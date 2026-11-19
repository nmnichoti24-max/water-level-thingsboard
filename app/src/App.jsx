import { useState } from 'react'
import { CircleHelp, Pause, Play, RefreshCw, RotateCcw, Waves } from 'lucide-react'
import { Nav, NAV } from './components/Navigation'
import { Source } from './components/MonitorControls'
import { useDevices, useMonitor } from './hooks/useMonitor'
import { usePage } from './hooks/usePage'
import { loadPreferences, savePreferences } from './model'
import AlertsPage from './pages/AlertsPage'
import BatteryPage from './pages/BatteryPage'
import DashboardPage from './pages/DashboardPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const page = usePage()
  const [prefs, setPrefs] = useState(loadPreferences)
  const [range, setRange] = useState('1h')
  const [paused, setPaused] = useState(false)
  const [persistError, setPersistError] = useState('')
  const catalog = useDevices()
  const { source, profiles } = prefs
  const settings = profiles[source]
  const monitor = useMonitor(source, settings, range, paused)
  const isDemo = source === 'demo'
  const isSimulated = isDemo || source === 'cloud-sim'
  const selected = catalog.devices.find(({ key }) => key === source)
  const deviceName = isDemo ? 'ตัวจำลองในเว็บ' : selected?.name ?? (isSimulated ? 'ESP32-S3-Water-Level-SIM' : 'ESP32-S3-Water-Level')
  function persist(next) {
    setPrefs(next)
    try {
      savePreferences(next)
      setPersistError('')
      return true
    } catch {
      setPersistError('ใช้ค่าในแท็บนี้ได้ แต่บันทึกถาวรไม่ได้')
      return false
    }
  }

  const shared = { monitor, settings, range, setRange }
  return <div className="app-shell">
    <Nav page={page} />
    <div className="workspace">
      <header className="topbar"><div className="top-context"><Waves size={18} /><span>ระบบตรวจวัดระดับน้ำ</span></div><div className="top-actions"><span className={'mode-tag ' + (isSimulated ? 'demo' : 'live')}><span className="status-dot" />{isSimulated ? 'SIMULATED DATA' : 'LIVE DATA'}</span><Source value={source} devices={catalog.devices} change={(value) => persist({ ...prefs, source: value })} /></div></header>
      <main id="main-content">
        <div className="page-heading"><div><h1>{NAV.find(([key]) => key === page)[1]}</h1><p>{page === 'dashboard' ? 'ระดับน้ำ สถานะอุปกรณ์ และการแจ้งเตือนจาก ' + deviceName : {
          history: 'ดูแนวโน้มและสถิติของข้อมูลตามช่วงเวลา', alerts: 'ตรวจเหตุการณ์ที่พบจากระดับน้ำและสถานะเซนเซอร์',
          settings: 'จัดการการอ่านข้อมูลและเกณฑ์ของแต่ละแหล่งข้อมูล', battery: 'ประมาณการเวลาจ่ายไฟให้ ESP32-S3 และอุปกรณ์ต่อพ่วง',
        }[page]}</p></div>
        {page === 'dashboard' && <div className="heading-actions">{isDemo ? <><button className="button-outline" onClick={() => setPaused(!paused)}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? 'เล่น Demo' : 'พัก Demo'}</button><button className="button-outline" onClick={monitor.reset}><RotateCcw size={16} />Reset Demo</button></> : <button className="button-outline" onClick={monitor.retry}><RefreshCw size={16} />รีเฟรช</button>}</div>}</div>

        {page === 'dashboard' && <DashboardPage {...shared} isDemo={isDemo} isSimulated={isSimulated} />}
        {page === 'history' && <HistoryPage {...shared} simulated={isSimulated} exportSource={source} />}
        {page === 'alerts' && <AlertsPage {...shared} isDemo={isSimulated} />}
        {page === 'settings' && <SettingsPage key={source} source={source} settings={settings} devices={catalog.devices} deviceCatalog={catalog} persistError={persistError} change={(value) => persist({ ...prefs, source: value })} save={(values) => persist({ ...prefs, profiles: { ...profiles, [source]: values } })} />}
        {page === 'battery' && <BatteryPage />}
        <footer><CircleHelp size={15} /> {isDemo ? 'DEMO สร้างข้อมูลในเบราว์เซอร์นี้เท่านั้น' : isSimulated ? 'แหล่งข้อมูลคือ Device จำลองบน ThingsBoard' : 'เวลาล่าสุดอ้างอิงจาก ThingsBoard Cloud'}</footer>
      </main>
    </div>
  </div>
}
