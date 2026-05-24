import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchCurrencies,
  fetchDeliveryPendingSettlements,
  settleDeliveryInvoices,
  fetchPaymentMethods,
  markDeliveryAssignmentDelivered,
  fetchSettings,
} from '../../api/tenant'
import type { PendingSettlementDriverGroup } from '../../api/tenant'
import type { Currency, PaymentMethod, TenantSettings } from '../../types'
import { ChevronDown, ChevronLeft, Truck } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { formatAmountWithSymbol } from '../../utils/currency'

export default function DriverSettlementPage() {
  const { currentTenant } = useAuth()
  const { t, lang } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [selected, setSelected] = useState<Record<number, Set<number>>>({})
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [driverFilter, setDriverFilter] = useState<string>('')
  const [appliedDriverFilter, setAppliedDriverFilter] = useState<string>('')
  const [paymentMethodId, setPaymentMethodId] = useState<number>(0)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId, 'driver-settlement'],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const { data: currencies = [] } = useQuery<Currency[]>({
    queryKey: ['currencies', tenantId, 'driver-settlement'],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId,
  })

  const pendingRes = useQuery({
    queryKey: ['delivery-pending', tenantId, appliedDriverFilter],
    queryFn: () =>
      fetchDeliveryPendingSettlements(tenantId, {
        ...(appliedDriverFilter ? { driver_id: appliedDriverFilter } : {}),
      }),
    enabled: !!tenantId,
  })

  const methodsRes = useQuery({
    queryKey: ['payment-methods', tenantId, 'settle'],
    queryFn: () => fetchPaymentMethods(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })
  const methods: PaymentMethod[] = useMemo(() => {
    const d = methodsRes.data
    if (!d) return []
    return Array.isArray(d) ? d : (d as { data: PaymentMethod[] }).data ?? []
  }, [methodsRes.data])

  const groups: PendingSettlementDriverGroup[] = pendingRes.data?.data ?? []

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const systemCurrency = useMemo(() => {
    const s = settings as TenantSettings | undefined
    const byCode = (code?: string | null) => (code ? currencies.find((c) => c.code === code) ?? null : null)

    const fromDoc = byCode(typeof s?.doc_default_currency_code === 'string' ? s.doc_default_currency_code : null)
    if (fromDoc) return fromDoc

    const defaultIdRaw = s?.default_currency_id
    const defaultId =
      typeof defaultIdRaw === 'number'
        ? defaultIdRaw
        : typeof defaultIdRaw === 'string' && defaultIdRaw.trim() !== ''
          ? Number(defaultIdRaw)
          : null
    if (defaultId != null && Number.isFinite(defaultId)) {
      const fromId = currencies.find((c) => c.id === defaultId) ?? null
      if (fromId) return fromId
    }

    return currencies.find((c) => c.is_default) ?? null
  }, [settings, currencies])

  const fmtMoney = (n: number) => {
    const base = formatAmountWithSymbol(n, systemCurrency, locale)
    if (!systemCurrency?.symbol || String(systemCurrency.symbol).trim() === '') {
      return systemCurrency?.code ? `${base} ${systemCurrency.code}` : base
    }
    return base
  }

  const amountKey = (driverId: number, invoiceId: number) => `${driverId}:${invoiceId}`

  useEffect(() => {
    // تهيئة مبالغ التسوية الافتراضية = رصيد الفاتورة (متوافق مع الباك إند عند غياب amount)
    setAmountDrafts((prev) => {
      const next = { ...prev }
      for (const g of groups) {
        const driverId = g.driver?.id ?? 0
        if (!driverId) continue
        for (const a of g.assignments) {
          const k = amountKey(driverId, a.invoice_id)
          if (next[k] == null) {
            next[k] = String(a.invoice.balance ?? 0)
          }
        }
      }
      return next
    })

    setExpanded((prev) => {
      const nxt = { ...prev }
      for (const g of groups) {
        const id = g.driver?.id ?? 0
        if (!id) continue
        if (nxt[id] == null) nxt[id] = true
      }
      return nxt
    })
  }, [groups])

  const deliveredMut = useMutation({
    mutationFn: (assignmentId: number) => markDeliveryAssignmentDelivered(tenantId, assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-pending', tenantId], exact: false })
    },
  })

  const settleMut = useMutation({
    mutationFn: (body: { driver_id: number; payment_method_id: number; date: string; invoices: Array<{ invoice_id: number; amount?: number }> }) =>
      settleDeliveryInvoices(tenantId, body),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['delivery-pending', tenantId], exact: false })
      queryClient.invalidateQueries({ queryKey: ['delivery-ready', tenantId] })
      const n = res.payments?.length ?? 0
      setToast({ message: (t.delivery?.settledOk ?? 'تم تسجيل {n} تحصيل').replace('{n}', String(n)), type: 'success' })
      setSelected({})
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'خطأ')
      setToast({ message: msg, type: 'error' })
    },
  })

  const toggle = (driverId: number, invoiceId: number) => {
    setSelected((prev) => {
      const next = { ...prev }
      const set = new Set(next[driverId] ?? [])
      if (set.has(invoiceId)) set.delete(invoiceId)
      else set.add(invoiceId)
      next[driverId] = set
      return next
    })
  }

  const selectAllForDriver = (driverId: number, invoiceIds: number[]) => {
    setSelected((prev) => ({
      ...prev,
      [driverId]: new Set(invoiceIds),
    }))
  }

  const parseAmount = (driverId: number, invoiceId: number, balance: number) => {
    const raw = amountDrafts[amountKey(driverId, invoiceId)] ?? String(balance)
    const n = Number(String(raw).replace(/,/g, '').trim())
    return Number.isFinite(n) ? n : 0
  }

  const settleDriver = (driverId: number, invoiceIds: number[]) => {
    if (!paymentMethodId) {
      setToast({ message: t.delivery?.selectPaymentMethod ?? 'اختر طريقة الدفع', type: 'error' })
      return
    }
    if (invoiceIds.length === 0) return
    const group = groups.find((g) => g.driver?.id === driverId)
    const byInvoice = new Map((group?.assignments ?? []).map((a) => [a.invoice_id, a]))

    settleMut.mutate({
      driver_id: driverId,
      payment_method_id: paymentMethodId,
      date,
      invoices: invoiceIds.map((invoice_id) => {
        const a = byInvoice.get(invoice_id)
        const balance = Number(a?.invoice.balance ?? 0)
        const entered = parseAmount(driverId, invoice_id, balance)
        const amount = Math.min(Math.max(entered, 0), balance)
        // إذا مساوٍ للرصيد نتركها بدون amount لتقليل الضوضاء (نفس سلوك الباك إند)
        if (Math.abs(amount - balance) < 0.0005) return { invoice_id }
        return { invoice_id, amount }
      }),
    })
  }

  const getOldestDays = (assignments: PendingSettlementDriverGroup['assignments']) => {
    const samples = assignments
      .map((a) => a.assigned_at)
      .filter((x): x is string => !!x)
      .map((iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
    return samples.length ? Math.max(...samples) : 0
  }

  const kpis = useMemo(() => {
    const totalDrivers = groups.length
    const totalInvoices = groups.reduce((sum, d) => sum + d.assignments.length, 0)
    const totalCustody = groups.reduce(
      (sum, d) => sum + d.assignments.reduce((s, a) => s + Number(a.custody_amount ?? 0), 0),
      0,
    )
    const oldestDays = Math.max(0, ...groups.map((d) => getOldestDays(d.assignments)))
    return { totalDrivers, totalInvoices, totalCustody, oldestDays }
  }, [groups])

  const driverOptions = useMemo(() => {
    const m = new Map<number, string>()
    for (const g of groups) {
      const id = g.driver?.id
      if (!id) continue
      m.set(id, g.driver?.name ?? `سائق ${id}`)
    }
    return [...m.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'ar'))
  }, [groups])

  return (
    <div className="w-full max-w-full min-w-0 p-4 md:p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-medium text-slate-900 flex items-center gap-2">
            <span className="w-9 h-9 rounded-lg bg-[#E8F1FB] flex items-center justify-center">
              <Truck className="w-5 h-5 text-[#185FA5]" />
            </span>
            <span className="truncate">{t.delivery?.settlementTitle ?? 'تسوية عهدة السائقين'}</span>
          </h1>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center p-3 bg-white border border-slate-100 rounded-xl">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 whitespace-nowrap">{t.delivery?.settleDate ?? 'تاريخ التحصيل'}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
          />
        </div>

        <div className="w-px h-5 bg-slate-200 hidden sm:block" />

        <div className="flex items-center gap-2 min-w-[240px]">
          <label className="text-xs text-slate-500 whitespace-nowrap">{t.invoices.paymentMethod} *</label>
          <select
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white min-w-[12rem] w-full"
            value={paymentMethodId || ''}
            onChange={(e) => setPaymentMethodId(Number(e.target.value))}
          >
            <option value="">اختر طريقة الدفع (مرتبطة بصندوق/بنك)</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>{lang === 'ar' ? m.name : (m.name_en || m.name)}</option>
            ))}
          </select>
        </div>

        <div className="w-px h-5 bg-slate-200 hidden sm:block" />

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 whitespace-nowrap">السائق</label>
          <select
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white min-w-[12rem]"
            value={driverFilter}
            onChange={(e) => setDriverFilter(e.target.value)}
          >
            <option value="">جميع السائقين</option>
            {driverOptions.map(([id, name]) => (
              <option key={id} value={String(id)}>{name}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="text-sm bg-[#185FA5] text-white px-4 py-1.5 rounded-lg hover:bg-[#154f8a] disabled:opacity-50"
          disabled={pendingRes.isFetching}
          onClick={() => setAppliedDriverFilter(driverFilter)}
        >
          بحث
        </button>
      </div>

      {pendingRes.isLoading ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">⏳</div>
          <p className="text-sm">جاري تحميل بيانات العهدة...</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-sm font-medium text-slate-600">لا توجد فواتير معلقة</p>
          <p className="text-xs text-slate-400 mt-1">جميع عهدات السائقين مسوّاة</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">السائقون بعهدة معلقة</p>
              <p className="text-2xl font-medium text-slate-900">{new Intl.NumberFormat('ar-SA').format(kpis.totalDrivers)}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">إجمالي الفواتير المعلقة</p>
              <p className="text-2xl font-medium text-slate-900">{new Intl.NumberFormat('ar-SA').format(kpis.totalInvoices)}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">إجمالي العهدة</p>
              <p className="text-2xl font-medium text-red-600">{fmtMoney(kpis.totalCustody)}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">أقدم إسناد معلق</p>
              <p className={`text-2xl font-medium ${kpis.oldestDays > 7 ? 'text-red-600' : 'text-slate-900'}`}>
                {new Intl.NumberFormat('ar-SA').format(kpis.oldestDays)}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {groups.map((g) => {
              const driverId = g.driver?.id ?? 0
              if (!driverId) return null
              const invIds = g.assignments.map((a) => a.invoice_id)
              const sel = selected[driverId] ?? new Set<number>()
              const selectedList = invIds.filter((id) => sel.has(id))

              const driverTotal = g.assignments.reduce((sum, a) => sum + Number(a.custody_amount ?? 0), 0)
              const oldest = getOldestDays(g.assignments)

              const name = g.driver?.name ?? `سائق ${driverId}`
              const initials =
                name
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join('') || '—'

              const isOpen = expanded[driverId] ?? true

              return (
                <section key={driverId} className="bg-white border border-slate-100 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    className="w-full text-start"
                    onClick={() => setExpanded((p) => ({ ...p, [driverId]: !isOpen }))}
                  >
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100 flex-wrap gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-[#E8F1FB] flex items-center justify-center text-sm font-medium text-[#185FA5] shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900 truncate">{name}</p>
                            <span className="text-slate-400">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 truncate">
                            {new Intl.NumberFormat('ar-SA').format(g.assignments.length)} فاتورة معلقة
                            {g.driver?.custody_account_id ? ` · حساب العهدة: ${g.driver.custody_account_id}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-center">
                          <p className="text-base font-medium text-slate-900">{fmtMoney(driverTotal)}</p>
                          <p className="text-xs text-slate-400">إجمالي العهدة</p>
                        </div>
                        {oldest > 7 ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 whitespace-nowrap">
                            متأخرة {new Intl.NumberFormat('ar-SA').format(oldest)} يوم
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap">عهدة معلقة</span>
                        )}
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100">
                              <th className="text-right text-xs font-medium text-slate-400 px-3 py-2 w-10" />
                              <th className="text-right text-xs font-medium text-slate-400 px-3 py-2">رقم الفاتورة</th>
                              <th className="text-right text-xs font-medium text-slate-400 px-3 py-2">التاريخ</th>
                              <th className="text-right text-xs font-medium text-slate-400 px-3 py-2">العميل</th>
                              <th className="text-right text-xs font-medium text-slate-400 px-3 py-2">الفرع</th>
                              <th className="text-right text-xs font-medium text-slate-400 px-3 py-2">إجمالي الفاتورة</th>
                              <th className="text-right text-xs font-medium text-slate-400 px-3 py-2">المتبقي</th>
                              <th className="text-right text-xs font-medium text-slate-400 px-3 py-2">التسليم</th>
                              <th className="text-right text-xs font-medium text-slate-400 px-3 py-2">مبلغ التسوية</th>
                              <th className="text-right text-xs font-medium text-slate-400 px-3 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {g.assignments.map((a) => {
                              const daysSince = a.assigned_at
                                ? Math.floor((Date.now() - new Date(a.assigned_at).getTime()) / 86400000)
                                : 0
                              const k = amountKey(driverId, a.invoice_id)
                              return (
                                <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                  <td className="px-3 py-2.5 align-middle">
                                    <input
                                      type="checkbox"
                                      checked={sel.has(a.invoice_id)}
                                      onChange={() => toggle(driverId, a.invoice_id)}
                                    />
                                  </td>
                                  <td className="px-3 py-2.5 text-[#185FA5] font-medium font-mono">{a.invoice.number}</td>
                                  <td className={`px-3 py-2.5 text-xs ${daysSince > 7 ? 'text-red-500' : 'text-slate-400'}`}>
                                    {a.invoice.date}
                                    {daysSince > 7 && (
                                      <span className="mr-1">({new Intl.NumberFormat('ar-SA').format(daysSince)}ي)</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">{a.invoice.customer?.name ?? '—'}</td>
                                  <td className="px-3 py-2.5 text-slate-500">{a.invoice.branch?.name ?? '—'}</td>
                                  <td className="px-3 py-2.5 font-medium tabular-nums">{fmtMoney(Number(a.invoice.total ?? 0))}</td>
                                  <td className="px-3 py-2.5 tabular-nums">{fmtMoney(Number(a.invoice.balance ?? 0))}</td>
                                  <td className="px-3 py-2.5">
                                    {a.delivered_at ? (
                                      <span className="text-xs text-emerald-600">✓</span>
                                    ) : (
                                      <button
                                        type="button"
                                        className="text-xs text-[#185FA5] hover:underline"
                                        disabled={deliveredMut.isPending}
                                        onClick={() => deliveredMut.mutate(a.id)}
                                      >
                                        {t.delivery?.markDelivered ?? 'تسجيل تسليم'}
                                      </button>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={amountDrafts[k] ?? String(a.invoice.balance ?? 0)}
                                      onChange={(e) => setAmountDrafts((prev) => ({ ...prev, [k]: e.target.value }))}
                                      className="w-28 text-sm text-center border border-slate-200 rounded-lg px-2 py-1 focus:border-[#185FA5] focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <Link className="text-[#185FA5] text-xs hover:underline" to={`/invoices/return/${a.invoice_id}`}>
                                      {t.delivery?.returnLink ?? 'مرتجع'}
                                    </Link>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-500">إجمالي التسوية (المحدد):</span>
                          <span className="text-base font-medium text-[#185FA5] tabular-nums">
                            {fmtMoney(
                              selectedList.reduce((sum, invoiceId) => {
                                const a = g.assignments.find((x) => x.invoice_id === invoiceId)
                                const bal = Number(a?.invoice.balance ?? 0)
                                return sum + parseAmount(driverId, invoiceId, bal)
                              }, 0),
                            )}
                          </span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            type="button"
                            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                            onClick={() => selectAllForDriver(driverId, invIds)}
                          >
                            تحديد الكل
                          </button>
                          <button
                            type="button"
                            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            disabled={selectedList.length === 0 || settleMut.isPending}
                            onClick={() => settleDriver(driverId, selectedList)}
                          >
                            {t.delivery?.collectSelected ?? 'تحصيل المحدد'} ({new Intl.NumberFormat('ar-SA').format(selectedList.length)})
                          </button>
                          <button
                            type="button"
                            className="text-xs px-4 py-1.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 font-medium disabled:opacity-50"
                            disabled={invIds.length === 0 || settleMut.isPending}
                            onClick={() => settleDriver(driverId, invIds)}
                          >
                            ✓ تسوية العهدة (الكل)
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
