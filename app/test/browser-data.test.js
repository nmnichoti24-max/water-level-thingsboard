import test from 'node:test'
import assert from 'node:assert/strict'
import { historyCsv } from '../src/lib/historyCsv.js'
import { readTelemetry } from '../src/lib/telemetryClient.js'

test('history export identifies simulated data and leaves invalid measurements blank', () => {
  const csv = historyCsv([
    { ts: 1, distance: 35, level: 95, percent: 95, state: 'DANGER' },
    { ts: 2, state: 'SENSOR_ERROR' },
    { ts: Infinity },
  ], 'cloud-sim')
  assert.equal(csv, '\uFEFFtimestamp_utc,source,distance_cm,water_level_cm,water_percent,status\r\n' +
    '1970-01-01T00:00:00.001Z,SIMULATED,35,95,95,DANGER\r\n' +
    '1970-01-01T00:00:00.002Z,SIMULATED,,,,SENSOR_ERROR\r\n')
})

test('telemetry client distinguishes an empty history from an invalid response', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ points: [] }))
  assert.deepEqual(await readTelemetry('history', { device: 'cloud-sim', range: '6h' }), { points: [] })
  assert.equal(fetch.mock.calls[0].arguments[0], '/api/telemetry?op=history&device=cloud-sim&range=6h')

  fetch.mock.mockImplementation(async () => new Response('<html>maintenance</html>'))
  await assert.rejects(readTelemetry('history'), /รูปแบบที่ไม่รองรับ/)

  fetch.mock.mockImplementation(async () => Response.json({ error: 'UPSTREAM_ACCESS_DENIED' }, { status: 502 }))
  await assert.rejects(readTelemetry('latest'), /ปฏิเสธสิทธิ์/)
})

test('telemetry client distinguishes the deadline from a source-switch cancellation', async (t) => {
  const deadline = new AbortController()
  t.mock.method(AbortSignal, 'timeout', () => deadline.signal)
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    signal.throwIfAborted()
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  })
  const source = new AbortController()
  const cancelled = readTelemetry('latest', { signal: source.signal })
  source.abort()
  await assert.rejects(cancelled, { name: 'AbortError' })

  const delayed = readTelemetry('latest')
  deadline.abort()
  await assert.rejects(delayed, /ตอบช้าเกินไป/)
})
