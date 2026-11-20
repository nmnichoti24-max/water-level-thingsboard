import { createHash, randomBytes } from 'node:crypto'

export const OPAQUE = /^[A-Za-z0-9_-]{43}$/
export const opaque = () => randomBytes(32).toString('base64url')
export const sha256 = (value) => createHash('sha256').update(value).digest('base64url')

const PAGES = 'https://nmnichoti24-max.github.io/water-level-thingsboard/'
const CONSUME = 'if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) end return 0'

const LIMIT = `
  local attempts = redis.call("INCR", KEYS[1])
  if attempts == 1 then redis.call("EXPIRE", KEYS[1], tonumber(ARGV[3])) end
  if attempts > tonumber(ARGV[1]) then return 0 end
  local account = redis.call("INCR", KEYS[2])
  if account == 1 then redis.call("EXPIRE", KEYS[2], tonumber(ARGV[3])) end
  if account > tonumber(ARGV[2]) then return 0 end
  return 1
`

export function bridgeConfig(env) {
  if (!env.AUTH_PAGES_REDIRECT_URL && !env.AUTH_REDIS_REST_URL && !env.AUTH_REDIS_REST_TOKEN) return undefined
  const callback = env.AUTH_PAGES_REDIRECT_URL ?? ''
  const development = !env.VERCEL && /^http:\/\/127\.0\.0\.1:\d+\/water-level-thingsboard\/$/.test(callback)
  if (callback !== PAGES && !development) return null
  if (!/^https:\/\/[a-z0-9-]+\.upstash\.io$/.test(env.AUTH_REDIS_REST_URL ?? '') || !env.AUTH_REDIS_REST_TOKEN) return null
  return { callback, origin: new URL(callback).origin, url: env.AUTH_REDIS_REST_URL, token: env.AUTH_REDIS_REST_TOKEN }
}

export function bridgeStore(config, fetcher = fetch) {
  async function command(...args) {
    const response = await fetcher(config.url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    const body = await response.json()
    if (!response.ok || body?.error || !Object.hasOwn(body, 'result')) throw new Error('Bridge store unavailable')
    return body.result
  }
  const key = (kind, id) => 'wg:v1:' + kind + ':' + sha256(id)
  return {
    get: (kind, id) => command('GET', key(kind, id)),
    set: (kind, id, value, ttl, mode = 'NX') => command('SET', key(kind, id), value, 'EX', Math.max(1, Math.floor(ttl)), mode),
    delete: (kind, id) => command('DEL', key(kind, id)),
    rateLimit: (scope, ip, account, ipLimit, accountLimit, ttl) => command('EVAL', LIMIT, 2,
      key('rate-ip', scope + '|' + ip), key('rate-account', scope + '|' + account), ipLimit, accountLimit, ttl),
    consume: (id, value) => command('EVAL', CONSUME, 1, key('code', id), value),
  }
}

export function pagesCors(config, req, res, operations, method = 'GET') {
  if (!config || req.headers.origin !== config.origin) return false
  const operation = new URL(req.url, 'http://localhost').searchParams.get('op') ?? 'devices'
  if (!operations.includes(operation)) return false
  res.setHeader('Access-Control-Allow-Origin', config.origin)
  res.setHeader('Vary', 'Origin')
  if (req.method !== 'OPTIONS') return false
  const allowedHeaders = (req.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map((name) => name.trim())
  if (req.headers['access-control-request-method'] !== method ||
      allowedHeaders.some((name) => name && !['authorization', 'content-type'].includes(name))) {
    res.statusCode = 403
  } else {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Methods', method)
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Max-Age', '300')
  }
  res.end()
  return true
}
