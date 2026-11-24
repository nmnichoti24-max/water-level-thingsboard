import { registerAccount, registrationStatus, verifyAccount } from './registration.js'
import { EMAIL, isNewPassword } from '../src/lib/registration.js'
import { usernameAccounts, usernameDatabaseConfig } from './accounts.js'
import { usernameAuth } from './usernameAuth.js'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { bridgeConfig, bridgeStore, OPAQUE, opaque, pagesCors, sha256 } from './bridgeStore.js'

const HOUR = 3_600_000
const USER_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const GENERIC_RECOVERY = { accepted: true }
const response = (status, data, cookie) => ({ status, data, cookie })
const failure = (status, error, cookie) => response(status, { error }, cookie)

export function authConfig(env) {
  const origin = env.APP_ORIGIN ?? ''
  const loopback = /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) && !env.VERCEL
  let canonical
  try { canonical = new URL(origin).origin } catch { return null }
  if (canonical !== origin || (!loopback && !origin.startsWith('https://'))) return null
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.AUTH_SUPABASE_URL ?? '')) return null
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.AUTH_SUPABASE_PUBLISHABLE_KEY ?? '')) return null
  if (!/^[A-Za-z0-9_-]{43}$/.test(env.AUTH_SESSION_KEY ?? '')) return null
  const key = Buffer.from(env.AUTH_SESSION_KEY, 'base64url')
  if (key.length !== 32) return null
  const bridge = bridgeConfig(env)
  if (bridge === null || (env.VERCEL && !bridge) || bridge?.origin === origin) return null
  return {
    origin, key, registrationEnabled: env.AUTH_ENABLE_REGISTRATION === '1',
    usernameRegistration: env.AUTH_ENABLE_USERNAME_REGISTRATION === '1',
    usernameDb: usernameDatabaseConfig(env),
    // Access for signed-in accounts without an explicit Redis ACL. An explicit ACL always wins, so owners can still revoke.
    defaultAcl: {
      sim: env.AUTH_DEFAULT_SIM === '1',
      liveDevices: env.AUTH_DEFAULT_LIVE === '1' && USER_ID.test(env.TB_REAL_DEVICE_ID ?? '') ? [env.TB_REAL_DEVICE_ID] : [],
    },
    provider: env.AUTH_SUPABASE_URL + '/auth/v1',
    publishable: env.AUTH_SUPABASE_PUBLISHABLE_KEY,
    secure: !loopback, name: loopback ? 'wg_local' : '__Host-wg_session', bridge,
  }
}

function cookie(config, value, maxAge) {
  return [
    config.name + '=' + value, 'Path=/', 'HttpOnly', 'SameSite=Strict',
    config.secure ? 'Secure' : '', maxAge === undefined ? '' : 'Max-Age=' + maxAge,
  ].filter(Boolean).join('; ')
}

function seal(config, session) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', config.key, iv)
  cipher.setAAD(Buffer.from(config.origin + ' ' + config.provider))
  const content = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), content]).toString('base64url')
}

function unseal(config, value) {
  if (typeof value !== 'string' || !value || value.length > 3900) return null
  try {
    const raw = Buffer.from(value, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', config.key, raw.subarray(0, 12))
    decipher.setAAD(Buffer.from(config.origin + ' ' + config.provider))
    decipher.setAuthTag(raw.subarray(12, 28))
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString())
  } catch { return null }
}

function cookieValue(config, header) {
  return (header ?? '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(config.name + '='))?.slice(config.name.length + 1)
}

async function cookieSession(config, headers, store) {
  const value = cookieValue(config, headers.cookie)
  if (!store) return { session: unseal(config, value) }
  if (!OPAQUE.test(value ?? '')) return { session: null }
  return { id: value, session: unseal(config, await store.get('session', value)) }
}

function publicUser(session) {
  return session.kind === 'username' ? { id: session.id, username: session.username } : { id: session.id, email: session.email }
}

async function sessionResult(config, session, now, store, existing) {
  let value = seal(config, session)
  if (store) {
    const id = existing ?? opaque()
    const saved = await store.set('session', id, value, (session.until - now) / 1000, existing ? 'XX' : 'NX')
    if (saved !== 'OK') return failure(401, 'AUTH_EXPIRED', cookie(config, '', 0))
    value = id
  }
  if (value.length > 3750) return failure(502, 'AUTH_PROVIDER_RESPONSE')
  const maxAge = session.remember ? Math.floor((session.until - now) / 1000) : undefined
  return response(200, {
    user: publicUser(session),
    expiresAt: session.until, renewAt: session.accessUntil,
  }, cookie(config, value, maxAge))
}

function activeSession(session, now) {
  return session && USER_ID.test(session.id) && session.until > now && session.accessUntil > now
}

async function telemetryPermissions(store, userId, providerScope, defaultAcl = {}) {
  const raw = store && await store.get('acl', providerScope + '|' + userId.toLowerCase())
  const acl = raw ? JSON.parse(raw) : defaultAcl
  return {
    status: 200, canSim: acl?.sim === true,
    liveDevices: new Set(Array.isArray(acl?.liveDevices) ? acl.liveDevices.filter((id) => typeof id === 'string' && USER_ID.test(id)).map((id) => id.toLowerCase()) : []),
  }
}

function pagesToken(config, header, now) {
  const match = typeof header === 'string' && header.match(/^Bearer ([A-Za-z0-9_-]+)$/)
  const grant = match && unseal(config, match[1])
  return grant?.kind === 'pages' && OPAQUE.test(grant.id) && grant.until > now ? grant : null
}

function makeSession(body, now, remembered, until) {
  const email = typeof body?.user?.email === 'string' ? body.user.email.toLowerCase() : ''
  if (!USER_ID.test(body?.user?.id ?? '') || !body.user.email_confirmed_at || !EMAIL.test(email) ||
      typeof body.access_token !== 'string' || !body.access_token ||
      typeof body.refresh_token !== 'string' || !body.refresh_token ||
      !Number.isFinite(body.expires_in) || body.expires_in < 1) return null
  return {
    id: body.user.id, email, access: body.access_token, refresh: body.refresh_token, remember: remembered, until,
    accessUntil: Math.min(until, now + Math.min(body.expires_in, 900) * 1000),
  }
}

function provider(config, fetcher) {
  return async (path, method, payload, access) => {
    try {
      const res = await fetcher(config.provider + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: {
          apikey: config.publishable, Accept: 'application/json', 'Content-Type': 'application/json',
          ...(access ? { Authorization: 'Bearer ' + access } : {}),
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      })
      return { status: res.status, ok: res.ok, data: await res.json().catch(() => null) }
    } catch { return { status: 503, ok: false, data: null } }
  }
}

function upstreamError(result, defaultCode) {
  if (result.status === 429) return failure(429, 'AUTH_RATE_LIMIT')
  if (result.status >= 500) return failure(503, 'AUTH_UNAVAILABLE')
  return failure(400, defaultCode)
}

export async function authorizeTelemetry(env, headers, now = Date.now(), fetcher = fetch) {
  const config = authConfig(env)
  if (!config) return failure(503, 'AUTH_NOT_CONFIGURED')
  const store = config.bridge && bridgeStore(config.bridge, fetcher)
  try {
    let session
    if (store && headers.origin === config.bridge.origin) {
      const grant = pagesToken(config, headers.authorization, now)
      if (!grant) return failure(401, 'AUTH_REQUIRED')
      session = unseal(config, await store.get('session', grant.id))
    } else {
      if (headers['sec-fetch-site'] === 'cross-site' || (headers.origin && headers.origin !== config.origin)) {
        return failure(403, 'AUTH_ORIGIN')
      }
      session = (await cookieSession(config, headers, store)).session
    }
    if (session?.kind === 'username' && (!store || !config.usernameDb)) return failure(401, 'AUTH_REQUIRED')
    const scope = session?.kind === 'username' ? config.provider + '|username' : config.provider
    return activeSession(session, now)
      ? await telemetryPermissions(store, session.id, scope, config.defaultAcl)
      : failure(401, 'AUTH_REQUIRED')
  } catch { return failure(503, 'AUTH_UNAVAILABLE') }
}

async function pagesExchange(config, store, body, now) {
  const { code, verifier, state } = body
  if (![code, verifier, state].every((value) => typeof value === 'string' && OPAQUE.test(value))) return failure(400, 'AUTH_INPUT')
  const raw = await store.get('code', code)
  const record = raw && JSON.parse(raw)
  if (!record || record.state !== state || record.challenge !== sha256(verifier) ||
      record.callback !== config.bridge.callback || record.until <= now || !OPAQUE.test(record.id)) {
    return failure(401, 'AUTH_BRIDGE')
  }
  if (await store.consume(code, raw) !== 1) return failure(401, 'AUTH_BRIDGE')
  const session = unseal(config, await store.get('session', record.id))
  if (!activeSession(session, now) || (session.kind === 'username' && !config.usernameDb)) return failure(401, 'AUTH_EXPIRED')
  const until = Math.min(session.accessUntil, now + 300_000)
  return response(200, {
    user: publicUser(session),
    expiresAt: session.until, renewAt: until,
    accessToken: seal(config, { kind: 'pages', id: record.id, until }),
  })
}

export function makeAuth(env, fetcher = fetch, clock = Date.now, openAccounts = usernameAccounts) {
  return async (operation, method, headers, body = {}) => {
    if (method !== 'POST') return failure(405, 'METHOD_NOT_ALLOWED')
    const config = authConfig(env)
    if (!config) return failure(503, 'AUTH_NOT_CONFIGURED')
    const bridgeOnly = operation === 'bridge-exchange' || operation === 'bridge-logout'
    const fromPages = Boolean(config.bridge && headers.origin === config.bridge.origin)
    const sameOrigin = headers.origin === config.origin && headers['sec-fetch-site'] !== 'cross-site'
    if (!/^application\/json(?:;|$)/i.test(headers['content-type'] ?? '') ||
        !(bridgeOnly ? fromPages : sameOrigin || (['register', 'register-username'].includes(operation) && fromPages))) return failure(403, 'AUTH_ORIGIN')

    const now = clock()
    const call = provider(config, fetcher)
    const store = config.bridge && bridgeStore(config.bridge, fetcher)
    const clear = cookie(config, '', 0)
    if (operation === 'register-username' || operation === 'login-username') {
      const accounts = config.usernameDb && store ? openAccounts(config.usernameDb) : null
      const result = await usernameAuth(config, store, accounts, headers, operation, body)
      if (!result.account) return result
      const remember = body.remember === true
      const until = now + HOUR * (remember ? 24 * 7 : 12)
      return sessionResult(config, {
        kind: 'username', ...result.account, remember, until, accessUntil: now + 15 * 60_000,
      }, now, store)
    }
    if (operation === 'register') return registerAccount(config, store, call, headers, body)
    if (operation === 'verify-email') return verifyAccount(config, store, call, headers, body)
    if (operation === 'bridge-exchange') return pagesExchange(config, store, body, now)
    if (operation === 'bridge-logout') {
      const grant = pagesToken(config, headers.authorization, now)
      if (!grant) return failure(401, 'AUTH_REQUIRED')
      const current = unseal(config, await store.get('session', grant.id))
      if (!current) return response(200, { signedOut: true })
      await store.delete('session', grant.id)
      if (current.kind === 'username') return response(200, { signedOut: true })
      const revoked = await call('/logout?scope=local', 'POST', undefined, current.access)
      return revoked.ok ? response(200, { signedOut: true }) : failure(503, 'AUTH_LOGOUT_LOCAL')
    }
    if (!['bridge-issue', 'session', 'logout', 'login', 'forgot', 'reset'].includes(operation)) return failure(404, 'AUTH_OPERATION')
    const { session: previous, id: sessionId } = await cookieSession(config, headers, store)
    if (operation === 'bridge-issue') {
      if (!store || !sessionId) return failure(503, 'AUTH_NOT_CONFIGURED')
      if (!activeSession(previous, now) || (previous.kind === 'username' && !config.usernameDb)) return failure(401, 'AUTH_EXPIRED')
      if (![body.state, body.challenge].every((value) => typeof value === 'string' && OPAQUE.test(value))) return failure(400, 'AUTH_INPUT')
      const code = opaque()
      const record = JSON.stringify({
        id: sessionId, state: body.state, challenge: body.challenge, callback: config.bridge.callback, until: now + 60_000,
      })
      if (await store.set('code', code, record, 60) !== 'OK') return failure(503, 'AUTH_UNAVAILABLE')
      const callback = new URL(config.bridge.callback)
      callback.search = new URLSearchParams({ wg_code: code, state: body.state }).toString()
      callback.hash = '/login'
      return response(200, { redirect: callback.href })
    }
    if (operation === 'session' || operation === 'logout') {
      if (operation === 'logout' && store && sessionId) await store.delete('session', sessionId)
      if (!previous || previous.until <= now) {
        return operation === 'logout' ? response(200, { signedOut: true }, clear) : failure(401, 'AUTH_EXPIRED', previous ? clear : undefined)
      }
      if (previous.kind === 'username') {
        if (operation === 'logout') return response(200, { signedOut: true }, clear)
        if (!config.usernameDb || !store || !sessionId) return failure(401, 'AUTH_EXPIRED', clear)
        const account = await openAccounts(config.usernameDb).identity(previous.id)
        if (!account || account.disabled_at || account.credential_version !== previous.credentialVersion) {
          await store.delete('session', sessionId)
          return failure(401, 'AUTH_EXPIRED', clear)
        }
        return sessionResult(config, {
          ...previous, username: account.username, accessUntil: Math.min(previous.until, now + 15 * 60_000),
        }, now, store, sessionId)
      }
      if (operation === 'session' && previous.accessUntil > now + 15_000) {
        return response(200, { user: { id: previous.id, email: previous.email }, expiresAt: previous.until, renewAt: previous.accessUntil })
      }
      let active = previous
      if (previous.accessUntil <= now + 15_000) {
        const result = await call('/token?grant_type=refresh_token', 'POST', { refresh_token: previous.refresh })
        if (!result.ok) {
          if (operation === 'logout') return failure(503, 'AUTH_LOGOUT_LOCAL', clear)
          if (result.status >= 500 || result.status === 429) return upstreamError(result, 'AUTH_EXPIRED')
          return failure(401, 'AUTH_EXPIRED', clear)
        }
        active = makeSession(result.data, now, previous.remember, previous.until)
        if (!active || active.id !== previous.id) {
          return failure(401, 'AUTH_EXPIRED', clear)
        }
      }
      if (operation === 'logout') {
        const revoked = await call('/logout?scope=local', 'POST', undefined, active.access)
        return revoked.ok ? response(200, { signedOut: true }, clear) : failure(503, 'AUTH_LOGOUT_LOCAL', clear)
      }
      return sessionResult(config, active, now, store, sessionId)
    }

    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (email.length > 254 || !EMAIL.test(email)) return failure(400, 'AUTH_INPUT')
    if (operation === 'forgot') {
      const sent = await call('/recover', 'POST', { email })
      if (sent.status >= 500) return upstreamError(sent, 'AUTH_UNAVAILABLE')
      return response(202, GENERIC_RECOVERY)
    }
    const { password } = body
    if (typeof password !== 'string' || password.length > 256 || password.length < 1) {
      return failure(400, 'AUTH_INPUT')
    }
    if (operation === 'reset') {
      if (typeof body.code !== 'string' || !/^\d{6,10}$/.test(body.code)) return failure(400, 'AUTH_INPUT')
      if (!isNewPassword(password)) return failure(400, 'AUTH_PASSWORD_REJECTED')
      const verified = await call('/verify', 'POST', { email, token: body.code, type: 'recovery' })
      if (!verified.ok) return upstreamError(verified, 'AUTH_RECOVERY')
      const recovery = makeSession(verified.data, now, false, now + HOUR)
      if (!recovery || recovery.email !== email) return failure(400, 'AUTH_RECOVERY')
      const changed = await call('/user', 'PUT', { password }, recovery.access)
      const revoked = await call('/logout?scope=' + (changed.ok ? 'global' : 'local'), 'POST', undefined, recovery.access)
      if (!changed.ok) return upstreamError(changed, 'AUTH_PASSWORD_REJECTED')
      if (store && sessionId) await store.delete('session', sessionId)
      return response(200, { passwordUpdated: true, otherSessionsRevoked: revoked.ok }, clear)
    }

    // Supabase verifies credentials and attests to email confirmation.
    const result = await call('/token?grant_type=password', 'POST', { email, password })
    if (!result.ok) {
      if (result.status >= 500 || result.status === 429) return upstreamError(result, 'AUTH_CREDENTIALS')
      return failure(401, result.data?.error_code === 'email_not_confirmed' ? 'AUTH_EMAIL_UNVERIFIED' : 'AUTH_CREDENTIALS')
    }
    const remembered = body.remember === true
    const session = makeSession(result.data, now, remembered, now + HOUR * (remembered ? 24 * 7 : 12))
    if (!session || session.email !== email) {
      if (typeof result.data?.access_token === 'string') await call('/logout?scope=local', 'POST', undefined, result.data.access_token)
      return failure(401, 'AUTH_CREDENTIALS')
    }
    return sessionResult(config, session, now, store)
  }
}

export function sendJson(res, result) {
  res.statusCode = result.status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, no-store')
  if (result.cookie) res.setHeader('Set-Cookie', result.cookie)
  res.end(JSON.stringify(result.data))
}

async function jsonBody(req) {
  const max = 4096
  if (Number(req.headers['content-length']) > max) throw new Error('body')
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body)
    if (Buffer.byteLength(raw) > max) throw new Error('body')
    return JSON.parse(raw)
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > max) throw new Error('body')
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString())
}

function logRegistration(operation, result) {
  if (!['register', 'register-username', 'verify-email'].includes(operation)) return
  // Log only application-generated outcomes. Provider bodies and request data stay out of logs.
  console.info(JSON.stringify({ event: 'auth.registration', operation, status: result.status, error: result.data.error }))
}

export async function respondAuth(req, res, env, openAccounts = usernameAccounts) {
  const operation = new URL(req.url, 'http://localhost').searchParams.get('op')
  const config = authConfig(env)
  if (['registration-status', 'username-registration-status', 'login-status'].includes(operation)) {
    if (pagesCors(config?.bridge, req, res, [operation])) return
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return sendJson(res, failure(405, 'METHOD_NOT_ALLOWED'))
    }
    if (req.headers.origin && req.headers.origin !== config?.origin && req.headers.origin !== config?.bridge?.origin) {
      return sendJson(res, failure(403, 'AUTH_ORIGIN'))
    }
    if (operation === 'login-status') {
      return sendJson(res, response(200, { legacy: Boolean(config?.bridge), username: Boolean(config?.bridge && config.usernameDb) }))
    }
    const ready = operation === 'username-registration-status'
      ? Boolean(config?.usernameDb && config.bridge && config.usernameRegistration)
      : Boolean(config && await registrationStatus(config, provider(config, fetch)))
    return sendJson(res, response(200, { ready }))
  }
  if (pagesCors(config?.bridge, req, res, ['bridge-exchange', 'bridge-logout', 'register', 'register-username'], 'POST')) return
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return sendJson(res, failure(405, 'METHOD_NOT_ALLOWED'))
  }
  let body
  try {
    body = await jsonBody(req)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body')
  } catch { return sendJson(res, failure(400, 'AUTH_INPUT')) }
  try {
    const result = await makeAuth(env, fetch, Date.now, openAccounts)(operation, req.method, { ...req.headers, localAddress: req.socket?.remoteAddress }, body)
    logRegistration(operation, result)
    return sendJson(res, result)
  } catch {
    const result = failure(503, 'AUTH_UNAVAILABLE')
    logRegistration(operation, result)
    return sendJson(res, result)
  }
}
