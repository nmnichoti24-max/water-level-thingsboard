import { useCallback, useEffect, useMemo, useState } from 'react'
import { alertHistory, freshness, measure } from '../model'
import { readTelemetry } from '../lib/telemetryClient'

export function useDevices() {
  const [state, setState] = useState({ devices: [], loading: true, error: '' })
  const [attempt, setAttempt] = useState(0)
  function retry() {
    setState((previous) => ({ ...previous, loading: true, error: '' }))
    setAttempt((value) => value + 1)
  }
  useEffect(() => {
    const task = new AbortController()
    readTelemetry('devices', { signal: task.signal })
      .then(({ devices }) => {
        if (!task.signal.aborted) setState({ devices, loading: false, error: '' })
      })
      .catch((error) => {
        if (!task.signal.aborted) setState((previous) => ({ ...previous, loading: false, error: error.message }))
      })
    return () => task.abort()
  }, [attempt])
  return { ...state, retry }
}

const empty = { key: '', value: null, error: '', loading: true }

export function useMonitor(source, settings, range) {
  const [clock, setClock] = useState(Date.now)
  const [latest, setLatest] = useState(empty)
  const [history, setHistory] = useState(empty)
  const [nonce, setNonce] = useState(0)
  const retry = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!source) return
    const task = new AbortController()
    let timer
    const run = async () => {
      try {
        const value = await readTelemetry('latest', { device: source, signal: task.signal })
        // Server clock minus browser clock, so a wrong PC clock does not make LIVE data look fresh or stale.
        const skew = Number.isFinite(value.serverTime) ? value.serverTime - Date.now() : 0
        if (!task.signal.aborted) setLatest({ key: source, value, skew, loading: false, error: '' })
      } catch (error) {
        if (!task.signal.aborted) setLatest((prev) => ({
          key: source, value: prev.key === source ? prev.value : null, skew: prev.key === source ? prev.skew : 0, loading: false, error: error.message,
        }))
      } finally {
        if (!task.signal.aborted) timer = setTimeout(run, settings.refreshSeconds * 1000)
      }
    }
    run()
    return () => { task.abort(); clearTimeout(timer) }
  }, [source, settings.refreshSeconds, nonce])

  const historyKey = source + ':' + range
  useEffect(() => {
    if (!source) return
    const task = new AbortController()
    let timer
    const run = async () => {
      try {
        const value = await readTelemetry('history', { device: source, range, signal: task.signal })
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
  }, [historyKey, source, range, settings.refreshSeconds, nonce])

  const current = latest.key === source ? latest : empty
  const series = history.key === historyKey ? history : empty
  const sample = current.value?.sample ?? null
  const reading = useMemo(() => measure(sample, settings), [sample, settings])
  const points = useMemo(() => (series.value?.points ?? []).map((point) => measure(point, settings)), [series.value, settings])
  const alerts = useMemo(() => {
    const ordered = reading.ts && reading.ts > (points.at(-1)?.ts ?? 0) ? [...points, reading] : points
    return alertHistory(ordered)
  }, [points, reading])
  const ageSeconds = sample ? Math.max(0, Math.floor((clock + (current.skew ?? 0) - sample.ts) / 1000)) : null
  const fresh = freshness(ageSeconds, settings.staleSeconds)
  const online = fresh === null ? null : fresh === 'online'
  return {
    reading, points, alerts, ageSeconds, online, freshness: fresh,
    reportedStatus: sample?.reportedStatus ?? null,
    activity: current.value?.deviceActive ?? null,
    lastActivity: current.value?.lastActivity ?? null,
    latestError: source ? current.error : '', historyError: source ? series.error : '',
    latestLoading: Boolean(source) && current.loading, historyLoading: Boolean(source) && series.loading,
    limited: Boolean(source && series.value?.limited), retry,
  }
}
