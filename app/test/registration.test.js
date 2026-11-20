import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authorizeTelemetry, makeAuth, respondAuth } from '../server/auth.js'
import { opaque, sha256 } from '../server/bridgeStore.js'
import { makeApi } from '../server/telemetry.js'

const env = {
  APP_ORIGIN: 'https://waterguard.example.test',
  AUTH_SUPABASE_URL: 'https://waterguard-test.supabase.co',
  AUTH_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  AUTH_SESSION_KEY: opaque(),
  AUTH_ENABLE_REGISTRATION: '1',
  AUTH_PAGES_REDIRECT_URL: 'https://nmnichoti24-max.github.io/water-level-thingsboard/',
  AUTH_REDIS_REST_URL: 'https://waterguard-test.upstash.io',
  AUTH_REDIS_REST_TOKEN: 'fixture-only',
  TB_ORIGIN: 'https://thingsboard.cloud',
  TB_ENABLE_CLOUD_READ: '1',
  TB_ENABLE_LIVE_READ: '1',
  TB_API_KEY: 'fixture-only',
  TB_SIM_DEVICE_ID: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  TB_REAL_DEVICE_ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.test' }
const credentials = { email: user.email, password: 'test-example-password', confirmation: 'test-example-password' }
const headers = { origin: env.APP_ORIGIN, 'content-type': 'application/json', 'x-vercel-forwarded-for': '192.0.2.11' }
const pages = { ...headers, origin: new URL(env.AUTH_PAGES_REDIRECT_URL).origin, 'sec-fetch-site': 'cross-site' }

function fixture(overrides = {}) {
  const settings = { ...env, ...overrides }
  const db = new Map()
  const calls = []
  const state = { confirmed: false, autoConfirm: false, response: null, signupDisabled: false }
  const now = 1_800_000_000_000
  const providerSession = () => ({
    user: { ...user, email_confirmed_at: state.confirmed ? '2026-11-20T00:00:00Z' : null },
    access_token: 'provider-access-fixture', refresh_token: 'provider-refresh-fixture', expires_in: 900,
  })
  const fetcher = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined
    if (url === settings.AUTH_REDIS_REST_URL) {
      const [cmd, key, value, ip, account, ipLimit, accountLimit, ttl] = body
      if (cmd === 'EVAL') {
        assert.match(key, /INCR.*[\s\S]*EXPIRE/)
        assert.equal(value, 2)
        assert.equal(ttl, 900)
        assert.doesNotMatch(JSON.stringify(body), /test@example|192\.0\.2/)
        function attempt(id, cap) {
          db.set(id, (db.get(id) ?? 0) + 1)
          return db.get(id) <= cap
        }
        return Response.json({ result: Number(attempt(ip, ipLimit) && attempt(account, accountLimit)) })
      }
      if (cmd === 'SET') { db.set(key, value); return Response.json({ result: 'OK' }) }
      if (cmd === 'GET') return Response.json({ result: db.get(key) ?? null })
      throw new Error('Unexpected Redis test command')
    }
    if (new URL(url).origin === settings.TB_ORIGIN) {
      calls.push({ route: new URL(url).pathname })
      return Response.json({})
    }
    const route = url.slice(settings.AUTH_SUPABASE_URL.length + '/auth/v1'.length)
    calls.push({ route, body })
    if (route === '/settings') return Response.json({
      disable_signup: state.signupDisabled, external: { email: true }, mailer_autoconfirm: state.autoConfirm,
    })
    if (route.startsWith('/signup?')) return state.response ?? Response.json({ ...user })
    if (route === '/verify') {
      if (body.token !== '123456') return Response.json({ error_code: 'otp_expired' }, { status: 403 })
      state.confirmed = true
      return Response.json(providerSession())
    }
    if (route.startsWith('/logout?')) return new Response(null, { status: 204 })
    return Response.json(providerSession())
  }
  const handler = makeAuth(settings, fetcher, () => now)
  const call = (op, input, incoming = headers) => handler(op, 'POST', incoming, input)
  const grant = (acl) => {
    const key = 'wg:v1:acl:' + sha256(settings.AUTH_SUPABASE_URL + '/auth/v1|' + user.id)
    if (acl) db.set(key, JSON.stringify(acl))
    else db.delete(key)
  }
  const access = (cookie) => authorizeTelemetry(settings, { cookie }, now, fetcher)
  const telemetry = async (operation, cookie) => {
    const permitted = await access(cookie)
    return permitted.status === 200
      ? makeApi(settings, fetcher, () => now, permitted)(new URL('https://example.test/?' + operation))
      : permitted
  }
  return { call, state, calls, grant, telemetry }
}

test('registration accepts valid credentials generically with PKCE and no session', async () => {
  const app = fixture()
  const result = await app.call('register', { ...credentials, email: ' TEST@example.test ', role: 'ADMIN', redirect: 'https://foreign.test/' }, pages)
  assert.deepEqual(result, { status: 202, data: { accepted: true } })
  const sent = app.calls.at(-1)
  assert.equal(new URL(sent.route, env.AUTH_SUPABASE_URL).searchParams.get('redirect_to'), env.APP_ORIGIN + '/')
  assert.deepEqual(Object.keys(sent.body), ['email', 'password', 'code_challenge', 'code_challenge_method'])
  assert.equal(sent.body.email, user.email)
  assert.equal(sent.body.code_challenge_method, 's256')
  assert.match(sent.body.code_challenge, /^[A-Za-z0-9_-]{43}$/)
  app.state.response = Response.json({ error_code: 'user_already_exists' }, { status: 422 })
  assert.deepEqual(await app.call('register', credentials), result)
})

test('invalid email, weak password, mismatching confirmation and foreign origins never reach signup', async () => {
  const app = fixture()
  for (const [patch, error] of [
    [{ email: 'broken' }, 'AUTH_REGISTER_EMAIL'],
    [{ password: 'short' }, 'AUTH_REGISTER_PASSWORD'],
    [{ password: '😀'.repeat(20) }, 'AUTH_REGISTER_PASSWORD'],
    [{ confirmation: 'not-a-match' }, 'AUTH_REGISTER_MISMATCH'],
  ]) {
    assert.deepEqual(await app.call('register', { ...credentials, ...patch }), { status: 400, data: { error } })
  }
  assert.equal((await app.call('register', credentials, { ...pages, origin: 'https://foreign.test' })).status, 403)
  assert.deepEqual(app.calls, [])
})

test('both account and IP registration limits apply; Supabase errors remain generic', async () => {
  const emailLimited = fixture()
  for (let n = 1; n <= 6; n++) {
    const result = await emailLimited.call('register', credentials, { ...headers, 'x-vercel-forwarded-for': '192.0.2.' + n })
    assert.equal(result.status, n <= 5 ? 202 : 429)
  }
  const ipLimited = fixture()
  for (let n = 1; n <= 21; n++) {
    const result = await ipLimited.call('register', { ...credentials, email: 'test' + n + '@example.test' })
    assert.equal(result.status, n <= 20 ? 202 : 429)
  }
  const upstream = fixture()
  upstream.state.response = Response.json({ error_code: 'over_email_send_rate_limit' }, { status: 429 })
  assert.deepEqual(await upstream.call('register', credentials), { status: 429, data: { error: 'AUTH_RATE_LIMIT' } })
  for (const status of [429, 500]) {
    upstream.state.response = Response.json({ msg: 'private upstream detail' }, { status })
    const result = await upstream.call('register', credentials)
    assert.equal(result.status, status === 429 ? 429 : 503)
    assert.doesNotMatch(JSON.stringify(result), /private upstream detail/)
  }
})

test('signup requires local opt-in and confirmed-email provider settings', async () => {
  for (const key of ['autoConfirm', 'signupDisabled']) {
    const app = fixture()
    app.state[key] = true
    assert.equal((await app.call('register', credentials)).data.error, 'AUTH_REGISTRATION_DISABLED')
    assert.equal(app.calls.some(({ route }) => route.startsWith('/signup')), false)
  }
  const disabled = fixture({ AUTH_ENABLE_REGISTRATION: '0' })
  assert.equal((await disabled.call('register', credentials)).data.error, 'AUTH_REGISTRATION_DISABLED')
  assert.deepEqual(disabled.calls, [])
  const provider = fixture()
  provider.state.response = Response.json({ access_token: 'unexpected-token' })
  assert.equal((await provider.call('register', credentials)).status, 503)
})

test('email verification uses a Vercel POST, revokes provider session and returns only the fixed Login URL', async () => {
  const app = fixture()
  assert.equal((await app.call('login', credentials)).cookie, undefined)
  assert.equal((await app.telemetry('op=latest&device=cloud-sim')).status, 401)
  const input = { email: user.email, code: '123456', redirect: 'https://foreign.test/' }
  assert.equal((await app.call('verify-email', input, pages)).status, 403)
  assert.equal((await app.call('verify-email', { ...input, code: '999999' })).data.error, 'AUTH_EMAIL_CODE')
  const result = await app.call('verify-email', input)
  assert.deepEqual(result, { status: 200, data: { confirmed: true, redirect: env.AUTH_PAGES_REDIRECT_URL + '#/login?confirmed=1' } })
  assert.equal(app.calls.at(-2).body.type, 'email')
  assert.equal(app.calls.at(-1).route, '/logout?scope=local')
  assert.equal((await app.telemetry('op=latest&device=cloud-sim')).status, 401)
  const login = await app.call('login', credentials)
  assert.equal(login.status, 200)
  const cookie = login.cookie.split(';')[0]
  assert.deepEqual((await app.telemetry('op=devices', cookie)).data.devices, [])
  for (const device of ['cloud-sim', 'esp32']) {
    assert.equal((await app.telemetry('op=latest&device=' + device, cookie)).status, 403)
  }
})

test('verified users need explicit Redis ACL; SIM and LIVE device scopes are independent and revocable', async () => {
  const app = fixture()
  app.state.confirmed = true
  const login = await app.call('login', { ...credentials, role: 'ADMIN' })
  const cookie = login.cookie.split(';')[0]
  const sim = 'op=latest&device=cloud-sim'
  const live = 'op=history&device=esp32&range=1h'
  assert.deepEqual((await app.telemetry('op=devices', cookie)).data.devices, [])
  for (const query of [sim, live]) assert.equal((await app.telemetry(query, cookie)).status, 403)
  app.grant({ sim: true, role: 'ADMIN' })
  assert.equal((await app.telemetry(sim, cookie)).status, 200)
  assert.equal((await app.telemetry(live, cookie)).status, 403)
  app.grant({ liveDevices: [env.TB_SIM_DEVICE_ID] })
  assert.equal((await app.telemetry(live, cookie)).status, 404)
  app.grant({ liveDevices: [env.TB_REAL_DEVICE_ID] })
  assert.equal((await app.telemetry(live, cookie)).status, 200)
  assert.equal((await app.telemetry(sim, cookie)).status, 403)
  assert.equal((await app.telemetry('op=latest&device=' + env.TB_REAL_DEVICE_ID + '&role=ADMIN', cookie)).status, 404)
  app.grant(null)
  assert.equal((await app.telemetry(live, cookie)).status, 403)
})

test('registration HTTP handler rejects oversized bodies and scopes the CORS preflight', async () => {
  function response() {
    const result = {}
    return { result, setHeader(name, value) { result[name] = value }, end() {} }
  }
  const registration = '/api/auth?op=register'
  const oversized = response()
  await respondAuth({ method: 'POST', url: registration, headers, body: ' '.repeat(4097) }, oversized, env)
  assert.equal(oversized.statusCode, 400)
  const request = { method: 'OPTIONS', url: registration, headers: {
    ...pages, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type',
  } }
  const allowed = response()
  await respondAuth(request, allowed, env)
  assert.equal(allowed.statusCode, 204)
  assert.equal(allowed.result['Access-Control-Allow-Origin'], pages.origin)
  assert.equal(allowed.result['Access-Control-Allow-Credentials'], undefined)
  const rejected = response()
  await respondAuth({ ...request, url: '/api/auth?op=verify-email' }, rejected, env)
  assert.equal(rejected.result['Access-Control-Allow-Origin'], undefined)
})

test('public Auth never exposes an ACL mutation operation', async () => {
  const app = fixture()
  for (const operation of ['grant', 'revoke', 'acl', 'admin']) {
    const result = await app.call(operation, { userId: user.id, role: 'ADMIN', sim: true })
    assert.deepEqual(result, { status: 404, data: { error: 'AUTH_OPERATION' }, cookie: undefined })
  }
  assert.deepEqual(app.calls, [])
  const res = { setHeader() {}, end(data) { this.data = JSON.parse(data) } }
  await respondAuth({ method: 'GET', url: '/api/auth?op=registration-status', headers: pages },
    res, { ...env, AUTH_ENABLE_REGISTRATION: '0' })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.data, { ready: false })
})
