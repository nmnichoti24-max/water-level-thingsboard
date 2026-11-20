import { Bell, Droplets, Gauge, Radio, Ruler, Waves } from 'lucide-react'
import { formatDate, formatNumber } from '../model'
import { STATUS_LABEL, Status } from '../components/MonitorControls'
import { RequestError } from '../components/LoadState'
import HistoryPage from './HistoryPage'
import AlertsPage from './AlertsPage'

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

export default function DashboardPage({ monitor, settings, range, setRange, isSimulated }) {
  const { reading } = monitor
  const offline = monitor.online === false
  const stale = offline || Boolean(monitor.latestError)
  let latestLabel = 'ไม่มีข้อมูล'
  if (monitor.latestLoading) latestLabel = 'กำลังโหลด…'
  else if (offline) latestLabel = 'Offline'
  else if (monitor.latestError) latestLabel = 'อ่านข้อมูลไม่ได้'
  else if (monitor.online) latestLabel = 'Online'
  const notes = stale && Number.isFinite(reading.level) ? 'Stale Data · ค่าครั้งก่อน' : ''
  const shared = { monitor, settings, range, setRange }
  return <>
    {monitor.latestError && <RequestError message={monitor.latestError} retry={monitor.retry} cached={Boolean(notes)} />}
    {reading.state === 'SENSOR_ERROR' && <p role="alert" className="notice error">Sensor Error · ค่าไม่อยู่ในช่วงที่ตั้งไว้ เซนเซอร์รายงานผิดพลาด หรือไม่มีระยะในตัวอย่างล่าสุด</p>}
    {['WARNING', 'DANGER'].includes(reading.state) && !stale && <p role="status" className={'notice alert-banner ' + reading.state.toLowerCase()}><Bell size={17} />{STATUS_LABEL[reading.state]} · {formatNumber(reading.percent)}% เมื่อเทียบกับเกณฑ์ {reading.state === 'DANGER' ? settings.danger : settings.warning}%</p>}
    <div className="overview-grid">
      <Tank reading={reading} stale={stale} />
      <div className="metrics-grid">
        <Metric icon={Waves} label="ระดับน้ำปัจจุบัน" value={formatNumber(reading.level)} unit="cm" note={notes} />
        <Metric icon={Gauge} label="ระดับน้ำในถัง" value={formatNumber(reading.percent)} unit="%" note={notes} />
        <Metric icon={Ruler} label="ระยะถึงผิวน้ำ" value={formatNumber(reading.distance)} unit="cm" note={notes} />
        <Metric icon={Radio} label="ความสดใหม่ของข้อมูล" value={latestLabel} color={monitor.online && !stale ? 'green' : 'amber'} note={monitor.ageSeconds === null ? '' : formatNumber(monitor.ageSeconds, 0) + ' วินาทีก่อน'} />
        <section className="panel activity-card"><div><span>รับข้อมูลล่าสุด</span><strong>{formatDate(reading.ts)}</strong></div><div><span>Device Activity</span><strong>{monitor.activity === true ? 'ACTIVE' : monitor.activity === false ? 'INACTIVE' : 'ไม่ทราบ'}</strong>{monitor.lastActivity && <small>{formatDate(monitor.lastActivity)}</small>}</div></section>
      </div>
    </div>
    <div className="overview-bottom"><HistoryPage {...shared} simulated={isSimulated} /><AlertsPage {...shared} simulated={isSimulated} recent /></div>
  </>
}
