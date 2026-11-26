# การติดตั้งฮาร์ดแวร์ WaterGuard Pro (ESP32-S3 + Ultrasonic)

## อุปกรณ์

| รายการ | สถานะการยืนยัน |
| --- | --- |
| ESP32-S3 Dev Board, USB-C 2 ช่อง (COM / USB) | ผู้ใช้ยืนยันแล้ว เครื่อง Windows เห็นเป็น COM3 ผ่านชิป CH343 (`VID_1A86&PID_55D3`) |
| โมดูล Ultrasonic สีน้ำเงิน | **ยังไม่ยืนยันรุ่น** คาดว่า JSN-SR04T หรือ AJ-SR04M ต้องตรวจจากภาพถ่ายก่อนจ่ายไฟ |
| ตัวต้านทาน 1 kΩ และ 2 kΩ (หรือ 10 kΩ / 20 kΩ) | สำหรับแบ่งแรงดัน ECHO ต้องจัดหาเพิ่มถ้ายังไม่มี |
| สาย Jumper, สาย USB-C ที่รับส่งข้อมูลได้ | |
| มัลติมิเตอร์ | แนะนำอย่างยิ่ง สำหรับวัดขา 5V และค่าตัวต้านทาน |

## ขั้นตอน

1. ถอดสาย USB ออกจากบอร์ด
2. ต่อสายตาม [WIRING-DIAGRAM-TH.md](WIRING-DIAGRAM-TH.md): VCC→5V, GND→GND, TRIG→GPIO5, ECHO→ตัวแบ่งแรงดัน→GPIO6
3. ทำ "รายการตรวจก่อนจ่ายไฟ" ทั้ง 8 ข้อในไฟล์ผังการต่อสาย
4. เสียบ USB-C ที่ช่อง **COM**
5. Upload เฟิร์มแวร์ตาม [ARDUINO-UPLOAD-GUIDE-TH.md](ARDUINO-UPLOAD-GUIDE-TH.md)

## การติดตั้งหัววัดกับถัง

- หัววัดหันตั้งฉากลงผิวน้ำ ไม่เอียง ไม่ชิดผนังถัง (ผนังสะท้อนคลื่นทำให้ค่าผิด)
- ผิวน้ำตอนเต็มต้องห่างหัววัดอย่างน้อย `MIN_DISTANCE_CM` (ค่าเริ่มต้น 20 cm) แนะนำ 30 cm ขึ้นไป
- กล่องวงจร ESP32-S3 ต้องอยู่นอกถังและกันน้ำ เฉพาะหัวโพรบ (ถ้าเป็น JSN-SR04T) เท่านั้นที่ทนความชื้นได้

## Calibration (ทำที่ถังจริง)

1. วัดระยะจากหน้าหัววัดถึง**ก้นถัง** (หรือระดับที่ถือว่าน้ำ 0%) = `SENSOR_TO_BOTTOM_CM`
2. วัดระยะจากหน้าหัววัดถึง**ผิวน้ำเมื่อเต็ม** (100%) = `SENSOR_TO_FULL_CM`
3. แก้สองค่านี้ใน `firmware/WaterGuard_ESP32S3/config.h` แล้ว Upload ใหม่
4. ในเว็บ เลือก **LIVE · ESP32-S3-Water-Level** → **ตั้งค่า**:
   - ความสูงช่วงใช้งาน = `SENSOR_TO_BOTTOM_CM − SENSOR_TO_FULL_CM`
   - ระยะเผื่อติดตั้งเหนือระดับเต็ม = `SENSOR_TO_FULL_CM`
   - ระยะเซนเซอร์ต่ำสุด/สูงสุด = `MIN_DISTANCE_CM` / `MAX_DISTANCE_CM`
   - เกณฑ์ WARNING / DANGER = `WARNING_PERCENT` / `DANGER_PERCENT`
   หน้า **ตั้งค่า** ของ LIVE มีตาราง "ค่าที่ต้องตั้งที่อุปกรณ์ ESP32-S3" คำนวณค่า config.h ให้อัตโนมัติ
5. ถ้าค่าในเว็บกับ config.h ไม่ตรงกัน หน้าภาพรวมจะแจ้ง "อุปกรณ์รายงาน … แต่เว็บคำนวณได้ …"

สูตร (เหมือนกันทั้งเฟิร์มแวร์และเว็บ มี Automated Test ตรวจทุก 0.1 cm ตั้งแต่ 20–600 cm ใน `app/test/live-device.test.js`):

```
span          = SENSOR_TO_BOTTOM_CM − SENSOR_TO_FULL_CM
waterLevel    = clamp(span − (distance − SENSOR_TO_FULL_CM), 0, span)
waterPercent  = round(waterLevel / span × 10000) / 100
status        = DANGER ถ้า ≥ 85, WARNING ถ้า ≥ 70, นอกนั้น NORMAL
```

## ค่าไหนตั้งที่ใด

| ค่า | ตั้งที่ |
| --- | --- |
| Wi-Fi, Device Access Token | อุปกรณ์ (`secrets.h`) |
| ขา TRIG/ECHO, รอบส่งข้อมูล 5 s, ตัวกรอง Median | อุปกรณ์ (`config.h`) |
| ค่าคาลิเบรตถังและเกณฑ์ 70/85% | **ทั้งสองที่ ต้องตรงกัน** (`config.h` สำหรับ ThingsBoard, หน้า ตั้งค่า สำหรับเว็บ) |
| รอบรีเฟรชเว็บ, เวลา Stale/Offline | เว็บเท่านั้น (บันทึกในเบราว์เซอร์ของแต่ละบัญชี) |
