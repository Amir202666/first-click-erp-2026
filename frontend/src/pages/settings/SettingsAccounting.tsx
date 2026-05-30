import { useState, useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchSettings, updateSettings, fetchAccounts, fetchCurrencies, fetchAccountDefaults, updateAccountDefaults } from '../../api/tenant'
import type { TenantSettings, TenantAccountDefault, Account, Currency } from '../../types'
import { Landmark, Save, BookOpen, Package, Hash, CalendarClock } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import SearchableSelect from '../../components/ui/SearchableSelect'
import AccountingFiscalCloseTab from '../../components/settings/AccountingFiscalCloseTab'
import { buildDefaultAccountSelectOptions } from '../../utils/defaultAccountSelectOptions'

type AccountingTab = 'general' | 'defaults' | 'docs' | 'tax' | 'items_options' | 'ref_numbers' | 'fiscal_close'

function accountingTabFromParam(tab: string | null): AccountingTab {
  if (tab === 'fiscal_close' || tab === 'fiscal-close') return 'fiscal_close'
  if (tab === 'defaults' || tab === 'docs' || tab === 'tax' || tab === 'items_options' || tab === 'ref_numbers') return tab
  return 'general'
}

const DEFAULTS_KEYS = [
  'cash_account_id', 'bank_account_id', 'customers_account_id', 'vendors_account_id',
  'inventory_account_id', 'sales_account_id', 'sales_returns_account_id', 'cogs_account_id',
  'purchases_account_id', 'discounts_account_id', 'purchase_discounts_account_id', 'tax_payable_account_id', 'capital_account_id',
  'inventory_adjustment_gain_account_id', 'inventory_adjustment_loss_account_id',
] as const

const DEFAULTS_LABELS: Record<string, string> = {
  cash_account_id: 'الصندوق',
  bank_account_id: 'البنك',
  customers_account_id: 'العملاء',
  vendors_account_id: 'الموردون',
  inventory_account_id: 'المخزون',
  inventory_adjustment_gain_account_id: 'إيرادات تسويات جردية (زيادة)',
  inventory_adjustment_loss_account_id: 'مصروفات/عجز تسويات جردية (نقص)',
  sales_account_id: 'المبيعات',
  sales_returns_account_id: 'مرتجعات المبيعات',
  cogs_account_id: 'تكلفة المبيعات',
  purchases_account_id: 'المشتريات',
  discounts_account_id: 'خصم المبيعات',
  purchase_discounts_account_id: 'خصم المشتريات',
  tax_payable_account_id: 'الضرائب المستحقة',
  capital_account_id: 'رأس المال',
}

const KEYS = [
  'fiscal_year_start_month',
  'default_currency_id',
  'retained_earnings_account_id',
  'currency_diff_account_id',
  'tax_account_id',
  'auto_journal_entries_enabled',
  'post_immediately',
] as const

const DOC_KEYS = [
  'doc_default_currency_code',
  'doc_amount_decimals',
  'doc_quantity_decimals',
  'doc_rounding_mode',
] as const

const ITEM_OPTIONS_KEYS = [
  'invoice_use_serial_numbers',
  'invoice_show_serial_in_reports',
  'invoice_expiry_dates_enabled',
  'allow_negative_sale',
  'invoice_variants_sales_enabled',
  'invoice_variants_purchases_enabled',
] as const

/** تنسيقات الرقم المرجعي العامة */
const REF_NUMBER_FORMATS = [
  { value: 'month_year_seq', labelAr: 'الشهر/السنة/رقم متسلسل', labelEn: 'Month/Year/Sequential' },
  { value: 'year_seq', labelAr: 'السنة/رقم متسلسل', labelEn: 'Year/Sequential' },
  { value: 'sequential', labelAr: 'رقم تسلسلي', labelEn: 'Sequential Number' },
  { value: 'random', labelAr: 'رقم عشوائي', labelEn: 'Random Number' },
] as const

/** أنواع المستندات التي لها أرقام مرجعية */
const REF_NUMBER_DOCS: { key: string; labelAr: string }[] = [
  { key: 'pos', labelAr: 'نقاط البيع' },
  { key: 'sales', labelAr: 'المبيعات' },
  { key: 'quotes', labelAr: 'عروض الأسعار' },
  { key: 'returns', labelAr: 'المرتجعات' },
  { key: 'payments', labelAr: 'المدفوعات' },
  { key: 'purchases', labelAr: 'المشتريات' },
  { key: 'purchase_payments', labelAr: 'مدفوعات المشتريات' },
  { key: 'transfer', labelAr: 'تحويل المخزون' },
  { key: 'daily_expenses', labelAr: 'المشتريات والمصروفات اليومية' },
  { key: 'inventory_adjustment', labelAr: 'تسوية المخزون' },
  { key: 'delivery', labelAr: 'التسليم' },
  { key: 'release_orders', labelAr: 'أوامر الصرف المخزنية' },
]

const FISCAL_MONTHS = [
  { value: 1, label: 'يناير' }, { value: 2, label: 'فبراير' }, { value: 3, label: 'مارس' },
  { value: 4, label: 'أبريل' }, { value: 5, label: 'مايو' }, { value: 6, label: 'يونيو' },
  { value: 7, label: 'يوليو' }, { value: 8, label: 'أغسطس' }, { value: 9, label: 'سبتمبر' },
  { value: 10, label: 'أكتوبر' }, { value: 11, label: 'نوفمبر' }, { value: 12, label: 'ديسمبر' },
]

export default function SettingsAccounting() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<AccountingTab>(() => accountingTabFromParam(searchParams.get('tab')))
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [form, setForm] = useState<Record<string, string | number | boolean>>({})
  const [defaultsForm, setDefaultsForm] = useState<Record<string, string>>({})
  const [docsForm, setDocsForm] = useState<Record<string, string | number>>({})
  const [salesRepEnabled, setSalesRepEnabled] = useState(false)
  const [salesRepRequired, setSalesRepRequired] = useState(false)
  const [taxForm, setTaxForm] = useState<{ company_tax_number: string; default_vat_rate: number }>({ company_tax_number: '', default_vat_rate: 15 })
  const [refNumberFormat, setRefNumberFormat] = useState<string>('month_year_seq')
  const [refNumberDocs, setRefNumberDocs] = useState<Record<string, { prefix: string; per_branch: boolean }>>({})

  const { data: settings, isLoading } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId, 'postable'],
    queryFn: () => fetchAccounts(tenantId, { postable_only: '1', active_only: '1' }),
    enabled: !!tenantId && activeTab !== 'defaults',
  })

  const { data: defaultsAccounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId, 'defaults-settings'],
    queryFn: () => fetchAccounts(tenantId, { include_groups: '1', active_only: '1' }),
    enabled: !!tenantId && activeTab === 'defaults',
  })

  const { data: currencies = [] } = useQuery<Currency[]>({
    queryKey: ['currencies', tenantId],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId,
  })

  const { data: accountDefaults, isLoading: defaultsLoading } = useQuery<TenantAccountDefault>({
    queryKey: ['account-defaults', tenantId],
    queryFn: () => fetchAccountDefaults(tenantId),
    enabled: !!tenantId && (activeTab === 'defaults' || activeTab === 'tax'),
  })

  const updateDefaultsMut = useMutation({
    mutationFn: (data: Partial<TenantAccountDefault>) => updateAccountDefaults(tenantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-defaults'] })
      showToast(t.msg?.updatedSuccess ?? 'تم الحفظ بنجاح', 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg?.updateError ?? 'فشل التحديث', 'error'),
  })

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const updateMut = useMutation({
    mutationFn: (data: Partial<TenantSettings>) => updateSettings(tenantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      showToast(t.msg?.updatedSuccess ?? 'تم الحفظ بنجاح', 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg?.updateError ?? 'فشل التحديث', 'error'),
  })

  useEffect(() => {
    const tParam = searchParams.get('tab')
    if (tParam === 'templates') {
      setSearchParams({}, { replace: true })
      return
    }
    setActiveTab(accountingTabFromParam(tParam))
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!settings) return
    const next: Record<string, string | number | boolean> = {}
    KEYS.forEach((key) => {
      const val = settings[key]
      if (val === undefined || val === null) {
        if (key === 'fiscal_year_start_month') next[key] = 1
        else if (typeof val === 'boolean') next[key] = false
        else next[key] = ''
      } else {
        next[key] = val as string | number | boolean
      }
    })
    ITEM_OPTIONS_KEYS.forEach((key) => {
      const val = (settings as Record<string, unknown>)[key]
      if (val === undefined || val === null) {
        next[key] =
          key === 'invoice_variants_sales_enabled' || key === 'invoice_variants_purchases_enabled' || key === 'invoice_expiry_dates_enabled'
            ? true
            : false
      } else {
        next[key] = val === true || val === '1' || val === 1
      }
    })
    setForm(next)
    const docs: Record<string, string | number> = {}
    DOC_KEYS.forEach((key) => {
      const val = settings[key]
      if (val === undefined || val === null) {
        if (key === 'doc_amount_decimals' || key === 'doc_quantity_decimals') {
          docs[key] = 2
        } else if (key === 'doc_rounding_mode') {
          docs[key] = 'none'
        } else {
          docs[key] = ''
        }
      } else {
        docs[key] = val as string | number
      }
    })
    setDocsForm(docs)
    const srEnabled = (settings as Record<string, unknown>).sales_rep_enabled
    const srRequired = (settings as Record<string, unknown>).sales_rep_required
    setSalesRepEnabled(srEnabled === true || srEnabled === '1' || srEnabled === 1)
    setSalesRepRequired(srRequired === true || srRequired === '1' || srRequired === 1)
  }, [settings])

  useEffect(() => {
    if (!accountDefaults) return
    const next: Record<string, string> = {}
    DEFAULTS_KEYS.forEach((key) => {
      const val = (accountDefaults as any)[key]
      next[key] = val != null ? String(val) : ''
    })
    setDefaultsForm(next)
  }, [accountDefaults])

  useEffect(() => {
    if (!settings) return
    setTaxForm({
      company_tax_number: String((settings as Record<string, unknown>).company_tax_number ?? (currentTenant as Record<string, unknown> | null)?.tax_registration_number ?? ''),
      default_vat_rate: Number((settings as Record<string, unknown>).default_vat_rate ?? 15),
    })
  }, [settings, currentTenant])

  useEffect(() => {
    if (!settings) return
    const s = settings as Record<string, unknown>
    const refSettings = s.ref_number_settings as { format?: string; docs?: Record<string, { prefix?: string; per_branch?: boolean }> } | undefined
    if (refSettings) {
      setRefNumberFormat(refSettings.format ?? 'month_year_seq')
      const initial: Record<string, { prefix: string; per_branch: boolean }> = {}
      const docs = refSettings.docs && typeof refSettings.docs === 'object' ? refSettings.docs : {}
      REF_NUMBER_DOCS.forEach((d) => {
        const row = (docs as Record<string, { prefix?: string; per_branch?: boolean }>)[d.key] ?? {}
        initial[d.key] = { prefix: String(row.prefix ?? ''), per_branch: row.per_branch !== false }
      })
      setRefNumberDocs(initial)
    } else {
      const initial: Record<string, { prefix: string; per_branch: boolean }> = {}
      REF_NUMBER_DOCS.forEach((d) => {
        initial[d.key] = { prefix: '', per_branch: true }
      })
      setRefNumberDocs(initial)
    }
  }, [settings])

  const switchTab = (tab: AccountingTab) => {
    setActiveTab(tab)
    if (tab === 'defaults') {
      setSearchParams({ tab: 'defaults' })
    } else if (tab === 'docs') {
      setSearchParams({ tab: 'docs' })
    } else if (tab === 'tax') {
      setSearchParams({ tab: 'tax' })
    } else if (tab === 'items_options') {
      setSearchParams({ tab: 'items_options' })
    } else if (tab === 'ref_numbers') {
      setSearchParams({ tab: 'ref_numbers' })
    } else if (tab === 'fiscal_close') {
      setSearchParams({ tab: 'fiscal_close', view: searchParams.get('view') ?? 'list' })
    } else {
      setSearchParams({})
    }
  }

  const handleChange = (key: string, value: string | number | boolean) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      showToast('يجب اختيار الشركة أولاً', 'error')
      return
    }
    const payload: Partial<TenantSettings> = {}
    KEYS.forEach((key) => {
      const v = form[key]
      if (v !== undefined) payload[key] = v as string | number | boolean
    })
    updateMut.mutate(payload)
  }

  const handleDocsChange = (key: string, value: string | number) => {
    setDocsForm((f) => ({ ...f, [key]: value }))
  }

  const handleDocsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      showToast('يجب اختيار الشركة أولاً', 'error')
      return
    }
    const payload: Partial<TenantSettings> = {}
    DOC_KEYS.forEach((key) => {
      const v = docsForm[key]
      if (v !== undefined) payload[key] = v as string | number
    })
    payload.sales_rep_enabled = salesRepEnabled
    payload.sales_rep_required = salesRepRequired
    updateMut.mutate(payload)
  }

  const handleDefaultsChange = (key: string, value: string) => {
    setDefaultsForm((f) => ({ ...f, [key]: value }))
  }

  const handleDefaultsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      showToast('يجب اختيار الشركة أولاً', 'error')
      return
    }
    const payload: Record<string, number | null> = {}
    DEFAULTS_KEYS.forEach((key) => {
      const v = defaultsForm[key]
      payload[key] = v ? Number(v) : null
    })
    updateDefaultsMut.mutate(payload as Partial<TenantAccountDefault>)
  }

  const handleTaxSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      showToast('يجب اختيار الشركة أولاً', 'error')
      return
    }
    updateMut.mutate({
      company_tax_number: taxForm.company_tax_number || null,
      default_vat_rate: taxForm.default_vat_rate,
    })
  }

  const handleItemsOptionsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      showToast('يجب اختيار الشركة أولاً', 'error')
      return
    }
    const payload: Partial<TenantSettings> = {}
    ITEM_OPTIONS_KEYS.forEach((key) => {
      const v = form[key]
      if (v !== undefined) payload[key] = v as boolean
    })
    updateMut.mutate(payload)
  }

  const handleRefNumbersChangeDoc = (docKey: string, field: 'prefix' | 'per_branch', value: string | boolean) => {
    setRefNumberDocs((prev) => {
      const cur = prev[docKey] ?? { prefix: '', per_branch: true }
      return { ...prev, [docKey]: { ...cur, [field]: value } }
    })
  }

  const handleRefNumbersSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      showToast('يجب اختيار الشركة أولاً', 'error')
      return
    }
    const docs: Record<string, { prefix: string; per_branch: boolean }> = {}
    REF_NUMBER_DOCS.forEach((d) => {
      const cur = refNumberDocs[d.key] ?? { prefix: '', per_branch: true }
      docs[d.key] = { prefix: String(cur.prefix ?? '').trim(), per_branch: !!cur.per_branch }
    })
    updateMut.mutate({ ref_number_settings: { format: refNumberFormat, docs } } as unknown as Partial<TenantSettings>)
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const isLoadingCurrent = activeTab === 'defaults' ? defaultsLoading : activeTab === 'fiscal_close' ? false : isLoading

  const monthOptions = useMemo(
    () => FISCAL_MONTHS.map((m) => ({ value: m.value, label: m.label })),
    [],
  )

  const currencyOptions = useMemo(
    () =>
      currencies.map((c) => ({
        value: c.id,
        label: `${c.code} — ${c.name}`,
        primaryLabel: c.name,
        secondaryLabel: c.code,
        searchText: `${c.code} ${c.name}`,
      })),
    [currencies],
  )

  const currencyCodeOptions = useMemo(
    () =>
      currencies.map((c) => ({
        value: c.code,
        label: `${c.code} — ${c.name}`,
        primaryLabel: c.code,
        secondaryLabel: c.name,
        searchText: `${c.code} ${c.name}`,
      })),
    [currencies],
  )

  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: `${a.code} — ${a.name}`,
        primaryLabel: a.name,
        secondaryLabel: a.code,
        searchText: `${a.code} ${a.name}`,
      })),
    [accounts],
  )

  const defaultsAccountOptions = useMemo(
    () => buildDefaultAccountSelectOptions(defaultsAccounts),
    [defaultsAccounts],
  )

  const roundingOptions = useMemo(
    () => [
      { value: 'none', label: 'بدون تقريب' },
      { value: 'nearest', label: 'لأقرب رقم' },
      { value: 'up', label: 'تقريب لأعلى' },
      { value: 'down', label: 'تقريب لأسفل' },
    ],
    [],
  )

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
          <Landmark size={20} className="text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">إعدادات النظام المحاسبي</h1>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => switchTab('general')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'general' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          <BookOpen size={18} />
          السنة المالية والحسابات الافتراضية
        </button>
        <button
          type="button"
          onClick={() => switchTab('defaults')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'defaults' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          <Landmark size={18} />
          الحسابات الأساسية
        </button>
        <button
          type="button"
          onClick={() => switchTab('docs')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'docs' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          <BookOpen size={18} />
          إعدادات الفواتير والسندات
        </button>
        <button
          type="button"
          onClick={() => switchTab('tax')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'tax' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          <Landmark size={18} />
          الضرائب
        </button>
        <button
          type="button"
          onClick={() => switchTab('items_options')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'items_options' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          <Package size={18} />
          خيارات الأصناف
        </button>
        <button
          type="button"
          onClick={() => switchTab('fiscal_close')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'fiscal_close' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          <CalendarClock size={18} />
          {t.nav.settingsAccountingTabFiscalClose}
        </button>
        <button
          type="button"
          onClick={() => switchTab('ref_numbers')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'ref_numbers' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
        >
          <Hash size={18} />
          الأرقام المرجعية
        </button>
      </div>

      {!tenantId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          يرجى اختيار الشركة من أعلى الصفحة قبل تعديل الإعدادات.
        </div>
      )}

      {isLoadingCurrent ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : activeTab === 'fiscal_close' ? (
        <AccountingFiscalCloseTab />
      ) : activeTab === 'ref_numbers' ? (
        <form onSubmit={handleRefNumbersSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 flex flex-col md:flex-row-reverse gap-6">
            <div className="flex-1 overflow-auto">
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className={`text-right py-2.5 px-3 font-medium text-slate-700 ${textAlign}`}>نوع المستند</th>
                      <th className="text-center py-2.5 px-3 font-medium text-slate-700 w-56">تسلسل الأرقام حسب الفروع</th>
                      <th className="text-right py-2.5 px-3 font-medium text-slate-700 w-80">بداية الرقم (مثال: INV, PO)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {REF_NUMBER_DOCS.map((d) => {
                      const row = refNumberDocs[d.key] ?? { prefix: '', per_branch: true }
                      return (
                        <tr key={d.key} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="py-2 px-3 text-slate-800">{d.labelAr}</td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex justify-center">
                              <select
                                value={row.per_branch ? 'yes' : 'no'}
                                onChange={(e) => handleRefNumbersChangeDoc(d.key, 'per_branch', e.target.value === 'yes')}
                                className="w-full max-w-[180px] border border-slate-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                              >
                                <option value="yes">نعم</option>
                                <option value="no">لا</option>
                              </select>
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={row.prefix}
                              onChange={(e) => handleRefNumbersChangeDoc(d.key, 'prefix', e.target.value)}
                              className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                              placeholder="اختياري"
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="md:w-64 shrink-0 border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">تنسيق الرقم المرجعي *</label>
              <select
                value={refNumberFormat}
                onChange={(e) => setRefNumberFormat(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              >
                {REF_NUMBER_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.labelAr}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button type="submit" disabled={updateMut.isPending} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              <Save size={18} /> حفظ
            </button>
          </div>
        </form>
      ) : activeTab === 'items_options' ? (
        <form onSubmit={handleItemsOptionsSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0">
              <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>استخدام الارقام التسلسلية في الفواتير</label>
              <select
                value={form.invoice_use_serial_numbers ? '1' : '0'}
                onChange={(e) => handleChange('invoice_use_serial_numbers', e.target.value === '1')}
                className="w-full min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              >
                <option value="0">لا</option>
                <option value="1">نعم</option>
              </select>
            </div>
            <div className="min-w-0">
              <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>إظهار الأرقام التسلسلية في التقارير</label>
              <select
                value={form.invoice_show_serial_in_reports ? '1' : '0'}
                onChange={(e) => handleChange('invoice_show_serial_in_reports', e.target.value === '1')}
                className="w-full min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              >
                <option value="0">لا</option>
                <option value="1">نعم</option>
              </select>
            </div>
            <div className="min-w-0">
              <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>السماح بالبيع بالسالب </label>
              <select
                value={form.allow_negative_sale ? '1' : '0'}
                onChange={(e) => handleChange('allow_negative_sale', e.target.value === '1')}
                className="w-full min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              >
                <option value="1">نعم</option>
                <option value="0">لا</option>
              </select>
            </div>
            <div className="min-w-0">
              <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>المتغيرات في فواتير المبيعات</label>
              <select
                value={form.invoice_variants_sales_enabled ? '1' : '0'}
                onChange={(e) => handleChange('invoice_variants_sales_enabled', e.target.value === '1')}
                className="w-full min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              >
                <option value="0">لا</option>
                <option value="1">نعم</option>
              </select>
            </div>
            <div className="min-w-0">
              <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>المتغيرات في فواتير المشتريات</label>
              <select
                value={form.invoice_variants_purchases_enabled ? '1' : '0'}
                onChange={(e) => handleChange('invoice_variants_purchases_enabled', e.target.value === '1')}
                className="w-full min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              >
                <option value="0">لا</option>
                <option value="1">نعم</option>
              </select>
            </div>
            <div className="min-w-0">
              <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>
                تفعيل تاريخ الصلاحية في الفواتير
              </label>
              <select
                value={form.invoice_expiry_dates_enabled ? '1' : '0'}
                onChange={(e) => handleChange('invoice_expiry_dates_enabled', e.target.value === '1')}
                className="w-full min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              >
                <option value="0">لا</option>
                <option value="1">نعم</option>
              </select>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button type="submit" disabled={updateMut.isPending} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              <Save size={18} /> حفظ
            </button>
          </div>
        </form>
      ) : activeTab === 'tax' ? (
        <form onSubmit={handleTaxSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>الرقم الضريبي للمنشأة</label>
              <input
                type="text"
                value={taxForm.company_tax_number}
                onChange={(e) => setTaxForm((f) => ({ ...f, company_tax_number: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                placeholder="مثال: 123456789012345"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>نسبة ضريبة القيمة المضافة الافتراضية %</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={taxForm.default_vat_rate}
                onChange={(e) => setTaxForm((f) => ({ ...f, default_vat_rate: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              />
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button type="submit" disabled={updateMut.isPending} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              <Save size={18} /> حفظ
            </button>
          </div>
        </form>
      ) : activeTab === 'defaults' ? (
        <form onSubmit={handleDefaultsSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <p className="text-sm text-slate-600">ربط الحسابات الافتراضية لعمليات البيع والشراء. رأس المال لا يُستخدم تلقائياً.</p>
          </div>
          <div className="p-6 pb-28 grid gap-5 sm:grid-cols-2">
            {DEFAULTS_KEYS.map((key) => (
              <div key={key}>
                <SearchableSelect
                  label={
                    DEFAULTS_LABELS[key] +
                    (key === 'capital_account_id' ? ' (لا يُستخدم تلقائياً)' : '')
                  }
                  options={defaultsAccountOptions}
                  value={defaultsForm[key] ? Number(defaultsForm[key]) : null}
                  onChange={(v) => handleDefaultsChange(key, v != null && v !== '' ? String(v) : '')}
                  placeholder="—"
                  textAlign={isRtl ? 'right' : 'left'}
                  wrapOptions
                  dropdownMinWidth={320}
                />
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button type="submit" disabled={updateDefaultsMut.isPending} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              <Save size={18} /> حفظ
            </button>
          </div>
        </form>
      ) : activeTab === 'general' ? (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible">
          <div className="p-6 pb-28 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2">السنة المالية والحسابات الافتراضية</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <SearchableSelect
                label="بداية السنة المالية (الشهر)"
                options={monthOptions}
                value={Number(form.fiscal_year_start_month ?? 1)}
                onChange={(v) => handleChange('fiscal_year_start_month', Number(v ?? 1))}
                textAlign={isRtl ? 'right' : 'left'}
                dropdownMinWidth={220}
              />
              <SearchableSelect
                label="العملة الافتراضية"
                options={currencyOptions}
                value={form.default_currency_id ? Number(form.default_currency_id) : null}
                onChange={(v) => handleChange('default_currency_id', v != null && v !== '' ? Number(v) : '')}
                placeholder="—"
                textAlign={isRtl ? 'right' : 'left'}
                wrapOptions
                dropdownMinWidth={280}
              />
              <SearchableSelect
                label="حساب الأرباح المبقاة"
                options={accountOptions}
                value={form.retained_earnings_account_id ? Number(form.retained_earnings_account_id) : null}
                onChange={(v) => handleChange('retained_earnings_account_id', v != null && v !== '' ? Number(v) : '')}
                placeholder="—"
                textAlign={isRtl ? 'right' : 'left'}
                wrapOptions
                dropdownMinWidth={320}
              />
              <SearchableSelect
                label="حساب فروق العملة"
                options={accountOptions}
                value={form.currency_diff_account_id ? Number(form.currency_diff_account_id) : null}
                onChange={(v) => handleChange('currency_diff_account_id', v != null && v !== '' ? Number(v) : '')}
                placeholder="—"
                textAlign={isRtl ? 'right' : 'left'}
                wrapOptions
                dropdownMinWidth={320}
              />
              <SearchableSelect
                label="حساب الضرائب (افتراضي)"
                options={accountOptions}
                value={form.tax_account_id ? Number(form.tax_account_id) : null}
                onChange={(v) => handleChange('tax_account_id', v != null && v !== '' ? Number(v) : '')}
                placeholder="—"
                textAlign={isRtl ? 'right' : 'left'}
                wrapOptions
                dropdownMinWidth={320}
              />
            </div>
            <div className="flex flex-wrap gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!form.auto_journal_entries_enabled} onChange={(e) => handleChange('auto_journal_entries_enabled', e.target.checked)} className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-slate-700">تفعيل القيود التلقائية</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!form.post_immediately} onChange={(e) => handleChange('post_immediately', e.target.checked)} className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-slate-700">الترحيل الفوري</span>
              </label>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button type="submit" disabled={updateMut.isPending} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              <Save size={18} /> حفظ
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleDocsSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible">
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2">
              إعدادات الفواتير والسندات
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <SearchableSelect
                label="العملة الافتراضية للفواتير والسندات"
                options={currencyCodeOptions}
                value={docsForm.doc_default_currency_code ? String(docsForm.doc_default_currency_code) : null}
                onChange={(v) => handleDocsChange('doc_default_currency_code', v != null ? String(v) : '')}
                placeholder="—"
                textAlign={isRtl ? 'right' : 'left'}
                wrapOptions
                dropdownMinWidth={280}
              />
              <div>
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>عدد الكسور العشرية في المبالغ</label>
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={docsForm.doc_amount_decimals ?? 2}
                  onChange={(e) =>
                    handleDocsChange('doc_amount_decimals', Math.max(0, Math.min(4, Number(e.target.value) || 0)))
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>عدد الكسور العشرية في الكميات</label>
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={docsForm.doc_quantity_decimals ?? 2}
                  onChange={(e) =>
                    handleDocsChange('doc_quantity_decimals', Math.max(0, Math.min(4, Number(e.target.value) || 0)))
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                />
              </div>
              <SearchableSelect
                label="التقريب في المبالغ"
                options={roundingOptions}
                value={String(docsForm.doc_rounding_mode ?? 'none')}
                onChange={(v) => handleDocsChange('doc_rounding_mode', v != null ? String(v) : 'none')}
                textAlign={isRtl ? 'right' : 'left'}
                dropdownMinWidth={220}
              />
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200">
              <h3 className="text-base font-semibold text-slate-800 mb-3">خانة المندوب في الفواتير والسندات</h3>
             
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-slate-200 hover:bg-slate-50">
                  <span className="text-sm font-medium text-slate-700">تفعيل خانة المندوب في الفواتير والسندات</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={salesRepEnabled}
                    onClick={() => setSalesRepEnabled((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-2 ${salesRepEnabled ? 'bg-primary-600' : 'bg-slate-200'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${salesRepEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} style={{ marginTop: 1 }} />
                  </button>
                </div>
                <div className={`flex items-center justify-between gap-4 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 ${!salesRepEnabled ? 'opacity-60 pointer-events-none' : ''}`}>
                  <span className="text-sm font-medium text-slate-700">جعل اختيار المندوب إجبارياً</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={salesRepRequired}
                    disabled={!salesRepEnabled}
                    onClick={() => salesRepEnabled && setSalesRepRequired((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed ${salesRepRequired ? 'bg-primary-600' : 'bg-slate-200'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${salesRepRequired ? 'translate-x-5' : 'translate-x-0.5'}`} style={{ marginTop: 1 }} />
                  </button>
                </div>
              </div>
             
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              disabled={updateMut.isPending}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              <Save size={18} /> حفظ
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

