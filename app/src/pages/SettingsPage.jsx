import { useState } from 'react'
import { HardDrive, Settings2 } from 'lucide-react'
import { validateSettings } from '../model'
import { NumericFields, Source } from '../components/MonitorControls'
import { RequestError } from '../components/LoadState'

const FORM = [
  ['tankHeight', 'ความสูงช่วงใช้งาน', 'cm'], ['sensorOffset', 'ระยะเผื่อติดตั้งเหนือระดับเต็ม', 'cm'],
  ['minDistance', 'ระยะเซนเซอร์ต่ำสุด', 'cm'], ['maxDistance', 'ระยะเซนเซอร์สูงสุด', 'cm'],
  ['warning', 'เกณฑ์ WARNING', '%'], ['danger', 'เกณฑ์ DANGER', '%'],
  ['refreshSeconds', 'รอบรีเฟรช Live', 'วินาที'], ['staleSeconds', 'แสดง Offline หลังผ่าน', 'วินาที'],
]

export default function SettingsPage({ source, settings, devices, change, save, persistError, deviceCatalog }) {
  const [form, setForm] = useState(settings)
  const [message, setMessage] = useState({ error: '', success: '' })
  function submit(event) {
    event.preventDefault()
    const values = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, String(value).trim() ? Number(value) : NaN]))
    const error = validateSettings(values)
    if (error) return setMessage({ error, success: '' })
    const saved = save(values)
    setMessage(saved ? { error: '', success: 'บันทึกการตั้งค่าแล้ว' } : { error: 'เบราว์เซอร์ไม่อนุญาตให้บันทึกค่าถาวร', success: '' })
  }
  return <div className="pages">
    <section className="panel settings-panel"><div className="panel-title"><span className="tile-icon"><HardDrive size={19} /></span><div><h2>แหล่งข้อมูล</h2><p>เลือกโปรไฟล์ประจำ Device</p></div></div>{source && <Source value={source} devices={devices} change={change} />}
      {deviceCatalog.loading && <p role="status">กำลังโหลดแหล่งข้อมูล…</p>}
      {deviceCatalog.error && <RequestError message={deviceCatalog.error} retry={deviceCatalog.retry} />}
      {!deviceCatalog.loading && !deviceCatalog.error && !devices.length && <p className="notice">ยังไม่มีแหล่งข้อมูล Cloud สำหรับบัญชีนี้</p>}
      {persistError && <p role="alert" className="notice error">{persistError}</p>}
    </section>
    {source && <form className="panel settings-panel" onSubmit={submit}><div className="panel-title"><span className="tile-icon"><Settings2 size={19} /></span><div><h2>คาลิเบรตและเกณฑ์แจ้งเตือน</h2><p>ค่าที่บันทึกในเบราว์เซอร์นี้มีผลกับการคำนวณหน้าเว็บเท่านั้น</p></div></div>
      {[
        ['คาลิเบรตถังและเซนเซอร์', FORM.slice(0, 4)],
        ['เกณฑ์แจ้งเตือน', FORM.slice(4, 6)],
        ['การอัปเดตข้อมูล', FORM.slice(6)],
      ].map(([label, fields]) => (
        <fieldset className="settings-group" key={label}>
          <legend>{label}</legend>
          <NumericFields fields={fields} values={form} update={(key, value) => { setForm({ ...form, [key]: value }); setMessage({ error: '', success: '' }) }} />
        </fieldset>
      ))}
      <p className="hint">ระดับน้ำ = ความสูงถัง − (ระยะจากเซนเซอร์ − ระยะเผื่อติดตั้ง) ค่าติดลบและค่าสูงเกินถังจะถูกจำกัดให้อยู่ในช่วง 0–100%</p>
      {message.error && <p role="alert" className="notice error">{message.error}</p>}
      {message.success && <p role="status" className="notice success">{message.success}</p>}
      <button type="submit" className="primary">บันทึกการตั้งค่า</button>
    </form>}
  </div>
}
