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
| W7 | Vercel env `TB_REAL_DEVICE_ID`, `TB_ENABLE_LIVE_READ=1` (ไม่ตั้ง `AUTH_DEFAULT_LIVE` ตามคำสั่ง: LIVE เฉพาะบัญชีที่ grant) | ✅ เพิ่มแล้ว · Device ID ยืนยันกับ ThingsBoard = ESP32-S3-Water-Level | `vercel env ls`, `/api/device/{id}` |
| W8 | Vercel env `TB_API_KEY` | ❌ ยังไม่มีใน Production / Preview / Development ของโปรเจกต์ `asdasd/esp32s3-water-level-monitor` (ตรวจ 2 รอบ 26 พ.ย.) | `vercel env ls` (ดูเฉพาะชื่อ) |
| W9 | Commit + Push + Merge main | ✅ `06a1468` (Session retry), `9a4b0e8` (Firmware 1.2.0 + LIVE web) · main fast-forward ไม่มี conflict · สแกนข้อมูลลับ 14 ค่า ไม่พบ | git |
| W10 | GitHub Pages Deploy (workflow_dispatch #3 จาก main) | ✅ สำเร็จ 42 s · bundle `index-C8n4RR0v.js` มี LIVE 75/25 cm refresh 5 s และเลือก LIVE ก่อน | https://nmnichoti24-max.github.io/water-level-thingsboard/ |
| W11 | grant-live.mjs บัญชี Dev5678 | ✅ ผู้ใช้อนุญาต → `--apply` สำเร็จ: `sim=true liveDevices=1` (SIM คงเดิม) ตรวจซ้ำด้วย dry-run แล้ว | สคริปต์ |
| W11a | SENSOR ERROR end-to-end (Serial ↔ ThingsBoard) | ✅ Serial `NO_ECHO` + upload `sensorValid:false` ไม่มีค่าระดับน้ำ ↔ ThingsBoard latest `distance:null, sensorValid:false` · uploads ok=250 fail=0 · ⏳ OLED/LED รอผู้ใช้ยืนยันด้วยตา | `serial-live-now.log` |
| W12 | Vercel Production Deploy | ✅ READY 2 ครั้ง (ครั้งที่ 2 หลังแก้ env) · alias https://esp32s3-water-level-monitor.vercel.app · API ไม่ล็อกอิน → 401 AUTH_REQUIRED | `vercel deploy --prod` |
| W13 | ตั้ง `TB_REAL_DEVICE_ID`, `TB_ENABLE_LIVE_READ` ใหม่เป็น Config (ไม่ใช่ข้อมูลลับ) เพื่อให้ตรวจค่าได้ | ✅ ตรวจจาก `vercel env pull`: ค่าตรงกับ local / = "1" · Redis และ Supabase ของ Production = ที่ใช้ grant | `vercel env pull` (เทียบความเท่ากัน ลบไฟล์ทันที) |
| W14 | เว็บ Production ล็อกอิน Dev5678 (รอบแรก) | ✅ ล็อกอินได้ · ❌ Dropdown มีแต่ SIM → สาเหตุ: `TB_API_KEY` ใน Production เป็นค่าว่าง (ตอนเพิ่มเจอ "Value is empty") | Browser pane |
| W15 | ผู้ใช้เขียนทับ `TB_API_KEY` (`--force`) + Deploy ครั้งที่ 3 | ✅ READY | `vercel deploy --prod` |
| W16 | Dropdown | ✅ มี `LIVE · ESP32-S3-Water-Level` (เลือกเป็นค่าเริ่มต้น) และ `SIM · ESP32-S3-Water-Level-SIM` | Browser pane |
| W17 | Dashboard LIVE | ✅ แหล่งข้อมูล "LIVE · ESP32-S3 จริง", Device Activity ACTIVE, Online 3–8 วินาที | Browser pane 14:53 |
| W18 | Serial = เว็บ ณ เวลาเดียวกัน | ✅ Serial `distance=136.2 cm 0.00 % NORMAL` (ok=492 fail=0) = เว็บ ระยะ 136.2 cm, 0 cm, 0 %, NORMAL | `serial-web-compare1.log` |
| W19 | Settings LIVE | ✅ 75 / 25 / 20 / 600 cm, 70 / 85 %, รีเฟรช 5 วินาที, Offline 60 วินาที · ตาราง config.h แสดง 25 / 100 / 20 / 600 / 70 / 85 | Browser pane |
| W20 | History LIVE | ✅ ข้อมูลจาก ThingsBoard, 1 ชม.: ต่ำสุด 0, สูงสุด 75, เฉลี่ย 28.4 cm, มีปุ่ม Export CSV | Browser pane |
| W21 | Alerts LIVE | ✅ แสดง DANGER (86.5–100 %) และ SENSOR ERROR จากข้อมูลจริง กรองสถานะได้ | Browser pane |

## 8. เกณฑ์สถานะ: ปัจจุบัน vs คำขอในอนาคต

### 8.1 เกณฑ์ปัจจุบัน (ใช้งานอยู่ใน Firmware 1.2.0 และเว็บ Production · ใช้ทดสอบรอบนี้)

สถานะคิดจาก **เปอร์เซ็นต์ระดับน้ำ** (`WARNING_PERCENT 70`, `DANGER_PERCENT 85`) โดย `waterPercent = (100 − Dist) / 75 × 100` จำกัด 0–100

| ระยะ Dist | waterPercent | สถานะ | LED |
|---|---|---|---|
| 20 – 36.25 cm | ≥ 85 % | DANGER | แดงติดค้าง |
| > 36.25 – 47.5 cm | ≥ 70 – < 85 % | WARNING | เหลือง |
| > 47.5 – 600 cm (> 100 cm = 0 %) | < 70 % | NORMAL | เขียว |
| < 20 cm, > 600 cm, NO_ECHO, valid < 4/7 | – | SENSOR ERROR | แดงกะพริบ |

### 8.2 เกณฑ์ใหม่ที่ต้องการ (บันทึก 26 พ.ย. 2026 · **ยังไม่อนุญาตให้แก้ Firmware / Upload / เปลี่ยนเว็บ**)

สถานะคิดจาก **ระยะ Dist** โดยตรง

| ระยะ Dist (ค่าที่อ่านได้ถูกต้อง) | สถานะ | LED |
|---|---|---|
| < 20 cm หรืออ่านค่าไม่ได้ | SENSOR ERROR | แดงกะพริบ |
| 20 – 30 cm (ส่วน 0–20 cm เป็น SENSOR ERROR ตามแถวบน) | DANGER | แดง |
| > 30 – 50 cm | WARNING | เหลือง |
| > 50 – 100 cm | NORMAL | เขียว |
| > 100 cm | NORMAL, waterPercent 0 % | เขียว |

- คงสูตรเปอร์เซ็นต์เดิม (empty 100 / full 25) เปอร์เซ็นต์ใช้แสดงผลเท่านั้น ไม่ใช้ตัดสินสถานะ
- คงระบบ SENSOR ERROR เดิม (median 7 ครั้ง, ต้องได้ ≥ 4, ไม่ส่งค่าระดับน้ำเมื่อ error)
- เมื่อแก้ ต้องให้ Firmware, OLED, LED, payload `status` ที่ส่ง ThingsBoard และเว็บ (Dashboard, History, Alerts, Settings) ใช้เกณฑ์เดียวกัน แล้ว Deploy ใหม่

### 8.3 ความต่างที่ต้องรู้ก่อนเปลี่ยน

| ระยะ | ปัจจุบัน | อนาคต |
|---|---|---|
| 30 – 36.25 cm | DANGER | WARNING |
| 47.5 – 50 cm | NORMAL | WARNING |
| > 100 cm | NORMAL | NORMAL (เหมือนเดิม) |

## 9. ตรวจสอบปัญหา "นำวัตถุเข้าใกล้มากแล้วถังแสดง 95%" (26 พ.ย. 2026 15:00 · ตรวจอย่างเดียว ยังไม่แก้)

### 9.1 ค่าจริง ณ เวลาเดียวกัน

| ชั้น | ค่า | สูตร / หมายเหตุ |
|---|---|---|
| Serial ping ทั้ง 7 ครั้ง | 1647–1674 µs = 28.8–29.3 cm (นิ่งทุก ping) | `serial-95pct.log` |
| Firmware | distance 28.8 cm, level 71.2 cm, **94.93 %**, DANGER | (100 − 28.8) / 75 × 100 = 94.93 ✓ |
| ThingsBoard payload | `distance:28.8, waterLevel:71.2, waterPercent:94.93, status:DANGER, sensorValid:true, simulated:false` | HTTP 200 ok=573 |
| Backend (`server/telemetry.js`) | ส่งต่อเฉพาะ `distance`, `sensorValid`, `status` ไม่คำนวณเปอร์เซ็นต์ | ไม่มีสูตร |
| Frontend (`model.js measure()`) | 28.8 cm → level 71.2 cm, **94.9 %**, DANGER · รูปถังปัดเป็น **95 %** | ใช้โปรไฟล์ LIVE 75/25 ✓ |
| localStorage | ไม่มีค่าที่บันทึกไว้ (`water-monitor-prefs*` ว่าง) → ใช้ค่าเริ่มต้น LIVE 75 / 25 / 20 / 600 / 70 / 85 | ไม่มี calibration เก่าค้าง |
| ใช้ calibration SIM (100/30) ซ้ำหรือไม่ | ไม่ใช่: ถ้าใช้ SIM จะได้ 100 % (101.2 ถูก clamp) แต่เว็บแสดง 94.9 % | ✓ |

### 9.2 สาเหตุ (สมมติฐาน · ต้องทดสอบซ้ำ)

สูตรทุกชั้นตรงกันและตรงตามที่ต้องการ `clamp((100 − d) / 75 × 100, 0, 100)` · เว็บไม่ได้ใช้ calibration เก่าของ SIM · สิ่งที่พบคือ **เซนเซอร์รายงานค่านิ่งประมาณ 28.8–29.2 cm** ขณะนำวัตถุเข้าใกล้ จึงไม่ถึง ≤ 25 cm ที่ทำให้เป็น 100 %

**ยังไม่สรุปว่าเป็นระยะอับของหัววัด** สาเหตุที่เป็นไปได้ (ต้องแยกด้วยการทดสอบซ้ำ):
1. ระยะอับ / เสียงก้องของหัววัด JSN-SR04T
2. วัตถุอื่นในลำคลื่นที่อยู่ห่างประมาณ 29 cm (ขั้น ก ตั้งเป้า 60 cm แต่วัดได้ 33.3 cm นิ่ง แสดงว่ามีวัตถุอื่นถูกวัดก่อนเป้าได้จริง)
3. วัตถุทดสอบเล็ก/เอียง/ผิวนุ่ม สะท้อนเสียงไม่ดี
4. ระยะที่ผู้ใช้วางจริงต่างจากที่คิด (ยังไม่ได้วัดด้วยไม้บรรทัด)

วิธีแยก: วัดระยะจริงด้วยไม้บรรทัด ใช้แผ่นแข็งเรียบตั้งฉาก ยกหัววัดให้พ้นโต๊ะ/สิ่งกีดขวาง แล้วไล่ระยะ 40 → 35 → 30 → 25 → 22 → 20 cm บันทึก Serial ทุกจุด

### 9.3 การตรวจขอบเขตตามที่ต้องการ (ตรวจจากโค้ด + unit test, ยังไม่ทดสอบกับฮาร์ดแวร์ทุกจุด)

| เงื่อนไข | Firmware | เว็บ |
|---|---|---|
| sensorValid=true, d ≤ 25 cm (≥ 20) | 100 % ✓ (clamp) | 100 % ✓ |
| sensorValid=true, d ≥ 100 cm | 0 % ✓ (ทดสอบจริง 126–196 cm) | 0 % ✓ (ทดสอบจริง 136.2 cm) |
| อ่านไม่ได้ / d < 20 cm | SENSOR ERROR ไม่ส่งค่าระดับ ✓ | SENSOR ERROR ✓ (ทดสอบจริง) |

## 10. รายการแก้ไขในอนาคต (รวม · **ยังไม่อนุญาตให้แก้หรือ Deploy**)

1. เกณฑ์สีไฟ/สถานะใหม่ตามระยะ Dist (หัวข้อ 8.2)
2. Calibration ใหม่ที่ผู้ใช้เสนอ (บันทึก 26 พ.ย. 2026 · ยังไม่อนุญาต):

   | ค่า | ปัจจุบัน | ใหม่ |
   |---|---|---|
   | Empty distance | 100 cm | 100 cm |
   | Full distance | 25 cm | **30 cm** |
   | Water height (span) | 75 cm | **70 cm** |
   | สูตร % | clamp((100 − d) / 75 × 100, 0, 100) | **clamp((100 − d) / 70 × 100, 0, 100)** |
   | 100 % เมื่อ (sensorValid=true) | d ≤ 25 cm | **d ≤ 30 cm** |

   สถานะ/LED ใหม่ตามระยะ (แทนหัวข้อ 8.2 ส่วนที่ต่างกัน): ไฟแดง DANGER 0–30 cm · ไฟเหลือง WARNING > 30–50 cm · ไฟเขียว NORMAL > 50 cm · SENSOR ERROR แดงกะพริบเหมือนเดิม (รวมกรณี < 20 cm / อ่านไม่ได้)
   - เส้นเตือนบนรูปถังต้องย้ายตาม: WARNING ที่ d = 50 cm = (100 − 50) / 70 = **71.4 %**, DANGER ที่ d = 30 cm = **100 %**
   - ต้องปรับ Firmware (`SENSOR_TO_FULL_CM 30`, สถานะจากระยะ), OLED, LED, payload `status` ที่ส่ง ThingsBoard, เว็บ (`LIVE_SETTINGS` tankHeight 70 / sensorOffset 30, การคำนวณสถานะ, เส้นเตือนรูปถัง, Alerts) และ unit test ให้ตรงกันทั้งหมด
   - ต้องทดสอบระยะจริงด้วยไม้บรรทัดก่อนยืนยันค่า calibration
3. พิจารณาให้ค่าที่ติดขอบล่าง (≈ ระยะต่ำสุดของเซนเซอร์) แสดงเป็น "ใกล้เกินระยะวัด" แทนตัวเลขปกติ
4. รูปถังปัดเป็นจำนวนเต็ม (95 %) ขณะการ์ดแสดง 94.9 % → พิจารณาแสดงทศนิยมเท่ากัน

## 11. ทดสอบตามระยะ (เกณฑ์ปัจจุบัน 70/85 %)

| ขั้น | ระยะที่ผู้ใช้ตั้ง | Serial (7 pings) | Firmware | เว็บ Dashboard | ThingsBoard | OLED / LED | ผล |
|---|---|---|---|---|---|---|---|
| ก | 60 cm (ตามแผน) | 1880–1905 µs = 32.9–33.3 cm นิ่ง | 33.3 cm, 66.7 cm, 88.93 %, DANGER | 33.3 cm, 66.7 cm, 88.9 %, DANGER (Online) | HTTP 200 ok=596–598, `sensorValid:true, simulated:false` | ⏳ รอผู้ใช้ | ⚠️ Serial = เว็บ = ThingsBoard ตรงกัน แต่ระยะที่วัดได้ 33.3 cm ไม่ใช่ 60 cm → รอยืนยันระยะจริง / สิ่งกีดขวางในลำคลื่น |

| ก (ซ้ำ) | 60 cm (ตามแผน) | รอบ 1: 2/7 (22.6, 20.7 cm) · รอบ 2: 110–159 cm กระจาย · รอบ 3: 71 / 40 / 26.0 ×4 / 73 cm | รอบ 1 SENSOR_ERROR (TOO_FEW_SAMPLES) · รอบ 2 119.4 cm 0 % NORMAL · รอบ 3 26.0 cm 98.67 % DANGER | รอบ 1: SENSOR ERROR (ตรง Serial) | HTTP 200 ok=626–628 | ⏳ | ⚠️ ค่าไม่นิ่ง (เป้า/หัววัดน่าจะยังขยับ) ยังไม่ได้ผลที่ 60 cm · **พบว่าเซนเซอร์อ่านได้ 26.0, 22.6, 20.7 cm → ค่า ~29 cm ก่อนหน้าไม่ใช่ขีดจำกัดต่ำสุดของหัววัด** (สนับสนุนสาเหตุข้อ 2–4 ในหัวข้อ 9.2) |

หมายเหตุ: JSN-SR04T มีมุมลำคลื่นกว้าง วัตถุอื่นที่ใกล้กว่าเป้า (ขอบโต๊ะ, มือ, พื้น, ผนังด้านข้าง) จะถูกวัดก่อน

## 12. Firmware 1.3.0 + เว็บเกณฑ์ตามระยะ (26 พ.ย. 2026 · ผู้ใช้อนุญาตให้แก้ / Upload / Deploy)

### 12.1 วิเคราะห์เซนเซอร์ก่อนแก้ (Firmware 1.2.0, เป้าตั้งไว้ 60 cm, 60 วินาที)

| ค่า | ผล |
|---|---|
| ping ทั้งหมด / valid / NO_ECHO | 84 / 84 / 0 |
| Pulse | 1198–1202 µs (rise หลัง TRIG 12.3 ms คงที่) |
| ระยะ min / max / median / SD | 20.9 / 21.0 / 21.0 cm / **0.0 cm** |
| อยู่ในช่วง 55–65 cm | 0 / 84 |

สรุป: ค่านิ่งมาก (SD 0.0) → ไม่ใช่สัญญาณรบกวนไฟฟ้า/Wi-Fi/จังหวะ ping · เซนเซอร์ได้ยินวัตถุแข็งที่ ~21 cm (ตัวยึด/ขอบโต๊ะ/สิ่งของในลำคลื่น) ก่อนเป้าที่ 60 cm · ค่ากระโดด 20/159 cm ก่อนหน้าเกิดขณะขยับอุปกรณ์

### 12.2 สิ่งที่แก้ (commit `ec97b9e`)

| ส่วน | ค่า |
|---|---|
| Calibration LIVE | empty 100 cm, full 30 cm, span 70 cm · % = clamp((100 − d) / 70 × 100, 0, 100) |
| สถานะ (Firmware + OLED + LED + payload `status` + เว็บ) | d ≤ 30 DANGER แดง · 30 < d ≤ 50 WARNING เหลือง · d > 50 NORMAL เขียว · อ่านไม่ได้ / d < 20 → SENSOR ERROR แดงกะพริบ ไม่ส่งค่าระดับ |
| SIM | calibration 30/130 เดิม · เกณฑ์ 60/45 cm = 70/85 % เดิม (มี unit test ยืนยัน) |
| ping gap | 100 ms · Median 7 ครั้ง ต้อง valid ≥ 4 (ไม่ลดเกณฑ์) |
| เว็บ | Settings เป็นเกณฑ์ระยะ (cm) · เส้นเตือนรูปถัง ≤50 cm = 71.4 %, ≤30 cm = 100 % · localStorage key v2 |
| ไม่เปลี่ยน | Login, LIVE/SIM, ACL บัญชี, TLS, Token |

### 12.3 ผลทดสอบจริง

| รายการ | ผล |
|---|---|
| สำรอง Firmware 1.2.0 (source + .bin ที่อยู่บนบอร์ด) | ✅ `outputs/work/firmware-backups/fw-1.2.0-on-board-*` |
| Unit tests | ✅ 45/45 (รวม Firmware = เว็บ ทุกระยะ 20–600 cm, เกณฑ์สีใหม่, SIM คงเดิม) |
| Build Vercel / Pages | ✅ |
| Compile + Upload 1.3.0 ผ่าน COM3 | ✅ Hash verified · 1,160,084 B (36 %) |
| Wi-Fi / NTP / HTTPS | ✅ IP 172.20.10.2, NTP synced 08:23:27 UTC, HTTP 200 ok=40 fail=0 |
| Commit / Push / main | ✅ `ec97b9e` บน `feature/esp32s3-live-hardware` และ `main` |
| Vercel Production | ✅ READY https://esp32s3-water-level-monitor.vercel.app |
| GitHub Pages | ✅ bundle `index-De_0e3oG.js` มี LIVE 70/30, เกณฑ์ 50/30 cm |
| เว็บ Production (หลังล้าง cache) | ✅ LIVE เลือกเป็นค่าเริ่มต้น + มี SIM · เส้นเตือน "เตือน ≤50 cm · 71.4 %", "อันตราย ≤30 cm · 100 %" · สถานะ SENSOR ERROR ตรงกับ Serial |
| เซนเซอร์หลังอัปโหลด | ❌ ส่วนใหญ่ NO_ECHO, บางรอบ 2/7 (104.8 cm) → SENSOR ERROR ตามจริง (ไม่ล็อกค่า ไม่สร้างค่าปลอม) · ยังไม่ได้ทดสอบ NORMAL/WARNING/DANGER ด้วย 1.3.0 |
| OLED / LED ด้วยตา, ไฟเหลือง, Session Expired | ⏳ ยังไม่ได้ทดสอบ |

หมายเหตุ: หลัง Deploy หน้าเว็บที่เปิดค้างอาจใช้ไฟล์เก่าจาก cache ของ GitHub Pages ได้ถึง 10 นาที ให้กด Ctrl+F5

### 12.4 ทางเลือกสำรองสำหรับการนำเสนอ

ถ้าเซนเซอร์ยังไม่ได้ echo ที่นิ่งตอนนำเสนอ ให้เลือก Dropdown **SIM · ESP32-S3-Water-Level-SIM** (ข้อมูลจำลอง ติดป้าย "ข้อมูลจำลอง (SIM)" ชัดเจน ไม่ปนกับ LIVE) และแสดง LIVE ในสถานะ SENSOR ERROR เป็นตัวอย่างการจัดการข้อผิดพลาด
