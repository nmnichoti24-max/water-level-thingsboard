import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { EMAIL, registrationError } from '../src/lib/registration.js'
import { opaque, sha256 } from './bridgeStore.js'

const accept = { status: 202, data: { accepted: true } }
const fail = (status, error) => ({ status, data: { error } })
const duplicates = new Set(['user_already_exists', 'email_exists'])

async function permit(config, store, headers, email, operation) {
  if (!config.registrationEnabled || !store) return fail(503, 'AUTH_REGISTRATION_DISABLED')
  const ip = config.secure ? headers['x-vercel-forwarded-for'] : headers.localAddress
  if (typeof ip !== 'string' || !isIP(ip)) return fail(503, 'AUTH_UNAVAILABLE')
  const privateKey = (value) => createHmac('sha256', config.key).update(value).digest('base64url')
  const account = privateKey(email)
  const verify = operation === 'verify-email'
  const allowed = await store.rateLimit(config.origin + '|' + operation, privateKey(ip), account, verify ? 40 : 20, verify ? 8 : 5, 900)
  if (allowed !== 1) return fail(429, 'AUTH_RATE_LIMIT')
  return null
}

export async function registrationStatus(config, call) {
  if (!config.registrationEnabled || !config.bridge) return false
  const settings = await call('/settings', 'GET')
  return settings.ok && settings.data?.disable_signup === false && settings.data?.external?.email === true &&
    settings.data?.mailer_autoconfirm === false
}

export async function registerAccount(config, store, call, headers, { email, password, confirmation }) {
  const invalid = registrationError(email, password, confirmation)
  if (invalid) return fail(400, invalid)
  const normalized = email.trim().toLowerCase()
  const limited = await permit(config, store, headers, normalized, 'register')
  if (limited) return limited

  if (!await registrationStatus(config, call)) return fail(503, 'AUTH_REGISTRATION_DISABLED')

  // Discard the PKCE verifier. Even the provider's default confirmation link can only return a code.
  const redirect = new URL('/', config.origin)
  const result = await call('/signup?' + new URLSearchParams({ redirect_to: redirect.href }), 'POST', {
    email: normalized, password, code_challenge: sha256(opaque()), code_challenge_method: 's256',
  })
  const accountId = result.data?.user?.id ?? result.data?.id
  if (result.ok && typeof accountId === 'string' && accountId && !result.data?.access_token && !result.data?.refresh_token) return accept
  if (duplicates.has(result.data?.error_code)) return accept
  if (result.status === 429 || result.data?.error_code === 'over_email_send_rate_limit') return fail(429, 'AUTH_RATE_LIMIT')
  if (result.data?.error_code === 'weak_password') return fail(400, 'AUTH_REGISTER_PASSWORD')
  if (result.data?.error_code === 'signup_disabled') return fail(503, 'AUTH_REGISTRATION_DISABLED')
  return fail(503, 'AUTH_UNAVAILABLE')
}

export async function verifyAccount(config, store, call, headers, { email, code }) {
  if (typeof email !== 'string' || email.length > 254 || !EMAIL.test(email.trim()) ||
      typeof code !== 'string' || !/^\d{6,10}$/.test(code)) return fail(400, 'AUTH_INPUT')
  const normalized = email.trim().toLowerCase()
  const limited = await permit(config, store, headers, normalized, 'verify-email')
  if (limited) return limited
  const result = await call('/verify', 'POST', { email: normalized, token: code, type: 'email' })
  if (result.status >= 500) return fail(503, 'AUTH_UNAVAILABLE')
  if (result.status === 429) return fail(429, 'AUTH_RATE_LIMIT')
  const access = result.data?.access_token
  if (!result.ok || typeof access !== 'string' || !access) return fail(400, 'AUTH_EMAIL_CODE')
  await call('/logout?scope=local', 'POST', undefined, access)
  const user = result.data?.user
  if (typeof user?.email !== 'string' || user.email.toLowerCase() !== normalized || !user.email_confirmed_at) return fail(400, 'AUTH_EMAIL_CODE')
  const target = new URL(config.bridge.callback)
  target.hash = '/login?confirmed=1'
  return { status: 200, data: { confirmed: true, redirect: target.href } }
}
