const ERROR_TEXT = {
  CLOUD_NOT_CONFIGURED: 'ยังไม่ได้เปิดการอ่านข้อมูล ThingsBoard ที่เซิร์ฟเวอร์',
  UPSTREAM_ACCESS_DENIED: 'ThingsBoard ปฏิเสธสิทธิ์อ่านข้อมูล ตรวจ API key และสิทธิ์ของ Device',
  UPSTREAM_RATE_LIMIT: 'ThingsBoard จำกัดความถี่ชั่วคราว ลองใหม่ภายหลัง',
  UPSTREAM_UNREACHABLE: 'เชื่อมต่อ ThingsBoard ไม่สำเร็จหรือคำขอหมดเวลา',
  DEVICE_NOT_ALLOWED: 'Device นี้ยังไม่ได้กำหนดในเซิร์ฟเวอร์',
}

const INVALID_RESPONSE = 'API ของเว็บส่งข้อมูลในรูปแบบที่ไม่รองรับ'

export async function readTelemetry(operation, { device, range, signal } = {}) {
  const query = new URLSearchParams({ op: operation })
  if (device) query.set('device', device)
  if (range) query.set('range', range)

  const timeout = AbortSignal.timeout(10000)
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  let response
  let data
  try {
    response = await fetch('/api/telemetry?' + query, { signal: requestSignal, cache: 'no-store' })
    data = await response.json().catch(() => null)
    requestSignal.throwIfAborted()
  } catch {
    signal?.throwIfAborted()
    throw new Error(timeout.aborted ? 'API ของเว็บตอบช้าเกินไป ลองใหม่อีกครั้ง' : 'ติดต่อ API ของเว็บไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')
  }

  if (!response.ok) {
    const code = data?.error
    throw new Error(Object.hasOwn(ERROR_TEXT, code) ? ERROR_TEXT[code] : 'อ่านข้อมูลจาก ThingsBoard ไม่สำเร็จ')
  }
  if (
    !data ||
    (operation === 'devices' && !Array.isArray(data.devices)) ||
    (operation === 'latest' && !Object.hasOwn(data, 'sample')) ||
    (operation === 'history' && !Array.isArray(data.points))
  ) throw new Error(INVALID_RESPONSE)

  return data
}
