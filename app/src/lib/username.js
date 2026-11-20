export function normalizeUsername(value) {
  if (typeof value !== 'string') return null
  const name = value.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9_.-]{2,31}$/.test(name) ? name : null
}

export function usernamePasswordValid(value) {
  return typeof value === 'string' && [...value].length >= 12 && new TextEncoder().encode(value).length <= 256
}

export function usernameRegistrationError(username, password, confirmation) {
  if (!normalizeUsername(username)) return 'AUTH_USERNAME_INVALID'
  if (!usernamePasswordValid(password)) return 'AUTH_USERNAME_PASSWORD'
  return password === confirmation ? null : 'AUTH_REGISTER_MISMATCH'
}
