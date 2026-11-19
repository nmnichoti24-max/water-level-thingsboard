#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('thingsboard.cloud', 'eu.thingsboard.cloud')]
    [string]$CloudHost = 'thingsboard.cloud',

    [ValidateRange(1, 300)]
    [int]$DelaySeconds = 2,

    [switch]$Preview
)

$ErrorActionPreference = 'Stop'

if (-not $Preview) {
    $token = $env:THINGSBOARD_SIM_DEVICE_TOKEN
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw 'Set THINGSBOARD_SIM_DEVICE_TOKEN to the SIM device token, or use -Preview.'
    }

    $encodedToken = [Uri]::EscapeDataString($token.Trim())
    $uri = "https://$CloudHost/api/v1/$encodedToken/telemetry"
}

# Simulated calibration: 130 cm at empty, 30 cm at full.
$emptyDistanceCm = 130
$fullDistanceCm = 30
$usableDepthCm = $emptyDistanceCm - $fullDistanceCm
$distancesCm = @(110, 65, 60, 46, 45, 35)

for ($index = 0; $index -lt $distancesCm.Count; $index++) {
    $distanceCm = $distancesCm[$index]
    $levelCm = [Math]::Max(0, [Math]::Min($usableDepthCm, $emptyDistanceCm - $distanceCm))
    $percent = [Math]::Round(100 * $levelCm / $usableDepthCm, 1)

    $status = 'NORMAL'
    if ($percent -ge 85) {
        $status = 'DANGER'
    } elseif ($percent -ge 70) {
        $status = 'WARNING'
    }

    $json = [ordered]@{
        distance = $distanceCm
        waterLevel = $levelCm
        waterPercent = $percent
        status = $status
    } | ConvertTo-Json -Compress

    if ($Preview) {
        Write-Output $json
        continue
    }

    try {
        $result = Invoke-WebRequest -Method Post -Uri $uri -Body $json `
            -ContentType 'application/json' -UseBasicParsing -TimeoutSec 20 `
            -MaximumRedirection 0 -Verbose:$false -Debug:$false

        if ([int]$result.StatusCode -lt 200 -or [int]$result.StatusCode -ge 300) {
            throw 'Expected a successful HTTP response.'
        }
    } catch {
        # PowerShell's original exception can include the secret-bearing URL.
        $response = $_.Exception.Response
        if ($null -ne $response -and $null -ne $response.StatusCode) {
            $code = [int]$response.StatusCode
            $message = "HTTP $code. Check the Cloud region and SIM Access Token."
        } else {
            $message = 'No successful HTTP response. Check network, DNS, TLS, or blocked redirects.'
        }

        $point = $index + 1
        throw "SIM telemetry failed at point $point of $($distancesCm.Count). $message"
    }

    Write-Output "SIM HTTP $($result.StatusCode) $json"
    if ($index -lt $distancesCm.Count - 1) {
        Start-Sleep -Seconds $DelaySeconds
    }
}
