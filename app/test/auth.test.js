import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { authorizeTelemetry, makeAuth } from '../server/auth.js'
import { makeApi, respond } from '../server/telemetry.js'

const email = 'viewer@example.test'
const testOrigin = 'https://waterguard.example.test'
const env = {
  APP_ORIGIN: testOrigin,
  AUTH_SUPABASE_URL: 'https://test-waterguard.supabase.co',
  AUTH_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mock',
  AUTH_SESSION_KEY: randomBytes(32).toString('base64url'),
}
const baseHeaders = { origin: testOrigin, 'content-type': 'application/json' }
const identity = {
  id: '11111111-1111-4111-8111-111111111111',
  email, email_confirmed_at: '2026-11-20T00:00:00Z',
}

function fixture() {
  let now = 1_800_000_000_000
  let status = 200
  const requests = []
  const upstream = async (url, options) => {
    const route = url.split('/auth/v1')[1]
    const body = options.body ? JSON.parse(options.body) : null
    requests.push({ route, body, headers: options.headers })
    if (status === 0) throw new Error('Network fixture')
    if (status !== 200) return Response.json({ message: 'private provider detail' }, { status })
    if (route.startsWith('/logout')) return new Response(null, { status: 204 })
    if (route === '/recover' || route === '/user') return Response.json({})
    return Response.json({ user: identity, access_token: 'mock-access', refresh_token: 'mock-refresh', expires_in: 300 })
  }
  const api = makeAuth(env, upstream, () => now)
  const call = (op, body = {}, headers = baseHeaders) => api(op, 'POST', headers, body)
  const login = (remember = false) => call('login', { email, password: 'test-input', remember })
  return { call, login, requests, now: () => now, advance: (ms) => { now += ms }, status: (code) => { status = code } }
}

const cookieValue = (result) => result.cookie.split(';')[0]
const withCookie = (result) => ({ ...baseHeaders, cookie: cookieValue(result) })

test('verified login creates no-store-ready encrypted session data with an HTTPS-only cookie', async () => {
  const app = fixture()
  const result = await app.login(true)
  assert.equal(result.status, 200)
  assert.deepEqual(result.data.user, { id: identity.id, email })
  assert.match(result.cookie, /^__Host-wg_session=.*; Path=\/; HttpOnly; SameSite=Strict; Secure; Max-Age=604800$/)
  assert.doesNotMatch(result.cookie + JSON.stringify(result.data), /mock-access|mock-refresh|test-input/)
  assert.equal((await app.call('session', {}, withCookie(result))).status, 200)
  assert.equal(app.requests.length, 1)
  const access = await authorizeTelemetry(env, withCookie(result), app.now())
  assert.equal(access.status, 200)
  assert.equal(access.canSim, false)
  assert.equal(access.liveDevices.size, 0)
  assert.equal((await authorizeTelemetry(env, { ...baseHeaders, cookie: cookieValue(result) + 'tampered' }, app.now())).status, 401)
})

test('invalid credentials, provider rate limiting, network and cross-origin requests never start sessions', async () => {
  const app = fixture()
  for (const [status, expected] of [[400, 'AUTH_CREDENTIALS'], [429, 'AUTH_RATE_LIMIT'], [0, 'AUTH_UNAVAILABLE']]) {
    app.status(status)
    const result = await app.login()
    assert.equal(result.data.error, expected)
    assert.equal(result.cookie, undefined)
  }
  const count = app.requests.length
  assert.equal((await app.call('login', { email, password: 'test-input' }, { ...baseHeaders, origin: 'https://other.example.test' })).status, 403)
  assert.equal(app.requests.length, count)
  assert.equal((await makeAuth({})('login', 'POST', baseHeaders, {})).status, 503)
})

test('refresh keeps the original hard expiry while logout revokes refresh and clears browser cookie', async () => {
  const app = fixture()
  const signIn = await app.login()
  assert.doesNotMatch(signIn.cookie, /Max-Age/)
  app.advance(301000)
  assert.equal((await authorizeTelemetry(env, withCookie(signIn), app.now())).status, 401)
  const renewed = await app.call('session', {}, withCookie(signIn))
  assert.equal(renewed.data.expiresAt, signIn.data.expiresAt)
  assert.match(app.requests.at(-1).route, /grant_type=refresh_token/)
  assert.equal((await authorizeTelemetry(env, withCookie(renewed), app.now())).status, 200)
  const logout = await app.call('logout', {}, withCookie(renewed))
  assert.match(logout.cookie, /^__Host-wg_session=;/)
  assert.match(logout.cookie, /Max-Age=0/)
  assert.equal(app.requests.at(-1).route, '/logout?scope=local')
  app.advance(12 * 3600000)
  const expired = await app.call('session', {}, withCookie(renewed))
  assert.equal(expired.status, 401)
  assert.match(expired.cookie, /Max-Age=0/)
})

test('recovery is generic until OTP verification and never turns into an application session', async () => {
  const app = fixture()
  const sent = await app.call('forgot', { email })
  assert.deepEqual(sent, await app.call('forgot', { email: 'unknown@example.test' }))
  assert.equal(sent.status, 202)
  const reset = await app.call('reset', { email, code: '123456', password: 'new-test-password' })
  assert.deepEqual(app.requests.slice(-3).map(({ route }) => route), ['/verify', '/user', '/logout?scope=global'])
  assert.equal(app.requests.at(-3).body.type, 'recovery')
  assert.equal(reset.data.passwordUpdated, true)
  assert.match(reset.cookie, /Max-Age=0/)
  assert.equal(reset.data.user, undefined)
})

test('unconfigured and unauthenticated HTTP requests cannot use any telemetry operations', async () => {
  for (const [config, status] of [[{}, 503], [env, 401]]) {
    for (const op of ['devices', 'latest', 'history']) {
      const res = { setHeader() {}, end() {} }
      await respond({ method: 'GET', url: '/api/telemetry?op=' + op, headers: {} }, res, config)
      assert.equal(res.statusCode, status)
    }
  }
})

test('SIM-authorized access cannot discover or query LIVE and foreign origins cannot read cookie data', async () => {
  const app = fixture()
  const login = await app.login()
  assert.equal((await authorizeTelemetry(env, { ...withCookie(login), origin: 'https://other.example.test' }, app.now())).status, 403)
  const cloud = {
    TB_ENABLE_CLOUD_READ: '1', TB_ORIGIN: 'https://thingsboard.cloud',
    TB_API_KEY: 'mock-only',
    TB_ENABLE_LIVE_READ: '1', TB_REAL_DEVICE_ID: '88888888-8888-4888-8888-888888888888', TB_SIM_DEVICE_ID: identity.id,
  }
  const api = makeApi(cloud, () => { throw Error('unexpected upstream call') }, app.now, { canSim: true })
  const url = (query) => new URL('https://example.test/?' + query)
  assert.deepEqual((await api(url('op=devices'))).data.devices.map((item) => item.key), ['cloud-sim'])
  assert.equal((await api(url('op=latest&device=esp32'))).status, 403)
})
