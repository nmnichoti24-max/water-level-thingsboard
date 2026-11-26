// Owner tool: let an existing Username account read the LIVE device (TB_REAL_DEVICE_ID) from app/.env.local.
// Usage (from app/): node scripts/grant-live.mjs <username>           -> dry run, shows the current ACL only
//                    node scripts/grant-live.mjs <username> --apply   -> adds LIVE, keeps every existing permission
// An explicit Redis ACL overrides AUTH_DEFAULT_LIVE, so accounts made with create-account.mjs --grant-sim
// ({ sim: true, liveDevices: [] }) need this to see LIVE. Nothing is removed; secrets are never printed.
import { loadEnv } from 'vite'
import { usernameAccounts, usernameDatabaseConfig } from '../server/accounts.js'
import { sha256 } from '../server/bridgeStore.js'
import { normalizeUsername } from '../src/lib/username.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const [input, flag] = process.argv.slice(2)
const env = loadEnv('development', process.cwd(), '')
const config = usernameDatabaseConfig(env)
if (!config) throw new Error('AUTH_ACCOUNT_DATABASE_URL is missing or invalid in app/.env.local')
if (!UUID.test(env.TB_REAL_DEVICE_ID ?? '')) throw new Error('TB_REAL_DEVICE_ID is missing or invalid in app/.env.local')
if (!env.AUTH_SUPABASE_URL || !/^https:\/\/[a-z0-9-]+\.upstash\.io$/.test(env.AUTH_REDIS_REST_URL ?? '')) throw new Error('Redis or Supabase URL missing')
const username = normalizeUsername(input)
if (!username) throw new Error('usage: node scripts/grant-live.mjs <username> [--apply]')

const account = await usernameAccounts(config).find(username)
if (!account) throw new Error('ไม่พบบัญชี: ' + username)
const key = 'wg:v1:acl:' + sha256(env.AUTH_SUPABASE_URL + '/auth/v1|username|' + account.id.toLowerCase())
const redis = async (command) => {
  const res = await fetch(env.AUTH_REDIS_REST_URL, {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.AUTH_REDIS_REST_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  if (!res.ok) throw new Error('Redis HTTP ' + res.status)
  return (await res.json()).result
}

const raw = await redis(['GET', key])
const current = raw ? JSON.parse(raw) : null
const live = (Array.isArray(current?.liveDevices) ? current.liveDevices : []).map((id) => String(id).toLowerCase())
const device = env.TB_REAL_DEVICE_ID.toLowerCase()
console.log('ACL ปัจจุบัน:', current ? `sim=${current.sim === true} liveDevices=${live.length} (มี LIVE device นี้: ${live.includes(device)})` : 'ไม่มี (ใช้ค่า AUTH_DEFAULT_*)')

if (current && live.includes(device)) {
  console.log('บัญชีนี้อ่าน LIVE ได้อยู่แล้ว ไม่ต้องแก้')
} else if (!current) {
  console.log('ไม่มี ACL เฉพาะบัญชี: LIVE จะขึ้นเมื่อ Vercel มี AUTH_DEFAULT_LIVE=1 และ TB_REAL_DEVICE_ID ไม่ต้องรันสคริปต์นี้')
} else if (flag !== '--apply') {
  console.log('Dry run: ยังไม่ได้แก้ไข รันซ้ำพร้อม --apply เพื่อเพิ่มสิทธิ์ LIVE (คงสิทธิ์เดิมทั้งหมด)')
} else {
  const next = { ...current, liveDevices: [...live, device] }
  // Only write if the ACL did not change since it was read.
  const script = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('SET', KEYS[1], ARGV[2]) else return 'CHANGED' end"
  const result = await redis(['EVAL', script, '1', key, raw, JSON.stringify(next)])
  console.log(result === 'OK' ? `เพิ่มสิทธิ์ LIVE แล้ว: sim=${next.sim === true} liveDevices=${next.liveDevices.length}` : 'ACL ถูกแก้ระหว่างทำงาน ไม่ได้เขียนทับ ลองใหม่')
}
process.exit(0)
