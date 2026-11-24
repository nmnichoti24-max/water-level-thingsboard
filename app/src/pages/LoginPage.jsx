import { useEffect, useState } from 'react'
import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import { confirmationPage, routeHash } from '../lib/routes'
import { authRequest, loginAvailability } from '../lib/authClient'
import { loginIdentity } from '../lib/username'

export default function LoginPage({ loading, message, onLogin, onExternal, confirmed, startScreen = 'login', initialLegacy = false }) {
  const [availability, setAvailability] = useState(null)
  const checkBroker = Boolean(onExternal)

  useEffect(() => {
    if (!checkBroker) return
    const task = new AbortController()
    loginAvailability(task.signal).then((status) => {
      if (!task.signal.aborted) setAvailability(status)
    }).catch(() => {
      if (!task.signal.aborted) setAvailability({ username: false, legacy: false })
    })
    return () => task.abort()
  }, [checkBroker])

  const [screen, setScreen] = useState(startScreen)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [legacy, setLegacy] = useState(initialLegacy)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [remember, setRemember] = useState(false)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const login = screen === 'login'
  const reset = screen === 'reset'
  const usernameLogin = login && !legacy

  function changeScreen(next) {
    setScreen(next)
    setPassword('')
    setCode('')
    setShow(false)
    setError('')
    setFeedback('')
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      if (login) await onLogin({ ...(usernameLogin ? loginIdentity(username) : { email }), password, remember })
      else if (!reset) {
        await authRequest('forgot', { email })
        changeScreen('reset')
        setFeedback('หากบัญชีมีสิทธิ์และตั้งค่าการส่งอีเมลแล้ว ใช้รหัสจากอีเมลที่ได้รับ')
      } else {
        const result = await authRequest('reset', { email, code, password })
        changeScreen('login')
        setFeedback(result.otherSessionsRevoked
          ? 'เปลี่ยนรหัสผ่านแล้ว เข้าสู่ระบบด้วยรหัสผ่านใหม่'
          : 'เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่ ระบบยังยืนยันการยกเลิกเซสชันอื่นไม่ได้')
      }
    } catch (failure) {
      setError(failure.message)
    } finally { setBusy(false) }
  }

  async function openExternal(intent) {
    setError('')
    setBusy(true)
    try { await onExternal(intent) }
    catch (failure) { setError(failure.message); setBusy(false) }
  }

  const title = login ? 'เข้าสู่ระบบ' : reset ? 'ตั้งรหัสผ่านใหม่' : 'กู้บัญชี'
  const description = login ? 'เข้าสู่ระบบด้วยบัญชี WaterGuard Pro' : reset
    ? 'กรอกรหัสยืนยันจากอีเมลและรหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร'
    : 'กรอกอีเมลของบัญชีเพื่อขอรหัสยืนยัน'

  return <AuthLayout title={title} description={description}>
        {loading ? <p role="status" className="notice">กำลังตรวจสอบเซสชัน…</p> : <>
          {login && message && !error && <p role="status" className="notice">{message}</p>}
          {login && confirmed && <p role="status" className="notice success">เข้าสู่ระบบด้วยบัญชีที่ยืนยันอีเมลแล้ว</p>}
          {error && <p role="alert" className="notice error">{error}</p>}
          {feedback && <p role="status" className="notice success">{feedback}</p>}
          {onExternal ? <>
            {!availability && <p role="status" className="notice">กำลังตรวจระบบบัญชี…</p>}
            {availability && !availability.username && !availability.legacy && <p role="status" className="notice">ระบบเข้าสู่ระบบยังไม่พร้อม</p>}
            <button type="button" className="primary auth-submit" disabled={busy || !availability?.username} onClick={() => openExternal('login')}>
              <LockKeyhole size={16} aria-hidden="true" /> {busy ? 'กำลังเปิดหน้าล็อกอิน…' : 'เข้าสู่ระบบด้วย Username'}
            </button>
            <div className="auth-options"><button type="button" className="auth-link" disabled={busy || !availability?.legacy} onClick={() => openExternal('legacy')}>เข้าสู่ระบบด้วยบัญชีอีเมลเดิม</button></div>
          </> : <form onSubmit={submit} aria-busy={busy}>
            {usernameLogin
              ? <label className="auth-field"><span>Username หรืออีเมลบัญชีเดิม</span><input type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} required /></label>
              : <label className="auth-field"><span>อีเมล</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} required /></label>}
            {reset && <label className="auth-field"><span>รหัสยืนยัน</span><input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}" maxLength={10} required /></label>}
            {(login || reset) && <div className="auth-field">
              <label htmlFor="auth-password">{reset ? 'รหัสผ่านใหม่' : 'รหัสผ่าน'}</label>
              <div className="password-wrap">
                <input id="auth-password" type={show ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={reset ? 'new-password' : 'current-password'} minLength={reset ? 12 : 1} maxLength={256} required />
                <button type="button" aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} onClick={() => setShow(!show)}>
                  {show ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                </button>
              </div>
            </div>}
            {login && <div className="auth-options">
              <label><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> จดจำเซสชัน</label>
              {legacy && <button type="button" className="auth-link" disabled={busy} onClick={() => changeScreen('forgot')}>ลืมรหัสผ่าน?</button>}
            </div>}
            <button type="submit" className="primary auth-submit" disabled={busy}>
              <LockKeyhole size={16} aria-hidden="true" /> {busy ? 'กำลังดำเนินการ…' : login ? 'เข้าสู่ระบบ' : reset ? 'บันทึกรหัสผ่านใหม่' : 'ขอรหัสยืนยัน'}
            </button>
          </form>}
          {!login && <div className="auth-options">
            <button type="button" className="auth-link" disabled={busy} onClick={() => changeScreen('login')}>กลับไปเข้าสู่ระบบ</button>
            <button type="button" className="auth-link" disabled={busy} onClick={() => changeScreen(reset ? 'forgot' : 'reset')}>{reset ? 'ขอรหัสใหม่' : 'มีรหัสยืนยันแล้ว'}</button>
          </div>}
          {login && <div className="auth-options auth-registration-links">
            <a className="auth-link" href={routeHash('register')}>สร้างบัญชี WaterGuard Pro</a>
            {!onExternal && <button type="button" className="auth-link" disabled={busy} onClick={() => { setLegacy(!legacy); changeScreen('login') }}>
              {legacy ? 'เข้าสู่ระบบด้วย Username' : 'เข้าสู่ระบบด้วยบัญชีอีเมลเดิม'}
            </button>}
            {legacy && !onExternal && <a className="auth-link" href={confirmationPage(false)}>ยืนยันอีเมลบัญชีเดิม</a>}
          </div>}
        </>}
  </AuthLayout>
}
