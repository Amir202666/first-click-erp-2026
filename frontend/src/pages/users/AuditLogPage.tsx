import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchAuditLogs } from '../../api/tenant'
import type { AuditLogEntry, PaginatedResponse } from '../../types'
import { ScrollText } from 'lucide-react'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import ReportFooter from '../../components/ui/ReportFooter'

const AUDIT_LOGS_PER_PAGE = 50

export default function AuditLogPage() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery<PaginatedResponse<AuditLogEntry>>({
    queryKey: ['audit-logs', tenantId, fromDate, toDate, actionFilter, page, AUDIT_LOGS_PER_PAGE],
    queryFn: () =>
      fetchAuditLogs(tenantId, {
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        action: actionFilter || undefined,
        page,
        per_page: AUDIT_LOGS_PER_PAGE,
      }),
    enabled: !!tenantId,
  })
  const logs: AuditLogEntry[] = data?.data ?? []

  useEffect(() => {
    setPage(1)
  }, [tenantId, fromDate, toDate, actionFilter])

  const total = data?.total ?? 0
  const currentPage = data?.current_page ?? 1
  const lastPage = data?.last_page ?? 1
  const from = total === 0 ? 0 : (currentPage - 1) * AUDIT_LOGS_PER_PAGE + 1
  const to = total === 0 ? 0 : Math.min(currentPage * AUDIT_LOGS_PER_PAGE, total)

  type AuditSortKey = 'action' | 'table' | 'user' | 'created_at' | 'ip'
  const auditSortColumns = useMemo((): SortColumn<AuditLogEntry, AuditSortKey>[] => {
    return [
      { key: 'action', type: 'string', getValue: (r) => r.action ?? '' },
      { key: 'table', type: 'string', getValue: (r) => r.table_name ?? r.model_type ?? '' },
      { key: 'user', type: 'string', getValue: (r) => r.user?.name ?? String(r.user_id ?? '') },
      { key: 'created_at', type: 'date', getValue: (r) => r.created_at ?? '' },
      { key: 'ip', type: 'string', getValue: (r) => r.ip_address ?? '' },
    ]
  }, [])
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const { sort, toggleSort, sortedRows } = useClientSort<AuditLogEntry, AuditSortKey>(logs, auditSortColumns, {
    locale,
  })

  const textAlign = isRtl ? 'text-right' : 'text-left'

  if (!tenantId) {
    return (
      <div className="p-6">
        <p className="text-amber-600">{t.accountDefaults?.ensureClientSelected ?? 'يرجى اختيار الشركة أولاً'}</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <ScrollText size={24} className="text-slate-600" />
        <h1 className="text-2xl font-bold text-slate-900">{(t as { userManagement?: { auditTitle?: string } }).userManagement?.auditTitle ?? 'سجل التدقيق'}</h1>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div>
          <label className="block text-xs text-slate-500 mb-1">{(t as { dashboard?: { fromDate?: string } }).dashboard?.fromDate ?? 'من تاريخ'}</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">{(t as { dashboard?: { toDate?: string } }).dashboard?.toDate ?? 'إلى تاريخ'}</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">{(t as { userManagement?: { action?: string } }).userManagement?.action ?? 'الإجراء'}</label>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="">—</option>
            <option value="created">إضافة</option>
            <option value="updated">تعديل</option>
            <option value="deleted">حذف</option>
            <option value="login">دخول</option>
            <option value="logout">خروج</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-slate-600">
                  <SortableTh label={(t as { userManagement?: { action?: string } }).userManagement?.action ?? 'الإجراء'} sortKey="action" sortState={sort} onToggle={toggleSort} widthClassName="w-28" className={`${textAlign} font-medium text-slate-700`} />
                  <SortableTh label={(t as { userManagement?: { tableName?: string } }).userManagement?.tableName ?? 'الجدول'} sortKey="table" sortState={sort} onToggle={toggleSort} widthClassName="w-36" className={`${textAlign} font-medium text-slate-700`} />
                  <SortableTh label="المستخدم" sortKey="user" sortState={sort} onToggle={toggleSort} widthClassName="w-40" className={`${textAlign} font-medium text-slate-700`} />
                  <SortableTh label={(t as { date?: string }).date ?? 'التاريخ'} sortKey="created_at" sortState={sort} onToggle={toggleSort} widthClassName="w-44" className={`${textAlign} font-medium text-slate-700`} />
                  <SortableTh label="IP" sortKey="ip" sortState={sort} onToggle={toggleSort} widthClassName="w-32" className={`${textAlign} font-medium text-slate-700`} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedRows.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-slate-400">{(t as { userManagement?: { noAuditLogs?: string } }).userManagement?.noAuditLogs ?? 'لا توجد سجلات'}</td></tr>
                ) : (
                  sortedRows.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs">{log.action}</td>
                      <td className="px-4 py-2 text-slate-600">{log.table_name ?? log.model_type ?? '—'}</td>
                      <td className="px-4 py-2">{log.user?.name ?? log.user_id ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-2 text-slate-500 text-xs">{log.ip_address ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && (
        <ReportFooter
          totalCount={total}
          currentPage={currentPage}
          lastPage={lastPage}
          from={from}
          to={to}
          onPageChange={setPage}
          lang={lang}
          isRtl={isRtl}
          recordLabel={lang === 'ar' ? 'سجل' : 'record'}
          alwaysShowPaginationBar
          dense
        />
      )}
    </div>
  )
}
