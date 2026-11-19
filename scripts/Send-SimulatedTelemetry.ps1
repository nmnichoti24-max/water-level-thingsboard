#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('thingsboard.cloud', 'eu.thingsboard.cloud')]
    [string]$CloudHost = 'thingsboard.cloud',

    [ValidateRange(1, 300)]
    [int]$DelaySeconds = 5,

    [ValidateRange(0, 10000)]
    [int]$Cycles = 0,

    [ValidateRange(0.01, 10000)]
    [double]$TankHeightCm = 100,

    [ValidateRange(0, 10000)]
    [double]$SensorOffsetCm = 30,

    [ValidateRange(0, 10000)]
    [double]$MinDistanceCm = 20,

    [ValidateRange(0.01, 10000)]
    [double]$MaxDistanceCm = 600,

    [ValidateRange(0, 100)]
    [double]$WarningPercent = 70,

    [ValidateRange(0, 100)]
    [double]$DangerPercent = 85,

    [ValidateRange(1, 6)]
    [int]$MaxAttempts = 3,

    [switch]$PromptForToken,
    [switch]$Preview
)

$ErrorActionPreference = 'Stop'

function Send-SimSample {
    param([string]$Uri, [string]$Payload, [long]$Point, [int]$Attempts)

    $ProgressPreference = 'SilentlyContinue'
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        $code = $null
        try {
            $response = Invoke-WebRequest -Method Post -Uri $Uri -Body $Payload `
                -ContentType 'application/json' -UseBasicParsing -TimeoutSec 10 `
                -MaximumRedirection 0 -Verbose:$false -Debug:$false
            $code = [int]$response.StatusCode
            if ($code -ge 200 -and $code -lt 300) { return $code }
        } catch [System.Management.Automation.PipelineStoppedException] {
            throw
        } catch {
            # The original exception may contain the credential in the request URL.
            if ($null -ne $_.Exception.Response.StatusCode) {
                $code = [int]$_.Exception.Response.StatusCode
            }
        }

        if ($code -in 401, 403, 404) {
            throw "ThingsBoard returned HTTP $code. Check the Cloud region and copy a current token from ESP32-S3-Water-Level-SIM."
        }
        if ($null -ne $code -and $code -notin 408, 429 -and ($code -lt 500 -or $code -gt 599)) {
            throw "ThingsBoard returned HTTP $code. Check the HTTPS endpoint and telemetry format. The simulator has stopped."
        }

        $reason = if ($null -eq $code) { 'No response. Check the internet connection.' } else { "ThingsBoard returned HTTP $code." }
        if ($attempt -eq $Attempts) {
            Write-Warning "SIM point $Point skipped after $Attempts attempt(s). $reason The next measurement will be attempted."
            return
        }
        $backoffSeconds = [int][Math]::Pow(2, $attempt - 1)
        Write-Warning "SIM point $Point failed on attempt $attempt of $Attempts. $reason Retrying in $backoffSeconds second(s)."
        Start-Sleep -Seconds $backoffSeconds
    }
}

if ($WarningPercent -le 0 -or $WarningPercent -ge $DangerPercent) {
    throw 'Set thresholds so 0 < WarningPercent < DangerPercent <= 100.'
}

$closestDistance = $SensorOffsetCm + $TankHeightCm * 0.05
$farthestDistance = $SensorOffsetCm + $TankHeightCm * 0.8
if ($closestDistance -lt $MinDistanceCm -or $farthestDistance -gt $MaxDistanceCm) {
    throw 'The 20%-95% cycle is outside the sensor range. Match the Web App SIM calibration and distance limits.'
}

if (-not $Preview) {
    $token = $env:THINGSBOARD_SIM_DEVICE_TOKEN
    if ($PromptForToken -or [string]::IsNullOrWhiteSpace($token)) {
        $secret = Read-Host 'Paste the Access Token of ESP32-S3-Water-Level-SIM only' -AsSecureString
        try {
            $token = [System.Net.NetworkCredential]::new('', $secret).Password
        } finally {
            $secret.Dispose()
        }
    }
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw 'The SIM Access Token is empty. Run again and paste the token, or use -Preview.'
    }

    $encodedToken = [Uri]::EscapeDataString($token.Trim())
    $uri = "https://$CloudHost/api/v1/$encodedToken/telemetry"
    Remove-Variable -Name token, encodedToken
    Write-Host 'SIMULATED DATA | ESP32-S3-Water-Level-SIM | Press Ctrl+C to stop.'
}

# One cycle is 20%, 25%, ..., 95%, 90%, ..., 25%.
# A bounded run also emits the final 20% where the cycle closes.
$risingSteps = 15
$stepsPerCycle = 2 * $risingSteps
if ($Preview -and $Cycles -eq 0) { $Cycles = 1 }
$sampleCount = $Cycles * $stepsPerCycle + 1
$runtime = [Diagnostics.Stopwatch]::StartNew()
$sent = 0L
$skipped = 0L

try {
    for ($index = 0L; $Cycles -eq 0 -or $index -lt $sampleCount; $index++) {
        $interval = [Diagnostics.Stopwatch]::StartNew()
        $cycleStep = $index % $stepsPerCycle
        $levelStep = $risingSteps - [Math]::Abs($risingSteps - $cycleStep)
        $percent = 20 + 5 * $levelStep
        $levelCm = [Math]::Round($TankHeightCm * ($percent / 100.0), 8)
        $distanceCm = [Math]::Round($SensorOffsetCm + ($TankHeightCm - $levelCm), 8)

        $status = 'NORMAL'
        if ($percent -ge $DangerPercent) {
            $status = 'DANGER'
        } elseif ($percent -ge $WarningPercent) {
            $status = 'WARNING'
        }

        $uptimeSeconds = if ($Preview) { $index * $DelaySeconds } else { [long][Math]::Floor($runtime.Elapsed.TotalSeconds) }
        $values = [ordered]@{
            distance = $distanceCm
            waterLevel = $levelCm
            waterPercent = $percent
            status = $status
            sensorValid = $true
            uptime = $uptimeSeconds
        }

        if ($Preview) {
            Write-Output ($values | ConvertTo-Json -Compress)
            continue
        }

        # Reuse the timestamp on retry so one measurement keeps the same history key.
        $payload = @{ ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); values = $values } | ConvertTo-Json -Compress
        $code = Send-SimSample -Uri $uri -Payload $payload -Point ($index + 1) -Attempts $MaxAttempts
        if ($null -ne $code) {
            $sent++
            Write-Output "SIM HTTP $code $($values | ConvertTo-Json -Compress)"
        } else {
            $skipped++
        }

        if ($Cycles -eq 0 -or $index + 1 -lt $sampleCount) {
            $remainingMs = ($DelaySeconds * 1000) - $interval.ElapsedMilliseconds
            if ($remainingMs -gt 0) {
                Start-Sleep -Milliseconds $remainingMs
            }
        }
    }
} finally {
    $runtime.Stop()
    if (-not $Preview) {
        Remove-Variable -Name uri
        Write-Host "SIM stopped. Acknowledged: $sent. Skipped: $skipped."
    }
}
