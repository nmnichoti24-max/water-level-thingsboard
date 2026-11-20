import { apiUrl } from './apiTarget'
import { authRequest } from './authClient'
import { MONITOR_ROUTES, routeFromHash, routeHash } from './routes'

const PENDING = 'wg:authorization-request'
const RESUME = 'wg:signed-in-tab'
const CALLBACK = 'https://nmnichoti24-max.github.io/water-level-thingsboard/'
const brokerIntent = (intent) => ['recover', 'legacy'].includes(intent) ? intent : 'login'
const NONCE = /^[A-Za-z0-9_-]{43}$/
const encoded = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const random = () => encoded(crypto.getRandomValues(new Uint8Array(32)))

export function pagesResume(enabled) {
  try {
    if (enabled === undefined) return sessionStorage.getItem(RESUME) === '1'
    if (enabled) sessionStorage.setItem(RESUME, '1')
    else sessionStorage.removeItem(RESUME)
  } catch { return false }
}

export async function startPagesLogin(intent = 'login', path = location.hash) {
  const state = random()
  const verifier = random()
  const challenge = encoded(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  const route = routeFromHash(path)
  const params = new URLSearchParams({ state, challenge, intent: brokerIntent(intent) })
  const url = apiUrl('/') + routeHash('connect') + '?' + params
  sessionStorage.setItem(PENDING, JSON.stringify({
    state, verifier, at: Date.now(), next: routeHash(MONITOR_ROUTES.includes(route) ? route : 'dashboard'),
  }))
  location.assign(url)
}

export async function finishPagesLogin(signal) {
  const url = new URL(location.href)
  if (!url.searchParams.has('wg_code') && !url.searchParams.has('state')) return null
  const code = url.searchParams.get('wg_code')
  const state = url.searchParams.get('state')
  url.searchParams.delete('wg_code')
  url.searchParams.delete('state')
  history.replaceState(null, '', url)
  const pending = JSON.parse(sessionStorage.getItem(PENDING))
  sessionStorage.removeItem(PENDING)
  if (!pending || !NONCE.test(code ?? '') || state !== pending.state ||
      !NONCE.test(pending.verifier ?? '') || Date.now() - pending.at > 600000) {
    throw new Error('คำขอเข้าสู่ระบบไม่ตรงกันหรือหมดอายุ กรุณาเริ่มใหม่')
  }
  const payload = await authRequest('bridge-exchange', { code, state, verifier: pending.verifier }, signal)
  const next = routeFromHash(pending.next)
  history.replaceState(null, '', routeHash(MONITOR_ROUTES.includes(next) ? next : 'dashboard'))
  return payload
}

export function bridgeRequest() {
  if (routeFromHash(location.hash) !== 'connect') return null
  const params = new URLSearchParams(location.hash.split('?')[1])
  const state = params.get('state')
  const challenge = params.get('challenge')
  return NONCE.test(state ?? '') && NONCE.test(challenge ?? '')
    ? { state, challenge, intent: brokerIntent(params.get('intent')) } : null
}

export function isPagesCallback(target) {
  const base = target.origin + target.pathname
  const local = location.hostname === '127.0.0.1' && /^http:\/\/127\.0\.0\.1:\d+\/water-level-thingsboard\/$/.test(base)
  return !target.username && !target.password && (base === CALLBACK || local)
}

export async function completeBridge({ state, challenge }, signal) {
  const result = await authRequest('bridge-issue', { state, challenge }, signal)
  const target = new URL(result.redirect)
  if (!isPagesCallback(target) ||
      target.searchParams.get('state') !== state || !NONCE.test(target.searchParams.get('wg_code') ?? '') ||
      target.hash !== routeHash('login')) throw new Error('ปลายทางกลับไป GitHub Pages ไม่ถูกต้อง')
  location.replace(target.href)
}
