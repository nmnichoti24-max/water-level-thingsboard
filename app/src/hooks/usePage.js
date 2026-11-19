import { useEffect, useSyncExternalStore } from 'react'
import { NAV } from '../components/Navigation'

function subscribe(listener) {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

function currentPage() {
  const hash = window.location.hash.slice(1)
  return NAV.some(([key]) => key === hash) ? hash : 'dashboard'
}

export function usePage() {
  const page = useSyncExternalStore(subscribe, currentPage)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page])
  return page
}
