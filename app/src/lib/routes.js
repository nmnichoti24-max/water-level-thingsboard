import { apiUrl } from './apiTarget.js'

export const MONITOR_ROUTES = ['dashboard', 'history', 'alerts', 'settings', 'battery']
export const routeHash = (route) => '#/' + route

export function routeFromHash(hash) {
  const name = hash.replace(/^#\/?/, '').split('?')[0]
  return [...MONITOR_ROUTES, 'login', 'connect', 'register', 'confirm-email'].includes(name) ? name : ''
}

export function confirmationPage(external) {
  if (external) {
    try { return apiUrl('/') + routeHash('confirm-email') } catch { /* The local screen explains the missing API. */ }
  }
  return routeHash('confirm-email')
}
