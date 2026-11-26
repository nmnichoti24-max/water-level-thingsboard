# รายงานผลการทดสอบ WaterGuard Pro – Firmware 1.2.0 (OLED + LED 3 สี + JSN-SR04T)

วันที่: 26 พ.ย. 2026 · Branch: `feature/esp32s3-live-hardware` (ยังไม่ Commit / ไม่ Push / ไม่ Deploy)

สัญลักษณ์: ✅ ทดสอบจริงผ่าน · ⏳ ยังไม่ได้ทดสอบ (รอบอร์ด/การยืนยัน) · ⚠️ ต้องตรวจเพิ่ม

## 1. สำรองข้อมูล

| รายการ | ผล |
|---|---|
| สำรอง Firmware เดิมทั้งโฟลเดอร์ (รวม secrets.h) ไว้นอก Git ที่ `outputs/work/firmware-backups/WaterGuard_ESP32S3-before-oled-merge-20261126-123925/` | ✅ |
| diff ของ Firmware ที่ยังไม่ Commit ก่อนแก้ → `outputs/work/firmware-backups/uncommitted-firmware.diff` | ✅ |

## 2. การเปลี่ยนแปลง

| ไฟล์ | เปลี่ยนอะไร |
|---|---|
| `firmware/.../config.h` | TRIG=GPIO5, ECHO=GPIO6, LED แดง/เหลือง/เขียว = GPIO16/17/18, OLED SDA=GPIO9 SCL=GPIO8 0x3C, LIVE calibration ว่าง 100 cm / เต็ม 25 cm, SIM calibration แยก (30/130) |
| `firmware/.../WaterGuard_ESP32S3.ino` | เพิ่ม OLED (ไม่มีจอก็ทำงานต่อ), LED 3 สี + แดงกะพริบเมื่อ Sensor Error, วัดค่า/แสดงผลทุก 5 วินาทีแม้ Wi-Fi หลุด, backoff หน่วงเฉพาะการส่ง, LIVE ส่ง `simulated:false`, Error ส่ง `status:"SENSOR_ERROR"` โดยไม่มีค่าระดับน้ำ |
| `app/src/model.js` | `LIVE_SETTINGS` = tankHeight 75, sensorOffset 25 ให้ตรง Firmware (ค่าเริ่มต้นเท่านั้น ยังไม่ Deploy) |
| `app/test/live-device.test.js` | ปรับค่าทดสอบตาม calibration ใหม่ + ทดสอบว่า SIM calibration ไม่ปนกับ LIVE |
| `docs/hardware/*.md`, `firmware/.../README.md` | อัปเดต GPIO, ผังต่อ OLED/LED, calibration |

สิ่งที่คงไว้จาก Firmware เดิม: Wi-Fi state machine + backoff, TLS ตรวจใบรับรอง ISRG (ไม่มี insecure mode), NTP timestamp, Median Filter 7 ครั้ง (ต้องได้ ≥ 4), ตรวจ ECHO ค้าง HIGH, Token ไม่พิมพ์ออก Serial, Compile ไม่ผ่านถ้า SIM Token = LIVE Token, LIVE Compile ไม่ผ่านถ้า `WIRING_VERIFIED 0`

## 3. ตรวจโค้ด Arduino ของผู้ใช้ (ก่อนรวม)

| ประเด็น | การแก้ใน Firmware |
|---|---|
| วัดครั้งเดียวต่อรอบ ค่ากระโดด | ใช้ Median 7 ครั้ง |
| ไฟแดงใช้ทั้ง "น้ำสูง" และ "Error" | DANGER = แดงติดค้าง, SENSOR ERROR = แดงกะพริบ 250 ms |
| เกณฑ์ 80/40 ไม่ตรงเว็บ | ใช้ 70/85 ตามเว็บ |
| `while(true)` เมื่อ OLED เสีย ระบบหยุด | ข้ามการแสดงผล ทำงานต่อ |
| ความเร็วเสียงคงที่ 0.0343 | ชดเชยอุณหภูมิ (30 °C) |
| `delay()` ล็อกลูป | ลูปแบบตั้งเวลา |

## 4. ผลการทดสอบ

| # | รายการ | ผล | หลักฐาน |
|---|---|---|---|
| 1 | Library Adafruit SSD1306 2.5.17, GFX 2.0.0, BusIO 1.17.4 | ✅ ติดตั้งแล้ว | `arduino-cli lib list` |
| 2 | Compile SAFE (ESP32-S3, Flash 16MB, OPI PSRAM, core 4.0.0) | ✅ 0 warning | 1,110,132 B (35%) |
| 3 | Compile SIM | ✅ 0 warning | 1,134,976 B (36%) |
| 4 | Compile LIVE (`WIRING_VERIFIED=1`, ทดสอบผ่าน build flag ไม่ได้แก้ config.h) | ✅ 0 warning | 1,135,872 B (36%) |
| 5 | Unit test เว็บ + สูตร Firmware = สูตรเว็บ ทุกระยะ 20–600 cm | ✅ 43/43 | `npm test` |
| 6 | SIM Token และ LIVE Token แยกกัน | ✅ ต่างกัน · ⚠️ LIVE Token ยังเป็น placeholder | ตรวจแบบไม่แสดงค่า |
| 7 | ตรวจพอร์ต USB จริง | ✅ COM3, CH343 `VID_1A86&PID_55D3`, driver usbser ของ Windows; esptool: ESP32-S3 rev v0.2, Flash 16MB, PSRAM 8MB | `arduino-cli board list`, `esptool flash-id` |
| 7a | GPIO ใน config.h ตรงกับผัง (TRIG 5, ECHO 6, LED 16/17/18, OLED SDA 9 / SCL 8, 0x3C) | ✅ ตรวจไฟล์แล้ว | `config.h` |
| 7b | LIVE Token | ✅ ใส่แล้ว (26 พ.ย. 13:45) รูปแบบถูก ไม่ซ้ำ SIM · ⏳ ยังไม่ยืนยันกับ ThingsBoard (ยังไม่ได้ HTTP 200) | ตรวจแบบไม่แสดงค่า |
| 8 | ยืนยันการต่อวงจร + วงจรแบ่งแรงดัน ECHO | ✅ ผู้ใช้ยืนยัน: JSN-SR04T 5V, ECHO ผ่าน 10kΩ/18kΩ ≈ 3.21V, LED มีตัวต้านทานครบ, OLED 3V3, ไม่มี 5V แตะ GPIO | คำตอบผู้ใช้ 26 พ.ย. |
| 9 | Compile + Upload LIVE ผ่าน COM3 | ✅ Hash verified | 1,135,856 B |
| 10 | Serial Monitor 115200 | ✅ บูตปกติ fw 1.2.0, MODE LIVE, PSRAM 8192 KB, calibration 25/100 | `outputs/work/serial-live-boot.log` |
| 11 | OLED แสดง %, ระยะ, ระดับ, สถานะ | ⚠️ Serial: `OLED: SSD1306 0x3C OK` · ⏳ รอผู้ใช้ยืนยันภาพบนจอ | boot log |
| 12 | LED เขียว/เหลือง/แดง/แดงกะพริบ | ⚠️ Self-test รันแล้ว (GPIO16→17→18) · ⏳ รอผู้ใช้ยืนยันว่าเห็นไฟติด | boot log |
| 13 | เซนเซอร์จริง เปลี่ยนระยะแล้วค่าเปลี่ยน | ⚠️ อ่านได้จริงบางช่วง (7/7: 52.9 cm, 51.7 cm, 182.0 cm, 196.4 cm) แต่ส่วนใหญ่ NO_ECHO → กำลังทดสอบเล็งผนัง 50–80 cm | `serial-live-2.log`, `serial-live-3.log` |
| 13a | วิเคราะห์ NO_ECHO (Debug 7 pings + ADC + จับเวลา) | ✅ ECHO สูงสุด 3184 mV (ผ่านเกณฑ์ HIGH ~2475 mV) → ตัวแบ่ง 10k/18k ไม่ใช่สาเหตุ · ECHO ขึ้นหลัง Trigger 12.3 ms แล้วค้าง 35.4 ms คงที่ = สัญญาณ "ไม่ได้ยินเสียงสะท้อน" ของ JSN-SR04T → เซนเซอร์ไม่ได้รับ echo จริง ไม่ได้ลดเกณฑ์ตรวจสอบ | `serial-live-debug2.log` |
| 14 | ThingsBoard รับ Telemetry ทุก 5 วินาที (`simulated=false`) | ✅ HTTP 200 ทุกครั้ง (ok=28 fail=0 ในรอบแรก) payload มี `simulated:false` · ทั้ง SENSOR_ERROR (ไม่มีค่าระดับน้ำ) และค่าจริง | `serial-live-2.log` |
| 14a | Wi-Fi / IP / NTP / TLS | ✅ เชื่อมต่อ IP 172.20.10.2 RSSI −21 ถึง −41 dBm · `[NTP] synced 2026-11-26 07:09:43 UTC` · HTTPS ตรวจใบรับรอง ISRG ได้ HTTP 200 | `serial-live-debug1.log` |
| 15 | เว็บ Dashboard / History / Alerts / Settings ใน LIVE | ⏳ | – |
| 16 | ถอด OLED แล้วระบบยังส่งข้อมูล | ⏳ | – |

## 5. ตารางทดสอบระยะจริง (กรอกหลังทดสอบ)

ค่าที่คาดหวังด้วย calibration เริ่มต้น (ว่าง 100 / เต็ม 25):

| ระยะจริง (cm) | waterLevel (cm) | waterPercent | สถานะ | LED | Serial | OLED | ThingsBoard | เว็บ |
|---|---|---|---|---|---|---|---|---|
| 100 | 0.0 | 0.00 | NORMAL | เขียว | | | | |
| 60 | 40.0 | 53.33 | NORMAL | เขียว | | | | |
| 45 | 55.0 | 73.33 | WARNING | เหลือง | | | | |
| 30 | 70.0 | 93.33 | DANGER | แดง | | | | |
| ปิดหัววัด / ถอด ECHO | – | – | SENSOR ERROR | แดงกะพริบ | | | | |

## 6. สิ่งที่ผู้ใช้ต้องทำ

1. เปิดเว็บ → Settings → โปรไฟล์ LIVE ตั้ง "ความสูงช่วงใช้งาน" = 75 และ "ระยะเผื่อติดตั้งเหนือระดับเต็ม" = 25 (ค่าที่บันทึกไว้ในเบราว์เซอร์เดิมจะไม่เปลี่ยนเอง และเว็บที่ Deploy อยู่ยังใช้ค่าเริ่มต้นเดิมจนกว่าจะอนุญาตให้ Deploy)
2. ใส่ LIVE Token ของ `ESP32-S3-Water-Level` ใน `secrets.h` เอง (ห้ามส่งในแชต)
3. ยืนยันการต่อวงจรตามรายการตรวจใน [WIRING-DIAGRAM-TH.md](WIRING-DIAGRAM-TH.md)

## 7. เว็บไซต์: LIVE ไม่ขึ้นใน Dropdown (26 พ.ย. 2026)

| # | รายการ | ผล | หลักฐาน |
|---|---|---|---|
| W1 | ThingsBoard `ESP32-S3-Water-Level` มีข้อมูลจริง | ✅ latest 20.6 cm, sensorValid=true, DANGER · 140 จุดใน 1 ชม. (valid 44) | อ่านผ่าน `makeApi` + API key read-only ใน `.env.local` |
| W2 | Backend โค้ดรองรับ LIVE | ✅ เมื่อ env ครบ `op=devices` คืนทั้ง LIVE และ SIM | ทดสอบ local |
| W3 | Vercel Production env | ❌ **ไม่มี** `TB_API_KEY`, `TB_REAL_DEVICE_ID`, `TB_ENABLE_LIVE_READ`, `AUTH_DEFAULT_LIVE` → API ไม่ส่ง LIVE | `vercel env ls production` (ดูเฉพาะชื่อ) |
| W4 | ACL บัญชี | ⚠️ บัญชีที่สร้างด้วย `create-account.mjs --grant-sim` มี ACL `{sim:true, liveDevices:[]}` ซึ่งชนะ `AUTH_DEFAULT_LIVE` → เพิ่ม `scripts/grant-live.mjs` (dry-run เป็นค่าเริ่มต้น) | โค้ด `server/auth.js` |
| W5 | Frontend เลือก SIM เป็นค่าเริ่มต้น | ✅ แก้แล้ว: เลือก LIVE ก่อนเมื่อบัญชีอ่านได้ · LIVE refresh 5 s | `App.jsx`, `model.js` |
| W6 | Unit tests / build Vercel / build Pages | ✅ 43/43 · build ผ่านทั้งสอง | `npm test`, `npm run build`, `npm run build:pages` |
| W7 | Deploy + ทดสอบ Production กับบอร์ดจริง | ⏳ รออนุญาต | – |
