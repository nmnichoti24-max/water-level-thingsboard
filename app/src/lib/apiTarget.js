export const PAGES_BUILD = import.meta.env?.MODE === 'pages'
const backend = import.meta.env?.VITE_API_BASE_URL
let pagesAccessToken = ''

export function apiUrl(path) {
  if (!PAGES_BUILD) return path
  if (!backend) throw new Error('ยังไม่ได้ตั้งค่า API สำหรับ GitHub Pages')
  const origin = new URL(backend)
  const development = origin.protocol === 'http:' && origin.hostname === '127.0.0.1' &&
    window.location.hostname === '127.0.0.1'
  if ((!development && origin.protocol !== 'https:') || backend !== origin.origin) {
    throw new Error('ตั้งค่า API URL ไม่ถูกต้อง')
  }
  return origin.origin + path
}

export function setPagesToken(value) {
  pagesAccessToken = value
}

export function apiAccess() {
  return PAGES_BUILD
    ? { credentials: 'omit', headers: pagesAccessToken ? { Authorization: 'Bearer ' + pagesAccessToken } : {} }
    : { credentials: 'same-origin', headers: {} }
}
