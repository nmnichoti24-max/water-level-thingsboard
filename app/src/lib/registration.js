export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const passwordMin = 12
export const isNewPassword = (value) => typeof value === 'string' &&
  [...value].length >= passwordMin && new TextEncoder().encode(value).length <= 72

export function registrationError(email, password, confirmation) {
  if (typeof email !== 'string' || email.length > 254 || !EMAIL.test(email.trim())) return 'AUTH_REGISTER_EMAIL'
  if (!isNewPassword(password)) return 'AUTH_REGISTER_PASSWORD'
  if (password !== confirmation) return 'AUTH_REGISTER_MISMATCH'
  return null
}
