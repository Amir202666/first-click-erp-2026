import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchInstallment,
  createInstallment,
  updateInstallment,
  approveInstallment,
  fetchCustomers,
  fetchVendors,
  fetchBranches,
  fetchAccounts,
  fetchPaymentMethods,
  payInstallmentLine,
  fetchCostCenters,
} from '../../api/tenant'
import type { Customer } from '../../types'
import { toLocalDateString } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { asArray } from '../../utils/asArray'
import { ArrowLeft, CircleDollarSign } from 'lucide-react'
import { Link } from 'react-router-dom'
import Toast from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
type LineRow = { sequence: number; due_date: string; amount: number; interest?: number; isDownPayment?: boolean }

type PeriodType = 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'manual'

function periodTypeToMonths(p: PeriodType): number {
  switch (p) {
    case 'quarterly':
      return 3
    case 'semi_annual':
      return 6
    case 'annual':
      return 12
    case 'manual':
    case 'monthly':
    default:
      return 1
  }
}

function addMonthsToYmd(startYmd: string, months: number): string {
  const d = new Date(`${startYmd}T12:00:00`)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() !== day) {
    d.setDate(0)
  }
  return toLocalDateString(d)
}

export default function InstallmentForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const { currentTenant } = useAuth()
  const { t, lang } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [customerId, setCustomerId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [totalPrincipal, setTotalPrincipal] = useState(0)
  const [startDate, setStartDate] = useState(() => toLocalDateString(new Date()))
  const [installmentCount, setInstallmentCount] = useState(12)
  const [installmentAmount, setInstallmentAmount] = useState(0)
  const [interestRate, setInterestRate] = useState(0)
  const [downPayment, setDownPayment] = useState(0)
  const [downPaymentType, setDownPaymentType] = useState<'fixed' | 'percent'>('fixed')
  const [periodType, setPeriodType] = useState<PeriodType>('monthly')
  const [branchId, setBranchId] = useState('')
  const [costCenterId, setCostCenterId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineRow[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [payModal, setPayModal] = useState<{ lineId: number; remaining: number; seq: number } | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(() => toLocalDateString(new Date()))
  const [payPaymentMethodId, setPayPaymentMethodId] = useState('')
  const [payCashBankAccountId, setPayCashBankAccountId] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null)
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)

  const { data: installment, isLoading: loadingInstallment } = useQuery({
    queryKey: ['installment', tenantId, id],
    queryFn: () => fetchInstallment(tenantId, Number(id)),
    enabled: !!tenantId && isEdit && !!id,
  })

  const branchIdNum = branchId ? Number(branchId) : null
  const { data: customersData } = useQuery({
    queryKey: ['customers', tenantId, branchId],
    queryFn: () =>
      fetchCustomers(tenantId, {
        per_page: '500',
        ...(branchIdNum != null && !Number.isNaN(branchIdNum) ? { branch_id: String(branchIdNum) } : {}),
      }),
    enabled: !!tenantId,
  })
  const { data: vendorsData } = useQuery({
    queryKey: ['vendors', tenantId, branchId],
    queryFn: () =>
      fetchVendors(tenantId, {
        per_page: '500',
        ...(branchIdNum != null && !Number.isNaN(branchIdNum) ? { branch_id: String(branchIdNum) } : {}),
      }),
    enabled: !!tenantId,
  })
  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const { data: costCentersData } = useQuery({
    queryKey: ['costCenters', tenantId],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', tenantId, 'active'],
    queryFn: () => fetchAccounts(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })
  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment-methods', tenantId, 'active'],
    queryFn: () => fetchPaymentMethods(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })
  const customers = asArray<Customer>(customersData)
  const vendors = asArray<{ id: number; name: string }>(vendorsData)
  const branches = asArray<{ id: number; name: string }>(branchesData)
  const costCenters = asArray<{ id: number; name: string; name_en?: string | null }>(costCentersData)

  useEffect(() => {
    if (!installment) return
    setCustomerId(installment.customer_id != null ? String(installment.customer_id) : '')
    setVendorId(installment.vendor_id != null ? String(installment.vendor_id) : '')
    setAccountId(installment.account_id != null ? String(installment.account_id) : '')
    setTotalPrincipal(Number(installment.total_amount) || 0)
    setStartDate(installment.start_date?.slice?.(0, 10) ?? toLocalDateString(new Date()))
    const n = installment.lines?.length ?? 12
    setInstallmentCount(Math.max(1, n))
    const fm = installment.frequency_months ?? 1
    if (fm === 3) setPeriodType('quarterly')
    else if (fm === 6) setPeriodType('semi_annual')
    else if (fm === 12) setPeriodType('annual')
    else setPeriodType('monthly')
    setBranchId(installment.branch_id ? String(installment.branch_id) : '')
    setCostCenterId(installment.cost_center_id != null ? String(installment.cost_center_id) : '')
    setNotes(installment.notes ?? '')
    setDownPayment(0)
    setInterestRate(0)
    if ((installment.lines ?? []).length > 0) {
      setLines(
        (installment.lines ?? []).map((l) => ({
          sequence: l.sequence,
          due_date: l.due_date?.slice?.(0, 10) ?? '',
          amount: Number(l.amount),
          interest: 0,
        }))
      )
    }
  }, [installment])

  const frequencyMonths = periodTypeToMonths(periodType)

  const selectedCustomer = useMemo(() => {
    if (!customerId) return null
    return customers.find((c) => String(c.id) === customerId) ?? null
  }, [customers, customerId])

  /** اقتراح قيمة القسط من أصل المبلغ بعد الدفعة الأولى والفائدة */
  useEffect(() => {
    if (isEdit) return
    if (totalPrincipal <= 0 || installmentCount <= 0) {
      setInstallmentAmount(0)
      return
    }
    const downVal =
      downPaymentType === 'percent' ? (totalPrincipal * downPayment) / 100 : downPayment
    const remaining = Math.max(0, totalPrincipal - downVal)
    const interest = remaining * (interestRate / 100)
    const per = Math.round(((remaining + interest) / installmentCount) * 1000) / 1000
    setInstallmentAmount(per)
  }, [totalPrincipal, installmentCount, downPayment, downPaymentType, interestRate, isEdit])

  const createMut = useMutation({
    mutationFn: (payload: Parameters<typeof createInstallment>[1]) => createInstallment(tenantId, payload),
    onSuccess: () => {
      setSaveError(null)
      queryClient.invalidateQueries({ queryKey: ['installments', tenantId] })
      navigate('/installments')
    },
    onError: (err: { response?: { data?: { message?: string; errors?: Record<string, string[]> } }; message?: string }) => {
      const data = err.response?.data
      const msg = data?.message || (data?.errors ? Object.values(data.errors).flat().join(' ') : null) || err.message || (lang === 'ar' ? 'فشل الحفظ. تحقق من الاتصال أو من البيانات.' : 'Save failed. Check connection or data.')
      setSaveError(msg)
    },
  })

  const updateMut = useMutation({
    mutationFn: (payload: Parameters<typeof updateInstallment>[2]) => updateInstallment(tenantId, Number(id), payload),
    onSuccess: () => {
      setSaveError(null)
      queryClient.invalidateQueries({ queryKey: ['installments', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['installment', tenantId, id] })
    },
    onError: (err: { response?: { data?: { message?: string; errors?: Record<string, string[]> } }; message?: string }) => {
      const data = err.response?.data
      const msg = data?.message || (data?.errors ? Object.values(data.errors).flat().join(' ') : null) || err.message || (lang === 'ar' ? 'فشل التعديل.' : 'Update failed.')
      setSaveError(msg)
    },
  })

  const approveMut = useMutation({
    mutationFn: () => approveInstallment(tenantId, Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['installment', tenantId, id] })
      setToast({ message: t.installments?.approveSuccess ?? 'تم اعتماد الجدول.', type: 'success' })
    },
  })

  const totalFromLines = useMemo(() => lines.reduce((s, l) => s + Number(l.amount), 0), [lines])
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(n, { decimal_places: 3 }, locale)

  const downPaymentValue = useMemo(() => {
    if (totalPrincipal <= 0) return 0
    return downPaymentType === 'percent' ? (totalPrincipal * downPayment) / 100 : downPayment
  }, [totalPrincipal, downPayment, downPaymentType])

  const remainingAfterDown = useMemo(
    () => Math.max(0, totalPrincipal - Math.min(downPaymentValue, totalPrincipal)),
    [totalPrincipal, downPaymentValue],
  )

  const interestOnFinanced = useMemo(
    () => remainingAfterDown * (interestRate / 100),
    [remainingAfterDown, interestRate],
  )

  const expectedScheduleSum = useMemo(
    () => Math.round((totalPrincipal + interestOnFinanced) * 1000) / 1000,
    [totalPrincipal, interestOnFinanced],
  )

  function generateSchedule() {
    if (isEdit) return
    if (totalPrincipal <= 0 || installmentCount <= 0) return
    const dVal = Math.min(Math.max(0, downPaymentValue), totalPrincipal)
    const rem = Math.max(0, totalPrincipal - dVal)
    const interestT = rem * (interestRate / 100)
    const totalFinanced = rem + interestT
    const periodMonths = frequencyMonths
    const rows: LineRow[] = []
    let seq = 1
    if (dVal > 0.0005) {
      rows.push({
        sequence: seq++,
        due_date: startDate,
        amount: Math.round(dVal * 1000) / 1000,
        interest: 0,
        isDownPayment: true,
      })
    }
    const perUnit =
      installmentAmount > 0 ? installmentAmount : installmentCount > 0 ? totalFinanced / installmentCount : 0
    let allocated = 0
    const intPer = installmentCount > 0 ? interestT / installmentCount : 0
    for (let i = 0; i < installmentCount; i++) {
      const isLast = i === installmentCount - 1
      const raw = isLast ? totalFinanced - allocated : Math.round(perUnit * 1000) / 1000
      const amt = Math.round(Math.max(0, raw) * 1000) / 1000
      allocated += amt
      rows.push({
        sequence: seq++,
        due_date: addMonthsToYmd(startDate, periodMonths * (i + 1)),
        amount: amt,
        interest: Math.round(intPer * 1000) / 1000,
      })
    }
    setLines(rows)
  }

  function updateLineRow(index: number, field: 'due_date' | 'amount', value: string | number) {
    setLines((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    )
  }

  function handleSave() {
    setSaveError(null)
    const isVendor = !!vendorId && !customerId
    if ((!customerId && !vendorId) || lines.length === 0) {
      const msg = lang === 'ar' ? 'اختر العميل/المورد وتوليد الجدول أولاً.' : 'Select partner and generate schedule first.'
      setSaveError(msg)
      return
    }
    if (isVendor && !accountId) {
      setSaveError(lang === 'ar' ? 'لجدول المورد يجب اختيار حساب التزام الأقساط (account).' : 'Vendor schedule requires an installment liability account.')
      return
    }
    const lineSum = Math.round(totalFromLines * 1000) / 1000
    const payload = {
      customer_id: customerId ? Number(customerId) : null,
      vendor_id: vendorId ? Number(vendorId) : null,
      account_id: accountId ? Number(accountId) : null,
      total_amount: lineSum > 0 ? lineSum : Math.max(0.001, Math.round(totalPrincipal * 1000) / 1000),
      start_date: startDate,
      frequency_months: Math.min(12, Math.max(1, frequencyMonths)),
      branch_id: branchId ? Number(branchId) : null,
      cost_center_id: costCenterId ? Number(costCenterId) : null,
      notes: notes.trim() || undefined,
      lines: lines.map((l) => ({
        sequence: l.sequence,
        due_date: l.due_date,
        amount: Number(l.amount),
      })),
    }
    if (isEdit) {
      updateMut.mutate({
        total_amount: payload.total_amount,
        start_date: payload.start_date,
        branch_id: payload.branch_id,
        cost_center_id: payload.cost_center_id,
        notes: payload.notes,
        lines: payload.lines,
      })
    } else {
      createMut.mutate(payload)
    }
  }

  if (isEdit && loadingInstallment) {
    return <div className="p-6">{t.loading}</div>
  }
  if (isEdit && !installment) {
    return <div className="p-6">{t.msg?.notFound ?? 'Not found'}</div>
  }

  const canEdit = !installment || installment.status === 'draft'
  const isVendorSchedule = !!vendorId && !customerId

  const placeholders = {
    customer: t.installments?.selectCustomer ?? 'اختر العميل',
    vendor: lang === 'ar' ? 'اختر المورد' : 'Select vendor',
    totalAmount: t.installments?.totalAmount ?? 'المبلغ الإجمالي',
    branch: lang === 'ar' ? 'الفرع' : 'Branch',
    costCenter: t.installments?.costCenterField ?? (lang === 'ar' ? 'مركز التكلفة' : 'Cost center'),
    startDate: t.installments?.startDate ?? 'تاريخ البداية',
    numInstallments: t.installments?.numInstallments ?? 'عدد الأقساط',
    frequency: t.installments?.frequencyMonths ?? 'فترة الاستحقاق (شهر)',
    periodCycles: t.installments?.periodCycles ?? (lang === 'ar' ? 'دوريات الأقساط' : 'Installment periods'),
    notes: t.installments?.notes ?? 'ملاحظات',
    account: lang === 'ar' ? 'حساب التزام الأقساط (مورد)' : 'Installment liability account (vendor)',
  }

  const customerBalance =
    selectedCustomer && 'balance' in selectedCustomer
      ? Number((selectedCustomer as Customer & { balance?: number }).balance)
      : null

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          position="center"
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          onClose={() => setToast(null)}
        />
      )}
      <div className="flex items-center gap-3">
        <Link to="/installments" className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">
          {isEdit ? (t.installments?.editTitle ?? 'تعديل جدول التقسيط') : (t.installments?.createTitle ?? 'جدول تقسيط جديد')}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">البيانات الأساسية</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] text-gray-400">{placeholders.startDate}</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isEdit && !!installment}
                  className="w-full rounded-lg border border-gray-200 py-1.5 px-2.5 text-sm text-gray-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-gray-400">{placeholders.customer}</label>
                <select
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value)
                    if (e.target.value) setVendorId('')
                  }}
                  disabled={isEdit}
                  className="w-full rounded-lg border border-gray-200 bg-white py-1.5 px-2.5 text-sm text-gray-800"
                >
                  <option value="">{placeholders.customer}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-gray-400">{placeholders.vendor}</label>
                <select
                  value={vendorId}
                  onChange={(e) => {
                    setVendorId(e.target.value)
                    if (e.target.value) setCustomerId('')
                  }}
                  disabled={isEdit}
                  className="w-full rounded-lg border border-gray-200 bg-white py-1.5 px-2.5 text-sm text-gray-800"
                >
                  <option value="">{placeholders.vendor}</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={String(v.id)}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-gray-400">{placeholders.branch}</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white py-1.5 px-2.5 text-sm text-gray-800"
                >
                  <option value="">{placeholders.branch}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[10px] text-gray-400">{placeholders.costCenter}</label>
                <select
                  value={costCenterId}
                  onChange={(e) => setCostCenterId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white py-1.5 px-2.5 text-sm text-gray-800"
                >
                  <option value="">{placeholders.costCenter}</option>
                  {costCenters.map((cc) => (
                    <option key={cc.id} value={String(cc.id)}>
                      {lang === 'ar' ? cc.name : cc.name_en || cc.name}
                    </option>
                  ))}
                </select>
              </div>
              {isVendorSchedule && (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[10px] text-gray-400">{placeholders.account}</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    disabled={isEdit && !!installment}
                    className="w-full rounded-lg border border-gray-200 bg-white py-1.5 px-2.5 text-sm text-gray-800"
                  >
                    <option value="">{placeholders.account}</option>
                    {accounts
                      .filter((a: { is_postable?: boolean }) => a.is_postable !== false)
                      .map((a: { id: number; code: string; name?: string; name_en?: string | null }) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.code} — {lang === 'ar' ? (a.name ?? a.code) : (a.name_en || a.name || a.code)}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[10px] text-gray-400">{placeholders.notes}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={placeholders.notes}
                  className="min-h-[56px] w-full resize-y rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800"
                />
              </div>
            </div>
          </div>

          {!isEdit && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {(
                  [
                    {
                      label: 'المبلغ الإجمالي',
                      required: true,
                      value: totalPrincipal,
                      onChange: (v: number) => setTotalPrincipal(Math.max(0, v)),
                      unit: 'KWD',
                      color: 'text-gray-900',
                      key: 'total',
                    },
                    {
                      label: placeholders.numInstallments,
                      required: true,
                      value: installmentCount,
                      onChange: (v: number) => setInstallmentCount(Math.max(1, Math.min(120, Math.floor(v)))),
                      unit: 'قسط',
                      color: 'text-gray-900',
                      key: 'count',
                    },
                    {
                      label: 'قيمة القسط',
                      required: false,
                      value: installmentAmount,
                      onChange: (v: number) => {
                        setInstallmentAmount(v)
                        if (totalPrincipal > 0 && v > 0) {
                          const tot = remainingAfterDown + interestOnFinanced
                          setInstallmentCount(Math.max(1, Math.min(120, Math.round(tot / v))))
                        }
                      },
                      unit: 'KWD / قسط',
                      color: 'text-blue-600',
                      key: 'per',
                    },
                    {
                      label: 'نسبة الفائدة',
                      required: false,
                      value: interestRate,
                      onChange: (v: number) => setInterestRate(Math.max(0, v)),
                      unit: '% سنوياً',
                      color: 'text-gray-900',
                      key: 'rate',
                    },
                  ] as const
                ).map((card) => (
                  <div key={card.key} className="rounded-lg bg-gray-50 p-3 text-center">
                    <p className="mb-2 text-[10px] text-gray-400">
                      {card.label}{' '}
                      {card.required && <span className="text-red-500">*</span>}
                    </p>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={card.value || ''}
                      onChange={(e) => card.onChange(parseFloat(e.target.value) || 0)}
                      className={`w-full border-none bg-transparent text-center text-lg font-medium outline-none ${card.color}`}
                      placeholder="0"
                    />
                    <p className="mt-1 text-[10px] text-gray-400">{card.unit}</p>
                  </div>
                ))}
              </div>

              <div className="mb-1">
                <p className="mb-2 text-[11px] text-gray-400">دورية الأقساط</p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { value: 'monthly' as PeriodType, label: 'شهري' },
                      { value: 'quarterly' as PeriodType, label: 'ربع سنوي' },
                      { value: 'semi_annual' as PeriodType, label: 'نصف سنوي' },
                      { value: 'annual' as PeriodType, label: 'سنوي' },
                      { value: 'manual' as PeriodType, label: 'يدوي' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPeriodType(opt.value)}
                      className={`rounded-full px-4 py-1.5 text-xs transition-colors ${
                        periodType === opt.value
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-1 flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 p-3">
                <span className="flex-shrink-0 text-sm text-gray-500">دفعة أولى</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={downPayment || ''}
                  onChange={(e) => setDownPayment(parseFloat(e.target.value) || 0)}
                  className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-sm"
                  placeholder="0"
                />
                <button
                  type="button"
                  onClick={() => setDownPaymentType((prev) => (prev === 'fixed' ? 'percent' : 'fixed'))}
                  className="min-w-[50px] rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600"
                >
                  {downPaymentType === 'fixed' ? 'KWD' : '%'}
                </button>
                <span className="text-xs text-gray-400">سيُخصم من الإجمالي ويُسجَّل كسطر أول في الجدول</span>
                {downPayment > 0 && (
                  <span className="mr-auto text-sm font-medium text-blue-600">
                    الباقي: {remainingAfterDown.toFixed(3)} KWD
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={generateSchedule}
                disabled={!totalPrincipal || !installmentCount || !startDate}
                className="mb-2 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ⚡ توليد جدول الأقساط
              </button>

              <div className="mb-4 flex items-start gap-2 rounded-lg bg-blue-50 p-2.5 text-xs text-blue-700">
                <span>ℹ️</span>
                <span>
                  يمكنك تعديل تاريخ أو مبلغ أي قسط يدوياً بعد التوليد. يُنصح بأن يطابق مجموع المبالغ المبلغ الإجمالي
                  والفائدة المتوقعة ({expectedScheduleSum.toFixed(3)} KWD).
                </span>
              </div>
            </>
          )}

          {lines.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
              <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-800">
                {lang === 'ar' ? 'جدول الأقساط' : 'Schedule'}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-400">#</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-400">{t.installments?.dueDate}</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-400">المبلغ (KWD)</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-400">الفائدة</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-400">الإجمالي</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-400">الحالة</th>
                      {isEdit && installment?.status === 'approved' && (
                        <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-400">
                          {lang === 'ar' ? 'سداد' : 'Pay'}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={`${line.sequence}-${idx}`} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2 text-center text-xs text-gray-400">{line.sequence}</td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={line.due_date}
                            onChange={(e) => updateLineRow(idx, 'due_date', e.target.value)}
                            disabled={!canEdit}
                            className="w-32 rounded border border-gray-200 px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={line.amount}
                            onChange={(e) => updateLineRow(idx, 'amount', parseFloat(e.target.value) || 0)}
                            disabled={!canEdit}
                            className="w-24 rounded border border-gray-200 px-2 py-1 text-center text-xs font-medium text-blue-600"
                          />
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-gray-400">
                          {(line.interest ?? 0).toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-xs font-medium text-blue-600">
                          {(Number(line.amount) + (line.interest ?? 0)).toFixed(3)}
                        </td>
                        <td className="px-3 py-2">
                          {line.isDownPayment ? (
                            <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] text-green-700">دفعة أولى</span>
                          ) : (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">معلق</span>
                          )}
                        </td>
                        {isEdit && installment?.status === 'approved' && (
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const apiLine = (installment.lines ?? []).find((l) => l.sequence === line.sequence)
                                const remaining = Number(
                                  apiLine?.remaining ??
                                    (Number(apiLine?.amount ?? 0) - Number(apiLine?.paid_amount ?? 0)),
                                )
                                if (!apiLine?.id || remaining <= 0) return
                                setPayModal({ lineId: apiLine.id, remaining, seq: line.sequence })
                                setPayAmount(String(remaining))
                                setPayNotes('')
                                setPayPaymentMethodId('')
                                setPayCashBankAccountId('')
                              }}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                              title={lang === 'ar' ? 'سداد القسط وتوليد سند' : 'Pay installment & create voucher'}
                            >
                              <CircleDollarSign size={14} className="text-emerald-600" />
                              {lang === 'ar' ? 'سداد' : 'Pay'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-medium">
                      <td colSpan={2} className="px-3 py-2 text-xs text-gray-500">
                        {t.total}
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {lines.reduce((s, r) => s + Number(r.amount), 0).toFixed(3)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400">
                        {lines.reduce((s, r) => s + (r.interest ?? 0), 0).toFixed(3)}
                      </td>
                      <td className="px-3 py-2 text-sm text-blue-600">
                        {lines.reduce((s, r) => s + Number(r.amount) + (r.interest ?? 0), 0).toFixed(3)}
                      </td>
                      <td />
                      {isEdit && installment?.status === 'approved' && <td />}
                    </tr>
                  </tbody>
                </table>
              </div>
              {!isEdit && Math.abs(totalFromLines - expectedScheduleSum) > 0.01 && (
                <div className="flex items-center gap-2 border-t border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  ⚠️ مجموع المبالغ لا يطابق الإجمالي المتوقع ({expectedScheduleSum.toFixed(3)} KWD) — راجع المبالغ أو أعد
                  التوليد
                </div>
              )}
            </div>
          )}

          {canEdit && lines.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4">
              {saveError && (
                <p className="text-sm text-red-600" role="alert">
                  {saveError}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/installments')}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 hover:bg-green-100"
                  >
                    🖨 معاينة وطباعة
                  </button>
                  {isEdit && installment?.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => setShowApproveConfirm(true)}
                      disabled={approveMut.isPending}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {approveMut.isPending ? t.loading : (t.installments?.approveSchedule ?? 'اعتماد الجدول')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!lines.length || createMut.isPending || updateMut.isPending}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {createMut.isPending || updateMut.isPending ? t.saving : '✓ حفظ جدول التقسيط'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="no-print h-fit space-y-3 lg:sticky lg:top-4">
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">ملخص التقسيط</p>
            <div className="mb-3 rounded-lg bg-gray-50 p-3">
              <p className="mb-1 text-[10px] text-gray-400">إجمالي المبلغ (أصل)</p>
              <p className="text-2xl font-medium text-gray-900">
                {totalPrincipal.toFixed(3)}
                <span className="mr-1 text-sm font-normal text-gray-400">KWD</span>
              </p>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {[
                { label: 'عدد الأقساط', value: isEdit ? String(lines.filter((l) => !l.isDownPayment).length || installmentCount) : String(installmentCount), unit: 'قسط' },
                { label: 'قيمة القسط', value: installmentAmount.toFixed(3), unit: 'KWD' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-gray-50 p-2.5 text-center">
                  <p className="mb-1 text-[10px] text-gray-400">{item.label}</p>
                  <p className="text-lg font-medium">{item.value}</p>
                  <p className="text-[10px] text-gray-400">{item.unit}</p>
                </div>
              ))}
            </div>
            {lines.length > 0 && (
              <div className="mb-3 rounded-lg bg-gray-50 p-3">
                <p className="mb-2 text-[10px] text-gray-400">مدة التقسيط</p>
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <p className="font-medium">{lines.find((r) => !r.isDownPayment)?.due_date ?? lines[0]?.due_date}</p>
                    <p className="text-gray-400">أول قسط</p>
                  </div>
                  <span className="text-gray-300">←</span>
                  <div className="text-left">
                    <p className="font-medium">{lines[lines.length - 1]?.due_date}</p>
                    <p className="text-gray-400">آخر قسط</p>
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-1.5 text-xs">
              {[
                { label: 'المبلغ الأصلي', value: totalPrincipal.toFixed(3), color: '' },
                {
                  label: 'الدفعة الأولى',
                  value: `- ${downPaymentValue.toFixed(3)}`,
                  color: 'text-green-600',
                },
                { label: 'إجمالي الفائدة (تقديري)', value: interestOnFinanced.toFixed(3), color: 'text-blue-600' },
              ].map((row) => (
                <div key={row.label} className="flex justify-between border-b border-gray-50 py-1">
                  <span className="text-gray-400">{row.label}</span>
                  <span className={`font-medium ${row.color}`}>{row.value}</span>
                </div>
              ))}
              <div className="flex justify-between py-2">
                <span className="font-medium">مجموع الجدول المتوقع</span>
                <span className="text-lg font-medium text-blue-600">{expectedScheduleSum.toFixed(3)} KWD</span>
              </div>
              {lines.length > 0 && (
                <div className="flex justify-between border-t border-gray-100 pt-2">
                  <span className="text-gray-500">مجموع المبالغ الحالي</span>
                  <span className="font-medium text-gray-900">{totalFromLines.toFixed(3)} KWD</span>
                </div>
              )}
            </div>
          </div>
          {selectedCustomer && (customerBalance != null || selectedCustomer.credit_limit != null) && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="mb-1 font-medium">⚠️ معلومات الائتمان</p>
              {customerBalance != null && !Number.isNaN(customerBalance) && (
                <p>
                  الرصيد الحالي:{' '}
                  <strong>{customerBalance.toFixed(3)} KWD</strong>
                </p>
              )}
              {selectedCustomer.credit_limit != null && (
                <p>
                  حد الائتمان:{' '}
                  <strong>{Number(selectedCustomer.credit_limit).toFixed(3)} KWD</strong>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {isEdit && installment?.status === 'approved' && (
        <p className="text-amber-700 text-sm">{t.installments?.cannotEditApproved}</p>
      )}

      {showApproveConfirm && (
        <ConfirmDialog
          title={t.installments?.approveSchedule ?? (lang === 'ar' ? 'اعتماد الجدول' : 'Approve schedule')}
          message={t.installments?.confirmApprove ?? (lang === 'ar' ? 'اعتماد إداري فقط — دون قيد؛ التحصيل بسند القبض على ذمة العميل.' : 'Administrative approval only — no journal; collect via receipt to customer AR.')}
          variant="warning"
          confirmLabel={lang === 'ar' ? 'تأكيد' : 'Confirm'}
          cancelLabel={t.cancel}
          isLoading={approveMut.isPending}
          overlayZClass="z-[120]"
          onCancel={() => setShowApproveConfirm(false)}
          onConfirm={() => {
            setShowApproveConfirm(false)
            approveMut.mutate()
          }}
        />
      )}

      {/* نافذة سداد القسط */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPayModal(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">
                {lang === 'ar' ? `سداد القسط رقم ${payModal.seq}` : `Pay installment #${payModal.seq}`}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {lang === 'ar' ? `المتبقي: ${fmt(payModal.remaining)}` : `Remaining: ${fmt(payModal.remaining)}`}
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{t.amount}</label>
                  <input
                    type="number"
                    step="0.001"
                    min={0.001}
                    max={payModal.remaining}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{t.date ?? (lang === 'ar' ? 'التاريخ' : 'Date')}</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{lang === 'ar' ? 'طريقة السداد' : 'Payment method'}</label>
                  <select
                    value={payPaymentMethodId}
                    onChange={(e) => setPayPaymentMethodId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">{lang === 'ar' ? 'اختياري' : 'Optional'}</option>
                    {paymentMethods.map((pm: any) => (
                      <option key={pm.id} value={String(pm.id)}>{lang === 'ar' ? pm.name : (pm.name_en || pm.name)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{lang === 'ar' ? 'حساب الصندوق/البنك' : 'Cash/Bank account'}</label>
                  <select
                    value={payCashBankAccountId}
                    onChange={(e) => setPayCashBankAccountId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">{lang === 'ar' ? 'اختياري' : 'Optional'}</option>
                    {accounts
                      .filter((a: any) => a.is_postable !== false)
                      .map((a: any) => (
                        <option key={a.id} value={String(a.id)}>{a.code} — {lang === 'ar' ? (a.name ?? a.code) : (a.name_en || a.name || a.code)}</option>
                      ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t.notes ?? (lang === 'ar' ? 'ملاحظات' : 'Notes')}</label>
                <textarea
                  rows={2}
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={() => setPayModal(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const amt = parseFloat(payAmount)
                    if (!Number.isFinite(amt) || amt <= 0) return
                    await payInstallmentLine(tenantId, payModal.lineId, {
                      amount: amt,
                      date: payDate,
                      payment_method_id: payPaymentMethodId ? Number(payPaymentMethodId) : null,
                      cash_bank_account_id: payCashBankAccountId ? Number(payCashBankAccountId) : null,
                      notes: payNotes.trim() || undefined,
                    })
                    queryClient.invalidateQueries({ queryKey: ['installments', tenantId] })
                    const refreshed = await fetchInstallment(tenantId, Number(id))
                    // تحديث جدول الخطوط والـ remaining/status
                    if (refreshed?.lines?.length) {
                      setLines(refreshed.lines.map((l) => ({ sequence: l.sequence, due_date: l.due_date.slice(0, 10), amount: Number(l.amount) })))
                    }
                    setToast({ message: lang === 'ar' ? 'تم سداد القسط وتوليد السند.' : 'Installment paid and voucher created.', type: 'success' })
                    setPayModal(null)
                  } catch (e: any) {
                    setToast({ message: e?.response?.data?.message ?? (lang === 'ar' ? 'تعذر السداد' : 'Payment failed'), type: 'error' })
                  }
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {lang === 'ar' ? 'تنفيذ السداد' : 'Pay'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
