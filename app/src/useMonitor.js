import { useCallback, useEffect, useMemo, useState } from 'react'
import { RANGES, SCENARIO, alertHistory, measure, simulate } from './model'

const ERROR_TEXT = {
  CLOUD_NOT_CONFIGURED: 'ยังไม่ได้เปิดการอ่านข้อมูล ThingsBoard ที่เซิร์ฟเวอร์',
  UPSTREAM_ACCESS_DENIED: 'ThingsBoard ปฏิเสธสิทธิ์อ่านข้อมูล ตรวจ API key และสิทธิ์ของ Device',
  UPSTREAM_RATE_LIMIT: 'ThingsBoard จำกัดความถี่ชั่วคราว ลองใหม่ภายหลัง',
  UPSTREAM_UNREACHABLE: 'เชื่อมต่อ ThingsBoard ไม่สำเร็จหรือคำขอหมดเวลา',
  DEVICE_NOT_ALLOWED: 'Device นี้ยังไม่ได้กำหนดในเซิร์ฟเวอร์',
}

async function read(operation, { device, range, signal } = {}) {
  const query = new URLSearchParams({ op: operation })
  if (device) query.set('device', device)
  if (range) query.set('range', range)
  const result = await fetch('/api/telemetry?' + query, { signal, cache: 'no-store' })
  const body = await result.json().catch(() => ({}))
  if (!result.ok) throw new Error(ERROR_TEXT[body.error] ?? 'อ่านข้อมูลจาก ThingsBoard ไม่สำเร็จ')
  return body
}

export function useDevices() {
  const [state, setState] = useState({ devices: [], loading: true, error: '' })
  useEffect(() => {
    const task = new AbortController()
    read('devices', { signal: task.signal })
      .then(({ devices }) => setState({ devices: Array.isArray(devices) ? devices : [], loading: false, error: '' }))
      .catch(() => {
        if (!task.signal.aborted) setState({ devices: [], loading: false, error: 'ติดต่อ API ของเว็บไม่ได้' })
      })
    return () => task.abort()
  }, [])
  return state
}

function demoSeed() {
  const now = Date.now()
  const values = SCENARIO.slice(0, 7)
  return {
    index: 6,
    points: values.map((percent, index) => ({ percent, ts: now - (values.length - index - 1) * 60000 })),
  }
}

const empty = { key: '', value: null, error: '', loading: true }

export function useMonitor(source, settings, range, paused) {
  const isDemo = source === 'demo'
  const [clock, setClock] = useState(Date.now)
  const [sim, setSim] = useState(demoSeed)
  const [latest, setLatest] = useState(empty)
  const [history, setHistory] = useState(empty)
  const [nonce, setNonce] = useState(0)
  const reset = useCallback(() => setSim(demoSeed()), [])
  const retry = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isDemo || paused) return
    const timer = setInterval(() => setSim(({ index, points }) => {
      const next = (index + 1) % SCENARIO.length
      return { index: next, points: [...points.slice(-499), { percent: SCENARIO[next], ts: Date.now() }] }
    }), 4200)
    return () => clearInterval(timer)
  }, [isDemo, paused])

  useEffect(() => {
    if (isDemo) return
    const task = new AbortController()
    let timer
    const run = async () => {
      try {
        const value = await read('latest', { device: source, signal: task.signal })
        if (!task.signal.aborted) setLatest({ key: source, value, loading: false, error: '' })
      } catch (error) {
        if (!task.signal.aborted) setLatest((prev) => ({
          key: source, value: prev.key === source ? prev.value : null, loading: false, error: error.message,
        }))
      } finally {
        if (!task.signal.aborted) timer = setTimeout(run, settings.refreshSeconds * 1000)
      }
    }
    run()
    return () => { task.abort(); clearTimeout(timer) }
  }, [isDemo, source, settings.refreshSeconds, nonce])

  const historyKey = source + ':' + range
  useEffect(() => {
    if (isDemo) return
    const task = new AbortController()
    let timer
    const run = async () => {
      try {
        const value = await read('history', { device: source, range, signal: task.signal })
        if (!task.signal.aborted) setHistory({ key: historyKey, value, loading: false, error: '' })
      } catch (error) {
        if (!task.signal.aborted) setHistory((prev) => ({
          key: historyKey, value: prev.key === historyKey ? prev.value : null, loading: false, error: error.message,
        }))
      } finally {
        if (!task.signal.aborted) timer = setTimeout(run, Math.max(30, settings.refreshSeconds) * 1000)
      }
    }
    run()
    return () => { task.abort(); clearTimeout(timer) }
  }, [historyKey, isDemo, source, range, settings.refreshSeconds, nonce])

  const current = latest.key === source ? latest : empty
  const series = history.key === historyKey ? history : empty
  const sample = useMemo(() => {
    if (!isDemo) return current.value?.sample ?? null
    const last = sim.points.at(-1)
    return simulate(last.percent, last.ts, settings)
  }, [isDemo, current.value, sim, settings])
  const reading = useMemo(() => measure(sample, settings), [sample, settings])
  const points = useMemo(() => {
    if (isDemo) {
      const cutoff = sim.points.at(-1).ts - RANGES[range]
      return sim.points.filter(({ ts }) => ts >= cutoff).map(({ percent, ts }) => measure(simulate(percent, ts, settings), settings))
    }
    return (series.value?.points ?? []).map((point) => measure(point, settings))
  }, [isDemo, sim, settings, series.value, range])
  const alerts = useMemo(() => {
    const ordered = reading.ts && reading.ts > (points.at(-1)?.ts ?? 0) ? [...points, reading] : points
    return alertHistory(ordered)
  }, [points, reading])
  const ageSeconds = sample ? Math.max(0, Math.floor((clock - sample.ts) / 1000)) : null
  const online = ageSeconds === null ? null : ageSeconds < settings.staleSeconds
  return {
    reading, points, alerts, ageSeconds, online,
    activity: isDemo ? null : current.value?.deviceActive ?? null,
    lastActivity: isDemo ? null : current.value?.lastActivity ?? null,
    latestError: isDemo ? '' : current.error, historyError: isDemo ? '' : series.error,
    latestLoading: !isDemo && current.loading, historyLoading: !isDemo && series.loading,
    limited: !isDemo && Boolean(series.value?.limited), reset, retry,
  }
}
