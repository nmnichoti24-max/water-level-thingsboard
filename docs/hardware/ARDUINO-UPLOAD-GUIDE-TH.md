# คู่มือ Compile และ Upload เฟิร์มแวร์ WaterGuard Pro (Arduino IDE 2.x / Arduino CLI)

เฟิร์มแวร์อยู่ที่ `firmware/WaterGuard_ESP32S3/`

| ไฟล์ | หน้าที่ |
| --- | --- |
| `WaterGuard_ESP32S3.ino` | โปรแกรมหลัก (Wi-Fi, อ่านเซนเซอร์, คำนวณระดับน้ำ, ส่ง HTTPS) |
| `config.h` | ขา GPIO, ค่าคาลิเบรตถัง, เกณฑ์ 70/85%, รอบส่งข้อมูล, สวิตช์ความปลอดภัย `WIRING_VERIFIED` |
| `ca_certs.h` | Root CA ของ ThingsBoard Cloud (ISRG Root X1 + ISRG Root YR) สำหรับตรวจใบรับรอง TLS |
| `secrets.example.h` | ตัวอย่างไฟล์ข้อมูลลับ คัดลอกเป็น `secrets.h` แล้วกรอกค่าจริง (ไฟล์ `secrets.h` ถูก ignore ไม่ขึ้น GitHub) |

ไม่ต้องติดตั้ง Library เพิ่ม ใช้เฉพาะ `WiFi`, `WiFiClientSecure`, `HTTPClient` ที่มากับ ESP32 core ของ Espressif

## 1. ติดตั้ง ESP32 Board Package

**Arduino IDE 2.x (Windows และ macOS เหมือนกัน)**

1. เปิด **File → Preferences** (macOS: **Arduino IDE → Settings**)
2. ช่อง **Additional boards manager URLs** ใส่
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. เปิด **Tools → Board → Boards Manager** ค้นหา `esp32` เลือก **esp32 by Espressif Systems** กด **Install** (ไฟล์ใหญ่หลาย GB รอจนเสร็จ)

**Arduino CLI** (ที่ใช้ทดสอบในเครื่อง Windows นี้: Arduino CLI 1.6.0)

```bash
arduino-cli config init
arduino-cli config set board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32
```

## 2. เตรียม secrets.h

```bash
cp firmware/WaterGuard_ESP32S3/secrets.example.h firmware/WaterGuard_ESP32S3/secrets.h
```

เปิด `secrets.h` กรอก `WIFI_SSID`, `WIFI_PASSWORD` (Wi-Fi 2.4 GHz เท่านั้น), `THINGSBOARD_HOST` และ `THINGSBOARD_DEVICE_TOKEN` ของ Device **ESP32-S3-Water-Level** (Device จริง ไม่ใช่ `-SIM`) ดูวิธีคัดลอก Token ใน [THINGSBOARD-LIVE-SETUP-TH.md](THINGSBOARD-LIVE-SETUP-TH.md) ห้ามส่งไฟล์นี้ในแชตหรือ Commit

ตรวจว่า Git ไม่เห็นไฟล์นี้: `git check-ignore -v firmware/WaterGuard_ESP32S3/secrets.h` ต้องแสดงบรรทัด `.gitignore`

## 3. เลือก Board

บอร์ดของโครงงานมี USB-C สองช่อง ช่อง **COM** ต่อกับชิป WCH CH343 (USB-UART) ช่อง **USB** ต่อกับ USB ในตัวของ ESP32-S3 คู่มือนี้ใช้ช่อง **COM**

| เมนู Tools | ค่า |
| --- | --- |
| Board | **ESP32S3 Dev Module** (`esp32:esp32:esp32s3`) |
| USB CDC On Boot | **Disabled** (เมื่อเสียบช่อง COM, Serial ออกทาง CH343) |
| Upload Speed | 921600 (ถ้า Upload ล้ม ลด 115200) |
| Flash Size / PSRAM | ค่าเริ่มต้นใช้ได้ เฟิร์มแวร์นี้ไม่ใช้ PSRAM |
| Core Debug Level | **None** (ระดับ Debug/Verbose อาจพิมพ์ URL ที่มี Token) |

ถ้าเสียบช่อง **USB** แทน ให้ตั้ง **USB CDC On Boot = Enabled** มิฉะนั้น Serial Monitor จะว่าง

## 4. เลือก Port

| ระบบ | วิธีตรวจ | ชื่อที่คาดว่าจะเห็น |
| --- | --- | --- |
| Windows (ตรวจแล้วในเครื่องนี้) | Device Manager → Ports (COM & LPT) หรือ `arduino-cli board list` | `USB Serial Device (COM3)` = `USB\VID_1A86&PID_55D3` (CH343) |
| macOS | `ls /dev/cu.*` ก่อนและหลังเสียบสาย | `/dev/cu.usbmodemXXXX` หรือ `/dev/cu.wchusbserialXXXX` |

macOS 11 ขึ้นไปมีไดรเวอร์ CH34x ในตัว ถ้าไม่เห็นพอร์ตให้เปลี่ยนสาย USB-C เป็นสายที่รับส่งข้อมูลได้ (สายชาร์จอย่างเดียวจะไม่เห็นพอร์ต) แล้วจึงพิจารณาไดรเวอร์จาก WCH (wch-ic.com) เท่านั้น

## 5. Compile

Arduino IDE: กด ✓ **Verify**

Arduino CLI:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32s3 firmware/WaterGuard_ESP32S3
```

## 6. Upload (ทำหลังตรวจการต่อสายแล้วเท่านั้น)

ลำดับที่ปลอดภัย:

1. Upload ครั้งแรกด้วย `WIRING_VERIFIED 0` (ค่าเริ่มต้น) เฟิร์มแวร์จะไม่แตะขา TRIG/ECHO และไม่ส่ง Telemetry ใช้ทดสอบ Wi-Fi และ TLS อย่างเดียว
2. เมื่อผ่าน [รายการตรวจก่อนจ่ายไฟ](WIRING-DIAGRAM-TH.md#รายการตรวจก่อนจ่ายไฟ-ต้องผ่านทุกข้อ) แล้ว จึงแก้เป็น `WIRING_VERIFIED 1` แล้ว Upload อีกครั้ง

Arduino IDE: กด → **Upload**

Arduino CLI (Windows ใช้ `COM3`, macOS ใช้ `/dev/cu.xxx`):

```bash
arduino-cli upload --fqbn esp32:esp32:esp32s3 -p COM3 firmware/WaterGuard_ESP32S3
```

### ใช้ปุ่ม BOOT และ RESET (RST)

บอร์ดที่ต่อผ่าน CH343 ปกติเข้าโหมด Download อัตโนมัติ ถ้า Upload ค้างที่ `Connecting....` หรือขึ้น `Failed to connect to ESP32-S3`:

1. กดปุ่ม **BOOT** ค้างไว้
2. กดแล้วปล่อยปุ่ม **RST** (บางบอร์ดพิมพ์ `EN` หรือ `RESET`)
3. ปล่อยปุ่ม **BOOT**
4. กด Upload ใหม่
5. เมื่อ Upload เสร็จ กด **RST** หนึ่งครั้งเพื่อเริ่มเฟิร์มแวร์

## 7. Serial Monitor

ตั้ง baud **115200** (Arduino IDE: **Tools → Serial Monitor** / CLI: `arduino-cli monitor -p COM3 -c baudrate=115200`)

ตัวอย่างข้อความที่ควรเห็นเมื่อ `WIRING_VERIFIED 1`:

```
WaterGuard Pro ESP32-S3 firmware 1.0.0
Device target: ThingsBoard LIVE device on thingsboard.cloud (token hidden)
Calibration: full=30.0 cm bottom=130.0 cm span=100.0 cm range=20-600 cm thresholds W=70% D=85%
Sensor: TRIG=GPIO4 ECHO=GPIO5 interval=5000 ms
[WiFi] Connecting to "<ชื่อ Wi-Fi>" (timeout 20 s)
[WiFi] Connected IP=192.168.x.x RSSI=-58 dBm
[Sensor] OK 7/7 pings  distance=xx.x cm  level=xx.x cm  percent=xx.xx %  status=NORMAL
[Upload] HTTP 200 OK  (ok=1 fail=0) payload={"ts":...,"values":{...}}
```

เฟิร์มแวร์ไม่พิมพ์รหัส Wi-Fi และ Access Token ในทุกกรณี ถ้าอ่านเซนเซอร์ไม่ได้จะเห็น `[Sensor] ERROR NO_ECHO ...` และส่ง `sensorValid=false` โดยไม่ส่งค่าระยะปลอม

ปัญหาที่พบบ่อยดู [TROUBLESHOOTING-TH.md](TROUBLESHOOTING-TH.md)
