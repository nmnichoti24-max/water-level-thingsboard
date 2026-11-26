# WaterGuard Pro – ESP32-S3 Firmware

Firmware สำหรับบอร์ด **ESP32-S3-N16R8** (Flash 16MB, PSRAM 8MB OPI, USB-UART CH343) ส่งข้อมูลระดับน้ำผ่าน **HTTPS (ตรวจใบรับรอง)** ไปยัง ThingsBoard Cloud ให้เว็บ
[WaterGuard Pro](https://nmnichoti24-max.github.io/water-level-thingsboard/) แสดงผล

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `WaterGuard_ESP32S3.ino` | โปรแกรมหลัก: Wi-Fi + reconnect, SIM/LIVE, HTTPS, RGB LED |
| `config.h` | โหมด, GPIO, calibration, threshold, timing (ไม่มีข้อมูลลับ) |
| `ca_certs.h` | Root CA (ISRG) สำหรับตรวจใบรับรอง `thingsboard.cloud` |
| `secrets.example.h` | แม่แบบ → คัดลอกเป็น `secrets.h` |
| `secrets.h` | Wi-Fi + Token จริง **อยู่ใน `.gitignore` ห้าม Commit / ห้ามส่งในแชต** |

## โหมดการทำงาน (`config.h` → `WG_MODE`)

| โหมด | ส่งข้อมูลไปที่ | ใช้ Token | GPIO เซนเซอร์ |
|---|---|---|---|
| `WG_MODE_SAFE` | ไม่ส่ง (ตรวจ Wi-Fi + TLS เท่านั้น) | – | ไม่แตะ |
| `WG_MODE_SIM` **(ค่าเริ่มต้น)** | `ESP32-S3-Water-Level-SIM` | `THINGSBOARD_SIM_DEVICE_TOKEN` | ไม่แตะ |
| `WG_MODE_LIVE` | `ESP32-S3-Water-Level` | `THINGSBOARD_DEVICE_TOKEN` | TRIG=GPIO5, ECHO=GPIO6 |

กันข้อมูลจำลองหลุดเข้า LIVE:
- โหมด SIM ใช้ได้เฉพาะ SIM Token, ทุกบรรทัด Serial ขึ้นต้น `[SIM]` และ payload มี `"simulated":true`
- Compile ไม่ผ่านถ้า SIM Token กับ LIVE Token เหมือนกัน
- โหมด LIVE Compile ไม่ผ่านจนกว่าจะตั้ง `WIRING_VERIFIED 1`
- ถ้า Token ยังเป็นค่า placeholder จะไม่ส่งข้อมูล (ทำแค่ TLS check)

## Telemetry (ตรงกับ `app/server/telemetry.js` และ `scripts/Send-SimulatedTelemetry.ps1`)

`distance` (cm), `waterLevel` (cm), `waterPercent` (%), `status` (`NORMAL|WARNING|DANGER`), `sensorValid` (bool), `uptime` (s), `rssi` (dBm)
เพิ่มเติม: `sensorError` (LIVE เมื่ออ่านไม่ได้), `simulated` (SIM เท่านั้น)
Endpoint: `POST https://<THINGSBOARD_HOST>/api/v1/<TOKEN>/telemetry` (ไม่พิมพ์ Token ออก Serial)

SIM ใช้รอบเดียวกับสคริปต์: 20% → 95% → 20% ทีละ 5% ทุก 5 วินาที

## ไฟ RGB บนบอร์ด (WS2812, GPIO48)

ตอนบูตจะทดสอบ แดง → เขียว → น้ำเงิน → ขาว → ดับ จากนั้นแสดงสถานะ:

| สี | ความหมาย |
|---|---|
| น้ำเงินกะพริบ | กำลังเชื่อมต่อ Wi-Fi |
| ม่วง (magenta) | ส่งข้อมูล SIM สำเร็จ |
| เขียว | ส่ง LIVE สำเร็จ / TLS OK |
| แดง | ส่งไม่สำเร็จ / TLS ล้มเหลว |
| ส้ม-เหลือง | ยังไม่ได้กรอก `secrets.h` |

ถ้าไฟไม่ติด: บางบอร์ดต้องบัดกรีเชื่อม jumper ที่เขียนว่า `RGB` หรือใช้ GPIO38 (แก้ `RGB_LED_PIN`)

## Board settings (Arduino IDE / CLI)

Board **ESP32S3 Dev Module** (core `esp32:esp32` ของ Espressif ≥ 3.x, ทดสอบกับ 4.0.0)

| ตัวเลือก | ค่า |
|---|---|
| Flash Size | 16MB (128Mb) |
| PSRAM | OPI PSRAM |
| Flash Mode | QIO 80MHz |
| Partition Scheme | 16M Flash (3MB APP/9.9MB FATFS) |
| USB CDC On Boot | Disabled (Serial ออกทาง CH343 / UART0) |
| Upload Mode | UART0 / Hardware CDC |

ใช้พอร์ต USB-C ที่เขียน **COM / UART** (CH343, VID `1A86` PID `55D3`) ไม่ใช่พอร์ต `USB`

```bash
FQBN="esp32:esp32:esp32s3:FlashSize=16M,PSRAM=opi,FlashMode=qio,PartitionScheme=app3M_fat9M_16MB,USBMode=hwcdc,CDCOnBoot=default,UploadMode=default,UploadSpeed=921600"
arduino-cli compile --fqbn "$FQBN" firmware/WaterGuard_ESP32S3
arduino-cli upload  --fqbn "$FQBN" -p COM3 firmware/WaterGuard_ESP32S3
arduino-cli monitor -p COM3 -c baudrate=115200
```

LIVE กับบอร์ดที่ตรวจวงจรแล้ว (ไม่ต้องแก้ config.h ซึ่ง Commit ไว้เป็นค่าปลอดภัย SIM / gate = 0):

```bash
arduino-cli compile --fqbn "$FQBN" --build-property "compiler.cpp.extra_flags=-DWG_MODE=2 -DWIRING_VERIFIED=1 -DEXTERNAL_LEDS_VERIFIED=1 -DSENSOR_DEBUG=1" firmware/WaterGuard_ESP32S3
```

`SENSOR_DEBUG=1` พิมพ์ผลทั้ง 7 ping, แรงดันสูงสุดของ ECHO (ADC) และเวลา rise/width ของพัลส์ ใช้วิเคราะห์ `NO_ECHO`
(JSN-SR04T รุ่นที่ทดสอบ: ECHO ขึ้นหลัง Trigger ~12.3 ms และส่งพัลส์ 35.4 ms คงที่เมื่อไม่ได้ยินเสียงสะท้อน)

ถ้า Upload ขึ้น `Failed to connect`: กดค้าง **BOOT** → กด **RST** หนึ่งครั้ง → ปล่อย **BOOT** แล้วสั่ง upload ใหม่ (หลัง upload เสร็จกด **RST** หนึ่งครั้ง)

## ขั้นตอนใช้งาน

1. คัดลอก `secrets.example.h` → `secrets.h` กรอก Wi-Fi **2.4 GHz** และ Token ของ `ESP32-S3-Water-Level-SIM`
2. Compile + Upload (โหมด SIM) → Serial ต้องเห็น `[SIM Upload] ... HTTP 200 OK`
3. เปิดเว็บ เลือก Device SIM ต้องเห็นค่าขยับ 20–95%
4. เมื่อต่อ JSN-SR04T ตาม `docs/hardware/WIRING-DIAGRAM-TH.md` และตรวจแล้ว: ตั้ง `WIRING_VERIFIED 1`, `WG_MODE WG_MODE_LIVE`, กรอก LIVE Token แล้ว Upload ใหม่
5. LED ภายนอก (GPIO18 เขียว / GPIO17 เหลือง / GPIO16 แดง + ตัวต้านทาน 220–330 Ω): ตั้ง `EXTERNAL_LEDS_VERIFIED 1` หลังต่อและตรวจวงจรแล้วเท่านั้น

Wi-Fi หลุดจะเชื่อมต่อใหม่อัตโนมัติ (timeout 20 s, backoff 2 → 60 s) ดูปัญหาอื่นใน `docs/hardware/TROUBLESHOOTING-TH.md`
