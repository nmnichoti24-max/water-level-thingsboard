import { useEffect, useRef, useState } from 'react'
import { authRequest } from '../lib/authClient'
import { PAGES_BUILD, setPagesToken } from '../lib/apiTarget'
import { finishPagesLogin, pagesResume, startPagesLogin } from '../lib/pagesLogin'

function checkedSession(payload) {
  if (!payload.user?.id || !(payload.user.username || payload.user.email) || !Number.isFinite(payload.renewAt)) {
    throw new Error('ไม่สามารถยืนยันเซสชันได้')
  }
  return payload
}

export function useSession(enabled = true) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const renewal = useRef(null)

  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    const task = new AbortController()
    setLoading(true)
    async function restore() {
      if (!PAGES_BUILD) return authRequest('session', {}, task.signal)
      if (new URLSearchParams(location.hash.split('?')[1]).get('confirmed') === '1') pagesResume(false)
      const payload = await finishPagesLogin(task.signal)
      if (payload || !pagesResume()) return payload
      await startPagesLogin()
      return null
    }
    restore().then((payload) => {
      if (task.signal.aborted || !payload) return
      const { accessToken, ...profile } = checkedSession(payload)
      if (PAGES_BUILD) {
        if (typeof accessToken !== 'string' || !accessToken) throw new Error('ไม่สามารถยืนยันสิทธิ์เรียก API ได้')
        setPagesToken(accessToken)
        pagesResume(true)
      }
      setSession(profile)
    }).catch((error) => {
      if (!task.signal.aborted && PAGES_BUILD) pagesResume(false)
      if (!task.signal.aborted && error.status !== 401) setMessage(error.message)
    }).finally(() => { if (!task.signal.aborted) setLoading(false) })
    return () => task.abort()
  }, [enabled])

  function expire() {
    renewal.current?.abort()
    setPagesToken('')
    if (PAGES_BUILD) pagesResume(false)
    setSession(null)
    setMessage('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง')
  }

  useEffect(() => {
    if (!enabled || !session) return
    const task = new AbortController()
    renewal.current = task
    const timer = setTimeout(() => {
      if (PAGES_BUILD) {
        startPagesLogin().catch(() => { if (!task.signal.aborted) expire() })
        return
      }
      authRequest('session', {}, task.signal).then((next) => {
        if (!task.signal.aborted) setSession(checkedSession(next))
      }).catch((error) => {
        if (!task.signal.aborted) {
          if (error.status === 401) expire()
          else { setSession(null); setMessage(error.message) }
        }
      })
    }, Math.max(1000, session.renewAt - Date.now() - 12000))
    window.addEventListener('waterguard:session-expired', expire)
    return () => {
      task.abort()
      if (renewal.current === task) renewal.current = null
      clearTimeout(timer)
      window.removeEventListener('waterguard:session-expired', expire)
    }
  }, [session, enabled])

  async function login(input) {
    const verified = checkedSession(await authRequest(input.username === undefined ? 'login' : 'login-username', input))
    setMessage('')
    setSession(verified)
  }

  async function logout() {
    renewal.current?.abort()
    try {
      await authRequest(PAGES_BUILD ? 'bridge-logout' : 'logout')
      setMessage('')
    } catch (error) {
      if (error.code !== 'AUTH_LOGOUT_LOCAL' && !(PAGES_BUILD && error.status === 401)) {
        setSession((current) => current ? { ...current } : current)
        throw error
      }
      setMessage(error.message)
    }
    setPagesToken('')
    if (PAGES_BUILD) pagesResume(false)
    setSession(null)
  }

  return { session, loading, message, login, logout }
}
