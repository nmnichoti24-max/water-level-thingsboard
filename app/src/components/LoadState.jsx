export function RequestError({ message, retry, cached }) {
  return (
    <div className="notice error request-error">
      <p role="alert">{message}{cached ? ' · แสดงข้อมูลที่อ่านได้ครั้งก่อน' : ''}</p>
      <button type="button" className="button-outline" onClick={retry}>ลองใหม่</button>
    </div>
  )
}

export function LoadState({ loading, loadingText, emptyText, compact }) {
  return <p className={compact ? 'empty small' : 'empty'} role="status">{loading ? loadingText : emptyText}</p>
}
