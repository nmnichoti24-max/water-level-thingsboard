// WaterGuard Pro - ESP32-S3 device configuration (no secrets here; see secrets.example.h).
#pragma once

// ---------------------------------------------------------------------------
// Operating mode.
//   WG_MODE_SAFE : Wi-Fi + TLS check only. Sends nothing, touches no sensor GPIO.
//   WG_MODE_SIM  : Sends SIMULATED data to ESP32-S3-Water-Level-SIM only
//                  (THINGSBOARD_SIM_DEVICE_TOKEN). Sensor GPIO untouched.
//   WG_MODE_LIVE : Real JSN-SR04T readings to ESP32-S3-Water-Level
//                  (THINGSBOARD_DEVICE_TOKEN). Requires WIRING_VERIFIED 1.
// Simulated data can never reach the LIVE device: SIM mode only ever uses the SIM token,
// and the build fails if the SIM and LIVE tokens are identical.
// ---------------------------------------------------------------------------
#define WG_MODE_SAFE 0
#define WG_MODE_SIM  1
#define WG_MODE_LIVE 2
#ifndef WG_MODE
#define WG_MODE WG_MODE_SIM
#endif

// ---------------------------------------------------------------------------
// Safety gate. Keep 0 until the wiring in docs/hardware/WIRING-DIAGRAM-TH.md has been
// checked against photos of the real sensor and board (model, pin labels, ECHO voltage).
// With 0 the firmware never drives TRIG and never reads ECHO. LIVE mode refuses to build.
// ---------------------------------------------------------------------------
#ifndef WIRING_VERIFIED
#define WIRING_VERIFIED 0
#endif

// Stop SIM uploads after this many accepted points (0 = unlimited). Use 1 to verify a new
// SIM token with a single point before streaming.
#ifndef SIM_MAX_UPLOADS
#define SIM_MAX_UPLOADS 0
#endif

#if WG_MODE == WG_MODE_LIVE && !WIRING_VERIFIED
#error "WG_MODE_LIVE needs WIRING_VERIFIED 1 (verify the JSN-SR04T wiring first)."
#endif

// ---------------------------------------------------------------------------
// On-board RGB LED (WS2812, 1 pixel). GPIO48 per the core's esp32s3 variant and the
// common N16R8 dev boards with CH343. Some boards need the "RGB" solder jumper bridged;
// a few (DevKitC-1 v1.1) use GPIO38. Set RGB_LED_ENABLED 0 to disable.
// ---------------------------------------------------------------------------
#define RGB_LED_ENABLED    1
#define RGB_LED_PIN        48
#define RGB_LED_BRIGHTNESS 24   // 0-255, kept low: the LED is very bright at full power

// ---------------------------------------------------------------------------
// External status LEDs (GPIO -> 220-330 ohm -> LED anode, cathode -> GND).
//   NORMAL = green, WARNING = yellow, DANGER = red, SENSOR ERROR = red blinking.
// Keep 0 until the LEDs + series resistors are wired and checked; with 0 these GPIOs
// are never configured.
// ---------------------------------------------------------------------------
#ifndef EXTERNAL_LEDS_VERIFIED
#define EXTERNAL_LEDS_VERIFIED 0
#endif
#define PIN_LED_NORMAL  18   // green
#define PIN_LED_WARNING 17   // yellow
#define PIN_LED_DANGER  16   // red
#define LED_BLINK_MS    250  // red blink half-period for SENSOR ERROR

// ---------------------------------------------------------------------------
// OLED SSD1306 128x64 I2C. If the display does not answer at boot the firmware logs it
// and keeps measuring/uploading without it. Set OLED_ENABLED 0 to skip I2C entirely.
// ---------------------------------------------------------------------------
#define OLED_ENABLED  1
#define OLED_SDA      9
#define OLED_SCL      8
#define OLED_ADDRESS  0x3C
#define OLED_WIDTH    128
#define OLED_HEIGHT   64

// ---------------------------------------------------------------------------
// GPIO (ESP32-S3 GPIO numbers, not header positions). Recommended for ESP32-S3 dev boards
// with N16R8 module: avoids strapping pins (0, 3, 45, 46), USB (19, 20), flash/PSRAM
// (26-37), UART0 to the CH343 bridge (43, 44) and the on-board RGB LED (48 on most boards).
// ---------------------------------------------------------------------------
#define PIN_TRIG 5   // ESP32-S3 output 3.3 V -> sensor TRIG
#define PIN_ECHO 6   // sensor ECHO -> voltage divider -> ESP32-S3 input (max 3.3 V!)

// ---------------------------------------------------------------------------
// Ultrasonic timing. 20 us trigger works for HC-SR04 (>=10 us) and JSN-SR04T/AJ-SR04M
// (>=10 us, some revisions need >=20 us). The echo timeout covers ~600 cm round trip.
// ---------------------------------------------------------------------------
#define TRIG_PULSE_US        20
#define ECHO_TIMEOUT_US      38000UL
#define PING_GAP_MS          100    // between pings so old echoes die out (JSN-SR04T: ECHO ends ~48 ms after TRIG)
#define SAMPLES_PER_READING  7      // median of N pings
#define MIN_VALID_SAMPLES    4      // fewer valid pings than this = Sensor Error
#define AIR_TEMPERATURE_C    30.0f  // speed of sound = 331.3 + 0.606 * T (m/s)
#ifndef SENSOR_DEBUG
#define SENSOR_DEBUG         0      // log all pings + ECHO pulse voltage (diagnostics only)
#endif

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
// Defaults: empty = 100 cm, full = 30 cm (web LIVE profile: tankHeight 70 cm, sensorOffset
// 30 cm). Re-measure at the real tank and change both here and in web Settings.
// ---------------------------------------------------------------------------
#define SENSOR_TO_FULL_CM   30.0f
#define SENSOR_TO_BOTTOM_CM 100.0f

// SIM mode only: fixed calibration of the web cloud-sim profile (CLOUD_SIM_SETTINGS:
// tankHeight 100, sensorOffset 30) so simulated distances keep the tested 20-95% cycle.
#define SIM_SENSOR_TO_FULL_CM   30.0f
#define SIM_SENSOR_TO_BOTTOM_CM 130.0f

// Status from the measured distance (same rule as the web, which recomputes it from distance):
//   distance <= DANGER_DISTANCE_CM -> DANGER (red), <= WARNING_DISTANCE_CM -> WARNING (yellow),
//   otherwise NORMAL (green). waterPercent is display only.
#define WARNING_DISTANCE_CM 50.0f
#define DANGER_DISTANCE_CM  30.0f
// SIM mode: 60 / 45 cm on the 30/130 SIM calibration = the former 70 / 85 % cycle statuses.
#define SIM_WARNING_DISTANCE_CM 60.0f
#define SIM_DANGER_DISTANCE_CM  45.0f

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
