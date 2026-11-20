import { useState } from 'react'
import { Bell } from 'lucide-react'
import { formatDate, formatNumber } from '../model'
import { RangeSwitch, STATUS_LABEL, Status } from '../components/MonitorControls'
import { LoadState, RequestError } from '../components/LoadState'

export default function AlertsPage({ monitor, simulated, recent = false, range, setRange }) {
  const [filter, setFilter] = useState('all')
  const events = recent ? monitor.alerts.slice(0, 3)
    : monitor.alerts.filter((event) => filter === 'all' || event.state === filter)
  return <section className="panel alerts-panel">
    <div className="section-head"><div className="panel-title"><span className="tile-icon amber"><Bell size={18} /></span><div><h2>{recent ? 'การแจ้งเตือนล่าสุด' : 'ประวัติการแจ้งเตือน'}</h2><p>{simulated ? 'เหตุการณ์จาก Device จำลองบน ThingsBoard' : 'คำนวณจาก Telemetry และเกณฑ์ปัจจุบัน'}</p></div></div>{!recent && <RangeSwitch range={range} setRange={setRange} />}</div>
    {monitor.historyError && <RequestError message={monitor.historyError} retry={monitor.retry} cached={events.length > 0} />}
    {!recent && <label className="event-filter">กรองสถานะ
      <select value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="all">ทุกสถานะ</option>
        <option value="WARNING">WARNING</option>
        <option value="DANGER">DANGER</option>
        <option value="SENSOR_ERROR">Sensor Error</option>
      </select>
    </label>}
    {events.length ? <ul className="events">{events.map((event) => <li key={event.ts + event.state}><Status status={event.state} /><div><b>{STATUS_LABEL[event.state]}</b><small>{formatDate(event.ts)}</small></div><strong>{Number.isFinite(event.percent) ? formatNumber(event.percent) + '%' : '—'}</strong></li>)}</ul>
      : !monitor.historyError && <LoadState compact loading={monitor.historyLoading} loadingText="กำลังโหลดเหตุการณ์…" emptyText="ไม่มีเหตุการณ์แจ้งเตือนในช่วงนี้" />}
  </section>
}
