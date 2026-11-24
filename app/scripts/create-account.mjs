// Owner tool: create a WaterGuard Pro Username account from app/.env.local without the public signup form.
// Usage (from app/): node scripts/create-account.mjs <username> [--grant-sim]
// The password is read from a hidden terminal prompt and is never printed or stored in plain text.
import { createInterface } from 'node:readline'
import { Algorithm, hash, Version } from '@node-rs/argon2'
import { loadEnv } from 'vite'
import { usernameAccounts, usernameDatabaseConfig } from '../server/accounts.js'
import { sha256 } from '../server/bridgeStore.js'
import { authMessage } from '../src/lib/authClient.js'
import { normalizeUsername, usernameRegistrationError } from '../src/lib/username.js'

// Must match PARAMS in server/usernameAuth.js; login rejects any other parameter set.
const PARAMS = { algorithm: Algorithm.Argon2id, version: Version.V0x13, memoryCost: 32768, timeCost: 3, parallelism: 1, outputLen: 32 }

function hidden(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (text) => { if (text.startsWith(prompt)) process.stdout.write(prompt) }
    rl.question(prompt, (value) => { rl.close(); process.stdout.write('\n'); resolve(value) })
  })
}

const [input, flag] = process.argv.slice(2)
const env = loadEnv('development', process.cwd(), '')
const config = usernameDatabaseConfig(env)
if (!config) throw new Error('AUTH_ACCOUNT_DATABASE_URL is missing or invalid in app/.env.local')
const username = normalizeUsername(input)
if (!username) throw new Error(authMessage('AUTH_USERNAME_INVALID'))

const password = await hidden('รหัสผ่าน (อย่างน้อย 12 ตัว): ')
const confirmation = await hidden('ยืนยันรหัสผ่าน: ')
const invalid = usernameRegistrationError(username, password, confirmation)
if (invalid) throw new Error(authMessage(invalid))

const accounts = usernameAccounts(config)
if (!await accounts.create(username, await hash(password, PARAMS))) throw new Error(authMessage('AUTH_USERNAME_TAKEN'))
const { id } = await accounts.find(username)
console.log('สร้างบัญชีแล้ว:', username)

if (flag === '--grant-sim') {
  if (!env.AUTH_SUPABASE_URL || !/^https:\/\/[a-z0-9-]+\.upstash\.io$/.test(env.AUTH_REDIS_REST_URL ?? '')) throw new Error('Redis or Supabase URL missing')
  const key = 'wg:v1:acl:' + sha256(env.AUTH_SUPABASE_URL + '/auth/v1|username|' + id.toLowerCase())
  // NX: never overwrite an ACL the owner already set.
  const res = await fetch(env.AUTH_REDIS_REST_URL, {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.AUTH_REDIS_REST_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, JSON.stringify({ sim: true, liveDevices: [] }), 'NX']),
  })
  const body = await res.json()
  console.log(body.result === 'OK' ? 'ให้สิทธิ์อ่าน SIM แล้ว' : 'มี ACL เดิมอยู่แล้ว ไม่ได้แก้ไข')
}
process.exit(0)
