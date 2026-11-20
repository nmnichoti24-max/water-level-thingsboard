export const RANGES = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000 }
export const DEFAULT_SETTINGS = {
  tankHeight: 100, sensorOffset: 0, minDistance: 20, maxDistance: 600,
  warning: 70, danger: 85, refreshSeconds: 10, staleSeconds: 60,
}
export const CLOUD_SIM_SETTINGS = { ...DEFAULT_SETTINGS, sensorOffset: 30 }
export const SCENARIO = [38, 47, 55, 65, 72, 80, 88, 95, 91, 82, 74, 62, 46, 33, 27, 36, 52, 59]
export const formatNumber = (value, digits = 1) => Number.isFinite(value)
  ? new Intl.NumberFormat('th-TH', { maximumFractionDigits: digits }).format(value) : '—'
export const formatDate = (value) => value
  ? new Intl.DateTimeFormat('th-TH-u-ca-gregory', { dateStyle: 'short', timeStyle: 'medium' }).format(value) : '—'

export function validateSettings(input) {
  const keys = Object.keys(DEFAULT_SETTINGS)
  if (keys.some((key) => typeof input[key] !== 'number' || !Number.isFinite(input[key]))) {
    return 'กรอกตัวเลขให้ครบทุกช่อง'
  }
  const { tankHeight, sensorOffset, minDistance, maxDistance, warning, danger, refreshSeconds, staleSeconds } = input
  if (tankHeight <= 0 || tankHeight > 10000 || sensorOffset < 0 || sensorOffset > 10000) return 'ความสูงต้องมากกว่า 0 และระยะเผื่อติดตั้งต้องไม่ติดลบ'
  if (minDistance < 0 || minDistance >= maxDistance || maxDistance > 20000) return 'ระยะต่ำสุดต้องน้อยกว่าระยะสูงสุด'
  if (warning <= 0 || warning >= danger || danger > 100) return 'ใช้เกณฑ์ 0 < WARNING < DANGER ≤ 100'
  if (!Number.isInteger(refreshSeconds) || refreshSeconds < 5 || refreshSeconds > 300) return 'รอบรีเฟรชต้องเป็นจำนวนเต็ม 5–300 วินาที'
  if (!Number.isInteger(staleSeconds) || staleSeconds <= refreshSeconds || staleSeconds > 86400) return 'เวลา Offline ต้องมากกว่ารอบรีเฟรช และไม่เกิน 86,400 วินาที'
  return ''
}

export function measure(sample, settings) {
  if (!sample) return { state: 'EMPTY' }
  const { distance, sensorValid, ts } = sample
  if (sensorValid === false || !Number.isFinite(distance) || distance < settings.minDistance || distance > settings.maxDistance) {
    return { state: 'SENSOR_ERROR', ts }
  }
  const { tankHeight, sensorOffset, warning, danger } = settings
  const level = Math.max(0, Math.min(tankHeight, tankHeight - (distance - sensorOffset)))
  const percent = Math.round((level / tankHeight) * 10000) / 100
  const state = percent >= danger ? 'DANGER' : percent >= warning ? 'WARNING' : 'NORMAL'
  return { state, level, percent, distance, ts }
}

export function simulate(percent, ts, settings) {
  return {
    ts, distance: settings.sensorOffset + settings.tankHeight * (1 - percent / 100), sensorValid: true,
  }
}

export function summarize(points) {
  let count = 0
  let low = Infinity
  let high = -Infinity
  let sum = 0
  for (const point of points) {
    if (!Number.isFinite(point.level)) continue
    low = Math.min(low, point.level)
    high = Math.max(high, point.level)
    sum += point.level
    count += 1
  }
  return count ? { low, high, average: sum / count, count } : null
}

export function alertHistory(points) {
  const events = []
  let previous = ''
  for (const point of points) {
    if (point.state !== previous && ['WARNING', 'DANGER', 'SENSOR_ERROR'].includes(point.state)) {
      events.push({ ...point })
    }
    previous = point.state
  }
  return events.reverse()
}

export function estimateRuntime({ capacity, voltage, efficiency, current }) {
  if (![capacity, voltage, efficiency, current].every((value) => Number.isFinite(value) && value > 0) || efficiency > 100) return null
  const storedWh = (capacity / 1000) * voltage
  const usableWh = storedWh * efficiency / 100
  const loadWatts = (current / 1000) * 5
  const hours = usableWh / loadWatts
  return Number.isFinite(hours) ? { storedWh, usableWh, loadWatts, hours, minutes: hours * 60 } : null
}

const STORAGE_KEY = 'water-monitor-prefs-v1'
const SOURCES = { demo: CLOUD_SIM_SETTINGS, esp32: DEFAULT_SETTINGS, 'cloud-sim': CLOUD_SIM_SETTINGS }

export function loadPreferences(scope) {
  let data
  try {
    data = JSON.parse(localStorage.getItem(scope ? STORAGE_KEY + ':' + scope : STORAGE_KEY))
    data ??= JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}
  } catch {
    data = {}
  }
  const profiles = Object.fromEntries(Object.entries(SOURCES).map(([source, defaults]) => {
    const profile = { ...defaults, ...data.profiles?.[source] }
    return [source, validateSettings(profile) ? defaults : profile]
  }))
  return { source: Object.hasOwn(SOURCES, data.source) ? data.source : 'demo', profiles }
}

export function savePreferences(prefs, scope) {
  localStorage.setItem(scope ? STORAGE_KEY + ':' + scope : STORAGE_KEY, JSON.stringify(prefs))
}
