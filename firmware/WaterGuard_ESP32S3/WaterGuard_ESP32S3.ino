// WaterGuard Pro - ESP32-S3 ultrasonic water level node.
// Modes (config.h WG_MODE):
//   SAFE : Wi-Fi + TLS check only, nothing is sent.
//   SIM  : simulated readings -> HTTPS -> ThingsBoard ESP32-S3-Water-Level-SIM only.
//   LIVE : JSN-SR04T -> median filter -> calibration -> HTTPS -> ESP32-S3-Water-Level.
// Telemetry keys match app/server/telemetry.js and scripts/Send-SimulatedTelemetry.ps1:
//   distance (cm), waterLevel (cm), waterPercent (%), status (NORMAL|WARNING|DANGER),
//   sensorValid (bool), uptime (s), rssi (dBm), simulated (true in SIM, false in LIVE);
//   extra: sensorError (LIVE error only).
// LIVE never generates simulated values. A failed reading is sent as sensorValid=false,
// status=SENSOR_ERROR without distance/level/percent, so the website shows Sensor Error
// instead of a fake zero.
// Local outputs: OLED SSD1306 (percent, distance, level, status) and 3 status LEDs
// (green NORMAL, yellow WARNING, red DANGER, red blinking SENSOR ERROR). Measuring and the
// local outputs keep running without Wi-Fi; a missing OLED never stops sensing or uploads.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

#include "config.h"
#include "ca_certs.h"

#if OLED_ENABLED
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#endif

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Missing secrets.h - copy secrets.example.h to secrets.h and fill in Wi-Fi and device tokens."
#endif

#ifndef THINGSBOARD_SIM_DEVICE_TOKEN
#error "secrets.h is missing THINGSBOARD_SIM_DEVICE_TOKEN - see secrets.example.h"
#endif

static_assert(SENSOR_TO_BOTTOM_CM > SENSOR_TO_FULL_CM, "SENSOR_TO_BOTTOM_CM must be greater than SENSOR_TO_FULL_CM");
static_assert(SENSOR_TO_FULL_CM >= MIN_DISTANCE_CM, "Full-tank surface must be outside the sensor blind zone (>= MIN_DISTANCE_CM)");
static_assert(SENSOR_TO_BOTTOM_CM <= MAX_DISTANCE_CM, "Tank bottom must be within MAX_DISTANCE_CM");
static_assert(DANGER_DISTANCE_CM > 0 && DANGER_DISTANCE_CM < WARNING_DISTANCE_CM && WARNING_DISTANCE_CM <= MAX_DISTANCE_CM,
              "Use 0 < DANGER_DISTANCE_CM < WARNING_DISTANCE_CM <= MAX_DISTANCE_CM");

// Declared before any function: the Arduino builder inserts prototypes above the first one.
struct Reading {
  bool valid;
  const char *error;    // NO_ECHO, ECHO_STUCK_HIGH, OUT_OF_RANGE, TOO_FEW_SAMPLES
  int validSamples;
  double distanceCm;    // rounded to 0.1 cm, exactly what is sent
  double levelCm;
  double percent;
  const char *status;
};

constexpr bool sameText(const char *a, const char *b) {
  return *a == *b && (*a == '\0' || sameText(a + 1, b + 1));
}
static_assert(!sameText(THINGSBOARD_SIM_DEVICE_TOKEN, THINGSBOARD_DEVICE_TOKEN),
              "SIM and LIVE tokens are identical - simulated data would reach the LIVE device");

static const char *FIRMWARE_VERSION = "1.3.0";

#if WG_MODE == WG_MODE_SIM
static const char *MODE_NAME = "SIM";
static const char *DEVICE_NAME = "ESP32-S3-Water-Level-SIM";
static const char *DEVICE_TOKEN = THINGSBOARD_SIM_DEVICE_TOKEN;
#elif WG_MODE == WG_MODE_LIVE
static const char *MODE_NAME = "LIVE";
static const char *DEVICE_NAME = "ESP32-S3-Water-Level";
static const char *DEVICE_TOKEN = THINGSBOARD_DEVICE_TOKEN;
#else
static const char *MODE_NAME = "SAFE";
static const char *DEVICE_NAME = "(none - nothing is sent)";
static const char *DEVICE_TOKEN = "";
#endif

// Placeholders from secrets.example.h count as "not configured".
static bool configured(const char *v) {
  return v && *v && strncmp(v, "your-", 5) != 0 && strncmp(v, "paste-", 6) != 0;
}
static bool wifiConfigured = false;
static bool tokenConfigured = false;

// ---------------------------------------------------------------------------
// On-board RGB LED
//   blue blink = Wi-Fi connecting   magenta = SIM upload OK   green = LIVE upload / TLS OK
//   red = upload/TLS failed         yellow  = secrets.h not filled in
// ---------------------------------------------------------------------------
static void rgb(uint8_t r, uint8_t g, uint8_t b) {
#if RGB_LED_ENABLED
  rgbLedWrite(RGB_LED_PIN, r * RGB_LED_BRIGHTNESS / 255, g * RGB_LED_BRIGHTNESS / 255, b * RGB_LED_BRIGHTNESS / 255);
#endif
}

static void rgbSelfTest() {
#if RGB_LED_ENABLED
  struct { const char *name; uint8_t r, g, b; } steps[] = {
    {"RED", 255, 0, 0}, {"GREEN", 0, 255, 0}, {"BLUE", 0, 0, 255}, {"WHITE", 255, 255, 255}, {"OFF", 0, 0, 0},
  };
  for (auto &s : steps) {
    Serial.printf("[RGB] GPIO%d -> %s\n", RGB_LED_PIN, s.name);
    rgb(s.r, s.g, s.b);
    delay(700);
  }
#else
  Serial.println("[RGB] disabled (RGB_LED_ENABLED 0)");
#endif
}

// ---------------------------------------------------------------------------
// External status LEDs (only configured when EXTERNAL_LEDS_VERIFIED 1)
// ---------------------------------------------------------------------------
static bool ledSensorError = false;  // red blinks in extLedLoop() while set

static void extLedInit() {
#if EXTERNAL_LEDS_VERIFIED
  struct { int pin; const char *name; } leds[] = {
    {PIN_LED_DANGER, "RED"}, {PIN_LED_WARNING, "YELLOW"}, {PIN_LED_NORMAL, "GREEN"},
  };
  for (auto &l : leds) { pinMode(l.pin, OUTPUT); digitalWrite(l.pin, LOW); }
  Serial.printf("External LEDs: NORMAL(green)=GPIO%d WARNING(yellow)=GPIO%d DANGER(red)=GPIO%d\n",
                PIN_LED_NORMAL, PIN_LED_WARNING, PIN_LED_DANGER);
  for (auto &l : leds) {
    Serial.printf("[LED] self-test GPIO%d %s\n", l.pin, l.name);
    digitalWrite(l.pin, HIGH);
    delay(600);
    digitalWrite(l.pin, LOW);
  }
#else
  Serial.println("External LEDs: disabled (EXTERNAL_LEDS_VERIFIED 0) - GPIO untouched");
#endif
}

// status = NORMAL | WARNING | DANGER, nullptr = sensor error (red blinking).
[[maybe_unused]] static void extLedShow(const char *status) {
  ledSensorError = status == nullptr;
#if EXTERNAL_LEDS_VERIFIED
  digitalWrite(PIN_LED_NORMAL, status && !strcmp(status, "NORMAL"));
  digitalWrite(PIN_LED_WARNING, status && !strcmp(status, "WARNING"));
  digitalWrite(PIN_LED_DANGER, status && !strcmp(status, "DANGER"));
#endif
}

static void extLedLoop() {
#if EXTERNAL_LEDS_VERIFIED
  if (ledSensorError) digitalWrite(PIN_LED_DANGER, (millis() / LED_BLINK_MS) % 2);
#endif
}

// ---------------------------------------------------------------------------
// OLED SSD1306. oledOk stays false when the display is absent; every draw is then skipped.
// ---------------------------------------------------------------------------
#if OLED_ENABLED
static Adafruit_SSD1306 oled(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
#endif
static bool oledOk = false;

static void oledInit() {
#if OLED_ENABLED
  Wire.begin(OLED_SDA, OLED_SCL);
  Wire.beginTransmission(OLED_ADDRESS);
  bool present = Wire.endTransmission() == 0;
  // periphBegin=false: keep the SDA/SCL pins chosen above.
  oledOk = present && oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS, true, false);
  if (oledOk) {
    Serial.printf("OLED: SSD1306 0x%02X OK (SDA=GPIO%d SCL=GPIO%d)\n", OLED_ADDRESS, OLED_SDA, OLED_SCL);
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(2);
    oled.setCursor(0, 8);
    oled.print("WaterGuard");
    oled.setTextSize(1);
    oled.setCursor(0, 32);
    oled.printf("Pro fw %s", FIRMWARE_VERSION);
    oled.setCursor(0, 48);
    oled.printf("Mode: %s", MODE_NAME);
    oled.display();
  } else {
    Serial.printf("OLED: not found at 0x%02X (SDA=GPIO%d SCL=GPIO%d) - %s; continuing without display\n",
                  OLED_ADDRESS, OLED_SDA, OLED_SCL, present ? "init failed" : "no I2C ACK");
  }
#else
  Serial.println("OLED: disabled (OLED_ENABLED 0)");
#endif
}

// ---------------------------------------------------------------------------
// Wi-Fi state machine (non-blocking, timeout + exponential backoff, auto-reconnect)
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
        Serial.printf("[WiFi] Connected IP=%s RSSI=%d dBm channel=%ld MAC=%s\n", WiFi.localIP().toString().c_str(),
                      WiFi.RSSI(), (long)WiFi.channel(), WiFi.macAddress().c_str());
        wifiBackoff = WIFI_BACKOFF_MIN_MS;
        wifiState = WIFI_UP;
        configTime(0, 0, "pool.ntp.org", "time.google.com");
      } else if (now - wifiAttemptStart >= WIFI_CONNECT_TIMEOUT_MS) {
        Serial.printf("[WiFi] Failed: %s. Retry in %lu s\n", wifiStatusText(status), wifiBackoff / 1000);
        WiFi.disconnect(true);
        if (status == WL_NO_SSID_AVAIL) {
          int n = WiFi.scanNetworks();
          Serial.printf("[WiFi] Scan: %d network(s) visible to the ESP32-S3 (2.4 GHz only):\n", n < 0 ? 0 : n);
          for (int i = 0; i < n && i < 30; i++)
            Serial.printf("         ch%-2ld %4d dBm  \"%s\"\n", (long)WiFi.channel(i), (int)WiFi.RSSI(i), WiFi.SSID(i).c_str());
          WiFi.scanDelete();
        }
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
  static bool logged = false;
  if (!logged) {
    logged = true;
    char when[32];
    strftime(when, sizeof when, "%Y-%m-%d %H:%M:%S", gmtime(&tv.tv_sec));
    Serial.printf("[NTP] synced %s UTC\n", when);
  }
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000;
}

static const char *statusFor(double distanceCm, double warningCm = WARNING_DISTANCE_CM, double dangerCm = DANGER_DISTANCE_CM) {
  if (distanceCm <= dangerCm) return "DANGER";
  if (distanceCm <= warningCm) return "WARNING";
  return "NORMAL";
}

// ---------------------------------------------------------------------------
// Ultrasonic sensor (JSN-SR04T) - only compiled into the loop in LIVE mode
// ---------------------------------------------------------------------------
static void trigger() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(4);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(TRIG_PULSE_US);
  digitalWrite(PIN_TRIG, LOW);
}

[[maybe_unused]] static float pingOnceCm(const char **error, unsigned long *rawUs) {
  *rawUs = 0;
  if (digitalRead(PIN_ECHO) == HIGH) { *error = "ECHO_STUCK_HIGH"; return NAN; }
  trigger();
  unsigned long us = pulseIn(PIN_ECHO, HIGH, ECHO_TIMEOUT_US);
  *rawUs = us;
  if (us == 0) { *error = "NO_ECHO"; return NAN; }
  const float cmPerUs = (331.3f + 0.606f * AIR_TEMPERATURE_C) / 10000.0f;
  float cm = us * cmPerUs / 2.0f;
  if (cm < MIN_DISTANCE_CM || cm > MAX_DISTANCE_CM) { *error = "OUT_OF_RANGE"; return NAN; }
  return cm;
}

#if SENSOR_DEBUG
// Diagnostic only (never used for the reading): one extra ping while sampling GPIO6 with
// the ADC, to see how high the divided ECHO pulse really gets. ESP32-S3 reads HIGH from
// ~0.75 * 3.3 V = 2475 mV; a 3.3 V ECHO through 10k/18k only reaches ~2120 mV.
static int echoPeakMv() {
  trigger();
  int peak = 0;
  unsigned long t0 = micros();
  while (micros() - t0 < ECHO_TIMEOUT_US) {
    int mv = analogReadMilliVolts(PIN_ECHO);
    if (mv > peak) peak = mv;
  }
  pinMode(PIN_ECHO, INPUT);  // hand the pin back to the digital input
  return peak;
}

// Diagnostic only: time one ECHO pulse with a 100 ms window (longer than ECHO_TIMEOUT_US)
// to tell "no pulse" from "pulse too long / too late for pulseIn".
static void echoTiming() {
  const unsigned long window = 100000UL;
  trigger();
  unsigned long t0 = micros(), rise = 0, fall = 0;
  while (micros() - t0 < window && digitalRead(PIN_ECHO) == LOW) {}
  if (digitalRead(PIN_ECHO) == HIGH) {
    rise = micros() - t0;
    while (micros() - t0 < window && digitalRead(PIN_ECHO) == HIGH) {}
    if (digitalRead(PIN_ECHO) == LOW) fall = micros() - t0;
  }
  if (!rise) Serial.println("[Echo] timing: no rising edge within 100 ms");
  else if (!fall) Serial.printf("[Echo] timing: rise after %lu us, still HIGH at 100 ms\n", rise);
  else Serial.printf("[Echo] timing: rise after %lu us, width %lu us (= %.1f cm)\n", rise, fall - rise,
                     (fall - rise) * (331.3f + 0.606f * AIR_TEMPERATURE_C) / 20000.0f);
}
#endif

[[maybe_unused]] static Reading readSensor() {
  float samples[SAMPLES_PER_READING];
  int n = 0;
  const char *lastError = "NO_ECHO";
#if SENSOR_DEBUG
  char dbg[SAMPLES_PER_READING * 28 + 16];
  size_t len = 0;
#endif
  for (int i = 0; i < SAMPLES_PER_READING; i++) {
    const char *err = nullptr;
    unsigned long us;
    float cm = pingOnceCm(&err, &us);
    if (!isnan(cm)) samples[n++] = cm; else lastError = err;
#if SENSOR_DEBUG
    if (isnan(cm) && us == 0)
      len += snprintf(dbg + len, sizeof dbg - len, " #%d %s |", i + 1, err);
    else
      len += snprintf(dbg + len, sizeof dbg - len, " #%d %luus %.1fcm%s |", i + 1, us, us * (331.3f + 0.606f * AIR_TEMPERATURE_C) / 20000.0f, isnan(cm) ? " OOR" : "");
#endif
    delay(PING_GAP_MS);
  }
#if SENSOR_DEBUG
  Serial.printf("[Ping]%s\n", dbg);
  Serial.printf("[Echo] GPIO6 peak %d mV during one diagnostic ping (HIGH needs >= ~2475 mV)\n", echoPeakMv());
  delay(PING_GAP_MS);
  echoTiming();
  delay(PING_GAP_MS);
#endif
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
  r.status = statusFor(r.distanceCm);
  r.valid = true;
  return r;
}

// ---------------------------------------------------------------------------
// Simulator - same 20% -> 95% -> 20% cycle (5% steps) as scripts/Send-SimulatedTelemetry.ps1
// ---------------------------------------------------------------------------
[[maybe_unused]] static Reading simulateReading() {
  static unsigned long step = 0;
  const int rising = 15;
  int cycleStep = step++ % (2 * rising);
  int levelStep = rising - abs(rising - cycleStep);
  double percent = 20 + 5 * levelStep;
  const double span = SIM_SENSOR_TO_BOTTOM_CM - SIM_SENSOR_TO_FULL_CM;
  Reading r = { true, nullptr, 0, 0, 0, percent, nullptr };
  r.levelCm = round(span * percent / 100.0 * 10.0) / 10.0;
  r.distanceCm = round((SIM_SENSOR_TO_FULL_CM + span - r.levelCm) * 10.0) / 10.0;
  r.status = statusFor(r.distanceCm, SIM_WARNING_DISTANCE_CM, SIM_DANGER_DISTANCE_CM);
  return r;
}

// ---------------------------------------------------------------------------
// ThingsBoard HTTPS
// ---------------------------------------------------------------------------
static WiFiClientSecure tls;
static unsigned long uploadBackoff = 0;
static unsigned long okCount = 0, failCount = 0;
static const char *cloudState = "--";  // OLED: -- (not tried) | OK | ER

// r == nullptr: no reading to show (SAFE, or SIM waiting for Wi-Fi).
static void oledShow(const Reading *r, bool online) {
#if OLED_ENABLED
  if (!oledOk) return;
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.printf("%s WiFi:%s TB:%s", MODE_NAME, online ? "OK" : "--", cloudState);
  if (!r) {
    oled.setTextSize(2);
    oled.setCursor(0, 16);
    oled.print("WaterGuard");
    oled.setTextSize(1);
    oled.setCursor(0, 40);
    oled.print(WG_MODE == WG_MODE_SAFE ? "SAFE: nothing sent" : online ? "Token not set" : "Waiting for Wi-Fi");
    oled.setCursor(0, 52);
    oled.printf("Uptime %lu s", millis() / 1000);
  } else if (r->valid) {
    oled.setTextSize(3);
    oled.setCursor(0, 12);
    oled.printf("%.1f%%", r->percent);
    oled.setTextSize(1);
    oled.setCursor(0, 38);
    oled.printf("Dist : %.1f cm", r->distanceCm);
    oled.setCursor(0, 47);
    oled.printf("Level: %.1f cm", r->levelCm);
    oled.setCursor(0, 56);
    oled.printf("Status: %s%s", r->status, WG_MODE == WG_MODE_SIM ? " SIM" : "");
  } else {
    oled.setTextSize(3);
    oled.setCursor(0, 12);
    oled.print("-- %");
    oled.setTextSize(1);
    oled.setCursor(0, 38);
    oled.print("Dist : -- cm");
    oled.setCursor(0, 47);
    oled.printf("Err  : %s", r->error);
    oled.setCursor(0, 56);
    oled.print("Status: SENSOR ERROR");
  }
  oled.display();
#else
  (void)r; (void)online;
#endif
}

static size_t buildPayload(const Reading &r, char *out, size_t size) {
  char values[256];
  unsigned long uptime = millis() / 1000;
  const char *simFlag = WG_MODE == WG_MODE_SIM ? ",\"simulated\":true" : ",\"simulated\":false";
  if (r.valid) {
    snprintf(values, sizeof values,
             "{\"distance\":%.1f,\"waterLevel\":%.1f,\"waterPercent\":%.2f,\"status\":\"%s\","
             "\"sensorValid\":true,\"uptime\":%lu,\"rssi\":%d%s}",
             r.distanceCm, r.levelCm, r.percent, r.status, uptime, WiFi.RSSI(), simFlag);
  } else {
    snprintf(values, sizeof values,
             "{\"status\":\"SENSOR_ERROR\",\"sensorValid\":false,\"sensorError\":\"%s\",\"uptime\":%lu,\"rssi\":%d%s}",
             r.error, uptime, WiFi.RSSI(), simFlag);
  }
  uint64_t ts = unixMillis();
  if (ts) return snprintf(out, size, "{\"ts\":%llu,\"values\":%s}", (unsigned long long)ts, values);
  return snprintf(out, size, "%s", values);
}

[[maybe_unused]] static void upload(const Reading &r) {
  char body[360];
  buildPayload(r, body, sizeof body);
  String path = String("/api/v1/") + DEVICE_TOKEN + "/telemetry";  // never printed
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setReuse(false);
  if (!http.begin(tls, THINGSBOARD_HOST, 443, path, true)) {
    Serial.printf("[%s Upload] FAILED: could not start HTTPS request\n", MODE_NAME);
    failCount++;
    cloudState = "ER";
    rgb(255, 0, 0);
    return;
  }
  http.addHeader("Content-Type", "application/json");
  int code = http.POST((uint8_t *)body, strlen(body));
  http.end();

  if (code >= 200 && code < 300) {
    okCount++;
    uploadBackoff = 0;
    cloudState = "OK";
    Serial.printf("[%s Upload] -> %s HTTP %d OK (ok=%lu fail=%lu) payload=%s\n", MODE_NAME, DEVICE_NAME, code, okCount, failCount, body);
    if (WG_MODE == WG_MODE_SIM) rgb(255, 0, 255); else rgb(0, 255, 0);
    return;
  }
  failCount++;
  cloudState = "ER";
  rgb(255, 0, 0);
  if (code < 0) {
    Serial.printf("[%s Upload] FAILED: %s (TLS/network). ok=%lu fail=%lu\n", MODE_NAME, HTTPClient::errorToString(code).c_str(), okCount, failCount);
  } else if (code == 401 || code == 403 || code == 404) {
    Serial.printf("[%s Upload] HTTP %d: token/host rejected. Check THINGSBOARD_HOST and the %s Access Token in secrets.h\n", MODE_NAME, code, DEVICE_NAME);
  } else {
    Serial.printf("[%s Upload] HTTP %d: ThingsBoard did not accept the sample\n", MODE_NAME, code);
  }
  uploadBackoff = uploadBackoff ? min(uploadBackoff * 2, UPLOAD_BACKOFF_MAX_MS) : TELEMETRY_INTERVAL_MS;
  Serial.printf("[%s Upload] Next attempt delayed by %lu s (fresh measurement, no replay)\n", MODE_NAME, uploadBackoff / 1000);
}

// Prove Wi-Fi + certificate validation without sending anything.
static bool tlsSelfCheck() {
  WiFiClientSecure probe;
  probe.setCACert(THINGSBOARD_ROOT_CA);
  probe.setTimeout(HTTP_TIMEOUT_MS / 1000);
  bool ok = probe.connect(THINGSBOARD_HOST, 443);
  Serial.printf("[TLS] %s %s:443 certificate %s\n", ok ? "OK" : "FAILED", THINGSBOARD_HOST, ok ? "verified (ISRG root)" : "NOT verified / unreachable");
  probe.stop();
  cloudState = ok ? "OK" : "ER";
  if (ok) rgb(0, 255, 0); else rgb(255, 0, 0);
  return ok;
}

// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(1500);
  Serial.println();
  Serial.printf("WaterGuard Pro ESP32-S3 firmware %s\n", FIRMWARE_VERSION);
  Serial.printf("Chip %s rev %d, %d cores @ %lu MHz | Flash %lu MB | PSRAM %lu KB (free %lu KB)\n",
                ESP.getChipModel(), ESP.getChipRevision(), ESP.getChipCores(), (unsigned long)ESP.getCpuFreqMHz(),
                (unsigned long)(ESP.getFlashChipSize() / (1024 * 1024)),
                (unsigned long)(ESP.getPsramSize() / 1024), (unsigned long)(ESP.getFreePsram() / 1024));
  Serial.printf("MODE: %s | target: %s on %s (token hidden)\n", MODE_NAME, DEVICE_NAME, THINGSBOARD_HOST);
  if (WG_MODE == WG_MODE_SIM)
    Serial.println("*** SIMULATED DATA (SIM) - NOT A REAL SENSOR - sent to the -SIM device only ***");
  Serial.printf("Calibration: full=%.1f cm bottom=%.1f cm span=%.1f cm range=%.0f-%.0f cm status by distance: DANGER<=%.0f WARNING<=%.0f cm\n",
                SENSOR_TO_FULL_CM, SENSOR_TO_BOTTOM_CM, SENSOR_TO_BOTTOM_CM - SENSOR_TO_FULL_CM,
                MIN_DISTANCE_CM, MAX_DISTANCE_CM, DANGER_DISTANCE_CM, WARNING_DISTANCE_CM);

  rgbSelfTest();
  oledInit();
  extLedInit();

#if WG_MODE == WG_MODE_LIVE
  pinMode(PIN_TRIG, OUTPUT);
  digitalWrite(PIN_TRIG, LOW);
  pinMode(PIN_ECHO, INPUT);
  Serial.printf("Sensor: TRIG=GPIO%d ECHO=GPIO%d interval=%lu ms\n", PIN_TRIG, PIN_ECHO, TELEMETRY_INTERVAL_MS);
#else
  Serial.println("Sensor: JSN-SR04T GPIO untouched (only enabled in LIVE mode with WIRING_VERIFIED 1)");
#endif

  wifiConfigured = configured(WIFI_SSID) && configured(WIFI_PASSWORD);
  tokenConfigured = WG_MODE == WG_MODE_SAFE || configured(DEVICE_TOKEN);
  if (!wifiConfigured) Serial.println("[Config] WIFI_SSID / WIFI_PASSWORD not set in secrets.h -> Wi-Fi disabled");
  if (!tokenConfigured) Serial.printf("[Config] Access Token for %s not set in secrets.h -> uploads disabled (TLS check only)\n", DEVICE_NAME);

  tls.setCACert(THINGSBOARD_ROOT_CA);  // certificate is always verified; there is no insecure mode
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);  // reconnects are handled by wifiLoop() with backoff
}

void loop() {
  static unsigned long nextRun = 0;
  static unsigned long uploadAllowedAt = 0;
  unsigned long now = millis();
  extLedLoop();

  if (wifiConfigured) {
    wifiLoop();
    if (!wifiReady()) rgb(0, 0, (now / 500) % 2 ? 255 : 0);  // blue blink while connecting
  } else {
    static unsigned long lastNag = 0;
    if (now - lastNag >= 10000UL || lastNag == 0) {
      lastNag = now ? now : 1;
      Serial.printf("[Config] Waiting: fill in secrets.h and upload again (mode %s, uptime %lu s)\n", MODE_NAME, now / 1000);
      rgb(255, 160, 0);
    }
  }

  if ((long)(now - nextRun) < 0) { delay(10); return; }
  nextRun = now + TELEMETRY_INTERVAL_MS;  // measuring + OLED/LEDs keep a steady 5 s pace

  bool online = wifiConfigured && wifiReady();
  bool sends = online && tokenConfigured && WG_MODE != WG_MODE_SAFE;
  // Upload backoff after failures delays only the upload, never the local measurement.
  [[maybe_unused]] bool uploadDue = sends && (long)(now - uploadAllowedAt) >= 0;

  if (online && !sends) {
    static unsigned long lastProbe = 0;
    static bool probed = false;
    if (!probed || now - lastProbe >= 60000UL) {
      tlsSelfCheck();
      probed = true;
      lastProbe = now;
    }
  }

#if WG_MODE == WG_MODE_SIM
  if (!sends) {
    if (wifiConfigured && !online) Serial.println("[SIM] Waiting for Wi-Fi");
    oledShow(nullptr, online);
    return;
  }
#if SIM_MAX_UPLOADS > 0
  if (okCount >= SIM_MAX_UPLOADS) {
    static bool announced = false;
    if (!announced) Serial.printf("[SIM] Limit reached (%d point(s) accepted) - uploads stopped\n", SIM_MAX_UPLOADS);
    announced = true;
    return;
  }
#endif
  if (!uploadDue) return;  // keep the SIM cycle aligned with accepted uploads
  Reading r = simulateReading();
  Serial.printf("[SIM] distance=%.1f cm  level=%.1f cm  percent=%.2f %%  status=%s  (SIMULATED)\n",
                r.distanceCm, r.levelCm, r.percent, r.status);
  extLedShow(r.status);
  upload(r);
  uploadAllowedAt = millis() + uploadBackoff;
  oledShow(&r, online);
#elif WG_MODE == WG_MODE_LIVE
  Reading r = readSensor();
  if (r.valid) {
    Serial.printf("[Sensor] OK %d/%d pings  distance=%.1f cm  level=%.1f cm  percent=%.2f %%  status=%s\n",
                  r.validSamples, SAMPLES_PER_READING, r.distanceCm, r.levelCm, r.percent, r.status);
  } else {
    Serial.printf("[Sensor] ERROR %s (%d/%d valid pings) -> sensorValid=false, no level sent\n",
                  r.error, r.validSamples, SAMPLES_PER_READING);
  }
  extLedShow(r.valid ? r.status : nullptr);
  oledShow(&r, online);  // show the reading before the (up to HTTP_TIMEOUT_MS) upload
  if (uploadDue) {
    upload(r);
    uploadAllowedAt = millis() + uploadBackoff;
    oledShow(&r, online);
  } else if (sends) {
    Serial.printf("[LIVE] Upload backoff: next upload in %ld s (reading not replayed)\n",
                  (long)(uploadAllowedAt - now) / 1000);
  } else if (wifiConfigured && !online) {
    Serial.println("[LIVE] Wi-Fi down - reading shown locally only");
  }
#else
  oledShow(nullptr, online);
#endif
}
