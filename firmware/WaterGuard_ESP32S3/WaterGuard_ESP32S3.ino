// WaterGuard Pro - ESP32-S3 ultrasonic water level node.
// Real sensor -> median filter -> calibration -> HTTPS (TLS verified) -> ThingsBoard LIVE device.
// Telemetry keys match server/telemetry.js and scripts/Send-SimulatedTelemetry.ps1:
//   distance (cm), waterLevel (cm), waterPercent (%), status (NORMAL|WARNING|DANGER),
//   sensorValid (bool), uptime (s); extra: rssi (dBm), sensorError (string, only on error).
// Never generates random or simulated values. A failed reading is sent as sensorValid=false
// without distance/level/percent, so the website shows Sensor Error instead of a fake zero.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

#include "config.h"
#include "ca_certs.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Missing secrets.h - copy secrets.example.h to secrets.h and fill in Wi-Fi and the LIVE device token."
#endif

static_assert(SENSOR_TO_BOTTOM_CM > SENSOR_TO_FULL_CM, "SENSOR_TO_BOTTOM_CM must be greater than SENSOR_TO_FULL_CM");
static_assert(SENSOR_TO_FULL_CM >= MIN_DISTANCE_CM, "Full-tank surface must be outside the sensor blind zone (>= MIN_DISTANCE_CM)");
static_assert(SENSOR_TO_BOTTOM_CM <= MAX_DISTANCE_CM, "Tank bottom must be within MAX_DISTANCE_CM");
static_assert(WARNING_PERCENT > 0 && WARNING_PERCENT < DANGER_PERCENT && DANGER_PERCENT <= 100,
              "Use 0 < WARNING_PERCENT < DANGER_PERCENT <= 100");

static const char *FIRMWARE_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Reading model
// ---------------------------------------------------------------------------
struct Reading {
  bool valid;
  const char *error;    // NO_ECHO, ECHO_STUCK_HIGH, OUT_OF_RANGE, TOO_FEW_SAMPLES
  int validSamples;
  double distanceCm;    // rounded to 0.1 cm, exactly what is sent
  double levelCm;
  double percent;
  const char *status;
};

// ---------------------------------------------------------------------------
// Wi-Fi state machine (non-blocking, timeout + exponential backoff)
// ---------------------------------------------------------------------------
enum WifiState { WIFI_IDLE, WIFI_CONNECTING, WIFI_UP };
static WifiState wifiState = WIFI_IDLE;
static unsigned long wifiAttemptStart = 0;
static unsigned long wifiNextAttempt = 0;
static unsigned long wifiBackoff = WIFI_BACKOFF_MIN_MS;

static const char *wifiStatusText(wl_status_t s) {
  switch (s) {
    case WL_NO_SSID_AVAIL: return "SSID not found (check name / 2.4 GHz band)";
    case WL_CONNECT_FAILED: return "connect failed (check password)";
    case WL_CONNECTION_LOST: return "connection lost";
    case WL_DISCONNECTED: return "disconnected";
    case WL_IDLE_STATUS: return "idle";
    default: return "not connected";
  }
}

static void wifiLoop() {
  unsigned long now = millis();
  wl_status_t status = WiFi.status();
  switch (wifiState) {
    case WIFI_IDLE:
      if ((long)(now - wifiNextAttempt) >= 0) {
        Serial.printf("[WiFi] Connecting to \"%s\" (timeout %lu s)\n", WIFI_SSID, WIFI_CONNECT_TIMEOUT_MS / 1000);
        WiFi.disconnect(true);
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        wifiAttemptStart = now;
        wifiState = WIFI_CONNECTING;
      }
      break;
    case WIFI_CONNECTING:
      if (status == WL_CONNECTED) {
        Serial.printf("[WiFi] Connected IP=%s RSSI=%d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
        wifiBackoff = WIFI_BACKOFF_MIN_MS;
        wifiState = WIFI_UP;
        configTime(0, 0, "pool.ntp.org", "time.google.com");
      } else if (now - wifiAttemptStart >= WIFI_CONNECT_TIMEOUT_MS) {
        Serial.printf("[WiFi] Failed: %s. Retry in %lu s\n", wifiStatusText(status), wifiBackoff / 1000);
        WiFi.disconnect(true);
        wifiNextAttempt = now + wifiBackoff;
        wifiBackoff = min(wifiBackoff * 2, WIFI_BACKOFF_MAX_MS);
        wifiState = WIFI_IDLE;
      }
      break;
    case WIFI_UP:
      if (status != WL_CONNECTED) {
        Serial.printf("[WiFi] Lost: %s. Reconnecting\n", wifiStatusText(status));
        wifiNextAttempt = now;
        wifiState = WIFI_IDLE;
      }
      break;
  }
}

static bool wifiReady() { return wifiState == WIFI_UP && WiFi.status() == WL_CONNECTED; }

// Unix ms from NTP once synced; 0 means "not synced, let ThingsBoard stamp server time".
static uint64_t unixMillis() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  if (tv.tv_sec < 1700000000) return 0;
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000;
}

// ---------------------------------------------------------------------------
// Ultrasonic sensor
// ---------------------------------------------------------------------------
static float pingOnceCm(const char **error) {
  if (digitalRead(PIN_ECHO) == HIGH) { *error = "ECHO_STUCK_HIGH"; return NAN; }
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(4);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(TRIG_PULSE_US);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long us = pulseIn(PIN_ECHO, HIGH, ECHO_TIMEOUT_US);
  if (us == 0) { *error = "NO_ECHO"; return NAN; }
  const float cmPerUs = (331.3f + 0.606f * AIR_TEMPERATURE_C) / 10000.0f;
  float cm = us * cmPerUs / 2.0f;
  if (cm < MIN_DISTANCE_CM || cm > MAX_DISTANCE_CM) { *error = "OUT_OF_RANGE"; return NAN; }
  return cm;
}

static const char *statusFor(double percent) {
  if (percent >= DANGER_PERCENT) return "DANGER";
  if (percent >= WARNING_PERCENT) return "WARNING";
  return "NORMAL";
}

[[maybe_unused]] static Reading readSensor() {
  float samples[SAMPLES_PER_READING];
  int n = 0;
  const char *lastError = "NO_ECHO";
  for (int i = 0; i < SAMPLES_PER_READING; i++) {
    const char *err = nullptr;
    float cm = pingOnceCm(&err);
    if (!isnan(cm)) samples[n++] = cm; else lastError = err;
    delay(PING_GAP_MS);
  }
  Reading r = { false, nullptr, n, NAN, NAN, NAN, nullptr };
  if (n < MIN_VALID_SAMPLES) {
    r.error = n == 0 ? lastError : "TOO_FEW_SAMPLES";
    return r;
  }
  // Insertion sort + median.
  for (int i = 1; i < n; i++) {
    float v = samples[i];
    int j = i - 1;
    while (j >= 0 && samples[j] > v) { samples[j + 1] = samples[j]; j--; }
    samples[j + 1] = v;
  }
  double median = (n % 2) ? samples[n / 2] : (samples[n / 2 - 1] + samples[n / 2]) / 2.0;
  // Same formula as app/src/model.js measure(): level = tankHeight - (distance - sensorOffset).
  const double span = SENSOR_TO_BOTTOM_CM - SENSOR_TO_FULL_CM;
  r.distanceCm = round(median * 10.0) / 10.0;
  double level = span - (r.distanceCm - SENSOR_TO_FULL_CM);
  r.levelCm = level < 0 ? 0 : level > span ? span : level;
  r.percent = round(r.levelCm / span * 10000.0) / 100.0;
  r.levelCm = round(r.levelCm * 10.0) / 10.0;
  r.status = statusFor(r.percent);
  r.valid = true;
  return r;
}

// ---------------------------------------------------------------------------
// ThingsBoard HTTPS
// ---------------------------------------------------------------------------
static WiFiClientSecure tls;
static unsigned long uploadBackoff = 0;
static unsigned long okCount = 0, failCount = 0;

static size_t buildPayload(const Reading &r, char *out, size_t size) {
  char values[256];
  unsigned long uptime = millis() / 1000;
  if (r.valid) {
    snprintf(values, sizeof values,
             "{\"distance\":%.1f,\"waterLevel\":%.1f,\"waterPercent\":%.2f,\"status\":\"%s\","
             "\"sensorValid\":true,\"uptime\":%lu,\"rssi\":%d}",
             r.distanceCm, r.levelCm, r.percent, r.status, uptime, WiFi.RSSI());
  } else {
    snprintf(values, sizeof values,
             "{\"sensorValid\":false,\"sensorError\":\"%s\",\"uptime\":%lu,\"rssi\":%d}",
             r.error, uptime, WiFi.RSSI());
  }
  uint64_t ts = unixMillis();
  if (ts) return snprintf(out, size, "{\"ts\":%llu,\"values\":%s}", (unsigned long long)ts, values);
  return snprintf(out, size, "%s", values);
}

[[maybe_unused]] static void upload(const Reading &r) {
  char body[320];
  buildPayload(r, body, sizeof body);
  String path = String("/api/v1/") + THINGSBOARD_DEVICE_TOKEN + "/telemetry";  // never printed
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setReuse(false);
  if (!http.begin(tls, THINGSBOARD_HOST, 443, path, true)) {
    Serial.println("[Upload] FAILED: could not start HTTPS request");
    failCount++;
    return;
  }
  http.addHeader("Content-Type", "application/json");
  int code = http.POST((uint8_t *)body, strlen(body));
  http.end();

  if (code >= 200 && code < 300) {
    okCount++;
    uploadBackoff = 0;
    Serial.printf("[Upload] HTTP %d OK  (ok=%lu fail=%lu) payload=%s\n", code, okCount, failCount, body);
    return;
  }
  failCount++;
  if (code < 0) {
    Serial.printf("[Upload] FAILED: %s (TLS/network). ok=%lu fail=%lu\n", HTTPClient::errorToString(code).c_str(), okCount, failCount);
  } else if (code == 401 || code == 403 || code == 404) {
    Serial.printf("[Upload] HTTP %d: token/host rejected. Check THINGSBOARD_HOST and the LIVE device Access Token in secrets.h\n", code);
  } else {
    Serial.printf("[Upload] HTTP %d: ThingsBoard did not accept the sample\n", code);
  }
  uploadBackoff = uploadBackoff ? min(uploadBackoff * 2, UPLOAD_BACKOFF_MAX_MS) : TELEMETRY_INTERVAL_MS;
  Serial.printf("[Upload] Next attempt delayed by %lu s (fresh measurement, no replay)\n", uploadBackoff / 1000);
}

// Safe mode (WIRING_VERIFIED == 0): prove Wi-Fi + certificate validation without touching GPIO.
static void tlsSelfCheck() {
  WiFiClientSecure probe;
  probe.setCACert(THINGSBOARD_ROOT_CA);
  probe.setTimeout(HTTP_TIMEOUT_MS / 1000);
  bool ok = probe.connect(THINGSBOARD_HOST, 443);
  Serial.printf("[TLS] %s %s:443 certificate %s\n", ok ? "OK" : "FAILED", THINGSBOARD_HOST, ok ? "verified (ISRG root)" : "NOT verified / unreachable");
  probe.stop();
}

// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(1500);
  Serial.println();
  Serial.printf("WaterGuard Pro ESP32-S3 firmware %s\n", FIRMWARE_VERSION);
  Serial.printf("Device target: ThingsBoard LIVE device on %s (token hidden)\n", THINGSBOARD_HOST);
  Serial.printf("Calibration: full=%.1f cm bottom=%.1f cm span=%.1f cm range=%.0f-%.0f cm thresholds W=%.0f%% D=%.0f%%\n",
                SENSOR_TO_FULL_CM, SENSOR_TO_BOTTOM_CM, SENSOR_TO_BOTTOM_CM - SENSOR_TO_FULL_CM,
                MIN_DISTANCE_CM, MAX_DISTANCE_CM, WARNING_PERCENT, DANGER_PERCENT);
#if WIRING_VERIFIED
  pinMode(PIN_TRIG, OUTPUT);
  digitalWrite(PIN_TRIG, LOW);
  pinMode(PIN_ECHO, INPUT);
  Serial.printf("Sensor: TRIG=GPIO%d ECHO=GPIO%d interval=%lu ms\n", PIN_TRIG, PIN_ECHO, TELEMETRY_INTERVAL_MS);
#else
  Serial.println("SAFE MODE: WIRING_VERIFIED=0 -> sensor GPIO untouched, no telemetry is sent.");
  Serial.println("           Verify wiring, then set WIRING_VERIFIED 1 in config.h and upload again.");
#endif
  tls.setCACert(THINGSBOARD_ROOT_CA);  // certificate is always verified; there is no insecure mode
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);  // reconnects are handled by wifiLoop() with backoff
}

void loop() {
  static unsigned long nextRun = 0;
  wifiLoop();
  unsigned long now = millis();
  if ((long)(now - nextRun) < 0) { delay(10); return; }
  nextRun = now + TELEMETRY_INTERVAL_MS + uploadBackoff;

#if WIRING_VERIFIED
  Reading r = readSensor();
  if (r.valid) {
    Serial.printf("[Sensor] OK %d/%d pings  distance=%.1f cm  level=%.1f cm  percent=%.2f %%  status=%s\n",
                  r.validSamples, SAMPLES_PER_READING, r.distanceCm, r.levelCm, r.percent, r.status);
  } else {
    Serial.printf("[Sensor] ERROR %s (%d/%d valid pings) -> sending sensorValid=false\n",
                  r.error, r.validSamples, SAMPLES_PER_READING);
  }
  if (!wifiReady()) {
    Serial.println("[Upload] Skipped: Wi-Fi not connected");
    return;
  }
  upload(r);
#else
  static unsigned long lastProbe = 0;
  static bool probed = false;
  if (wifiReady() && (!probed || now - lastProbe >= 60000UL)) {
    tlsSelfCheck();
    probed = true;
    lastProbe = now;
  } else if (!wifiReady()) {
    Serial.println("[Safe] Waiting for Wi-Fi");
  }
#endif
}
