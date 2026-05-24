import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchCurrencies, createCurrency, updateCurrency, deleteCurrency, fetchExchangeRates, fetchSettings, updateSettings } from '../../api/tenant'
import type { Currency } from '../../types'
import { X } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'

type SortKey = 'id' | 'code' | 'name' | 'symbol' | 'decimals' | 'rate' | 'is_active'

const getCurrencyFlag = (code: string): string => {
  const flags: Record<string, string> = {
    KWD: '🇰🇼', SAR: '🇸🇦', AED: '🇦🇪', QAR: '🇶🇦',
    BHD: '🇧🇭', OMR: '🇴🇲', USD: '🇺🇸', EUR: '🇪🇺',
    GBP: '🇬🇧', EGP: '🇪🇬', JOD: '🇯🇴', TRY: '🇹🇷',
    INR: '🇮🇳', PKR: '🇵🇰', CNY: '🇨🇳', JPY: '🇯🇵',
  }
  return flags[code?.toUpperCase()] ?? '🌐'
}

export default function Currencies() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Currency | null>(null)
  const [form, setForm] = useState({ code: '', name: '', name_en: '', symbol: '', decimal_places: 2, exchange_rate: '1', is_default: false, is_active: true })
  const [deleteTarget, setDeleteTarget] = useState<Currency | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [reportCurrencyCode, setReportCurrencyCode] = useState<string>('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [lastFetchTime, setLastFetchTime] = useState<string | null>(null)

  const { data: currencies = [], isLoading } = useQuery<Currency[]>({
    queryKey: ['currencies', tenantId],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId,
  })

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  useEffect(() => {
    const code = (settings?.report_default_currency_code as string) ?? (currencies.find((c) => c.is_default)?.code ?? '')
    if (code && code !== reportCurrencyCode) setReportCurrencyCode(code)
  }, [settings?.report_default_currency_code, currencies, reportCurrencyCode])

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const fetchRatesMut = useMutation({
    mutationFn: () => fetchExchangeRates(tenantId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['currencies'] })
      setLastFetchTime(new Date().toISOString())
      showToast(res.message, res.failed?.length ? 'error' : 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg?.addError ?? 'Error', 'error'),
  })

  const handleFetchRates = async () => {
    try {
      await fetchRatesMut.mutateAsync()
    } catch {
      /* errors surfaced via onError */
    }
  }

  const saveReportCurrencyMut = useMutation({
    mutationFn: (code: string) => updateSettings(tenantId, { report_default_currency_code: code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      showToast(t.currencies.saveSettings ? 'تم حفظ العملة الافتراضية للتقارير' : 'Saved', 'success')
    },
    onError: () => showToast(t.msg?.updateError ?? 'Error', 'error'),
  })

  const createMut = useMutation({
    mutationFn: (d: Partial<Currency>) => createCurrency(tenantId, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['currencies'] }); closeModal(); showToast(t.msg.addedSuccess, 'success') },
    onError: () => showToast(t.msg.addError, 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: Partial<Currency> }) => updateCurrency(tenantId, id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['currencies'] }); closeModal(); showToast(t.msg.updatedSuccess, 'success') },
    onError: () => showToast(t.msg.updateError, 'error'),
  })

  const setDefaultMut = useMutation({
    mutationFn: (id: number) => updateCurrency(tenantId, id, { is_default: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currencies'] })
      showToast(t.msg.updatedSuccess, 'success')
    },
    onError: () => showToast(t.msg.updateError, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCurrency(tenantId, id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['currencies'] }); setDeleteTarget(null); showToast(t.msg.deletedSuccess, 'success') },
    onError: (err: any) => { setDeleteTarget(null); showToast(err?.response?.data?.message ?? t.msg.deleteError, 'error') },
  })

  function closeModal() { setShowModal(false); setEditing(null); setForm({ code: '', name: '', name_en: '', symbol: '', decimal_places: 2, exchange_rate: '1', is_default: false, is_active: true }) }

  function openEdit(c: Currency) {
    setEditing(c)
    setForm({
      code: c.code,
      name: c.name,
      name_en: c.name_en ?? '',
      symbol: c.symbol ?? '',
      decimal_places: c.decimal_places ?? 2,
      exchange_rate: String(c.exchange_rate ?? 1),
      is_default: !!c.is_default,
      is_active: !!c.is_active,
    })
    setShowModal(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      code: form.code.toUpperCase(),
      name: form.name,
      name_en: form.name_en || null,
      symbol: form.symbol || null,
      decimal_places: form.decimal_places,
      exchange_rate: parseFloat(form.exchange_rate) || 1,
      is_default: form.is_default,
      is_active: form.is_active,
    }
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  function handleDelete(id: number) {
    const c = currencies.find((x) => x.id === id)
    if (!c) return
    if (c.is_default) {
      showToast(t.currencies.cannotDeleteDefault, 'error')
      return
    }
    setDeleteTarget(c)
  }

  function handleSetDefault(id: number) {
    setDefaultMut.mutate(id)
  }

  const handleSortToggle = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir('asc')
    }
  }

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const sortLocale = lang === 'ar' ? 'ar' : 'en'

  const filteredCurrencies = useMemo(() => {
    let list = [...currencies]

    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter((c) =>
        String(c.id).includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q) ||
        (c.symbol?.toLowerCase().includes(q) ?? false) ||
        (c.name_en?.toLowerCase().includes(q) ?? false),
      )
    }

    if (sortBy) {
      list.sort((a, b) => {
        let av: string | number
        let bv: string | number
        switch (sortBy) {
          case 'id': av = a.id ?? 0; bv = b.id ?? 0; break
          case 'code': av = a.code ?? ''; bv = b.code ?? ''; break
          case 'name': av = a.name ?? ''; bv = b.name ?? ''; break
          case 'symbol': av = a.symbol ?? ''; bv = b.symbol ?? ''; break
          case 'decimals': av = Number(a.decimal_places ?? 2); bv = Number(b.decimal_places ?? 2); break
          case 'rate': av = Number(a.exchange_rate ?? 1); bv = Number(b.exchange_rate ?? 1); break
          case 'is_active': av = a.is_active ? 1 : 0; bv = b.is_active ? 1 : 0; break
          default: return 0
        }
        let cmp: number
        if (typeof av === 'number' && typeof bv === 'number') {
          cmp = av - bv
        } else {
          cmp = String(av).localeCompare(String(bv), sortLocale)
        }
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return list
  }, [currencies, search, sortBy, sortDir, sortLocale])

  const totalCurrencies = currencies.length
  const activeCurrencies = currencies.filter((c) => c.is_active).length
  const defaultRow = currencies.find((c) => c.is_default)
  const lastRateDate = useMemo(() => {
    let latest = ''
    for (const c of currencies) {
      const d = c.rate_date
      if (d && String(d) > latest) latest = String(d)
    }
    return latest
  }, [currencies])

  const dateLocale = lang === 'ar' ? 'ar-KW' : 'en-US'
  const kpiItems = useMemo(() => [
    { label: t.currencies.kpiTotal, value: String(totalCurrencies), color: 'text-blue-600' },
    { label: t.currencies.kpiActive, value: String(activeCurrencies), color: 'text-emerald-600' },
    { label: t.currencies.kpiDefaultLabel, value: defaultRow?.symbol ?? '—', color: 'text-amber-600' },
    {
      label: t.currencies.kpiLastRateUpdate,
      value: lastRateDate ? new Date(lastRateDate).toLocaleDateString(dateLocale) : '—',
      color: 'text-gray-500',
    },
  ], [t.currencies, totalCurrencies, activeCurrencies, defaultRow?.symbol, lastRateDate, dateLocale])

  const tableColumns: { label: string; sortKey: SortKey | null }[] = [
    { label: t.currencies.currencyNumber, sortKey: 'id' },
    { label: t.currencies.currencyCode, sortKey: 'code' },
    { label: t.currencies.currencyName, sortKey: 'name' },
    { label: t.currencies.symbol, sortKey: 'symbol' },
    { label: t.currencies.decimalsShort, sortKey: 'decimals' },
    { label: t.currencies.exchangeRate, sortKey: 'rate' },
    { label: t.currencies.defaultShort, sortKey: null },
    { label: t.status, sortKey: 'is_active' },
    { label: t.actions, sortKey: null },
  ]

  const isSaving = createMut.isPending || updateMut.isPending
  const dir = isRtl ? 'rtl' : 'ltr'

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-5" dir={dir}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-lg shadow-sm">
            💱
          </div>
          <h1 className="text-xl font-bold text-gray-900">{t.currencies.title}</h1>
        </div>
        <button
          type="button"
          onClick={() => { setForm({ code: '', name: '', name_en: '', symbol: '', decimal_places: 2, exchange_rate: '1', is_default: false, is_active: true }); setEditing(null); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-l from-emerald-500 to-emerald-600 text-white rounded-xl text-sm font-semibold shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:shadow-[0_6px_16px_rgba(16,185,129,0.4)] hover:-translate-y-0.5 transition-all"
        >
          <span className="text-base">+</span>
          {t.currencies.addCurrency}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5" dir={dir}>
        {kpiItems.map((kpi) => (
          <div key={kpi.label} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
            <p className="text-[10px] text-gray-400 font-semibold mb-1">{kpi.label}</p>
            <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5" dir={dir}>
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1">
            ⭐ {t.currencies.reportDefaultCurrency}
          </p>
          <select
            value={reportCurrencyCode}
            onChange={(e) => setReportCurrencyCode(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:border-emerald-400 focus:outline-none bg-gray-50 focus:bg-white transition-colors"
          >
            <option value="">—</option>
            {currencies.filter((c) => c.is_active).map((c) => (
              <option key={c.id} value={c.code}>{c.symbol ?? c.code} — {c.name}</option>
            ))}
          </select>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1">
            🔄 {t.currencies.fetchRates}
          </p>
          <button
            type="button"
            onClick={handleFetchRates}
            disabled={fetchRatesMut.isPending || currencies.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className={fetchRatesMut.isPending ? 'inline-block animate-spin' : ''}>🔄</span>
            {fetchRatesMut.isPending ? t.currencies.fetchingRates : t.currencies.fetchRates}
          </button>
          {lastFetchTime && (
            <p className="text-[10px] text-gray-400 mt-2">
              {t.currencies.lastUpdatedPrefix} {new Date(lastFetchTime).toLocaleTimeString(dateLocale)}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden" dir={dir}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 gap-3 flex-wrap">
          <p className="text-sm font-bold text-gray-700">{t.currencies.currencyList}</p>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`🔍 ${t.currencies.searchCurrency}`}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-gray-50 focus:border-emerald-400 focus:outline-none w-44"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {tableColumns.map((col) => (
                    <th
                      key={col.label}
                      onClick={() => col.sortKey && handleSortToggle(col.sortKey)}
                      className={`text-right text-[10px] font-bold text-gray-400 uppercase tracking-wide px-4 py-3 whitespace-nowrap
                        ${col.sortKey ? 'cursor-pointer hover:text-gray-600' : ''}`}
                    >
                      {col.label}
                      {col.sortKey && sortBy === col.sortKey && (
                        <span className="mr-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currencies.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-gray-400">{t.currencies.noCurrencies}</td>
                  </tr>
                ) : filteredCurrencies.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-gray-400">{t.currencies.searchNoResults}</td>
                  </tr>
                ) : (
                  filteredCurrencies.map((currency) => {
                    const dec = coerceDecimalPlaces(currency.decimal_places, 2)
                    const numSlots = Math.max(3, Math.min(dec, 4))
                    return (
                      <tr
                        key={currency.id}
                        className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors"
                      >
                        <td className="px-4 py-3 tabular-nums text-gray-600 font-semibold">
                          {currency.id}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block text-[11px] font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-700 font-mono tracking-wider">
                            {currency.code}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xl leading-none flex-shrink-0">
                              {getCurrencyFlag(currency.code)}
                            </span>
                            <div>
                              <p className="font-semibold text-gray-900 text-sm">{currency.name}</p>
                              <p className="text-[10px] text-gray-400">{currency.name_en ?? currency.code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-base font-bold text-gray-700">{currency.symbol ?? '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {Array.from({ length: numSlots }, (_, i) => (
                              <div
                                key={i}
                                className={`w-2 h-2 rounded-full transition-all ${
                                  i < dec ? 'bg-emerald-500' : 'bg-gray-200'
                                }`}
                              />
                            ))}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">
                            {dec} {t.currencies.fractionsSuffix}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold tabular-nums text-gray-800">
                            {formatAmount(Number(currency.exchange_rate ?? 1), currency, locale)}
                          </p>
                          {currency.is_default ? (
                            <p className="text-[10px] text-gray-400">{t.currencies.rateBaseLabel}</p>
                          ) : (
                            <p className="text-[10px] text-emerald-600">
                              {currency.rate_date ? t.currencies.rateUpdatedHint : '—'}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {currency.is_default ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                              ⭐ {t.currencies.defaultCurrency}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(currency.id)}
                              disabled={setDefaultMut.isPending}
                              className="text-[10px] px-2.5 py-1 rounded-lg bg-gray-50 text-gray-500 border border-gray-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 transition-colors font-medium disabled:opacity-50"
                            >
                              {t.currencies.setAsDefault}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-semibold
                            ${currency.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${currency.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                            {currency.is_active ? t.active : t.inactive}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEdit(currency)}
                              className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center text-sm transition-colors"
                              title={t.edit}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(currency.id)}
                              disabled={currency.is_default}
                              className="w-8 h-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title={currency.is_default ? t.currencies.cannotDeleteDefaultTitle : t.delete}
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-end px-5 py-3.5 border-t border-gray-100 gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => reportCurrencyCode && saveReportCurrencyMut.mutate(reportCurrencyCode)}
            disabled={saveReportCurrencyMut.isPending || !reportCurrencyCode}
            className="px-5 py-2 bg-gradient-to-l from-emerald-500 to-emerald-600 text-white rounded-xl text-sm font-semibold shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveReportCurrencyMut.isPending ? t.saving : `✓ ${t.currencies.saveSettings}`}
          </button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">{editing ? t.currencies.editCurrency : t.currencies.addCurrency}</h3>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.currencies.currencyCode} *</label>
                  <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} maxLength={3}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none font-mono uppercase" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.currencies.symbol}</label>
                  <input type="text" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.currencies.currencyName} *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.nameEn}</label>
                <input type="text" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" dir="ltr" placeholder="English name (optional)" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.currencies.decimalPlaces}</label>
                  <input type="number" min={0} max={4} value={form.decimal_places} onChange={(e) => setForm({ ...form, decimal_places: Math.max(0, Math.min(4, parseInt(e.target.value, 10) || 0)) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none font-mono" />
                  <p className="text-xs text-slate-400 mt-0.5">{t.currencies.decimalPlacesHint}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.currencies.exchangeRate} *</label>
                  <input type="number" value={form.exchange_rate} onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none font-mono"
                    required min="0" step="any" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="cur-is-default" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                  <label htmlFor="cur-is-default" className="text-sm font-medium text-slate-700">{t.currencies.isDefault}</label>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="cur-is-active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                  <label htmlFor="cur-is-active" className="text-sm font-medium text-slate-700">{t.active}</label>
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">{t.cancel}</button>
                <button type="submit" disabled={isSaving} className="bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50 transition-colors">
                  {isSaving ? t.saving : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t.currencies.deleteCurrency}
          message={t.currencies.confirmDelete.replace('{name}', deleteTarget.name)}
          confirmLabel={t.delete}
          variant="danger"
          isLoading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
