// WaterGuard Pro - ESP32-S3 device configuration (no secrets here; see secrets.example.h).
#pragma once

// ---------------------------------------------------------------------------
// Safety gate. Keep 0 until the wiring in docs/hardware/WIRING-DIAGRAM-TH.md has been
// checked against photos of the real sensor and board (model, pin labels, ECHO voltage).
// With 0 the firmware never drives TRIG, never reads ECHO and never posts telemetry to
// the LIVE device. It only connects Wi-Fi and checks the TLS handshake to ThingsBoard.
// ---------------------------------------------------------------------------
#ifndef WIRING_VERIFIED
#define WIRING_VERIFIED 0
#endif

// ---------------------------------------------------------------------------
// GPIO (ESP32-S3 GPIO numbers, not header positions). Recommended for ESP32-S3 dev boards
// with N16R8 module: avoids strapping pins (0, 3, 45, 46), USB (19, 20), flash/PSRAM
// (26-37), UART0 to the CH343 bridge (43, 44) and the on-board RGB LED (48 on most boards).
// ---------------------------------------------------------------------------
#define PIN_TRIG 4   // ESP32-S3 output 3.3 V -> sensor TRIG
#define PIN_ECHO 5   // sensor ECHO -> voltage divider -> ESP32-S3 input (max 3.3 V!)

// ---------------------------------------------------------------------------
// Ultrasonic timing. 20 us trigger works for HC-SR04 (>=10 us) and JSN-SR04T/AJ-SR04M
// (>=10 us, some revisions need >=20 us). The echo timeout covers ~600 cm round trip.
// ---------------------------------------------------------------------------
#define TRIG_PULSE_US        20
#define ECHO_TIMEOUT_US      38000UL
#define PING_GAP_MS          80     // >=60 ms between pings so old echoes die out
#define SAMPLES_PER_READING  7      // median of N pings
#define MIN_VALID_SAMPLES    4      // fewer valid pings than this = Sensor Error
#define AIR_TEMPERATURE_C    30.0f  // speed of sound = 331.3 + 0.606 * T (m/s)

// Distance limits that the sensor can measure. Keep equal to the web Settings
// "ระยะเซนเซอร์ต่ำสุด / สูงสุด" for the LIVE profile. JSN-SR04T blind zone is ~20-25 cm.
#define MIN_DISTANCE_CM 20.0f
#define MAX_DISTANCE_CM 600.0f

// ---------------------------------------------------------------------------
// Tank calibration, measured at the real installation.
//   SENSOR_TO_FULL_CM   = distance from sensor face to the water surface when FULL
//                         (= web Settings "ระยะเผื่อติดตั้งเหนือระดับเต็ม", sensorOffset)
//   SENSOR_TO_BOTTOM_CM = distance from sensor face to the tank bottom / EMPTY level
//                         (= sensorOffset + web Settings "ความสูงช่วงใช้งาน", tankHeight)
// Defaults match the WaterGuard Pro web defaults: tankHeight 100 cm, sensorOffset 30 cm.
// ---------------------------------------------------------------------------
#define SENSOR_TO_FULL_CM   30.0f
#define SENSOR_TO_BOTTOM_CM 130.0f

// Status thresholds (percent). Same rule as web + simulator:
//   NORMAL < WARNING_PERCENT <= WARNING < DANGER_PERCENT <= DANGER
// The web recomputes status from distance with the user's Settings; keep these equal.
#define WARNING_PERCENT 70.0f
#define DANGER_PERCENT  85.0f

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------
#define TELEMETRY_INTERVAL_MS   5000UL   // one measurement + upload every 5 s
#define WIFI_CONNECT_TIMEOUT_MS 20000UL  // give up one attempt after 20 s
#define WIFI_BACKOFF_MIN_MS     2000UL   // retry backoff doubles up to the max
#define WIFI_BACKOFF_MAX_MS     60000UL
#define HTTP_TIMEOUT_MS         10000UL
#define UPLOAD_BACKOFF_MAX_MS   60000UL  // after repeated 429/5xx/network failures
#define NTP_SYNC_TIMEOUT_MS     10000UL

#define SERIAL_BAUD 115200
