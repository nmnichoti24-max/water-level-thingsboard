import { useState } from 'react'
import { BatteryCharging } from 'lucide-react'
import { estimateRuntime, formatNumber } from '../model'
import { NumericFields } from '../components/MonitorControls'

const BATTERY_FIELDS = [
  ['capacity', 'ความจุ Power Bank', 'mAh'], ['voltage', 'แรงดันเซลล์ Nominal', 'V'],
  ['efficiency', 'ประสิทธิภาพแปลงไฟ', '%'], ['current', 'กระแสเฉลี่ยที่ 5 V', 'mA'],
]

export default function BatteryPage() {
  const [input, setInput] = useState({ capacity: '10000', voltage: '3.7', efficiency: '85', current: '180' })
  const estimate = estimateRuntime(Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Number(value)])))
  return <div className="battery-grid"><section className="panel settings-panel"><div className="panel-title"><span className="tile-icon"><BatteryCharging size={20} /></span><div><h2>ข้อมูล Power Bank</h2><p>ใส่ความจุตามสเปกเซลล์และกระแสที่โหลด 5 V</p></div></div>
    <NumericFields fields={BATTERY_FIELDS} values={input} update={(key, value) => setInput({ ...input, [key]: value })} />
    {!estimate && <p role="alert" className="notice error">กรอกค่าที่มากกว่า 0 และประสิทธิภาพไม่เกิน 100%</p>}
  </section><section className="panel battery-result"><span className="tile-icon"><BatteryCharging size={21} /></span><h2>Estimated Runtime</h2><strong>{formatNumber(estimate?.hours, 2)} <small>ชั่วโมง</small></strong><p>{formatNumber(estimate?.minutes, 0)} นาที</p>
    <div className="stats-strip"><div><span>พลังงานใช้ได้</span><strong>{formatNumber(estimate?.usableWh, 2)} Wh</strong></div><div><span>โหลด</span><strong>{formatNumber(estimate?.loadWatts, 2)} W</strong></div></div>
    <p className="hint">เวลาทำงานประมาณการจากค่าเฉลี่ยที่กรอก ความจุคงเหลือต้องวัดจากฮาร์ดแวร์</p>
  </section></div>
}
