import pg from 'pg'

const pools = new Map()

export function usernameDatabaseConfig(env) {
  if (!env.AUTH_ACCOUNT_DATABASE_URL) return null
  try {
    const url = new URL(env.AUTH_ACCOUNT_DATABASE_URL)
    const supabase = /^(?:[a-z0-9-]+\.pooler\.supabase\.com|db\.[a-z0-9]+\.supabase\.co)$/
    const user = decodeURIComponent(url.username)
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || !supabase.test(url.hostname) ||
        !/^waterguard_app(?:\.[a-z0-9]+)?$/.test(user) || !url.password || url.hash ||
        !/^\/[a-z0-9_]+$/.test(url.pathname)) return null
    // Supply mandatory TLS options explicitly rather than accepting knobs in the connection URL.
    url.search = ''
    return { connectionString: url.href, ca: env.AUTH_ACCOUNT_DATABASE_CA?.replaceAll('\\n', '\n') }
  } catch {
    return null
  }
}

function pool(config) {
  if (!pools.has(config.connectionString)) {
    const db = new pg.Pool({
      connectionString: config.connectionString,
      ssl: { rejectUnauthorized: true, ...(config.ca ? { ca: config.ca } : {}) },
      max: 2,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      query_timeout: 5000,
      statement_timeout: 4000,
      allowExitOnIdle: true,
    })
    db.on('error', () => console.warn('Username account database connection dropped'))
    pools.set(config.connectionString, db)
  }
  return pools.get(config.connectionString)
}

export function usernameAccounts(config, db = pool(config)) {
  return {
    async create(username, passwordHash) {
      const result = await db.query(
        'insert into waterguard_private.accounts (username, password_hash) values ($1, $2) on conflict (username) do nothing returning id',
        [username, passwordHash],
      )
      return result.rowCount === 1
    },
    async find(username) {
      const result = await db.query(
        'select id, username, password_hash, credential_version, disabled_at from waterguard_private.accounts where username = $1',
        [username],
      )
      return result.rows[0] ?? null
    },
    async identity(id) {
      const result = await db.query(
        'select id, username, credential_version, disabled_at from waterguard_private.accounts where id = $1',
        [id],
      )
      return result.rows[0] ?? null
    },
  }
}
