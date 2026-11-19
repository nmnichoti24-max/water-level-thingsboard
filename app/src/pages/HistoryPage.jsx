import { useMemo } from 'react'
import { Activity, Download } from 'lucide-react'
import HistoryChart from '../HistoryChart'
import { formatNumber, summarize } from '../model'
import { RangeSwitch } from '../components/MonitorControls'
import { LoadState, RequestError } from '../components/LoadState'
import { downloadHistory } from '../lib/historyCsv'

export default function HistoryPage({ monitor, settings, range, setRange, simulated, exportSource }) {
  const stats = useMemo(() => summarize(monitor.points), [monitor.points])
  return <section className="panel chart-panel">
    <div className="section-head"><div className="panel-title"><span className="tile-icon"><Activity size={19} /></span><div><h2>ระดับน้ำย้อนหลัง</h2><p>{simulated ? 'ช่วงเวลาของข้อมูลจำลอง' : 'ข้อมูลจาก ThingsBoard Cloud'}</p></div></div><RangeSwitch range={range} setRange={setRange} /></div>
    {monitor.historyError && <RequestError message={monitor.historyError} retry={monitor.retry} cached={monitor.points.length > 0} />}
    {monitor.limited && <p className="notice">แสดงผลจากตัวอย่างล่าสุดที่ API คืนมา สูงสุด 2,500 จุดต่อคีย์</p>}
    {stats ? <>
      <HistoryChart points={monitor.points} tankHeight={settings.tankHeight} />
      <div className="stats-strip">{[['ต่ำสุด', stats.low], ['สูงสุด', stats.high], ['เฉลี่ย', stats.average]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{formatNumber(value)} <small>cm</small></strong></div>)}</div>
    </> : !monitor.historyError && <LoadState loading={monitor.historyLoading} loadingText="กำลังโหลดประวัติ…" emptyText="ไม่มีข้อมูลระดับน้ำที่ใช้ได้ในช่วงนี้" />}
    {exportSource && (
      <div className="history-actions">
        <button type="button" className="button-outline" disabled={!monitor.points.length} onClick={() => downloadHistory(monitor.points, exportSource, range)}>
          <Download size={16} aria-hidden="true" /> ส่งออก CSV
        </button>
      </div>
    )}
  </section>
}
