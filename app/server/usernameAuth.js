import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { Algorithm, hash, verify, Version } from '@node-rs/argon2'
import { normalizeUsername, usernamePasswordValid, usernameRegistrationError } from '../src/lib/username.js'

const PARAMS = { algorithm: Algorithm.Argon2id, version: Version.V0x13, memoryCost: 32768, timeCost: 3, parallelism: 1, outputLen: 32 }
const DUMMY = '$argon2id$v=19$m=32768,t=3,p=1$Lp6VU70l3ft/+x3V3lUpBw$8ZPcEKPiW+pssZEiO1fwe2nxjbBDtQp9bT0Tyi/yFoc'
const HASH_FORMAT = /^\$argon2id\$v=19\$m=32768,t=3,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/
const fail = (status, error) => ({ status, data: { error } })
let inFlight = 0

export async function usernameAuth(config, store, accounts, headers, operation, body) {
  const register = operation === 'register-username'
  if (!accounts || !store || (register && !config.usernameRegistration)) return fail(503, 'AUTH_USERNAME_UNAVAILABLE')
  const username = normalizeUsername(body.username)
  if (register) {
    const error = usernameRegistrationError(body.username, body.password, body.confirmation)
    if (error) return fail(400, error)
  } else if (!username || !usernamePasswordValid(body.password)) return fail(401, 'AUTH_USERNAME_CREDENTIALS')

  const ip = config.secure ? headers['x-vercel-forwarded-for'] : headers.localAddress
  if (typeof ip !== 'string' || !isIP(ip)) return fail(503, 'AUTH_UNAVAILABLE')
  const privateKey = (value) => createHmac('sha256', config.key).update(value).digest('base64url')
  if (await store.rateLimit(config.origin + '|' + operation, privateKey(ip), privateKey(username),
    register ? 5 : 30, register ? 3 : 10, 900) !== 1) return fail(429, 'AUTH_RATE_LIMIT')

  // Bound native hashing work within a server instance as well as limiting requests in Redis.
  if (inFlight >= 4) return fail(429, 'AUTH_RATE_LIMIT')
  inFlight++
  try {
    if (register) {
      const created = await accounts.create(username, await hash(body.password, PARAMS))
      return created ? { status: 201, data: { created: true } } : fail(409, 'AUTH_USERNAME_TAKEN')
    }
    const account = await accounts.find(username)
    const usable = account && !account.disabled_at && HASH_FORMAT.test(account.password_hash)
    const correct = await verify(usable ? account.password_hash : DUMMY, body.password)
    if (!usable || !correct) return fail(401, 'AUTH_USERNAME_CREDENTIALS')
    return { account: { id: account.id, username: account.username, credentialVersion: account.credential_version } }
  } finally {
    inFlight--
  }
}
