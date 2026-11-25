# ตั้งค่า ThingsBoard Cloud สำหรับอุปกรณ์จริง (LIVE)

## สถานะที่ตรวจแล้ว (24 พ.ย. 2026)

ตรวจผ่าน backend ของโปรเจกต์ (`app/server/telemetry.js`) ด้วยค่าใน `app/.env.local` แบบอ่านอย่างเดียว:

| รายการ | ผล |
| --- | --- |
| ThingsBoard | `https://thingsboard.cloud` |
| Device จริง | **`ESP32-S3-Water-Level`** มีอยู่แล้ว (`TB_REAL_DEVICE_ID` เป็น UUID ที่ถูกต้อง) **ใช้ Device นี้ ไม่ต้องสร้าง `-LIVE` ซ้ำ** |
| Device จำลอง | `ESP32-S3-Water-Level-SIM` (ID แยกจาก Device จริง) |
| Telemetry ของ Device จริง | ยังว่าง (ไม่มีข้อมูลใน 7 วันล่าสุด) ไม่มีข้อมูลจำลองปน |
| การอ่าน LIVE จาก backend | HTTP 200, `TB_ENABLE_LIVE_READ=1`, ใช้ API key แบบอ่านอย่างเดียว ("WaterGuard Reader") |

ข้อห้าม: ห้ามรัน `scripts/Send-SimulatedTelemetry.ps1` ด้วย Token ของ `ESP32-S3-Water-Level` สคริปต์จำลองใช้กับ `-SIM` เท่านั้น

## Telemetry ที่เฟิร์มแวร์ส่ง (ตรงกับ backend เดิม)

Endpoint: `POST https://thingsboard.cloud/api/v1/<DEVICE_TOKEN>/telemetry` (HTTPS, ตรวจใบรับรองด้วย ISRG Root)

ตัวอย่างค่าปกติ:

```json
{"ts":1795485000000,"values":{"distance":45.2,"waterLevel":84.8,"waterPercent":84.80,"status":"WARNING","sensorValid":true,"uptime":3605,"rssi":-58}}
```

ตัวอย่างเมื่ออ่านเซนเซอร์ไม่ได้ (ไม่มี distance/waterLevel/waterPercent/status เพื่อไม่ให้เกิดค่าศูนย์ปลอม):

```json
{"ts":1795485005000,"values":{"sensorValid":false,"sensorError":"NO_ECHO","uptime":3610,"rssi":-58}}
```

| คีย์ | ชนิด | ผู้ใช้ | หมายเหตุ |
| --- | --- | --- | --- |
| `distance` | number (cm, 1 ตำแหน่ง) | เว็บ (คำนวณระดับน้ำจากคีย์นี้), Dashboard | median ของ 7 ครั้ง |
| `waterLevel` | number (cm) | Dashboard ThingsBoard | คำนวณด้วย config.h |
| `waterPercent` | number (%) | Dashboard ThingsBoard | จำกัด 0–100 |
| `status` | string | เว็บใช้เทียบความสอดคล้อง, Dashboard | `NORMAL` / `WARNING` / `DANGER` |
| `sensorValid` | boolean | เว็บ | `false` = Sensor Error |
| `uptime` | number (s) | ตรวจการรีบูต | |
| `rssi` | number (dBm) | ตรวจสัญญาณ Wi-Fi | คีย์เพิ่ม |
| `sensorError` | string | ตรวจสาเหตุ | `NO_ECHO`, `ECHO_STUCK_HIGH`, `OUT_OF_RANGE`, `TOO_FEW_SAMPLES` |

`ts` ใส่เมื่อบอร์ด Sync เวลา NTP แล้ว ถ้ายังไม่ Sync บอร์ดจะไม่ใส่ `ts` และ ThingsBoard ใช้เวลาเซิร์ฟเวอร์แทน

## คัดลอก Access Token ของ Device จริงอย่างปลอดภัย

1. เข้า ThingsBoard Cloud → **Entities → Devices** → คลิก **ESP32-S3-Water-Level** (ชื่อที่ไม่มี `-SIM`)
2. แท็บ **Details** → กด **Copy access token** (ถ้าไม่มี ให้เปิด **Manage credentials** ตรวจว่าเป็นประเภท **Access Token**)
3. วางลงใน `firmware/WaterGuard_ESP32S3/secrets.h` บรรทัด `THINGSBOARD_DEVICE_TOKEN` เท่านั้น
4. ห้ามวาง Token ในแชต, Issue, README, ภาพหน้าจอ หรือไฟล์ที่ Commit
5. ถ้าสงสัยว่า Token รั่ว: **Manage credentials** → สร้าง Token ใหม่ → แก้ `secrets.h` → Upload ใหม่ (Token เดิมใช้ไม่ได้ทันที)

Device Access Token ใช้**ส่ง**ข้อมูลเท่านั้น ส่วนเว็บ**อ่าน**ข้อมูลด้วย `TB_API_KEY` ที่อยู่ฝั่ง Server (Vercel Environment Variables) ไม่เคยส่งไปที่เบราว์เซอร์

## ตรวจผลใน ThingsBoard (TEST 07)

1. **Devices → ESP32-S3-Water-Level → Latest telemetry** ต้องเห็นคีย์ `distance`, `waterLevel`, `waterPercent`, `status`, `sensorValid`, `uptime`, `rssi`
2. คอลัมน์ **Last update time** ต้องเปลี่ยนทุก ~5 วินาที และตรงกับเวลาปัจจุบัน
3. ขยับวัตถุ (เช่น แผ่นไม้ หรือฝ่ามือ) ใกล้/ไกลหัววัด ค่า `distance` ต้องเปลี่ยนตาม และตรงกับบรรทัด `[Sensor]` ใน Serial Monitor
4. แอตทริบิวต์ **Server attributes → active** ต้องเป็น `true` ขณะบอร์ดส่งข้อมูล

## Vercel Environment Variables ที่เกี่ยวข้อง (ฝั่ง Server)

| ตัวแปร | ค่า |
| --- | --- |
| `TB_ORIGIN` | `https://thingsboard.cloud` |
| `TB_API_KEY` | API key แบบอ่านอย่างเดียว |
| `TB_REAL_DEVICE_ID` | UUID ของ `ESP32-S3-Water-Level` |
| `TB_SIM_DEVICE_ID` | UUID ของ `ESP32-S3-Water-Level-SIM` |
| `TB_ENABLE_CLOUD_READ` | `1` |
| `TB_ENABLE_LIVE_READ` | `1` |
| `AUTH_DEFAULT_LIVE` | `1` ถ้าต้องการให้ทุกบัญชีที่ Login อ่าน LIVE ได้ (ACL ราย บัญชีใน Redis ยังมีผลเหนือกว่า) |

ห้ามใช้คำนำหน้า `VITE_` กับค่าเหล่านี้ เพราะ Vite จะฝังค่าลงใน JavaScript ของเว็บ
