// Local-only browser test backend on 127.0.0.1:4177.
// Runs the real Auth/Telemetry handlers, real Upstash Redis and real ThingsBoard from app/.env.local,
// but keeps Username accounts in an embedded PostgreSQL (same migration and role) so no cloud account is touched.
// Usage (from app/): node scripts/e2e-local-backend.mjs
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { createServer, loadEnv } from 'vite'
import { usernameAccounts } from '../server/accounts.js'
import { respondAuth } from '../server/auth.js'
import { sha256 } from '../server/bridgeStore.js'
import { respond } from '../server/telemetry.js'

const live = loadEnv('development', process.cwd(), '')
if (live.APP_ORIGIN !== 'http://127.0.0.1:4177') throw new Error('APP_ORIGIN must be http://127.0.0.1:4177')
const fixtureDb = new URL('postgresql://aws-0-e2e.pooler.supabase.com:6543/postgres')
fixtureDb.username = 'waterguard_app.e2e'
fixtureDb.password = 'embedded-only'
const env = {
  ...live,
  AUTH_ACCOUNT_DATABASE_URL: fixtureDb.href,
  AUTH_ACCOUNT_DATABASE_CA: '',
  AUTH_ENABLE_USERNAME_REGISTRATION: '1',
}

const db = new PGlite()
await db.exec(await readFile(new URL('../database/001_username_accounts.sql', import.meta.url), 'utf8'))
await db.exec('set role waterguard_accounts')
const accounts = (config) => usernameAccounts(config, db)

// Test clock: shifts Date.now for session-expiry checks.
let offset = 0
const realNow = Date.now
Date.now = () => realNow() + offset

const nonce = randomBytes(16).toString('hex')
const granted = new Set()
async function redis(...args) {
  const res = await fetch(env.AUTH_REDIS_REST_URL, {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.AUTH_REDIS_REST_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  return (await res.json()).result
}
const aclKey = (id) => 'wg:v1:acl:' + sha256(env.AUTH_SUPABASE_URL + '/auth/v1|username|' + id.toLowerCase())

async function control(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1')
  const reply = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)) }
  if (url.pathname === '/advance') { offset += Number(url.searchParams.get('ms')) || 0; return reply({ offsetMs: offset }) }
  if (url.pathname === '/reset-clock') { offset = 0; return reply({ offsetMs: 0 }) }
  if (url.pathname === '/accounts') {
    const r = await db.query('select username, password_hash, credential_version from waterguard_private.accounts')
    return reply(r.rows.map((a) => ({ username: a.username, argon2id: /^\$argon2id\$v=19\$m=32768,t=3,p=1\$/.test(a.password_hash), v: a.credential_version })))
  }
  if (url.pathname === '/acl') {
    const account = await accounts().find(url.searchParams.get('username') ?? '')
    if (!account) return reply({ error: 'no such embedded account' })
    const mode = url.searchParams.get('mode')
    const value = { none: null, sim: { sim: true, liveDevices: [] }, live: { sim: false, liveDevices: [env.TB_REAL_DEVICE_ID] }, both: { sim: true, liveDevices: [env.TB_REAL_DEVICE_ID] } }[mode]
    if (value === undefined) return reply({ error: 'mode' })
    if (value === null) await redis('DEL', aclKey(account.id))
    else await redis('SET', aclKey(account.id), JSON.stringify(value), 'EX', 1800)
    granted.add(account.id)
    return reply({ username: account.username, mode })
  }
  if (url.pathname === '/shutdown') { reply({ stopping: true }); return cleanup() }
  res.statusCode = 404; res.end()
}

const server = await createServer({
  configFile: false, root: process.cwd(), mode: 'development', envPrefix: 'VITE_',
  plugins: [(await import('@vitejs/plugin-react')).default(), {
    name: 'e2e-api',
    configureServer(s) {
      s.middlewares.use('/__e2e/' + nonce, control)
      s.middlewares.use('/api/telemetry', (req, res) => respond(req, res, env))
      s.middlewares.use('/api/auth', (req, res) => respondAuth(req, res, env, accounts))
    },
  }],
  server: { host: '127.0.0.1', port: 4177, strictPort: true, cors: false },
})
await server.listen()
console.log('e2e backend ready on http://127.0.0.1:4177 (embedded accounts, real Redis + ThingsBoard)')
console.log('control: http://127.0.0.1:4177/__e2e/' + nonce)

async function cleanup() {
  for (const id of granted) await redis('DEL', aclKey(id)).catch(() => {})
  console.log('removed', granted.size, 'test ACL key(s)')
  process.exit(0)
}
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
