import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authorizeTelemetry, makeAuth, respondAuth } from '../server/auth.js'
import { bridgeConfig, opaque, sha256 } from '../server/bridgeStore.js'
import { respond } from '../server/telemetry.js'
import { isDemoHash, MONITOR_ROUTES, routeFromHash, routeHash } from '../src/lib/routes.js'

const env = {
  APP_ORIGIN: 'https://waterguard.example.test',
  AUTH_SUPABASE_URL: 'https://waterguard-test.supabase.co',
  AUTH_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  AUTH_SESSION_KEY: opaque(),
  AUTH_PAGES_REDIRECT_URL: 'https://nmnichoti24-max.github.io/water-level-thingsboard/',
  AUTH_REDIS_REST_URL: 'https://waterguard-test.upstash.io',
  AUTH_REDIS_REST_TOKEN: 'fixture-only',
}
const origin = new URL(env.AUTH_PAGES_REDIRECT_URL).origin
const local = { origin: env.APP_ORIGIN, 'content-type': 'application/json' }
const external = { origin, 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }

function fixture() {
  let now = 1_800_000_000_000
  const db = new Map()
  const calls = []
  const fetcher = async (url, options) => {
    if (url === env.AUTH_REDIS_REST_URL) {
      const [cmd, key, value, , ttl, mode] = JSON.parse(options.body)
      if (cmd === 'GET' && db.get(key)?.expires <= now) db.delete(key)
      if (cmd === 'GET') return Response.json({ result: db.get(key)?.value ?? null })
      if (cmd === 'DEL') return Response.json({ result: Number(db.delete(key)) })
      if (cmd === 'SET') {
        if (mode === 'NX' ? db.has(key) : !db.has(key)) return Response.json({ result: null })
        db.set(key, { value, expires: now + ttl * 1000 })
        return Response.json({ result: 'OK' })
      }
      if (cmd === 'EVAL') {
        assert.match(key, /redis.call\("GET",KEYS\[1\]\).*redis.call\("DEL",KEYS\[1\]\)/)
        const [, , keyCount, entry, expected] = JSON.parse(options.body)
        assert.equal(keyCount, 1)
        const found = db.get(entry)
        return Response.json({ result: Number(Boolean(found && found.expires > now && found.value === expected && db.delete(entry))) })
      }
      throw new Error('Unknown Redis fixture command')
    }
    calls.push(url)
    if (url.includes('/logout?')) return new Response(null, { status: 204 })
    return Response.json({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'viewer@example.test', email_confirmed_at: '2026-11-20' },
      access_token: 'provider-access-fixture', refresh_token: 'provider-refresh-fixture', expires_in: 900,
    })
  }
  const handler = makeAuth(env, fetcher, () => now)
  const call = (op, args, headers) => handler(op, 'POST', headers, args)
  const signIn = () => call('login', { email: 'viewer@example.test', password: 'fixture-input' }, local)
  const access = (headers) => authorizeTelemetry(env, headers, now, fetcher)
  return { call, signIn, access, advance: (ms) => { now += ms }, db, calls }
}

async function challenge(app) {
  const state = opaque()
  const verifier = opaque()
  const login = await app.signIn()
  assert.match(login.cookie, /^__Host-wg_session=[A-Za-z0-9_-]{43};/)
  assert.doesNotMatch(JSON.stringify([...app.db.values()]), /provider-refresh-fixture/)
  const cookie = login.cookie.split(';')[0]
  const issued = await app.call('bridge-issue', { state, challenge: sha256(verifier), redirect: 'https://attacker.example.test/' }, { ...local, cookie })
  const callback = new URL(issued.data.redirect)
  assert.equal(callback.origin + callback.pathname, env.AUTH_PAGES_REDIRECT_URL)
  assert.equal(callback.hash, '#/login')
  assert.deepEqual([...callback.searchParams.keys()], ['wg_code', 'state'])
  return { cookie, input: { code: callback.searchParams.get('wg_code'), state, verifier } }
}

test('canonical and legacy hashes map to all five pages and keep DEMO explicit', () => {
  for (const route of [...MONITOR_ROUTES, 'login', 'register', 'confirm-email']) {
    assert.equal(routeFromHash('#' + route), route)
    assert.equal(routeFromHash(routeHash(route)), route)
  }
  assert.equal(isDemoHash(routeHash('history', true)), true)
  assert.equal(isDemoHash('#/login?demo=1'), false)
  assert.equal(routeFromHash('#//evil.test'), '')
})

test('a cross-site cookie cannot authorize; one bridged code survives only one concurrent correct exchange', async () => {
  const app = fixture()
  const { cookie, input } = await challenge(app)
  assert.equal((await app.access({ ...external, cookie })).status, 401)
  assert.equal((await app.call('bridge-issue', {}, { ...external, cookie })).status, 403)
  assert.equal((await app.call('bridge-exchange', input, { ...external, origin: 'https://evil.example.test' })).status, 403)
  assert.equal((await app.call('bridge-exchange', { ...input, verifier: opaque() }, external)).status, 401)
  assert.equal((await app.call('bridge-exchange', { ...input, state: opaque() }, external)).status, 401)
  const contenders = await Promise.all(Array.from({ length: 12 }, () => app.call('bridge-exchange', input, external)))
  assert.equal(contenders.filter(({ status }) => status === 200).length, 1)
  const grant = contenders.find(({ status }) => status === 200)
  assert.equal(grant.cookie, undefined)
  assert.doesNotMatch(JSON.stringify(grant.data), /provider-access-fixture|provider-refresh-fixture/)
  const headers = { ...external, authorization: 'Bearer ' + grant.data.accessToken }
  const key = 'wg:v1:acl:' + sha256(env.AUTH_SUPABASE_URL + '/auth/v1|11111111-1111-4111-8111-111111111111')
  assert.equal((await app.access(headers)).canSim, false)
  app.db.set(key, { value: JSON.stringify({ sim: true }), expires: Infinity })
  assert.equal((await app.access(headers)).canSim, true)
  app.db.delete(key)
  assert.equal((await app.access(headers)).canSim, false)
  assert.equal((await app.access({ ...headers, origin: 'https://evil.example.test' })).status, 403)
  assert.equal((await app.call('bridge-logout', {}, headers)).status, 200)
  assert.equal((await app.access(headers)).status, 401)
  assert.equal((await app.access({ ...local, cookie })).status, 401)
  assert.match(app.calls.at(-1), /logout\?scope=local/)
})

test('expired codes and bearer grants fail closed, even with a valid server session', async () => {
  const app = fixture()
  const expired = await challenge(app)
  app.advance(61000)
  assert.equal((await app.call('bridge-exchange', expired.input, external)).status, 401)
  const valid = await challenge(app)
  const grant = await app.call('bridge-exchange', valid.input, external)
  app.advance(301000)
  assert.equal((await app.access({ ...external, authorization: 'Bearer ' + grant.data.accessToken })).status, 401)
  assert.equal((await app.access({ ...local, cookie: valid.cookie })).status, 200)
})

test('CORS preflights cover only the explicit Pages origin, routes, methods and headers', async () => {
  function probe() {
    const headers = {}
    return { headers, setHeader(name, value) { headers[name] = value }, end() {} }
  }
  const req = { method: 'OPTIONS', url: '/api/telemetry?op=latest', headers: {
    origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization',
  } }
  const accepted = probe()
  await respond(req, accepted, env)
  assert.equal(accepted.statusCode, 204)
  assert.equal(accepted.headers['Access-Control-Allow-Origin'], origin)
  assert.equal(accepted.headers['Access-Control-Allow-Credentials'], undefined)
  const refused = probe()
  await respond({ ...req, headers: { ...req.headers, origin: 'https://other.github.io' } }, refused, env)
  assert.equal(refused.statusCode, 405)
  assert.equal(refused.headers['Access-Control-Allow-Origin'], undefined)
  const password = probe()
  await respondAuth({ ...req, url: '/api/auth?op=login', headers: { ...req.headers, 'access-control-request-method': 'POST' } }, password, env)
  assert.equal(password.headers['Access-Control-Allow-Origin'], undefined)
  const readiness = probe()
  readiness.end = function (raw) { this.body = JSON.parse(raw) }
  await respondAuth({ method: 'GET', url: '/api/auth?op=login-status', headers: { origin } }, readiness, env)
  assert.equal(readiness.statusCode, 200)
  assert.deepEqual(readiness.body, { legacy: true, username: false })
  assert.equal(readiness.headers['Access-Control-Allow-Origin'], origin)
  assert.equal(bridgeConfig({ ...env, AUTH_PAGES_REDIRECT_URL: env.AUTH_PAGES_REDIRECT_URL + 'extra' }), null)
})
