import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleHelp, LogOut, RefreshCw, UserRound, Waves } from 'lucide-react'
import { Nav, NAV } from './components/Navigation'
import { Source } from './components/MonitorControls'
import { useDevices, useMonitor } from './hooks/useMonitor'
import { useHash, usePage } from './hooks/usePage'
import { useSession } from './hooks/useSession'
import { PAGES_BUILD } from './lib/apiTarget'
import { bridgeRequest, completeBridge, startPagesLogin } from './lib/pagesLogin'
import { MONITOR_ROUTES, routeFromHash, routeHash } from './lib/routes'
import { DEFAULT_SETTINGS, loadPreferences, savePreferences } from './model'
import AlertsPage from './pages/AlertsPage'
import BatteryPage from './pages/BatteryPage'
import DashboardPage from './pages/DashboardPage'
import HistoryPage from './pages/HistoryPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const hash = useHash()
  const route = routeFromHash(hash)
  const registration = route === 'register' || route === 'confirm-email'
  const auth = useSession(!registration)
  const bridge = useMemo(() => PAGES_BUILD ? null : bridgeRequest(), [hash])
  const destination = useRef(routeHash('dashboard'))
  const user = auth.session?.user

  useEffect(() => {
    if (auth.loading || user || bridge || registration) return
    if (MONITOR_ROUTES.includes(route)) destination.current = routeHash(route)
    if (route !== 'login') window.history.replaceState(null, '', routeHash('login'))
  }, [auth.loading, user, bridge, registration, route])

  useEffect(() => {
    if (user && MONITOR_ROUTES.includes(route) && hash !== routeHash(route)) {
      window.history.replaceState(null, '', routeHash(route))
    }
  }, [hash, route, user])

  if (registration) return <RegisterPage key={route} verify={route === 'confirm-email'} />

  if (bridge) return <BrokerLogin key={bridge.state} auth={auth} bridge={bridge} />

  if (!user) return <LoginPage loading={auth.loading} message={auth.message}
    confirmed={new URLSearchParams(hash.split('?')[1]).get('confirmed') === '1'}
    onLogin={async (input) => { await auth.login(input); window.history.replaceState(null, '', destination.current) }}
    onExternal={PAGES_BUILD ? (intent) => startPagesLogin(intent, destination.current) : undefined} />

  return <Monitor key={user.id} user={user} onExit={auth.logout} />
}

function BrokerLogin({ auth, bridge }) {
  const [loggedInHere, setLoggedInHere] = useState(false)
  const [error, setError] = useState('')
  const signedIn = Boolean(auth.session) && (bridge.intent !== 'recover' || loggedInHere)
  useEffect(() => {
    if (!signedIn) return
    const task = new AbortController()
    completeBridge(bridge, task.signal).catch((failure) => {
      if (!task.signal.aborted) setError(failure.message)
    })
    return () => task.abort()
  }, [signedIn, bridge])
  return <LoginPage loading={auth.loading || (signedIn && !error)} message={error || auth.message}
    initialLegacy={bridge.intent === 'legacy' || bridge.intent === 'recover'}
    startScreen={bridge.intent === 'recover' ? 'forgot' : 'login'}
    onLogin={async (input) => { await auth.login(input); setLoggedInHere(true) }} />
}

function Monitor({ user, onExit }) {
  const page = usePage()
  const [prefs, setPrefs] = useState(() => loadPreferences(user.id))
  const [range, setRange] = useState('1h')
  const [persistError, setPersistError] = useState('')
  const [exitError, setExitError] = useState('')
  const [exiting, setExiting] = useState(false)
  const catalog = useDevices()
  const { profiles } = prefs
  // Until the user picks a source, start on the real board when the account can read it, else SIM.
  const selected = catalog.devices.find(({ key }) => key === prefs.source) ??
    catalog.devices.find(({ simulated }) => !simulated) ?? catalog.devices[0]
  const source = selected?.key ?? ''
  const settings = profiles[source] ?? DEFAULT_SETTINGS
  const monitor = useMonitor(source, settings, range)
  const isSimulated = selected?.simulated === true
  function persist(next) {
    setPrefs(next)
    try {
      savePreferences(next, user.id)
      setPersistError('')
      return true
    } catch {
      setPersistError('ใช้ค่าในแท็บนี้ได้ แต่บันทึกถาวรไม่ได้')
      return false
    }
  }

  async function exit() {
    setExiting(true)
    setExitError('')
    try { await onExit() }
    catch (error) { setExitError(error.message) }
    finally { setExiting(false) }
  }

  const shared = { monitor, settings, range, setRange }
  return <div className="app-shell">
    <Nav page={page} />
    <div className="workspace">
      <header className="topbar">
        <div className="top-context"><Waves size={18} /><span>ระบบตรวจวัดระดับน้ำ</span></div>
        <div className="top-actions">
          {selected && <span className={'mode-tag ' + (isSimulated ? 'simulated' : 'live')}><span className="status-dot" />{isSimulated ? 'ข้อมูลจำลอง (SIM)' : 'ข้อมูลจริง (LIVE)'}</span>}
          {selected && <Source value={source} devices={catalog.devices} change={(value) => persist({ ...prefs, source: value })} />}
          <details className="profile-menu">
            <summary aria-label="เมนูบัญชี"><UserRound size={18} aria-hidden="true" /></summary>
            <div className="profile-card"><p>{user.username ?? user.email}</p><button type="button" className="button-outline" disabled={exiting} onClick={exit}><LogOut size={16} /> ออกจากระบบ</button></div>
          </details>
        </div>
      </header>
      <main id="main-content">
        {catalog.error && <p role="alert" className="notice error">{catalog.error}</p>}
        {!catalog.loading && !catalog.error && !catalog.devices.length && <p role="status" className="notice">บัญชีนี้ยังไม่มีสิทธิ์อ่านข้อมูล ThingsBoard ติดต่อผู้ดูแลเพื่อขอสิทธิ์อ่านข้อมูล</p>}
        {!catalog.loading && !catalog.error && catalog.devices.length > 0 && catalog.devices.every((device) => device.simulated) &&
          <p role="status" className="notice">LIVE · ESP32-S3 ยังไม่พร้อมสำหรับบัญชีนี้ (ยังไม่เชื่อมอุปกรณ์จริงหรือยังไม่ได้รับสิทธิ์) แสดงเฉพาะข้อมูล SIM</p>}
        {exitError && <p role="alert" className="notice error">{exitError}</p>}
        <div className="page-heading"><div><h1>{NAV.find(([key]) => key === page)[1]}</h1><p>{page === 'dashboard' ? selected ? 'ระดับน้ำ สถานะอุปกรณ์ และการแจ้งเตือนจาก ' + selected.name : 'ระดับน้ำ สถานะอุปกรณ์ และการแจ้งเตือน' : {
          history: 'ดูแนวโน้มและสถิติของข้อมูลตามช่วงเวลา', alerts: 'ตรวจเหตุการณ์ที่พบจากระดับน้ำและสถานะเซนเซอร์',
          settings: 'จัดการการอ่านข้อมูลและเกณฑ์ของแต่ละแหล่งข้อมูล', battery: 'ประมาณการเวลาจ่ายไฟให้ ESP32-S3 และอุปกรณ์ต่อพ่วง',
        }[page]}</p></div>
        {page === 'dashboard' && (selected || catalog.error) && <div className="heading-actions"><button className="button-outline" onClick={selected ? monitor.retry : catalog.retry}><RefreshCw size={16} />รีเฟรช</button></div>}</div>

        {page === 'dashboard' && <DashboardPage {...shared} isSimulated={isSimulated} />}
        {page === 'history' && <HistoryPage {...shared} simulated={isSimulated} exportSource={source} />}
        {page === 'alerts' && <AlertsPage {...shared} simulated={isSimulated} />}
        {page === 'settings' && <SettingsPage key={source} source={source} settings={settings} devices={catalog.devices} deviceCatalog={catalog} persistError={persistError} change={(value) => persist({ ...prefs, source: value })} save={(values) => persist({ ...prefs, profiles: { ...profiles, [source]: values } })} />}
        {page === 'battery' && <BatteryPage />}
        <footer><CircleHelp size={15} /> {isSimulated ? 'แหล่งข้อมูลคือ Device จำลองบน ThingsBoard' : 'เวลาล่าสุดอ้างอิงจาก ThingsBoard Cloud'}</footer>
      </main>
    </div>
  </div>
}
