/** English locale for date display across the app (DD/MM/YYYY). */
const DATE_DISPLAY_LOCALE = 'en-GB'

/**
 * Format a date string for display. Always uses English format (e.g. 01/03/2026).
 */
/**
 * استخراج YYYY-MM-DD من نص تاريخ (يدعم ISO مثل 2026-03-03T00:00:00.000000Z).
 */
function extractDateOnly(raw: string): string | null {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

export function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const raw = String(dateStr).trim()
  const dateOnly = extractDateOnly(raw)
  if (dateOnly) {
    const [y, m, d] = dateOnly.split('-')
    return `${d}/${m}/${y}`
  }
  const dObj = new Date(raw)
  if (Number.isNaN(dObj.getTime())) return raw.slice(0, 10)
  return dObj.toLocaleDateString(DATE_DISPLAY_LOCALE, { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/** Format local date as YYYY-MM-DD (no UTC shift). */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** إضافة يوم واحد لتاريخ YYYY-MM-DD (لمراعاة نهاية اليوم في فلتر التقارير). */
export function addOneDay(ymd: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd
  const [y, m, day] = ymd.split('-').map((x) => parseInt(x, 10))
  const d = new Date(y, m - 1, day)
  d.setDate(d.getDate() + 1)
  return toLocalDateString(d)
}

/** Week starts on Saturday (common in KSA). getDay(): 0=Sun, 6=Sat. */
function getStartOfWeekLocal(d: Date): Date {
  const day = d.getDay() // 0 Sun .. 6 Sat
  const toSaturday = day === 6 ? 0 : day + 1
  const out = new Date(d)
  out.setDate(out.getDate() - toSaturday)
  return out
}

/**
 * Dashboard date range from user's local date (browser).
 * So "Today" / "This Week" / "This Month" / "Year" match what the user sees.
 */
export function getDashboardDateRange(
  period: 'day' | 'week' | 'month' | 'year'
): { from_date: string; to_date: string } {
  const now = new Date()
  const to_date = toLocalDateString(now)
  if (period === 'day') {
    return { from_date: to_date, to_date }
  }
  if (period === 'week') {
    const start = getStartOfWeekLocal(now)
    return { from_date: toLocalDateString(start), to_date }
  }
  if (period === 'month') {
    const y = now.getFullYear()
    const m = now.getMonth()
    const from = new Date(y, m, 1)
    return { from_date: toLocalDateString(from), to_date }
  }
  // year
  const from_date = `${now.getFullYear()}-01-01`
  return { from_date, to_date }
}

/** End of week (Friday). Week starts Saturday. */
function getEndOfWeekLocal(d: Date): Date {
  const start = getStartOfWeekLocal(d)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return end
}

export type ReportPeriodKey =
  | 'all'
  | 'from_inception'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'

/**
 * نطاق التاريخ لفلتر التقارير: الكل، اليوم، الأمس، هذا الأسبوع، الأسبوع السابق، هذا الشهر، الشهر السابق، هذه السنة.
 * عند "custom" لا تستخدم هذه الدالة — استخدم قيم من/إلى من الحقول.
 */
export function getReportPeriodRange(preset: ReportPeriodKey): { from_date: string; to_date: string } {
  const now = new Date()
  const to_date = toLocalDateString(now)
  if (preset === 'all') {
    return { from_date: `${now.getFullYear()}-01-01`, to_date }
  }
  if (preset === 'today') {
    return { from_date: to_date, to_date }
  }
  if (preset === 'yesterday') {
    const y = new Date(now)
    y.setDate(y.getDate() - 1)
    const s = toLocalDateString(y)
    return { from_date: s, to_date: s }
  }
  if (preset === 'this_week') {
    const start = getStartOfWeekLocal(now)
    return { from_date: toLocalDateString(start), to_date }
  }
  if (preset === 'last_week') {
    const thisWeekStart = getStartOfWeekLocal(now)
    const lastWeekStart = new Date(thisWeekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastWeekEnd = new Date(lastWeekStart)
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 6)
    return { from_date: toLocalDateString(lastWeekStart), to_date: toLocalDateString(lastWeekEnd) }
  }
  if (preset === 'this_month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from_date: toLocalDateString(first), to_date }
  }
  if (preset === 'last_month') {
    const y = now.getFullYear()
    const m = now.getMonth()
    const first = new Date(y, m - 1, 1)
    const last = new Date(y, m, 0)
    return { from_date: toLocalDateString(first), to_date: toLocalDateString(last) }
  }
  if (preset === 'this_quarter') {
    const month = now.getMonth()
    const quarterStartMonth = Math.floor(month / 3) * 3
    const first = new Date(now.getFullYear(), quarterStartMonth, 1)
    return { from_date: toLocalDateString(first), to_date }
  }
  if (preset === 'from_inception') {
    return { from_date: '1970-01-01', to_date }
  }
  // this_year
  return { from_date: `${now.getFullYear()}-01-01`, to_date }
}

/** اليوم السابق لتاريخ YYYY-MM-DD */
export function subtractOneDay(ymd: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd
  const [y, m, day] = ymd.split('-').map((x) => parseInt(x, 10))
  const d = new Date(y, m - 1, day)
  d.setDate(d.getDate() - 1)
  return toLocalDateString(d)
}

/**
 * Default date range: first day of current year → today (local date).
 * Used for invoices, vouchers, reports filters.
 */
export function getDefaultDateRange(): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const year = now.getFullYear()
  const dateTo = toLocalDateString(now)
  const dateFrom = `${year}-01-01`
  return { dateFrom, dateTo }
}

export type DatePresetKey = 'today' | 'yesterday' | 'last7' | 'current_month' | 'custom'

/**
 * Preset date ranges for account statement / reports.
 */
export function getDatePresetRange(preset: DatePresetKey): { dateFrom: string; dateTo: string } | null {
  const now = new Date()
  const today = toLocalDateString(now)
  if (preset === 'today') {
    return { dateFrom: today, dateTo: today }
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = toLocalDateString(yesterday)
  if (preset === 'yesterday') {
    return { dateFrom: yesterdayStr, dateTo: yesterdayStr }
  }
  const last7 = new Date(now)
  last7.setDate(last7.getDate() - 6)
  if (preset === 'last7') {
    return { dateFrom: toLocalDateString(last7), dateTo: today }
  }
  if (preset === 'current_month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    return { dateFrom: toLocalDateString(first), dateTo: today }
  }
  return null
}

/**
 * Default date range for journal entries: first day of previous year → today (local date).
 * So opening entries (قيد افتتاحي) dated at year-end or start of year are always visible.
 */
export function getDefaultJournalDateRange(): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const year = now.getFullYear()
  const dateTo = toLocalDateString(now)
  const dateFrom = `${year - 1}-01-01`
  return { dateFrom, dateTo }
}

/**
 * Default date range for invoice list: from 5 years ago (or 2020) to today.
 * Ensures sales/purchase invoices from past years are visible by default.
 */
export function getDefaultInvoiceListDateRange(): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const year = now.getFullYear()
  const dateTo = toLocalDateString(now)
  const fromYear = Math.max(2020, year - 5)
  const dateFrom = `${fromYear}-01-01`
  return { dateFrom, dateTo }
}
