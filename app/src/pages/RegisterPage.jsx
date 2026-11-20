import { useEffect, useState } from 'react'
import { Eye, EyeOff, UserRoundPlus } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import { PAGES_BUILD } from '../lib/apiTarget'
import { authMessage, authRequest, registrationReady } from '../lib/authClient'
import { isPagesCallback } from '../lib/pagesLogin'
import { usernameRegistrationError } from '../lib/username'
import { confirmationPage, routeHash } from '../lib/routes'

export default function RegisterPage({ verify }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [code, setCode] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [ready, setReady] = useState(null)
  const verifyLink = confirmationPage(PAGES_BUILD)

  useEffect(() => {
    const task = new AbortController()
    registrationReady(task.signal, !verify).then((value) => {
      if (!task.signal.aborted) setReady(value)
    }).catch(() => {
      if (!task.signal.aborted) setReady(false)
    })
    return () => task.abort()
  }, [verify])

  async function submit(event) {
    event.preventDefault()
    if (!ready) return
    setError('')
    if (!verify) {
      const invalid = usernameRegistrationError(identifier, password, confirmation)
      if (invalid) { setError(authMessage(invalid)); return }
    }
    setBusy(true)
    try {
      if (verify) {
        const result = await authRequest('verify-email', { email: identifier, code })
        const target = new URL(result.redirect)
        if (!result.confirmed || !isPagesCallback(target) || target.search || target.hash !== '#/login?confirmed=1') {
          throw new Error('ปลายทางหลังยืนยันอีเมลไม่ถูกต้อง')
        }
        location.replace(target.href)
      } else {
        const result = await authRequest('register-username', { username: identifier, password, confirmation })
        if (result.created !== true) throw new Error('ระบบสมัครสมาชิกตอบกลับไม่สมบูรณ์')
        setPassword('')
        setConfirmation('')
        setShow(false)
        setSubmitted(true)
      }
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  const title = verify ? 'ยืนยันอีเมล WaterGuard Pro' : 'สร้างบัญชี WaterGuard Pro'
  const description = verify ? 'กรอกอีเมลและรหัสยืนยันของบัญชีอีเมลเดิม' : 'สร้าง Username เพื่อเข้าสู่ระบบ WaterGuard Pro'
  return <AuthLayout title={title} description={description}>
    {ready === null && <p role="status" className="notice">กำลังตรวจความพร้อมของระบบบัญชี…</p>}
    {ready === false && !error && <p role="status" className="notice">{authMessage(verify ? 'AUTH_REGISTRATION_DISABLED' : 'AUTH_USERNAME_UNAVAILABLE')}</p>}
    {submitted ? <p role="status" className="notice success">สร้างบัญชีแล้ว เข้าสู่ระบบด้วย Username และรหัสผ่านของคุณได้เลย</p>
      : verify && PAGES_BUILD ? (verifyLink.startsWith('#') ? <p role="alert" className="notice error">ยังไม่ได้ตั้งค่า API สำหรับ GitHub Pages</p>
        : <a className="auth-link" href={verifyLink}>เปิดหน้ายืนยันอีเมล WaterGuard Pro</a>)
      : <form onSubmit={submit} aria-busy={busy} noValidate={!verify}>
        {error && <p role="alert" className="notice error">{error}</p>}
        <label className="auth-field">
          <span>{verify ? 'อีเมล' : 'Username'}</span>
          <input type={verify ? 'email' : 'text'} autoComplete={verify ? 'email' : 'username'}
            autoCapitalize="none" spellCheck={false} required maxLength={verify ? 254 : 32} value={identifier} disabled={busy}
            onChange={(event) => setIdentifier(event.target.value)} />
        </label>
        {verify ? <label className="auth-field">
          <span>รหัสยืนยันอีเมล</span>
          <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" required maxLength={10}
            value={code} disabled={busy} onChange={(event) => setCode(event.target.value)} />
        </label> : <>
          <div className="auth-field">
            <label htmlFor="register-password">รหัสผ่าน</label>
            <div className="password-wrap">
              <input id="register-password" type={show ? 'text' : 'password'} autoComplete="new-password"
                required maxLength={256} value={password} disabled={busy} aria-describedby="password-policy"
                onChange={(event) => setPassword(event.target.value)} />
              <button type="button" aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                aria-controls="register-password register-confirmation" onClick={() => setShow(!show)}>
                {show ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
              </button>
            </div>
            <small id="password-policy">อย่างน้อย 12 ตัวอักษร สูงสุด 256 ไบต์</small>
          </div>
          <label className="auth-field">
            <span>ยืนยันรหัสผ่าน</span>
            <input id="register-confirmation" type={show ? 'text' : 'password'} autoComplete="new-password"
              required maxLength={256} value={confirmation} disabled={busy}
              onChange={(event) => setConfirmation(event.target.value)} />
          </label>
        </>}
        <button className="primary auth-submit" disabled={busy || ready !== true} type="submit">
          <UserRoundPlus size={16} aria-hidden="true" /> {busy ? 'กำลังดำเนินการ…' : verify ? 'ยืนยันอีเมล' : 'สมัครสมาชิก'}
        </button>
      </form>}
    <div className="auth-options auth-registration-links">
      <a className="auth-link" href={routeHash('login')}>มีบัญชีอยู่แล้ว? เข้าสู่ระบบ</a>
    </div>
    <a className="button-outline auth-demo auth-demo-link" href={routeHash('dashboard', true)}>เปิด DEMO ในเบราว์เซอร์</a>
  </AuthLayout>
}
