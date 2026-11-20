import { useEffect, useSyncExternalStore } from 'react'
import { MONITOR_ROUTES, routeFromHash } from '../lib/routes'

function subscribe(listener) {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

const currentHash = () => window.location.hash
export const useHash = () => useSyncExternalStore(subscribe, currentHash)

export function usePage() {
  const route = routeFromHash(useHash())
  const page = MONITOR_ROUTES.includes(route) ? route : 'dashboard'
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page])
  return page
}
