import React, { useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, BatteryCharging, Bell, CircleHelp, Droplets, Gauge, HardDrive, History,
  LayoutDashboard, Menu, Pause, Play, Radio, RefreshCw, RotateCcw, Ruler, Settings2, Waves, X,
} from 'lucide-react'
import HistoryChart from './HistoryChart'
import { estimateRuntime, formatDate, formatNumber, loadPreferences, savePreferences, summarize, validateSettings } from './model'
import { useDevices, useMonitor } from './useMonitor'
import './style.css'

const NAV = [
  ['dashboard', 'ภาพรวม', LayoutDashboard], ['history', 'ประวัติระดับน้ำ', History],
  ['alerts', 'การแจ้งเตือน', Bell], ['settings', 'ตั้งค่า', Settings2], ['battery', 'คำนวณแบตเตอรี่', BatteryCharging],
]
const PERIODS = [['1h', '1 ชม.'], ['6h', '6 ชม.'], ['24h', '24 ชม.'], ['7d', '7 วัน']]
const STATUS_LABEL = {
  NORMAL: 'ระดับน้ำปกติ', WARNING: 'ระดับน้ำเริ่มสูง', DANGER: 'ระดับน้ำสูงมาก',
  SENSOR_ERROR: 'Sensor Error', EMPTY: 'ยังไม่มีข้อมูล',
}
const FORM = [
  ['tankHeight', 'ความสูงช่วงใช้งาน', 'cm'], ['sensorOffset', 'ระยะเผื่อติดตั้งเหนือระดับเต็ม', 'cm'],
  ['minDistance', 'ระยะเซนเซอร์ต่ำสุด', 'cm'], ['maxDistance', 'ระยะเซนเซอร์สูงสุด', 'cm'],
  ['warning', 'เกณฑ์ WARNING', '%'], ['danger', 'เกณฑ์ DANGER', '%'],
  ['refreshSeconds', 'รอบรีเฟรช Live', 'วินาที'], ['staleSeconds', 'แสดง Offline หลังผ่าน', 'วินาที'],
]
const BATTERY_FIELDS = [
  ['capacity', 'ความจุ Power Bank', 'mAh'], ['voltage', 'แรงดันเซลล์ Nominal', 'V'],
  ['efficiency', 'ประสิทธิภาพแปลงไฟ', '%'], ['current', 'กระแสเฉลี่ยที่ 5 V', 'mA'],
]
const DASHBOARD = 'https://thingsboard.cloud/dashboard/6a182b80-e40e-11f1-b8a1-9db681a717b8?publicId=a5b263d0-e40f-11f1-b50d-0302f5370387'

function Nav({ page, setPage }) {
  const [open, setOpen] = useState(false)
  const toggle = useRef(null)
  function select(next) {
    if (open) toggle.current?.focus()
    setOpen(false)
    setPage(next)
  }
  return <aside className="sidebar">
    <div className="sidebar-head">
      <a className="brand" href="#dashboard" onClick={(event) => { event.preventDefault(); select('dashboard') }}>
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
      <button key={key} className={page === key ? 'nav-item selected' : 'nav-item'} onClick={() => select(key)} aria-current={page === key ? 'page' : undefined}>
        <Icon size={19} /><span>{label}</span>
      </button>
    ))}</nav>
    <div className="sidebar-bottom">
      <span className="cloud-icon"><Radio size={17} /></span>
      <div><b>ThingsBoard Cloud</b><a href={DASHBOARD} target="_blank" rel="noreferrer">เปิด Dashboard เดิม</a></div>
    </div>
  </aside>
}

function Source({ value, devices, change }) {
  return <label className="source-picker">
    <span className="visually-hidden">เลือกแหล่งข้อมูล</span>
    <select value={value} onChange={(event) => change(event.target.value)}>
      <option value="demo">DEMO · จำลองในเว็บ</option>
      {devices.map(({ key, name, simulated }) => <option key={key} value={key}>{simulated ? 'SIM · ' : 'LIVE · '}{name}</option>)}
      {value !== 'demo' && !devices.some(({ key }) => key === value) && <option value={value}>แหล่งข้อมูลที่บันทึกไว้</option>}
    </select>
  </label>
}

function Status({ status }) {
  return <span className={'status-pill ' + status.toLowerCase()}><span className="status-dot" />{status === 'SENSOR_ERROR' ? 'SENSOR ERROR' : status === 'EMPTY' ? 'NO DATA' : status}</span>
}

function Tank({ reading, stale }) {
  const hasValue = Number.isFinite(reading.percent)
  return <section className="panel tank-panel">
    <div className="panel-title"><span className="tile-icon"><Droplets size={18} /></span><div><h2>ถังเก็บน้ำ</h2><p>ระดับน้ำเทียบความสูงช่วงใช้งาน</p></div></div>
    <div className="tank-visual" role="img" aria-label={hasValue ? 'น้ำในถัง ' + formatNumber(reading.percent) + ' เปอร์เซ็นต์' : 'ไม่มีข้อมูลระดับน้ำ'}>
      <div className="tank-grid" />
      <div className="tank-shell">
        <div className="tank-top" />
        <div className="tank-window">
          {hasValue && <div className={'tank-fill' + (stale ? ' stale' : '')} style={{ height: reading.percent + '%' }}><div className="water-surface" /></div>}
          <div className="tank-stripes" />
          <div className="tank-value"><strong>{formatNumber(reading.percent, 0)}<small>{hasValue ? '%' : ''}</small></strong><span>{hasValue ? 'ความจุช่วงใช้งาน' : 'ไม่มีค่าที่ใช้ได้'}</span></div>
        </div>
        <div className="tank-base" />
      </div>
      <div className="tank-scale" aria-hidden="true">{['100%', '75%', '50%', '25%', '0%'].map((value) => <span key={value}>{value}</span>)}</div>
    </div>
    <div className="tank-footer"><Status status={reading.state} /><span>{stale && hasValue ? 'ค่าครั้งก่อน' : STATUS_LABEL[reading.state]}</span></div>
  </section>
}

function Metric({ icon: Icon, label, value, unit, note, color = 'cyan' }) {
  return <section className="panel metric"><span className={'tile-icon ' + color}><Icon size={19} /></span><div><p>{label}</p><strong>{value}{unit && <small> {unit}</small>}</strong>{note && <em>{note}</em>}</div></section>
}

function RangeSwitch({ range, setRange }) {
  return <div className="range-switch" aria-label="ช่วงเวลา">{PERIODS.map(([key, label]) => <button key={key} type="button" aria-pressed={range === key} onClick={() => setRange(key)}>{label}</button>)}</div>
}

function ChartPanel({ monitor, settings, range, setRange, simulated }) {
  const stats = useMemo(() => summarize(monitor.points), [monitor.points])
  return <section className="panel chart-panel">
    <div className="section-head"><div className="panel-title"><span className="tile-icon"><Activity size={19} /></span><div><h2>ระดับน้ำย้อนหลัง</h2><p>{simulated ? 'ช่วงเวลาของข้อมูลจำลอง' : 'ข้อมูลจาก ThingsBoard Cloud'}</p></div></div><RangeSwitch range={range} setRange={setRange} /></div>
    {monitor.historyError && <p role="alert" className="notice error">{monitor.historyError}{stats ? ' · แสดงประวัติที่อ่านได้ครั้งก่อน' : ''}</p>}
    {monitor.limited && <p className="notice">แสดงผลจากตัวอย่างล่าสุดที่ API คืนมา สูงสุด 2,500 จุดต่อคีย์</p>}
    {stats ? <>
      <HistoryChart points={monitor.points} tankHeight={settings.tankHeight} />
      <div className="stats-strip">{[['ต่ำสุด', stats.low], ['สูงสุด', stats.high], ['เฉลี่ย', stats.average]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{formatNumber(value)} <small>cm</small></strong></div>)}</div>
    </> : <div className="empty">{monitor.historyLoading ? 'กำลังโหลดประวัติ…' : 'ไม่มีข้อมูลระดับน้ำที่ใช้ได้ในช่วงนี้'}</div>}
  </section>
}

function Alerts({ monitor, isDemo, recent = false, range, setRange }) {
  const events = recent ? monitor.alerts.slice(0, 3) : monitor.alerts
  return <section className="panel alerts-panel">
    <div className="section-head"><div className="panel-title"><span className="tile-icon amber"><Bell size={18} /></span><div><h2>{recent ? 'การแจ้งเตือนล่าสุด' : 'ประวัติการแจ้งเตือน'}</h2><p>{isDemo ? 'เหตุการณ์จำลองจากเกณฑ์ในเว็บ' : 'คำนวณจาก Telemetry และเกณฑ์ปัจจุบัน'}</p></div></div>{!recent && <RangeSwitch range={range} setRange={setRange} />}</div>
    {monitor.historyError && <p role="alert" className="notice error">{monitor.historyError}</p>}
    {events.length ? <ul className="events">{events.map((event) => <li key={event.ts + event.state}><Status status={event.state} /><div><b>{STATUS_LABEL[event.state]}</b><small>{formatDate(event.ts)}</small></div><strong>{Number.isFinite(event.percent) ? formatNumber(event.percent) + '%' : '—'}</strong></li>)}</ul>
      : <div className="empty small">{monitor.historyLoading ? 'กำลังโหลดเหตุการณ์…' : 'ไม่มีเหตุการณ์แจ้งเตือนในช่วงนี้'}</div>}
  </section>
}

function NumericFields({ fields, values, update }) {
  return <div className="numeric-grid">{fields.map(([key, label, unit]) => <label key={key}><span>{label}</span><span className="unit-field"><input type="number" step="any" value={values[key]} onChange={(event) => update(key, event.target.value)} required /><small>{unit}</small></span></label>)}</div>
}

function SettingsPage({ source, settings, devices, change, save, persistError, deviceCatalog }) {
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
    <section className="panel settings-panel"><div className="panel-title"><span className="tile-icon"><HardDrive size={19} /></span><div><h2>แหล่งข้อมูล</h2><p>เลือกโปรไฟล์ประจำ Device</p></div></div><Source value={source} devices={devices} change={change} />
      {!deviceCatalog.loading && !devices.length && <p className="notice">{deviceCatalog.error || 'Live ยังไม่ได้กำหนดที่เซิร์ฟเวอร์ ใช้ DEMO ในเว็บได้ทันที'}</p>}
      {persistError && <p role="alert" className="notice error">{persistError}</p>}
    </section>
    <form className="panel settings-panel" onSubmit={submit}><div className="panel-title"><span className="tile-icon"><Settings2 size={19} /></span><div><h2>คาลิเบรตและเกณฑ์แจ้งเตือน</h2><p>ค่าที่บันทึกในเบราว์เซอร์นี้มีผลกับการคำนวณหน้าเว็บเท่านั้น</p></div></div>
      <NumericFields fields={FORM} values={form} update={(key, value) => { setForm({ ...form, [key]: value }); setMessage({ error: '', success: '' }) }} />
      <p className="hint">ระดับน้ำ = ความสูงถัง − (ระยะจากเซนเซอร์ − ระยะเผื่อติดตั้ง) ค่าติดลบและค่าสูงเกินถังจะถูกจำกัดให้อยู่ในช่วง 0–100%</p>
      {message.error && <p role="alert" className="notice error">{message.error}</p>}
      {message.success && <p role="status" className="notice success">{message.success}</p>}
      <button type="submit" className="primary">บันทึกการตั้งค่า</button>
    </form>
  </div>
}

function BatteryPage() {
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

function App() {
  const [page, setPage] = useState('dashboard')
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
  const { reading } = monitor
  const stale = monitor.online === false || Boolean(monitor.latestError)
  const latestLabel = monitor.latestLoading ? 'กำลังโหลด…' : monitor.online === null ? 'ไม่มีข้อมูล' : stale ? 'Offline' : 'Online'
  const notes = stale && Number.isFinite(reading.level) ? 'ค่าครั้งก่อน' : ''

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

  function navigate(next) {
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const shared = { monitor, settings, range, setRange }
  return <div className="app-shell">
    <Nav page={page} setPage={navigate} />
    <div className="workspace">
      <header className="topbar"><div className="top-context"><Waves size={18} /><span>ระบบตรวจวัดระดับน้ำ</span></div><div className="top-actions"><span className={'mode-tag ' + (isSimulated ? 'demo' : 'live')}><span className="status-dot" />{isSimulated ? 'SIMULATED DATA' : 'LIVE DATA'}</span><Source value={source} devices={catalog.devices} change={(value) => persist({ ...prefs, source: value })} /></div></header>
      <main id="main-content">
        <div className="page-heading"><div><h1>{NAV.find(([key]) => key === page)[1]}</h1><p>{page === 'dashboard' ? 'ระดับน้ำ สถานะอุปกรณ์ และการแจ้งเตือนจาก ' + deviceName : {
          history: 'ดูแนวโน้มและสถิติของข้อมูลตามช่วงเวลา', alerts: 'ตรวจเหตุการณ์ที่พบจากระดับน้ำและสถานะเซนเซอร์',
          settings: 'จัดการการอ่านข้อมูลและเกณฑ์ของแต่ละแหล่งข้อมูล', battery: 'ประมาณการเวลาจ่ายไฟให้ ESP32-S3 และอุปกรณ์ต่อพ่วง',
        }[page]}</p></div>
        {page === 'dashboard' && <div className="heading-actions">{isDemo ? <><button className="button-outline" onClick={() => setPaused(!paused)}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? 'เล่น Demo' : 'พัก Demo'}</button><button className="button-outline" onClick={monitor.reset}><RotateCcw size={16} />Reset Demo</button></> : <button className="button-outline" onClick={monitor.retry}><RefreshCw size={16} />รีเฟรช</button>}</div>}</div>

        {page === 'dashboard' && <>
          {monitor.latestError && <p role="alert" className="notice error">{monitor.latestError}{notes ? ' · กำลังแสดงค่าครั้งก่อน' : ''}</p>}
          {reading.state === 'SENSOR_ERROR' && <p role="alert" className="notice error">Sensor Error · ค่าไม่อยู่ในช่วงที่ตั้งไว้ เซนเซอร์รายงานผิดพลาด หรือไม่มีระยะในตัวอย่างล่าสุด</p>}
          {['WARNING', 'DANGER'].includes(reading.state) && !stale && <p role="status" className={'notice alert-banner ' + reading.state.toLowerCase()}><Bell size={17} />{STATUS_LABEL[reading.state]} · {formatNumber(reading.percent)}% เมื่อเทียบกับเกณฑ์ {reading.state === 'DANGER' ? settings.danger : settings.warning}%</p>}
          <div className="overview-grid">
            <Tank reading={reading} stale={stale} />
            <div className="metrics-grid">
              <Metric icon={Waves} label="ระดับน้ำปัจจุบัน" value={formatNumber(reading.level)} unit="cm" note={notes} />
              <Metric icon={Gauge} label="ระดับน้ำในถัง" value={formatNumber(reading.percent)} unit="%" note={notes} />
              <Metric icon={Ruler} label="ระยะถึงผิวน้ำ" value={formatNumber(reading.distance)} unit="cm" note={notes} />
              <Metric icon={Radio} label="ความสดใหม่ของข้อมูล" value={latestLabel} color={monitor.online && !stale ? 'green' : 'amber'} note={monitor.ageSeconds === null ? '' : formatNumber(monitor.ageSeconds, 0) + ' วินาทีก่อน'} />
              <section className="panel activity-card"><div><span>รับข้อมูลล่าสุด</span><strong>{formatDate(reading.ts)}</strong></div><div><span>Device Activity</span><strong>{isDemo ? 'จำลองในเว็บ' : monitor.activity === true ? 'ACTIVE' : monitor.activity === false ? 'INACTIVE' : 'ไม่ทราบ'}</strong>{monitor.lastActivity && <small>{formatDate(monitor.lastActivity)}</small>}</div></section>
            </div>
          </div>
          <div className="overview-bottom"><ChartPanel {...shared} simulated={isSimulated} /><Alerts {...shared} isDemo={isSimulated} recent /></div>
        </>}
        {page === 'history' && <ChartPanel {...shared} simulated={isSimulated} />}
        {page === 'alerts' && <Alerts {...shared} isDemo={isSimulated} />}
        {page === 'settings' && <SettingsPage key={source} source={source} settings={settings} devices={catalog.devices} deviceCatalog={catalog} persistError={persistError} change={(value) => persist({ ...prefs, source: value })} save={(values) => persist({ ...prefs, profiles: { ...profiles, [source]: values } })} />}
        {page === 'battery' && <BatteryPage />}
        <footer><CircleHelp size={15} /> {isDemo ? 'DEMO สร้างข้อมูลในเบราว์เซอร์นี้เท่านั้น' : isSimulated ? 'แหล่งข้อมูลคือ Device จำลองบน ThingsBoard' : 'เวลาล่าสุดอ้างอิงจาก ThingsBoard Cloud'}</footer>
      </main>
    </div>
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
