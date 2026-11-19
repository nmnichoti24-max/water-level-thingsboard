import { useRef, useState } from 'react'
import { BatteryCharging, Bell, Droplets, History, LayoutDashboard, Menu, Radio, Settings2, X } from 'lucide-react'

export const NAV = [
  ['dashboard', 'ภาพรวม', LayoutDashboard], ['history', 'ประวัติระดับน้ำ', History],
  ['alerts', 'การแจ้งเตือน', Bell], ['settings', 'ตั้งค่า', Settings2], ['battery', 'คำนวณแบตเตอรี่', BatteryCharging],
]

const DASHBOARD = 'https://thingsboard.cloud/dashboard/6a182b80-e40e-11f1-b8a1-9db681a717b8?publicId=a5b263d0-e40f-11f1-b50d-0302f5370387'

export function Nav({ page }) {
  const [open, setOpen] = useState(false)
  const toggle = useRef(null)
  function close() {
    if (open) toggle.current?.focus()
    setOpen(false)
  }
  return <aside className="sidebar">
    <div className="sidebar-head">
      <a className="brand" href="#dashboard" onClick={close}>
        <span className="brand-icon"><Droplets size={22} /></span>
        <span><b>Water Level Monitor</b><small>ESP32-S3 IoT</small></span>
      </a>
      <button ref={toggle} type="button" className="nav-toggle" aria-controls="main-navigation" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <X aria-hidden="true" size={18} /> : <Menu aria-hidden="true" size={18} />}<span>เมนู</span>
      </button>
    </div>
    <nav id="main-navigation" className={open ? 'navigation-open' : undefined} aria-label="เมนูหลัก" onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        setOpen(false)
        toggle.current?.focus()
      }
    }}>{NAV.map(([key, label, Icon]) => (
      <a key={key} href={'#' + key} className={page === key ? 'nav-item selected' : 'nav-item'} onClick={close} aria-current={page === key ? 'page' : undefined}>
        <Icon size={19} /><span>{label}</span>
      </a>
    ))}</nav>
    <div className="sidebar-bottom">
      <span className="cloud-icon"><Radio size={17} /></span>
      <div><b>ThingsBoard Cloud</b><a href={DASHBOARD} target="_blank" rel="noreferrer">เปิด Dashboard เดิม</a></div>
    </div>
  </aside>
}
