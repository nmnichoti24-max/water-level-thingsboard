const ORIGINS = new Set(['https://thingsboard.cloud', 'https://eu.thingsboard.cloud'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const WINDOWS = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000 }
const LIMIT = 2500
const KEYS = 'distance,waterLevel,waterPercent,status,sensorValid'
const STATUS = new Set(['NORMAL', 'WARNING', 'DANGER'])
const publicSessions = new WeakMap()

class ApiError extends Error {
  constructor(status, code) {
    super(code)
    this.status = status
  }
}

function number(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function boolean(value) {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return null
}

function devices(env) {
  if (env.TB_ENABLE_CLOUD_READ !== '1' || !ORIGINS.has(env.TB_ORIGIN)) return []
  return [
    { key: 'esp32', name: 'ESP32-S3-Water-Level', simulated: false, id: env.TB_REAL_DEVICE_ID, enabled: Boolean(env.TB_API_KEY) },
    { key: 'cloud-sim', name: 'ESP32-S3-Water-Level-SIM', simulated: true, id: env.TB_SIM_DEVICE_ID, enabled: Boolean(env.TB_API_KEY) || UUID.test(env.TB_PUBLIC_SIM_ID ?? '') },
  ].filter((entry) => entry.enabled && UUID.test(entry.id ?? ''))
}

async function requestJson(fetcher, url, options) {
  let response
  try {
    response = await fetcher(url, {
      ...options,
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    })
  } catch {
    throw new ApiError(502, 'UPSTREAM_UNREACHABLE')
  }
  if (response.status === 401 || response.status === 403) throw new ApiError(502, 'UPSTREAM_ACCESS_DENIED')
  if (response.status === 429) throw new ApiError(503, 'UPSTREAM_RATE_LIMIT')
  if (!response.ok) throw new ApiError(502, 'UPSTREAM_ERROR')
  try {
    return await response.json()
  } catch {
    throw new ApiError(502, 'UPSTREAM_INVALID_RESPONSE')
  }
}

async function authorization(env, fetcher, device) {
  if (!device.simulated || !UUID.test(env.TB_PUBLIC_SIM_ID ?? '')) return 'ApiKey ' + env.TB_API_KEY
  const key = env.TB_ORIGIN + '/' + env.TB_PUBLIC_SIM_ID
  const saved = publicSessions.get(env)
  if (saved?.key === key && saved.expires > Date.now()) return saved.header
  const session = {
    key, expires: Date.now() + 600000,
    header: requestJson(fetcher, new URL('/api/auth/login/public', env.TB_ORIGIN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ publicId: env.TB_PUBLIC_SIM_ID }),
    }).then((body) => {
      if (typeof body?.token !== 'string' || !body.token) throw new ApiError(502, 'UPSTREAM_INVALID_RESPONSE')
      return 'Bearer ' + body.token
    }),
  }
  publicSessions.set(env, session)
  try {
    return await session.header
  } catch (error) {
    if (publicSessions.get(env) === session) publicSessions.delete(env)
    throw error
  }
}

function ordered(body, key) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(502, 'UPSTREAM_INVALID_RESPONSE')
  // ThingsBoard can return a timestamped null placeholder for a key never sent.
  return Array.isArray(body[key]) ? body[key].filter((point) =>
    Number.isSafeInteger(point?.ts) && point.ts > 0 && point.value !== null && point.value !== undefined) : []
}

export function makeApi(env, fetcher = fetch, now = Date.now) {
  return async (url, method = 'GET') => {
    try {
      if (method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED')
      const operation = url.searchParams.get('op') ?? 'devices'
      const available = devices(env)
      if (operation === 'devices') return { status: 200, data: {
        devices: available.map(({ key, name, simulated }) => ({ key, name, simulated })),
      } }
      if (operation !== 'latest' && operation !== 'history') throw new ApiError(400, 'INVALID_OPERATION')
      if (!available.length) throw new ApiError(503, 'CLOUD_NOT_CONFIGURED')
      const device = available.find((entry) => entry.key === url.searchParams.get('device'))
      if (!device) throw new ApiError(404, 'DEVICE_NOT_ALLOWED')
      const base = '/api/plugins/telemetry/DEVICE/' + device.id + '/values'
      const request = async (suffix, query) => {
        const url = new URL(base + suffix, env.TB_ORIGIN)
        url.search = new URLSearchParams(query).toString()
        const header = await authorization(env, fetcher, device)
        return requestJson(fetcher, url, { headers: { Accept: 'application/json', 'X-Authorization': header } })
      }
      if (operation === 'latest') {
        const [body, attributes] = await Promise.all([
          request('/timeseries', { keys: KEYS }),
          request('/attributes/SERVER_SCOPE', { keys: 'active,lastActivityTime' }).catch(() => null),
        ])
        const distance = ordered(body, 'distance')[0]
        const sensor = ordered(body, 'sensorValid')[0]
        const reported = ordered(body, 'status')[0]
        const ts = Math.max(distance?.ts ?? 0, sensor?.ts ?? 0) || null
        const activity = Array.isArray(attributes) ? attributes : []
        const status = reported?.ts === ts && STATUS.has(reported?.value) ? reported.value : null
        const sample = ts === null ? null : {
          ts,
          distance: distance?.ts === ts ? number(distance.value) : null,
          sensorValid: sensor?.ts === ts ? boolean(sensor.value) === true : null,
          reportedStatus: status,
        }
        return { status: 200, data: {
          sample, deviceActive: boolean(activity.find((item) => item?.key === 'active')?.value),
          lastActivity: number(activity.find((item) => item?.key === 'lastActivityTime')?.value),
          serverTime: now(),
        } }
      }
      const duration = WINDOWS[url.searchParams.get('range')]
      if (typeof duration !== 'number') throw new ApiError(400, 'INVALID_WINDOW')
      const endTs = now()
      const startTs = endTs - duration
      const body = await request('/timeseries', {
        keys: 'distance,sensorValid', startTs, endTs, limit: LIMIT, agg: 'NONE', orderBy: 'DESC',
      })
      const distances = ordered(body, 'distance')
      const flags = ordered(body, 'sensorValid')
      const byTime = new Map(distances.map(({ ts, value }) => [ts, { ts, distance: number(value), sensorValid: null }]))
      for (const { ts, value } of flags) {
        const point = byTime.get(ts) ?? { ts, distance: null }
        byTime.set(ts, { ...point, sensorValid: boolean(value) === true })
      }
      return { status: 200, data: {
        points: Array.from(byTime.values()).filter(({ ts }) => ts >= startTs && ts <= endTs).sort((a, b) => a.ts - b.ts),
        limited: distances.length >= LIMIT || flags.length >= LIMIT,
      } }
    } catch (error) {
      const known = error instanceof ApiError
      return { status: known ? error.status : 500, data: { error: known ? error.message : 'INTERNAL_ERROR' } }
    }
  }
}

export async function respond(req, res, env) {
  const result = await makeApi(env)(new URL(req.url, 'http://localhost'), req.method)
  res.statusCode = result.status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') res.setHeader('Allow', 'GET')
  res.end(JSON.stringify(result.data))
}
