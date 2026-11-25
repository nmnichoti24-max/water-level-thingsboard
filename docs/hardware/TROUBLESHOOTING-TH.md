# แก้ปัญหา WaterGuard Pro (ฮาร์ดแวร์ → ThingsBoard → เว็บ)

## คอมพิวเตอร์มองไม่เห็นบอร์ด

| อาการ | สาเหตุ / วิธีแก้ |
| --- | --- |
| ไม่มี COM ใหม่ (Windows) / ไม่มี `/dev/cu.*` ใหม่ (macOS) | ใช้สาย USB-C ที่รับส่งข้อมูลได้ เสียบช่อง **COM** ลองพอร์ตอื่นของคอมพิวเตอร์ |
| Windows เห็น "Unknown device" | ติดตั้งไดรเวอร์ CH343 จาก wch-ic.com (เครื่องนี้มีไดรเวอร์แล้ว: `USB Serial Device (COM3)`) |
| macOS ไม่เห็น `cu.wchusbserial*` | macOS 11+ มีไดรเวอร์ในตัว ลองช่อง USB อีกช่องของบอร์ด (จะขึ้น `cu.usbmodem*`) |

## Upload ไม่สำเร็จ

| ข้อความ | วิธีแก้ |
| --- | --- |
| `Failed to connect to ESP32-S3: No serial data received` / ค้าง `Connecting....` | กด BOOT ค้าง → กด/ปล่อย RST → ปล่อย BOOT → Upload ใหม่ |
| `could not open port` / `Access is denied` / `Resource busy` | ปิด Serial Monitor หรือโปรแกรมอื่นที่เปิดพอร์ตอยู่ |
| Upload ล้มกลางทาง | ลด Upload Speed เป็น 115200 เปลี่ยนสาย |
| `Missing secrets.h` ตอน Compile | คัดลอก `secrets.example.h` เป็น `secrets.h` |
| `static assertion failed: SENSOR_TO_FULL_CM ...` | ค่าคาลิเบรตใน config.h ไม่สมเหตุสมผล (เต็มถังอยู่ในระยะอับ หรือก้นถังเกินระยะวัด) |

## Wi-Fi

| Serial Monitor | สาเหตุ |
| --- | --- |
| `SSID not found (check name / 2.4 GHz band)` | ชื่อผิด หรือเป็น Wi-Fi 5 GHz อย่างเดียว ESP32-S3 รองรับ 2.4 GHz เท่านั้น (Hotspot iPhone เปิด "Maximize Compatibility") |
| `connect failed (check password)` | รหัสผ่านผิด |
| `Retry in 2 s / 4 s / ... 60 s` | ปกติ เฟิร์มแวร์ถอยเวลาลองใหม่อัตโนมัติ ไม่ค้าง |

## TLS / Upload

| Serial Monitor | สาเหตุ / วิธีแก้ |
| --- | --- |
| `[TLS] FAILED ... NOT verified` หรือ `[Upload] FAILED: connection refused` | ตรวจ `THINGSBOARD_HOST` (ไม่มี `https://`) ตรวจอินเทอร์เน็ต ถ้า ThingsBoard เปลี่ยน CA ให้อัปเดต `ca_certs.h` จาก letsencrypt.org/certificates **ห้ามใช้ `setInsecure()`** |
| `HTTP 401/403/404: token/host rejected` | Token ผิด, ใช้ Token ของ `-SIM`, หรือ Host ผิดภูมิภาค (thingsboard.cloud vs eu.thingsboard.cloud) |
| `HTTP 429` | ส่งถี่เกินโควตา เฟิร์มแวร์ถอยเวลาให้เอง ถ้าเกิดบ่อยเพิ่ม `TELEMETRY_INTERVAL_MS` |

## เซนเซอร์

| Serial Monitor | สาเหตุ / วิธีแก้ |
| --- | --- |
| `ERROR NO_ECHO` ทุกครั้ง | ไฟ VCC ไม่ถึง 5 V, สลับ TRIG/ECHO, ตัวแบ่งแรงดันต่อผิด, บอร์ดอยู่โหมด UART (R27/R19), TRIG 3.3 V ไม่พอสำหรับบอร์ดรุ่นนั้น (ใส่ Level Shifter) |
| `ERROR ECHO_STUCK_HIGH` | ECHO ค้าง HIGH: ต่อสายผิดขา หรือโมดูลเสีย |
| `ERROR OUT_OF_RANGE` | วัตถุใกล้กว่าระยะอับ (~20 cm) หรือไกลเกิน 600 cm |
| `ERROR TOO_FEW_SAMPLES` | ค่ากระโดด: หัววัดเอียง ใกล้ผนังถัง หรือผิวน้ำมีคลื่น |
| ค่ากระโดดเล็กน้อย | ปกติ ±1 cm; Median ของ 7 ครั้งช่วยกรองแล้ว |

## เว็บไซต์

| อาการ | สาเหตุ |
| --- | --- |
| ไม่มีตัวเลือก LIVE | บัญชีไม่มีสิทธิ์ LIVE (Redis ACL) หรือ `TB_ENABLE_LIVE_READ`/`TB_REAL_DEVICE_ID` ไม่ได้ตั้งที่ Vercel |
| "ไม่มีข้อมูล" บน LIVE | บอร์ดยังไม่เคยส่ง ระบบไม่สร้างค่าศูนย์ปลอม |
| Stale | ไม่มีข้อมูลใหม่เกินเวลา Offline ที่ตั้ง (ค่าเริ่มต้น 60 s) |
| Offline | ไม่มีข้อมูลใหม่เกิน 3 เท่า (ค่าเริ่มต้น 180 s) ตรวจไฟเลี้ยงและ Wi-Fi ของบอร์ด |
| "อุปกรณ์รายงาน X แต่เว็บคำนวณได้ Y" | ค่าคาลิเบรตหรือเกณฑ์ในหน้า ตั้งค่า ไม่ตรงกับ config.h |
| Sensor Error | บอร์ดส่ง `sensorValid=false` หรือ distance อยู่นอกช่วงที่ตั้งในเว็บ |
