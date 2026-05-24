/**
 * ReportFooter - شريط سفلي موحّد لجميع التقارير
 * يضم: بطاقات الإجماليات + معلومات الصفحة + أزرار التنقل
 */

interface TotalCard {
  label: string
  value: string | number
  highlight?: boolean   // يُبرز البطاقة بلون أغمق
  color?: 'emerald' | 'blue' | 'red' | 'amber' | 'slate'
}

interface ReportFooterProps {
  /** بطاقات الإجماليات (اختياري) */
  totals?: TotalCard[]
  /** إجمالي عدد السجلات */
  totalCount?: number
  /** عدد السجلات في الصفحة الحالية */
  currentCount?: number
  /** الصفحة الحالية */
  currentPage?: number
  /** آخر صفحة */
  lastPage?: number
  /** رقم أول سجل في الصفحة */
  from?: number
  /** رقم آخر سجل في الصفحة */
  to?: number
  /** دالة تغيير الصفحة */
  onPageChange?: (page: number) => void
  /** اللغة */
  lang?: 'ar' | 'en'
  /** الاتجاه */
  isRtl?: boolean
  /** تخصيص تسمية السجلات */
  recordLabel?: string
  /** إظهار شريط التصفح دائماً (حتى عند صفحة واحدة) */
  alwaysShowPaginationBar?: boolean
  /** إظهار نص ملخص السجلات (عرض X–Y من إجمالي Z). افتراضي true */
  showRecordSummary?: boolean
  /** إظهار بطاقات الإجماليات في منتصف الشريط السفلي (بدل صف مستقل فوقه) */
  totalsInBar?: boolean
  /** تقليل الارتفاع (حشو أقل) — مثلاً قوائم الجداول */
  dense?: boolean
}

export default function ReportFooter({
  totals = [],
  totalCount,
  currentCount,
  currentPage = 1,
  lastPage = 1,
  from,
  to,
  onPageChange,
  lang = 'ar',
  isRtl = true,
  recordLabel,
  alwaysShowPaginationBar = false,
  showRecordSummary = true,
  totalsInBar = false,
  dense = false,
}: ReportFooterProps) {
  const hasPagination = onPageChange && lastPage > 1
  const hasInfo = totalCount !== undefined || currentCount !== undefined
  const showBar = hasInfo || hasPagination || alwaysShowPaginationBar
  const showPaginationControls = hasPagination || (alwaysShowPaginationBar && onPageChange && currentPage !== undefined && lastPage !== undefined)

  const colorMap: Record<NonNullable<TotalCard['color']>, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    blue:    'bg-blue-50 border-blue-200 text-blue-800',
    red:     'bg-red-50 border-red-200 text-red-800',
    amber:   'bg-amber-50 border-amber-200 text-amber-800',
    slate:   'bg-slate-100 border-slate-200 text-slate-800',
  }

  const txtAlign = isRtl ? 'text-right' : 'text-left'

  const totalsBlock = totals.length > 0 && (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {totals.map((card, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold ${
            card.color ? colorMap[card.color] : card.highlight ? colorMap.blue : colorMap.slate
          }`}
        >
          <span className="text-xs font-medium opacity-75">{card.label}:</span>
          <span className="tabular-nums font-bold">{card.value}</span>
        </div>
      ))}
    </div>
  )

  return (
    <div className="rounded-b-xl overflow-hidden border-t-2 border-slate-200 bg-white">
      {/* ── صف الإجماليات (مستقل إلا إذا totalsInBar) ── */}
      {totals.length > 0 && !totalsInBar && (
        <div
          className={`bg-slate-50 border-b border-slate-200 ${dense ? 'px-3 py-2' : 'px-4 py-3'}`}
        >
          {totalsBlock}
        </div>
      )}

      {/* ── شريط الصفحة والتنقل (+ الإجماليات في المنتصف إن totalsInBar) ── */}
      {showBar && (
        <div
          className={`border-t border-slate-200 bg-slate-50/50 ${dense ? 'px-3 py-2 gap-2' : 'px-4 py-3 gap-3'} ${totalsInBar && totals.length > 0 ? 'grid grid-cols-[1fr_auto_1fr] items-center' : 'flex flex-wrap items-center justify-between'}`}
        >
          {/* يسار: معلومات الصفحة أو السجلات */}
          <div
            className={`${dense ? 'text-xs' : 'text-sm'} text-slate-600 ${txtAlign} min-w-0 leading-tight ${totalsInBar ? 'order-1' : ''}`}
          >
            {showRecordSummary && from !== undefined && to !== undefined && totalCount !== undefined ? (
              <span>
                {lang === 'ar' ? (
                  <>عرض <strong className="text-slate-900">{from}–{to}</strong> من إجمالي <strong className="text-slate-900">{totalCount}</strong> {recordLabel ?? 'سجل'}</>
                ) : (
                  <>Showing <strong className="text-slate-900">{from}–{to}</strong> of <strong className="text-slate-900">{totalCount}</strong> {recordLabel ?? 'records'}</>
                )}
              </span>
            ) : showRecordSummary && totalCount !== undefined ? (
              <span>
                {lang === 'ar'
                  ? <>{lang === 'ar' ? 'إجمالي السجلات: ' : 'Total records: '}<strong className="text-slate-900">{totalCount}</strong> {recordLabel ?? 'سجل'}</>
                  : <>Total: <strong className="text-slate-900">{totalCount}</strong> {recordLabel ?? 'records'}</>
                }
              </span>
            ) : currentPage !== undefined && lastPage !== undefined ? (
              <span>
                {lang === 'ar' ? (
                  <>الصفحة <strong className="text-slate-900">{currentPage}</strong> من <strong className="text-slate-900">{lastPage}</strong></>
                ) : (
                  <>Page <strong className="text-slate-900">{currentPage}</strong> of <strong className="text-slate-900">{lastPage}</strong></>
                )}
              </span>
            ) : null}
          </div>

          {/* منتصف: إجماليات في الشريط (لقيود اليومية) */}
          {totalsInBar && totals.length > 0 && (
            <div className={`flex justify-center px-2 ${isRtl ? 'order-2' : 'order-2'}`}>
              {totalsBlock}
            </div>
          )}

          {/* أزرار التصفح */}
          {showPaginationControls && onPageChange && (
            <div
              className={`flex items-center flex-wrap ${dense ? 'gap-1' : 'gap-2'} ${totalsInBar ? 'order-3 justify-end' : ''}`}
            >
              {/* زر الأولى */}
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(1)}
                className={`${dense ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm'} flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
                title={lang === 'ar' ? 'الأولى' : 'First'}
              >
                {isRtl ? '»' : '«'}
              </button>

              {/* السابق */}
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                className={`${dense ? 'px-2 h-7 text-xs gap-0.5' : 'px-3 h-8 text-sm gap-1'} flex items-center rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
              >
                {isRtl ? '›' : '‹'} {lang === 'ar' ? 'السابق' : 'Prev'}
              </button>

              {/* رقم الصفحة */}
              <div className={`flex items-center ${dense ? 'gap-0.5' : 'gap-1'}`}>
                {Array.from({ length: Math.min(lastPage, 7) }, (_, i) => {
                  let p: number
                  if (lastPage <= 7) {
                    p = i + 1
                  } else if (currentPage <= 4) {
                    p = i + 1
                  } else if (currentPage >= lastPage - 3) {
                    p = lastPage - 6 + i
                  } else {
                    p = currentPage - 3 + i
                  }
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onPageChange(p)}
                      className={`${dense ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm'} flex items-center justify-center rounded-lg font-medium border transition-colors ${
                        p === currentPage
                          ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  )
                })}
              </div>

              {/* التالي */}
              <button
                type="button"
                disabled={currentPage >= lastPage}
                onClick={() => onPageChange(Math.min(lastPage, currentPage + 1))}
                className={`${dense ? 'px-2 h-7 text-xs gap-0.5' : 'px-3 h-8 text-sm gap-1'} flex items-center rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
              >
                {lang === 'ar' ? 'التالي' : 'Next'} {isRtl ? '‹' : '›'}
              </button>

              {/* زر الأخيرة */}
              <button
                type="button"
                disabled={currentPage >= lastPage}
                onClick={() => onPageChange(lastPage)}
                className={`${dense ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm'} flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
                title={lang === 'ar' ? 'الأخيرة' : 'Last'}
              >
                {isRtl ? '«' : '»'}
              </button>

              {/* مؤشر X من Y */}
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {lang === 'ar' ? `${currentPage} / ${lastPage}` : `${currentPage} / ${lastPage}`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
