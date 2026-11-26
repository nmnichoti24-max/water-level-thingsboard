import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { CLOUD_SIM_SETTINGS, firmwareCalibration, freshness, LIVE_SETTINGS, loadPreferences, measure } from '../src/model.js'
import { makeApi } from '../server/telemetry.js'
import { historyCsv } from '../src/lib/historyCsv.js'

const config = readFileSync(new URL('../../firmware/WaterGuard_ESP32S3/config.h', import.meta.url), 'utf8')
const define = (name) => Number.parseFloat(config.match(new RegExp(String.raw`#define\s+${name}\s+([0-9.]+)`))?.[1])

test('firmware config.h defaults reproduce the web LIVE calibration and thresholds', () => {
  const expected = firmwareCalibration(LIVE_SETTINGS)
  for (const [key, value] of Object.entries(expected)) assert.equal(define(key), value, key)
  assert.ok(LIVE_SETTINGS.sensorOffset >= LIVE_SETTINGS.minDistance, 'full-tank surface must be outside the blind zone')
  // Firmware uploads every TELEMETRY_INTERVAL_MS; the web must not call that stale.
  assert.ok(define('TELEMETRY_INTERVAL_MS') / 1000 < LIVE_SETTINGS.staleSeconds)
  // The LIVE web view polls as often as the board uploads.
  assert.equal(LIVE_SETTINGS.refreshSeconds, define('TELEMETRY_INTERVAL_MS') / 1000)
})

test('firmware SIM calibration matches the web cloud-sim profile, independent of LIVE', () => {
  const sim = firmwareCalibration(CLOUD_SIM_SETTINGS)
  assert.equal(define('SIM_SENSOR_TO_FULL_CM'), sim.SENSOR_TO_FULL_CM)
  assert.equal(define('SIM_SENSOR_TO_BOTTOM_CM'), sim.SENSOR_TO_BOTTOM_CM)
})

test('firmware formula and web formula give the same level, percent and status', () => {
  const full = define('SENSOR_TO_FULL_CM')
  const span = define('SENSOR_TO_BOTTOM_CM') - full
  const firmware = (distance) => {
    const level = Math.max(0, Math.min(span, span - (distance - full)))
    const percent = Math.round(level / span * 10000) / 100
    return { percent, state: percent >= define('DANGER_PERCENT') ? 'DANGER' : percent >= define('WARNING_PERCENT') ? 'WARNING' : 'NORMAL' }
  }
  for (let distance = 20; distance <= 600; distance += 0.1) {
    const d = Math.round(distance * 10) / 10
    const web = measure({ distance: d, sensorValid: true }, LIVE_SETTINGS)
    const fw = firmware(d)
    assert.equal(web.percent, fw.percent, 'percent at ' + d)
    assert.equal(web.state, fw.state, 'state at ' + d)
  }
  assert.equal(measure({ distance: 42, sensorValid: true }, LIVE_SETTINGS).state, 'WARNING')
  assert.equal(measure({ distance: 30, sensorValid: true }, LIVE_SETTINGS).state, 'DANGER')
  assert.equal(measure({ sensorValid: false }, LIVE_SETTINGS).state, 'SENSOR_ERROR')
})

test('freshness separates online, stale and offline', () => {
  assert.equal(freshness(null, 60), null)
  assert.equal(freshness(5, 60), 'online')
  assert.equal(freshness(60, 60), 'stale')
  assert.equal(freshness(179, 60), 'stale')
  assert.equal(freshness(180, 60), 'offline')
})

test('stored LIVE profile defaults to the firmware calibration and never falls back to SIM', () => {
  globalThis.localStorage = { getItem: () => null, setItem() {} }
  try {
    assert.deepEqual(loadPreferences('user').profiles.esp32, LIVE_SETTINGS)
    assert.equal(loadPreferences('user').source, '')
  } finally { delete globalThis.localStorage }
})

test('a firmware sensor error payload reaches the web as Sensor Error, never as a zero level', async () => {
  const id = '22222222-2222-4222-8222-222222222222'
  const now = 1_800_000_000_000
  const env = { TB_ENABLE_CLOUD_READ: '1', TB_ORIGIN: 'https://thingsboard.cloud', TB_API_KEY: 'test-value-only', TB_REAL_DEVICE_ID: id, TB_ENABLE_LIVE_READ: '1', TB_SIM_DEVICE_ID: '33333333-3333-4333-8333-333333333333' }
  const api = makeApi(env, async (url) => {
    assert.ok(url.pathname.includes(id), 'LIVE request must target the LIVE device only')
    return Response.json(url.pathname.endsWith('/SERVER_SCOPE') ? []
      : { distance: [{ ts: now - 5000, value: 45.2 }], status: [{ ts: now - 5000, value: 'DANGER' }], sensorValid: [{ ts: now, value: false }] })
  }, () => now, { canSim: false, liveDevices: new Set([id]) })
  const { data } = await api(new URL('http://localhost/api/telemetry?op=latest&device=esp32'))
  assert.deepEqual(data.sample, { ts: now, distance: null, sensorValid: false, reportedStatus: null })
  assert.equal(measure(data.sample, LIVE_SETTINGS).state, 'SENSOR_ERROR')
  // A LIVE-only account cannot read SIM, so SIM is never substituted for LIVE.
  assert.equal((await api(new URL('http://localhost/api/telemetry?op=latest&device=cloud-sim'))).status, 403)
})

test('CSV export labels LIVE rows as LIVE', () => {
  const csv = historyCsv([measure({ ts: 1_800_000_000_000, distance: 30, sensorValid: true }, LIVE_SETTINGS)], 'esp32')
  assert.match(csv, /,LIVE,30,70,93.33,DANGER/)
})
