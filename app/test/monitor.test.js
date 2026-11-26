import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeApi } from '../server/telemetry.js'
import { alertHistory, CLOUD_SIM_SETTINGS, DEFAULT_SETTINGS, estimateRuntime, measure, summarize, validateSettings } from '../src/model.js'

const deviceId = '11111111-1111-4111-8111-111111111111'
const now = 1_800_000_000_000
const env = { TB_ENABLE_CLOUD_READ: '1', TB_ORIGIN: 'https://thingsboard.cloud', TB_API_KEY: 'test-value-only', TB_SIM_DEVICE_ID: deviceId }
const makeSimApi = (settings, fetcher, clock) => makeApi(settings, fetcher, clock, { canSim: true })
const endpoint = (params) => new URL('http://localhost/api/telemetry?' + params)

test('calibrates the known SIM sample and clamps a calibrated valid measurement', () => {
  assert.deepEqual(measure({ ts: now, distance: 35 }, CLOUD_SIM_SETTINGS),
    { ts: now, state: 'DANGER', distance: 35, level: 95, percent: 95 })
  assert.equal(measure({ distance: 29 }, CLOUD_SIM_SETTINGS).percent, 100)
  assert.equal(measure({ distance: 150 }, CLOUD_SIM_SETTINGS).percent, 0)
  assert.equal(measure({ distance: 60 }, CLOUD_SIM_SETTINGS).state, 'WARNING')
  assert.equal(measure({ distance: 45 }, CLOUD_SIM_SETTINGS).state, 'DANGER')
})

test('missing, invalid, timeout and out-of-range readings do not look valid', () => {
  assert.equal(measure(null, DEFAULT_SETTINGS).state, 'EMPTY')
  for (const sample of [{ distance: null }, { distance: 3500 }, { distance: 60, sensorValid: false }]) {
    const result = measure(sample, DEFAULT_SETTINGS)
    assert.equal(result.state, 'SENSOR_ERROR')
    assert.equal(result.level, undefined)
  }
})

test('the simulation covers each threshold and event history omits repeats', () => {
  const points = [38, 47, 55, 65, 72, 80, 88, 95, 91, 82, 74, 62, 46, 33, 27, 36, 52, 59].map((percent, idx) => measure({distance: 130 - percent, ts: idx + 1, sensorValid: true}, CLOUD_SIM_SETTINGS))
  assert.deepEqual(new Set(points.map(({ state }) => state)), new Set(['NORMAL', 'WARNING', 'DANGER']))
  assert.deepEqual(alertHistory(points).map(({ state }) => state), ['WARNING', 'DANGER', 'WARNING'])
  assert.equal(summarize(points).high, 95)
  assert.equal(summarize([]), null)
})

test('settings reject overlapping thresholds and invalid polling; battery uses watt-hours', () => {
  assert.equal(validateSettings(DEFAULT_SETTINGS), '')
  assert.match(validateSettings({ ...DEFAULT_SETTINGS, warningDistance: 10 }), /WARNING/)
  assert.match(validateSettings({ ...DEFAULT_SETTINGS, refreshSeconds: 2 }), /5–300/)
  assert.equal(estimateRuntime({ capacity: 10000, voltage: 3.7, efficiency: 85, current: 180 }).hours.toFixed(2), '34.94')
  assert.equal(estimateRuntime({ capacity: 10000, voltage: 3.7, efficiency: 101, current: 180 }), null)
})

test('the proxy restricts methods, IDs, windows, hosts and opt-in', async () => {
  const fail = () => assert.fail('invalid inputs must not reach ThingsBoard')
  const api = makeSimApi(env, fail)
  assert.deepEqual((await api(endpoint('op=devices'))).data, { devices: [{ key: 'cloud-sim', name: 'ESP32-S3-Water-Level-SIM', simulated: true }] })
  assert.equal((await api(endpoint('op=latest&device=' + deviceId))).status, 404)
  assert.equal((await api(endpoint('op=history&device=cloud-sim&range=toString'))).status, 400)
  assert.equal((await api(endpoint('op=latest&device=cloud-sim'), 'POST')).status, 405)
  assert.equal((await makeSimApi({ ...env, TB_ORIGIN: 'https://bad.example' }, fail)(endpoint('op=latest&device=cloud-sim'))).status, 503)
  assert.equal((await makeSimApi({ ...env, TB_ENABLE_CLOUD_READ: '0' }, fail)(endpoint('op=latest&device=cloud-sim'))).status, 503)
})

test('latest REST reads device activity separately and does not reuse old distance after timeout', async () => {
  const api = makeSimApi(env, async (url, options) => {
    assert.equal(url.origin, 'https://thingsboard.cloud')
    assert.equal(options.headers['X-Authorization'], 'ApiKey test-value-only')
    return Response.json(url.pathname.endsWith('/SERVER_SCOPE')
      ? [{ key: 'active', value: true }, { key: 'lastActivityTime', value: now }]
      : { distance: [{ ts: now - 5000, value: '35' }], sensorValid: [{ ts: now, value: 'false' }] })
  }, () => now)
  const { data } = await api(endpoint('op=latest&device=cloud-sim'))
  assert.deepEqual(data, { sample: { ts: now, distance: null, sensorValid: false, reportedStatus: null }, deviceActive: true, lastActivity: now, serverTime: now })
})

test('a ThingsBoard null placeholder does not supersede the newest real reading', async () => {
  const api = makeSimApi(env, async (url) => Response.json(url.pathname.endsWith('/SERVER_SCOPE') ? []
    : { distance: [{ ts: now - 1000, value: '35' }], sensorValid: [{ ts: now, value: null }] }), () => now)
  const { data } = await api(endpoint('op=latest&device=cloud-sim'))
  assert.deepEqual(data.sample, { ts: now - 1000, distance: 35, sensorValid: null, reportedStatus: null })
})

test('history is sorted, includes invalid timestamps as gaps and retains nulls', async () => {
  const api = makeSimApi(env, async (url) => {
    assert.equal(url.searchParams.get('startTs'), String(now - 3600000))
    return Response.json({ distance: [{ ts: now, value: '40' }, { ts: now - 2000, value: '65' }],
      sensorValid: [{ ts: now - 1000, value: 'false' }] })
  }, () => now)
  const { data } = await api(endpoint('op=history&device=cloud-sim&range=1h'))
  assert.deepEqual(data.points.map(({ distance }) => distance), [65, null, 40])
  assert.equal(data.points[1].sensorValid, false)
})

test('upstream errors return stable public codes without credentials or fabricated readings', async () => {
  for (const [upstream, code] of [[401, 'UPSTREAM_ACCESS_DENIED'], [429, 'UPSTREAM_RATE_LIMIT'], [500, 'UPSTREAM_ERROR']]) {
    const api = makeSimApi(env, () => Promise.resolve(new Response(env.TB_API_KEY, { status: upstream })))
    const { data } = await api(endpoint('op=latest&device=cloud-sim'))
    assert.deepEqual(data, { error: code })
  }
  const api = makeSimApi(env, () => Promise.reject(new Error(env.TB_API_KEY)))
  assert.deepEqual((await api(endpoint('op=latest&device=cloud-sim'))).data, { error: 'UPSTREAM_UNREACHABLE' })
})

test('public login only enables the cloud simulation and keeps its credential server-side', async () => {
  const publicEnv = { ...env, TB_API_KEY: '', TB_PUBLIC_SIM_ID: deviceId, TB_REAL_DEVICE_ID: deviceId }
  let logins = 0
  const api = makeSimApi(publicEnv, async (url, options) => {
    if (url.pathname === '/api/auth/login/public') {
      logins += 1
      assert.deepEqual(JSON.parse(options.body), { publicId: deviceId })
      return Response.json({ token: 'temporary-test-value', refreshToken: 'unused-test-value' })
    }
    assert.equal(options.headers['X-Authorization'], 'Bearer temporary-test-value')
    return Response.json(url.pathname.endsWith('/SERVER_SCOPE') ? [] : {})
  }, () => now)
  assert.equal((await api(endpoint('op=latest&device=esp32'))).status, 403)
  const result = await api(endpoint('op=latest&device=cloud-sim'))
  assert.equal(result.status, 200)
  assert.equal(logins, 1)
  assert.ok(!JSON.stringify(result).includes('test-value'))
})
