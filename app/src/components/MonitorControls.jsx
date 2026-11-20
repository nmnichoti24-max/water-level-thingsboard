const PERIODS = [['1h', '1 ชม.'], ['6h', '6 ชม.'], ['24h', '24 ชม.'], ['7d', '7 วัน']]

export const STATUS_LABEL = {
  NORMAL: 'ระดับน้ำปกติ', WARNING: 'ระดับน้ำเริ่มสูง', DANGER: 'ระดับน้ำสูงมาก',
  SENSOR_ERROR: 'Sensor Error', EMPTY: 'ยังไม่มีข้อมูล',
}

export function Source({ value, devices, change }) {
  return <label className="source-picker">
    <span className="visually-hidden">เลือกแหล่งข้อมูล</span>
    <select value={value} onChange={(event) => change(event.target.value)}>
      {devices.map(({ key, name, simulated }) => <option key={key} value={key}>{simulated ? 'SIM · ' : 'LIVE · '}{name}</option>)}
    </select>
  </label>
}

export function Status({ status }) {
  return <span className={'status-pill ' + status.toLowerCase()}><span className="status-dot" />{status === 'SENSOR_ERROR' ? 'SENSOR ERROR' : status === 'EMPTY' ? 'NO DATA' : status}</span>
}

export function RangeSwitch({ range, setRange }) {
  return <div className="range-switch" aria-label="ช่วงเวลา">{PERIODS.map(([key, label]) => <button key={key} type="button" aria-pressed={range === key} onClick={() => setRange(key)}>{label}</button>)}</div>
}

export function NumericFields({ fields, values, update }) {
  return <div className="numeric-grid">{fields.map(([key, label, unit]) => <label key={key}><span>{label}</span><span className="unit-field"><input type="number" step="any" value={values[key]} onChange={(event) => update(key, event.target.value)} required /><small>{unit}</small></span></label>)}</div>
}
