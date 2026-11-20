import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { loadEnv } from 'vite'
import { usernameAccounts } from '../server/accounts.js'
import { authConfig, authorizeTelemetry, makeAuth } from '../server/auth.js'
import { bridgeStore, opaque, sha256 } from '../server/bridgeStore.js'
import { makeApi } from '../server/telemetry.js'

const realRedis = process.env.WG_TEST_REAL_REDIS === '1'
const live = realRedis ? loadEnv('development', process.cwd(), '') : {}
const fixtureDatabase = new URL('postgresql://aws-0-test-1.pooler.supabase.com:6543/postgres')
fixtureDatabase.username = 'waterguard_app.fixture'
fixtureDatabase.password = 'unused-test-value'
const env = {
  APP_ORIGIN: 'https://waterguard-example.test',
  AUTH_SUPABASE_URL: 'https://username-fixture.supabase.co',
  AUTH_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  AUTH_SESSION_KEY: opaque(),
  AUTH_PAGES_REDIRECT_URL: 'https://nmnichoti24-max.github.io/water-level-thingsboard/',
  AUTH_REDIS_REST_URL: realRedis ? live.AUTH_REDIS_REST_URL : 'https://username-fixture.upstash.io',
  AUTH_REDIS_REST_TOKEN: realRedis ? live.AUTH_REDIS_REST_TOKEN : 'fixture-only',
  AUTH_ACCOUNT_DATABASE_URL: fixtureDatabase.href,
  AUTH_ENABLE_USERNAME_REGISTRATION: '1',
}
const origin = env.APP_ORIGIN
const pages = new URL(env.AUTH_PAGES_REDIRECT_URL).origin
const localHeaders = { origin, 'content-type': 'application/json', 'x-vercel-forwarded-for': '192.0.2.10' }
const pagesHeaders = { ...localHeaders, origin: pages, 'sec-fetch-site': 'cross-site' }
const password = 'fixture-passphrase-for-test'
const migration = await readFile(new URL('../database/001_username_accounts.sql', import.meta.url), 'utf8')

function mockRedis() {
  const kv = new Map()
  return async (url, init) => {
    assert.equal(url, env.AUTH_REDIS_REST_URL, 'Username auth must not call Supabase Auth password endpoints')
    const [command, key, value, , , mode] = JSON.parse(init.body)
    let result
    if (command === 'GET') result = kv.get(key) ?? null
    else if (command === 'DEL') result = Number(kv.delete(key))
    else if (command === 'SET') {
      if (mode === 'NX' ? kv.has(key) : !kv.has(key)) result = null
      else { kv.set(key, value); result = 'OK' }
    } else if (command === 'EVAL') {
      const [, , keyCount, a, b, perIp, perAccount] = JSON.parse(init.body)
      if (keyCount === 1) result = kv.get(a) === b ? Number(kv.delete(a)) : 0
      else {
        const attempts = (id, max) => {
          const count = (kv.get(id) ?? 0) + 1
          kv.set(id, count)
          return count <= max
        }
        result = Number(attempts(a, perIp) && attempts(b, perAccount))
      }
    } else throw new Error('Unsupported Redis fixture command')
    return Response.json({ result })
  }
}

async function fixture() {
  const db = new PGlite()
  await db.exec(migration)
  await db.exec('set role waterguard_accounts')
  const config = authConfig(env)
  if (!config?.bridge) throw new Error('Real Redis test needs the existing local Upstash configuration')
  const fetcher = realRedis ? async (url, init) => {
    assert.equal(url, env.AUTH_REDIS_REST_URL, 'Username auth contacted a non-Redis provider')
    return fetch(url, init)
  } : mockRedis()
  let now = Date.now()
  const api = makeAuth(env, fetcher, () => now, () => usernameAccounts(config.usernameDb, db))
  const store = bridgeStore(config.bridge, fetcher)
  const user = 'u' + opaque().slice(0, 19).toLowerCase().replaceAll('_', '-')
  const credentials = { username: user, password, confirmation: password }
  const run = (op, data = {}, headers = localHeaders) => api(op, 'POST', headers, data)
  const auth = (headers) => authorizeTelemetry(env, headers, now, fetcher)
  const apiRead = async (device, headers) => {
    const access = await auth(headers)
    return access.status === 200
      ? makeApi({}, () => { throw new Error('Unexpected telemetry upstream request') }, () => now, access)(
        new URL('https://example.test/?op=latest&device=' + device))
      : access
  }
  return { db, store, config, user, credentials, run, auth, apiRead, advance: (t) => { now += t } }
}

const cookieValue = (result) => result.cookie.split(';')[0]
const name = realRedis ? ' with actual Upstash Redis and embedded PostgreSQL' : ' with Redis fixture and embedded PostgreSQL'

test('concurrent registration writes exactly one Argon2id credential and respects DB role restrictions' + name, async () => {
  const a = await fixture()
  try {
    const wrong = await a.run('register-username', { ...a.credentials, confirmation: 'does-not-match' }, pagesHeaders)
    assert.deepEqual(wrong.data, { error: 'AUTH_REGISTER_MISMATCH' })
    const responses = await Promise.all([a.user, a.user.toUpperCase(), ' ' + a.user + ' '].map((username, index) => a.run(
      'register-username', { ...a.credentials, username },
      { ...pagesHeaders, 'x-vercel-forwarded-for': realRedis ? a.config.key[index] % 200 + 1 + '.2.3.4' : '192.0.2.' + (10 + index) },
    )))
    assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409, 409])
    assert.equal(responses.find((r) => r.status === 201).cookie, undefined)
    const saved = await usernameAccounts(a.config.usernameDb, a.db).find(a.user)
    assert.match(saved.password_hash, /^\$argon2id\$v=19\$m=32768,t=3,p=1\$/)
    assert.ok(!saved.password_hash.includes(password))
    await assert.rejects(a.db.query('update waterguard_private.accounts set credential_version = 2'), /permission denied/)
    await a.db.exec('reset role; create role wg_test_untrusted; set role wg_test_untrusted;')
    await assert.rejects(a.db.query('select username from waterguard_private.accounts'), /permission denied/)
  } finally { await a.db.close() }
})

test('username login, PKCE, Redis ACL, renewal, and logout preserve identity and default deny' + name, async () => {
  const a = await fixture()
  let id, redisSession
  try {
    assert.equal((await a.run('register-username', a.credentials)).status, 201)
    for (const input of [{ ...a.credentials, username: a.user + 'x' }, { ...a.credentials, password: 'incorrect-password' }]) {
      const rejected = await a.run('login-username', input)
      assert.deepEqual(rejected.data, { error: 'AUTH_USERNAME_CREDENTIALS' })
      assert.equal(rejected.status, 401)
    }
    assert.equal((await a.run('login-username', a.credentials, pagesHeaders)).status, 403)
    const login = await a.run('login-username', a.credentials)
    assert.equal(login.status, 200)
    assert.match(login.cookie, /^__Host-wg_session=[A-Za-z0-9_-]{43};/)
    id = login.data.user.id
    assert.deepEqual(login.data.user, { id, username: a.user })
    const cookie = cookieValue(login)
    redisSession = cookie.split('=')[1]
    assert.ok(!(await a.store.get('session', redisSession)).includes(password))
    const sameOrigin = { ...localHeaders, cookie }
    const state = opaque(), verifier = opaque()
    const issued = await a.run('bridge-issue', { state, challenge: sha256(verifier) }, sameOrigin)
    assert.equal(issued.status, 200)
    const url = new URL(issued.data.redirect)
    assert.equal(url.origin, pages)
    const exchange = { code: url.searchParams.get('wg_code'), verifier, state }
    assert.equal((await a.run('bridge-exchange', { ...exchange, verifier: opaque() }, pagesHeaders)).status, 401)
    const calls = await Promise.all([a.run('bridge-exchange', exchange, pagesHeaders), a.run('bridge-exchange', exchange, pagesHeaders)])
    assert.deepEqual(calls.map(({ status }) => status).sort(), [200, 401])
    const grant = calls.find(({ status }) => status === 200)
    assert.deepEqual(grant.data.user, { id, username: a.user })
    const bearer = { ...pagesHeaders, authorization: 'Bearer ' + grant.data.accessToken }
    assert.equal((await a.apiRead('cloud-sim', bearer)).status, 403)
    assert.equal((await a.apiRead('esp32', bearer)).status, 403)
    await a.store.set('acl', a.config.provider + '|' + id, JSON.stringify({ sim: true }), 60)
    assert.equal((await a.auth(bearer)).canSim, false)
    await a.store.set('acl', a.config.provider + '|username|' + id, JSON.stringify({ sim: true }), 60)
    assert.equal((await a.auth(bearer)).canSim, true)
    assert.equal((await a.apiRead('esp32', bearer)).status, 403)
    await a.store.delete('acl', a.config.provider + '|username|' + id)
    assert.equal((await a.apiRead('cloud-sim', bearer)).status, 403)
    a.advance(120000)
    const renewed = await a.run('session', {}, sameOrigin)
    assert.equal(renewed.status, 200)
    assert.deepEqual(renewed.data.user, login.data.user)
    assert.equal(renewed.data.expiresAt, login.data.expiresAt)
    assert.ok(renewed.data.renewAt > login.data.renewAt)
    assert.equal((await a.run('bridge-logout', {}, bearer)).status, 200)
    assert.equal((await a.apiRead('cloud-sim', bearer)).status, 401)
    assert.equal((await a.run('session', {}, sameOrigin)).status, 401)
  } finally {
    if (id) {
      await a.store.delete('acl', a.config.provider + '|' + id)
      await a.store.delete('acl', a.config.provider + '|username|' + id)
    }
    if (redisSession) await a.store.delete('session', redisSession)
    await a.db.close()
  }
})

test('username throttling, opt-in, and changed credential version fail closed' + name, async () => {
  const a = await fixture()
  let sid
  try {
    const noSignup = makeAuth({ ...env, AUTH_ENABLE_USERNAME_REGISTRATION: '0' })
    assert.equal((await noSignup('register-username', 'POST', localHeaders, a.credentials)).status, 503)
    assert.equal((await a.run('register-username', a.credentials)).status, 201)
    for (let i = 0; i < 3; i++) {
      const response = await a.run('register-username', a.credentials)
      assert.equal(response.status, i === 2 ? 429 : 409)
    }
    const login = await a.run('login-username', a.credentials)
    const cookie = cookieValue(login)
    sid = cookie.split('=')[1]
    for (let i = 0; i < 10; i++) {
      const response = await a.run('login-username', { ...a.credentials, password: 'wrong-password-fixture' })
      assert.equal(response.status, i === 9 ? 429 : 401)
    }
    await a.db.exec('reset role')
    await a.db.query('update waterguard_private.accounts set credential_version = 2 where id = $1', [login.data.user.id])
    await a.db.exec('set role waterguard_accounts')
    assert.equal((await a.run('session', {}, { ...localHeaders, cookie })).status, 401)
    assert.equal((await a.auth({ ...localHeaders, cookie })).status, 401)
  } finally {
    if (sid) await a.store.delete('session', sid)
    await a.db.close()
  }
})
