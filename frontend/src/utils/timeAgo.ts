export function formatTimeAgo(iso: string, isAr: boolean): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diffMs = Date.now() - then
  const diffM = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMs / 3600000)
  const diffD = Math.floor(diffMs / 86400000)

  if (diffM < 1) return isAr ? 'الآن' : 'just now'
  if (diffM < 60) return isAr ? `منذ ${diffM} د` : `${diffM}m ago`
  if (diffH < 24) return isAr ? `منذ ${diffH} س` : `${diffH}h ago`
  if (diffD < 30) return isAr ? `منذ ${diffD} يوم` : `${diffD}d ago`
  return new Date(iso).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')
}
