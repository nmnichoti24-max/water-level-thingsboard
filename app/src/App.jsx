import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleHelp, LogOut, Pause, Play, RefreshCw, RotateCcw, UserRound, Waves } from 'lucide-react'
import { Nav, NAV } from './components/Navigation'
import { Source } from './components/MonitorControls'
import { useDevices, useMonitor } from './hooks/useMonitor'
import { useHash, usePage } from './hooks/usePage'
import { useSession } from './hooks/useSession'
import { PAGES_BUILD } from './lib/apiTarget'
import { bridgeRequest, completeBridge, startPagesLogin } from './lib/pagesLogin'
import { isDemoHash, MONITOR_ROUTES, routeFromHash, routeHash } from './lib/routes'
import { loadPreferences, savePreferences } from './model'
import AlertsPage from './pages/AlertsPage'
import BatteryPage from './pages/BatteryPage'
import DashboardPage from './pages/DashboardPage'
import HistoryPage from './pages/HistoryPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const hash = useHash()
  const demo = isDemoHash(hash)
  const route = routeFromHash(hash)
  const registration = route === 'register' || route === 'confirm-email'
  const auth = useSession(!demo && !registration)
  const bridge = useMemo(() => PAGES_BUILD ? null : bridgeRequest(), [hash])
  const destination = useRef(routeHash('dashboard'))
  const user = auth.session?.user

  useEffect(() => {
    if (auth.loading || demo || user || bridge || registration) return
    if (MONITOR_ROUTES.includes(route)) destination.current = routeHash(route)
    if (route !== 'login') window.history.replaceState(null, '', routeHash('login'))
  }, [auth.loading, demo, user, bridge, registration, route])

  if (registration) return <RegisterPage key={route} verify={route === 'confirm-email'} />

  if (bridge) return <BrokerLogin key={bridge.state} auth={auth} bridge={bridge} />

  if (!demo && !user) return <LoginPage loading={auth.loading} message={auth.message}
    confirmed={new URLSearchParams(hash.split('?')[1]).get('confirmed') === '1'}
    onLogin={async (input) => { await auth.login(input); window.history.replaceState(null, '', destination.current) }}
    onExternal={PAGES_BUILD ? (intent) => startPagesLogin(intent, destination.current) : undefined}
    onDemo={() => { window.location.hash = routeHash('dashboard', true) }} />

  return <Monitor key={demo ? 'demo' : user.id} user={demo ? null : user}
    onExit={demo ? () => { window.location.hash = routeHash('login') } : auth.logout} />
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
  const [prefs, setPrefs] = useState(() => loadPreferences(user?.id))
  const [range, setRange] = useState('1h')
  const [paused, setPaused] = useState(false)
  const [persistError, setPersistError] = useState('')
  const [exitError, setExitError] = useState('')
  const [exiting, setExiting] = useState(false)
  const catalog = useDevices(Boolean(user))
  const { profiles } = prefs
  const source = user ? prefs.source : 'demo'
  const settings = profiles[source]
  const monitor = useMonitor(source, settings, range, paused)
  const isDemo = source === 'demo'
  const isSimulated = isDemo || source === 'cloud-sim'
  const selected = catalog.devices.find(({ key }) => key === source)
  const deviceName = isDemo ? 'ตัวจำลองในเว็บ' : selected?.name ?? (isSimulated ? 'ESP32-S3-Water-Level-SIM' : 'ESP32-S3-Water-Level')
  function persist(next) {
    setPrefs(next)
    try {
      savePreferences(next, user?.id)
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
    <Nav page={page} demo={!user} />
    <div className="workspace">
      <header className="topbar">
        <div className="top-context"><Waves size={18} /><span>ระบบตรวจวัดระดับน้ำ</span></div>
        <div className="top-actions">
          <span className={'mode-tag ' + (isSimulated ? 'demo' : 'live')}><span className="status-dot" />{isDemo ? 'DEMO' : isSimulated ? 'SIMULATED DATA' : 'LIVE DATA'}</span>
          {user && <Source value={source} devices={catalog.devices} change={(value) => persist({ ...prefs, source: value })} />}
          {user ? <details className="profile-menu">
            <summary aria-label="เมนูบัญชี"><UserRound size={18} aria-hidden="true" /></summary>
            <div className="profile-card"><p>{user.username ?? user.email}</p><button type="button" className="button-outline" disabled={exiting} onClick={exit}><LogOut size={16} /> ออกจากระบบ</button></div>
          </details> : <button type="button" className="button-outline" onClick={exit}>เข้าสู่ระบบ</button>}
        </div>
      </header>
      <main id="main-content">
        {user && catalog.error && <p role="alert" className="notice error">{catalog.error}</p>}
        {user && !catalog.loading && !catalog.error && !catalog.devices.length && <p role="status" className="notice">บัญชีนี้ยังไม่มีสิทธิ์อ่านข้อมูล ThingsBoard ใช้ DEMO หรือขอสิทธิ์จากผู้ดูแลได้</p>}
        {exitError && <p role="alert" className="notice error">{exitError}</p>}
        <div className="page-heading"><div><h1>{NAV.find(([key]) => key === page)[1]}</h1><p>{page === 'dashboard' ? 'ระดับน้ำ สถานะอุปกรณ์ และการแจ้งเตือนจาก ' + deviceName : {
          history: 'ดูแนวโน้มและสถิติของข้อมูลตามช่วงเวลา', alerts: 'ตรวจเหตุการณ์ที่พบจากระดับน้ำและสถานะเซนเซอร์',
          settings: 'จัดการการอ่านข้อมูลและเกณฑ์ของแต่ละแหล่งข้อมูล', battery: 'ประมาณการเวลาจ่ายไฟให้ ESP32-S3 และอุปกรณ์ต่อพ่วง',
        }[page]}</p></div>
        {page === 'dashboard' && <div className="heading-actions">{isDemo ? <><button className="button-outline" onClick={() => setPaused(!paused)}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? 'เล่น Demo' : 'พัก Demo'}</button><button className="button-outline" onClick={monitor.reset}><RotateCcw size={16} />Reset Demo</button></> : <button className="button-outline" onClick={monitor.retry}><RefreshCw size={16} />รีเฟรช</button>}</div>}</div>

        {page === 'dashboard' && <DashboardPage {...shared} isDemo={isDemo} isSimulated={isSimulated} />}
        {page === 'history' && <HistoryPage {...shared} simulated={isSimulated} exportSource={source} />}
        {page === 'alerts' && <AlertsPage {...shared} isDemo={isSimulated} />}
        {page === 'settings' && <SettingsPage key={source} source={source} settings={settings} devices={catalog.devices} deviceCatalog={catalog} persistError={persistError} readOnly={!user} change={(value) => persist({ ...prefs, source: value })} save={(values) => persist({ ...prefs, profiles: { ...profiles, [source]: values } })} />}
        {page === 'battery' && <BatteryPage />}
        <footer><CircleHelp size={15} /> {isDemo ? 'DEMO สร้างข้อมูลในเบราว์เซอร์นี้เท่านั้น' : isSimulated ? 'แหล่งข้อมูลคือ Device จำลองบน ThingsBoard' : 'เวลาล่าสุดอ้างอิงจาก ThingsBoard Cloud'}</footer>
      </main>
    </div>
  </div>
}
