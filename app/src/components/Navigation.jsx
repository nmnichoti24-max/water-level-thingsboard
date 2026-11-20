import { BatteryCharging, Bell, Droplets, History, LayoutDashboard, Radio, Settings2 } from 'lucide-react'
import { routeHash } from '../lib/routes'

export const NAV = [
  ['dashboard', 'ภาพรวม', LayoutDashboard], ['history', 'ประวัติระดับน้ำ', History],
  ['alerts', 'การแจ้งเตือน', Bell], ['settings', 'ตั้งค่า', Settings2], ['battery', 'คำนวณแบตเตอรี่', BatteryCharging],
]

const DASHBOARD = 'https://thingsboard.cloud/dashboard/6a182b80-e40e-11f1-b8a1-9db681a717b8?publicId=a5b263d0-e40f-11f1-b50d-0302f5370387'
const SHORT_LABEL = { history: 'ประวัติ', alerts: 'แจ้งเตือน', battery: 'แบตเตอรี่' }

export function Nav({ page, demo }) {
  return <aside className="sidebar">
    <div className="sidebar-head">
      <a className="brand" href={routeHash('dashboard', demo)}>
        <span className="brand-icon"><Droplets size={22} /></span>
        <span><b>WaterGuard <em>Pro</em></b><small>ESP32-S3 IoT</small></span>
      </a>
    </div>
    <nav id="main-navigation" aria-label="เมนูหลัก">{NAV.map(([key, label, Icon]) => (
      <a key={key} href={routeHash(key, demo)} className={page === key ? 'nav-item selected' : 'nav-item'} aria-label={label} aria-current={page === key ? 'page' : undefined}>
        <Icon size={19} aria-hidden="true" /><span className="nav-long">{label}</span><span className="nav-short">{SHORT_LABEL[key] ?? label}</span>
      </a>
    ))}</nav>
    <div className="sidebar-bottom">
      <span className="cloud-icon"><Radio size={17} /></span>
      <div><b>ThingsBoard Cloud</b><a href={DASHBOARD} target="_blank" rel="noreferrer">เปิด Dashboard เดิม</a></div>
    </div>
  </aside>
}
