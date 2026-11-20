import { apiAccess, apiUrl } from './apiTarget'

const MESSAGES = {
  AUTH_NOT_CONFIGURED: 'ระบบบัญชียังไม่ได้ตั้งค่า สามารถเปิด DEMO ในเบราว์เซอร์ได้',
  AUTH_USERNAME_INVALID: 'Username ต้องมี 3–32 ตัว ใช้ a–z, 0–9, จุด ขีดกลาง หรือขีดล่าง',
  AUTH_USERNAME_PASSWORD: 'ใช้รหัสผ่านอย่างน้อย 12 ตัวอักษร และไม่เกิน 256 ไบต์',
  AUTH_USERNAME_TAKEN: 'Username นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น',
  AUTH_USERNAME_CREDENTIALS: 'Username หรือรหัสผ่านไม่ถูกต้อง',
  AUTH_USERNAME_UNAVAILABLE: 'ระบบบัญชี Username ยังไม่เปิดใช้งาน',
  AUTH_REGISTER_EMAIL: 'กรุณากรอกอีเมลให้ถูกต้อง',
  AUTH_REGISTER_PASSWORD: 'ใช้รหัสผ่านอย่างน้อย 12 ตัวอักษรและไม่เกิน 72 ไบต์',
  AUTH_REGISTER_MISMATCH: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน',
  AUTH_REGISTRATION_DISABLED: 'ระบบสมัครสมาชิกยังรอการตั้งค่าอีเมลยืนยัน',
  AUTH_EMAIL_UNVERIFIED: 'บัญชีนี้ยังไม่ยืนยันอีเมล กรุณาใช้รหัสจากอีเมลที่ได้รับ',
  AUTH_EMAIL_CODE: 'รหัสยืนยันอีเมลไม่ถูกต้องหรือหมดอายุ',
  AUTH_CREDENTIALS: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  AUTH_EXPIRED: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
  AUTH_INPUT: 'ตรวจสอบอีเมล รหัสผ่าน หรือรหัสยืนยันแล้วลองใหม่',
  AUTH_RATE_LIMIT: 'ส่งคำขอมากเกินไป กรุณารอก่อนลองอีกครั้ง',
  AUTH_UNAVAILABLE: 'ติดต่อระบบบัญชีไม่ได้ กรุณาลองอีกครั้ง',
  AUTH_RECOVERY: 'รหัสกู้บัญชีไม่ถูกต้องหรือหมดอายุ ขอรหัสใหม่แล้วลองอีกครั้ง',
  AUTH_PASSWORD_REJECTED: 'ระบบบัญชีปฏิเสธรหัสผ่านใหม่ ขอรหัสกู้บัญชีใหม่ก่อนลองอีกครั้ง',
  AUTH_LOGOUT_LOCAL: 'ออกจากระบบบนเบราว์เซอร์นี้แล้ว แต่ติดต่อผู้ให้บริการเพื่อยกเลิกเซสชันไม่ได้',
  AUTH_BRIDGE: 'รหัสเข้าสู่ระบบใช้ไม่ได้หรือหมดอายุ กรุณาเริ่มใหม่',
  AUTH_REQUIRED: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
}

export const authMessage = (code) => MESSAGES[code]

async function authStatus(operation, signal) {
  const result = await fetch(apiUrl('/api/auth?op=' + operation), {
    method: 'GET', cache: 'no-store', credentials: 'omit',
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
  })
  if (!result.ok) throw new Error(MESSAGES.AUTH_UNAVAILABLE)
  return result.json()
}

export async function registrationReady(signal, username = false) {
  const status = await authStatus(username ? 'username-registration-status' : 'registration-status', signal)
  return status.ready === true
}

export async function loginAvailability(signal) {
  const status = await authStatus('login-status', signal)
  return { username: status.username === true, legacy: status.legacy === true }
}

export async function authRequest(operation, data = {}, signal) {
  const timeout = AbortSignal.timeout({ reset: 27000, logout: 18000, register: 24000, 'verify-email': 24000, 'register-username': 18000, 'login-username': 18000 }[operation] ?? 12000)
  let response
  try {
    const access = ['register', 'register-username', 'verify-email'].includes(operation) ? { credentials: 'omit', headers: {} } : apiAccess()
    response = await fetch(apiUrl('/api/auth?op=' + operation), {
      method: 'POST', cache: 'no-store',
      credentials: access.credentials,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { ...access.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const body = await response.json()
    if (response.ok && body && typeof body === 'object') return body
    const error = new Error(Object.hasOwn(MESSAGES, body?.error) ? MESSAGES[body.error] : MESSAGES.AUTH_UNAVAILABLE)
    error.code = body?.error
    error.status = response.status
    throw error
  } catch (error) {
    if (signal?.aborted || error.status) throw error
    throw new Error(MESSAGES.AUTH_UNAVAILABLE)
  }
}
