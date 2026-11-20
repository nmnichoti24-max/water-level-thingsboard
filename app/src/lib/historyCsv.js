const SOURCES = { 'cloud-sim': 'SIMULATED', esp32: 'LIVE' }
const STATES = ['NORMAL', 'WARNING', 'DANGER', 'SENSOR_ERROR']
const numberCell = (value) => Number.isFinite(value) ? value : ''

export function historyCsv(points, source) {
  const origin = Object.hasOwn(SOURCES, source) ? SOURCES[source] : ''
  const rows = ['timestamp_utc,source,distance_cm,water_level_cm,water_percent,status']
  for (const { ts, distance, level, percent, state } of points) {
    if (!Number.isFinite(ts)) continue
    const date = new Date(ts)
    if (!Number.isFinite(date.getTime())) continue
    rows.push([
      date.toISOString(), origin, numberCell(distance), numberCell(level),
      numberCell(percent), STATES.includes(state) ? state : '',
    ].join(','))
  }
  return '\uFEFF' + rows.join('\r\n') + '\r\n'
}

export function downloadHistory(points, source, range) {
  const blob = new Blob([historyCsv(points, source)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'water-level-' + source + '-' + range + '.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
