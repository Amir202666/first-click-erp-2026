import { useState, useMemo, useCallback, useRef } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { formatAmount } from '../utils/currency'
import type { Account, Branch, CostCenter, PaymentMethod, TenantSettings, Currency } from '../types'
import { Plus, Trash2, ArrowUp, ArrowDown, DollarSign, Landmark, Calendar, Building2, Tag, FileText, Paperclip, FolderOpen } from 'lucide-react'
import AccountSearchSelect from './AccountSearchSelect'

export interface VoucherEntryLine {
  id: string
  account_id: number | null
  amount: number
  cost_center_id: number | null
  description: string
}

export interface VoucherFormData {
  date: string
  number: string
  voucher_type: 'receipt' | 'payment' | 'transfer'
  branch_id: number | null
  cost_center_id: number | null
  currency: string
  reference: string
  main_account_id: number | null
  payment_method_id: number | null
  notes: string
  lines: VoucherEntryLine[]
}

interface VoucherFormProps {
  data: VoucherFormData
  onDataChange: (data: VoucherFormData) => void
  accounts: Account[]
  branches: Branch[]
  costCenters: CostCenter[]
  paymentMethods: PaymentMethod[]
  currencies: Currency[]
  settings?: TenantSettings
  isLoading?: boolean
  onSave?: () => void
  onSaveAndPrint?: () => void
  onCancel?: () => void
  mode?: 'create' | 'edit'
  attachmentFile?: File | null
  onAttachmentFileChange?: (file: File | null) => void
}

export default function VoucherForm({
  data,
  onDataChange,
  accounts,
  branches,
  costCenters,
  paymentMethods,
  currencies,
  settings,
  isLoading = false,
  onSave,
  onSaveAndPrint,
  onCancel,
  mode = 'create',
  attachmentFile = null,
  onAttachmentFileChange,
}: VoucherFormProps) {
  const { t, lang, isRtl } = useLanguage()
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(n, { decimal_places: (settings?.doc_amount_decimals as number | undefined) ?? 2 }, locale)

  const [draggedLineId, setDraggedLineId] = useState<string | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)

  // حساب الإجماليات
  const totals = useMemo(() => {
    const totalAmount = data.lines.reduce((sum, line) => sum + line.amount, 0)
    return { totalAmount }
  }, [data.lines])

  // معالج تحديث البيانات الأساسية
  const handleHeaderChange = useCallback(
    (field: keyof VoucherFormData, value: any) => {
      onDataChange({ ...data, [field]: value })
    },
    [data, onDataChange]
  )

  // معالج تحديث سطر العملية
  const handleLineChange = useCallback(
    (lineId: string, field: keyof VoucherEntryLine, value: any) => {
      onDataChange({
        ...data,
        lines: data.lines.map((line) =>
          line.id === lineId ? { ...line, [field]: value } : line
        ),
      })
    },
    [data, onDataChange]
  )

  // إضافة سطر جديد
  const handleAddLine = useCallback(() => {
    onDataChange({
      ...data,
      lines: [
        ...data.lines,
        {
          id: `line-${Date.now()}-${Math.random()}`,
          account_id: null,
          amount: 0,
          cost_center_id: null,
          description: '',
        },
      ],
    })
  }, [data, onDataChange])

  // حذف سطر
  const handleDeleteLine = useCallback(
    (lineId: string) => {
      if (data.lines.length <= 1) return // لا تحذف السطر الأخير
      onDataChange({
        ...data,
        lines: data.lines.filter((line) => line.id !== lineId),
      })
    },
    [data, onDataChange]
  )

  // تحريك سطر لأعلى
  const handleMoveLineUp = useCallback(
    (index: number) => {
      if (index === 0) return
      const newLines = [...data.lines]
      ;[newLines[index], newLines[index - 1]] = [newLines[index - 1], newLines[index]]
      onDataChange({ ...data, lines: newLines })
    },
    [data, onDataChange]
  )

  // تحريك سطر لأسفل
  const handleMoveLineDown = useCallback(
    (index: number) => {
      if (index === data.lines.length - 1) return
      const newLines = [...data.lines]
      ;[newLines[index], newLines[index + 1]] = [newLines[index + 1], newLines[index]]
      onDataChange({ ...data, lines: newLines })
    },
    [data, onDataChange]
  )

  // معالج Drag & Drop
  const handleDragStart = (lineId: string) => {
    setDraggedLineId(lineId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (lineId: string) => {
    if (!draggedLineId || draggedLineId === lineId) return
    const draggedIndex = data.lines.findIndex((l) => l.id === draggedLineId)
    const targetIndex = data.lines.findIndex((l) => l.id === lineId)
    if (draggedIndex === -1 || targetIndex === -1) return
    handleMoveLineUp(draggedIndex)
    if (draggedIndex < targetIndex) {
      handleMoveLineDown(draggedIndex)
    } else {
      handleMoveLineUp(draggedIndex)
    }
    setDraggedLineId(null)
  }

  function setAttachmentFromFile(file: File | null) {
    if (!file) {
      setAttachmentError(null)
      onAttachmentFileChange?.(null)
      return
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isJpg = file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')
    const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')

    if (!isPdf && !isJpg && !isPng) {
      setAttachmentError(lang === 'ar' ? 'مرفق غير مدعوم. ارفع JPG/PNG أو PDF.' : 'Unsupported attachment. Upload JPG/PNG or PDF.')
      return
    }

    setAttachmentError(null)
    onAttachmentFileChange?.(file)
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const flexDirection = isRtl ? 'flex-row-reverse' : 'flex-row'

  // تصفية الفروع ومراكز التكلفة حسب الربط المتقدم للحسابات المختارة في الأسطر
  const headerBranchIds = useMemo(() => {
    const ids = new Set<number>()
    for (const line of data.lines) {
      if (!line.account_id) continue
      const acc = accounts.find((a) => a.id === line.account_id)
      if (acc?.branch_ids?.length) acc.branch_ids.forEach((id) => ids.add(id))
    }
    return ids.size ? Array.from(ids) : null
  }, [data.lines, accounts])
  const headerBranchesFiltered = useMemo(() => {
    if (!headerBranchIds) return branches
    return branches.filter((b) => headerBranchIds.includes(b.id))
  }, [branches, headerBranchIds])

  const headerCostCenterIds = useMemo(() => {
    const ids = new Set<number>()
    for (const line of data.lines) {
      if (!line.account_id) continue
      const acc = accounts.find((a) => a.id === line.account_id)
      if (acc?.cost_center_ids?.length) acc.cost_center_ids.forEach((id) => ids.add(id))
    }
    return ids.size ? Array.from(ids) : null
  }, [data.lines, accounts])
  const headerCostCentersFiltered = useMemo(() => {
    if (!headerCostCenterIds) return costCenters
    return costCenters.filter((cc) => headerCostCenterIds.includes(cc.id))
  }, [costCenters, headerCostCenterIds])

  const getCostCentersForLine = useCallback(
    (line: VoucherEntryLine) => {
      if (!line.account_id) return costCenters
      const acc = accounts.find((a) => a.id === line.account_id)
      if (!acc?.cost_center_ids?.length) return costCenters
      return costCenters.filter((cc) => acc.cost_center_ids!.includes(cc.id))
    },
    [accounts, costCenters]
  )

  const mainAccountTitle =
    data.voucher_type === 'receipt'
      ? (t.payments?.cashBankAccount || 'حساب استقبال السيولة')
      : data.voucher_type === 'payment'
        ? (t.payments?.cashBankAccount || 'حساب خروج السيولة')
        : (t.payments?.transferFromAccount || 'الحساب المحول منه')

  return (
    <div className="space-y-5">
      {/* ──── قسم الترويسة (Header Section) ──── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-2.5 space-y-2">
          {/* من اليمين: المرجع ← التاريخ ← العملة ← طريقة الدفع ← مركز التكلفة ← الفرع؛ من md صف واحد + تمرير أفقي عند الضيق */}
          <div className="w-full max-w-full overflow-x-auto overflow-y-visible overscroll-x-contain">
          <div
            dir="rtl"
            className="grid w-full max-w-full grid-cols-1 gap-2.5 md:w-max md:grid-cols-6 md:[grid-template-columns:minmax(0,11rem)_minmax(0,9rem)_minmax(0,9rem)_minmax(0,11rem)_minmax(0,15rem)_minmax(0,15rem)] lg:w-full lg:min-w-0 lg:[grid-template-columns:minmax(0,12rem)_minmax(0,9rem)_minmax(0,9rem)_minmax(0,12rem)_minmax(0,15rem)_minmax(0,15rem)]"
          >
            <div className="min-w-0 max-w-full sm:max-w-none lg:max-w-[12rem]">
              <input
                type="text"
                value={data.reference}
                onChange={(e) => handleHeaderChange('reference', e.target.value)}
                placeholder={t.payments?.reference || 'المرجع'}
                className="w-full h-9 border border-slate-300 rounded-lg px-3 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-transparent outline-none focus:ring-offset-0 bg-white"
              />
            </div>
            <div className="min-w-0 max-w-full sm:max-w-none lg:max-w-[9rem]">
              <input
                type="date"
                value={data.date}
                onChange={(e) => handleHeaderChange('date', e.target.value)}
                className="w-full h-9 border border-slate-300 rounded-lg px-3 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-transparent outline-none focus:ring-offset-0 bg-white"
                title={t.date || 'التاريخ'}
                aria-label={t.date || 'التاريخ'}
              />
            </div>
            <div className="min-w-0 max-w-full sm:max-w-none lg:max-w-[9rem]">
              <select
                value={data.currency}
                onChange={(e) => handleHeaderChange('currency', e.target.value)}
                className="w-full h-9 border border-slate-300 rounded-lg px-3 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-transparent outline-none focus:ring-offset-0 bg-white"
              >
                <option value="">{lang === 'ar' ? 'العملة' : 'Currency'}</option>
                {(currencies || [])
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <option key={c.id} value={c.code}>
                      {lang === 'ar' ? c.name : (c.name_en || c.name)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="min-w-0 max-w-full sm:max-w-none lg:max-w-[12rem]">
              <select
                value={data.payment_method_id ?? ''}
                onChange={(e) =>
                  handleHeaderChange('payment_method_id', e.target.value ? parseInt(e.target.value) : null)
                }
                className="w-full h-9 border border-slate-300 rounded-lg px-3 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-transparent outline-none focus:ring-offset-0 bg-white"
              >
                <option value="">{t.payments?.paymentMethod || (lang === 'ar' ? 'طريقة الدفع' : 'Payment method')}</option>
                {paymentMethods.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {lang === 'ar' ? pm.name : (pm.name_en || pm.name)}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 max-w-full sm:max-w-none md:max-w-[15rem] lg:max-w-[15rem]">
              <select
                value={data.cost_center_id ?? ''}
                onChange={(e) => handleHeaderChange('cost_center_id', e.target.value ? parseInt(e.target.value) : null)}
                className="w-full h-9 border border-slate-300 rounded-lg px-3 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-transparent outline-none focus:ring-offset-0 bg-white"
              >
                <option value="">{t.journal?.costCenter || (lang === 'ar' ? 'مركز التكلفة' : 'Cost center')}</option>
                {headerCostCentersFiltered.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 max-w-full sm:max-w-none md:max-w-[15rem] lg:max-w-[15rem]">
              <select
                value={data.branch_id ?? ''}
                onChange={(e) => handleHeaderChange('branch_id', e.target.value ? parseInt(e.target.value) : null)}
                className="w-full h-9 border border-slate-300 rounded-lg px-3 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-transparent outline-none focus:ring-offset-0 bg-white"
              >
                <option value="">{t.journal?.branch || (lang === 'ar' ? 'الفرع' : 'Branch')}</option>
                {headerBranchesFiltered.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          </div>
      </div>

      {/* ──── قسم الحساب الرئيسي (Main Account) ──── */}
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        {/* RTL: العنوان يبدأ من اليمين (بداية السطر) ثم الأيقونة؛ LTR: أيقونة ثم عنوان */}
        <div className="mb-3 flex w-full flex-row items-center justify-start gap-2">
          {isRtl ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{mainAccountTitle}</h3>
                {data.voucher_type === 'transfer' && (
                  <span
                    className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                    title={t.payments?.transferSourceCreditBadgeTitle}
                  >
                    {t.journal?.credit ?? (lang === 'ar' ? 'دائن' : 'Credit')}
                  </span>
                )}
              </div>
              <Landmark size={18} className="text-primary-600 shrink-0" aria-hidden />
            </>
          ) : (
            <>
              <Landmark size={18} className="text-primary-600 shrink-0" aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{mainAccountTitle}</h3>
                {data.voucher_type === 'transfer' && (
                  <span
                    className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                    title={t.payments?.transferSourceCreditBadgeTitle}
                  >
                    {t.journal?.credit ?? (lang === 'ar' ? 'دائن' : 'Credit')}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
        <div className="relative">
          <AccountSearchSelect
            accounts={accounts}
            value={data.main_account_id}
            onChange={(accountId) => handleHeaderChange('main_account_id', accountId)}
            placeholder="ابحث عن الحساب..."
          />
        </div>
      </div>

      {/* ──── جدول الأسطر (Entries Grid) ──── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {/* رأس الجدول */}
        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 rounded-t-xl flex items-center justify-between">
          <div>
            <h3 className={`text-sm font-semibold text-slate-900 ${textAlign}`}>
              تفاصيل العمليات
            </h3>
          </div>
          <button
            type="button"
            onClick={handleAddLine}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-500"
          >
            <Plus size={14} />
            {t.add || 'سطر جديد'}
          </button>
        </div>

        {/* محتوى الجدول */}
        <div className="overflow-x-auto rounded-b-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className={`px-2.5 py-1.5 font-semibold text-slate-700 ${textAlign} w-10`}>#</th>
                <th className={`px-2.5 py-1.5 font-semibold text-slate-700 ${textAlign} w-[28%]`}>
                  {t.journal?.account || 'الحساب'}
                </th>
                <th className={`px-2.5 py-1.5 font-semibold text-slate-700 ${textAlign} w-32`}>
                  {t.amount || 'المبلغ'}
                </th>
                <th className={`px-2.5 py-1.5 font-semibold text-slate-700 ${textAlign} w-44`}>
                  {t.journal?.costCenter || 'مركز التكلفة'}
                </th>
                <th className={`px-2.5 py-1.5 font-semibold text-slate-700 ${textAlign} w-[26%]`}>
                  {t.description || 'البيان'}
                </th>
                <th className={`px-2.5 py-1.5 font-semibold text-slate-700 ${textAlign} w-24`}>
                  {t.actions || 'الإجراءات'}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line, index) => (
                <tr
                  key={line.id}
                  draggable
                  onDragStart={() => handleDragStart(line.id)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(line.id)}
                  className={`border-b border-slate-200 hover:bg-slate-50 transition-colors ${
                    draggedLineId === line.id ? 'opacity-50 bg-slate-100' : ''
                  }`}
                >
                  {/* الرقم */}
                  <td className={`px-2.5 py-1.5 text-xs text-slate-600 font-medium ${textAlign} cursor-move`}>
                    {index + 1}
                  </td>

                  {/* الحساب */}
                  <td className="px-2.5 py-1.5 align-middle">
                    <AccountSearchSelect
                      accounts={accounts}
                      value={line.account_id}
                      onChange={(accountId) => {
                        handleLineChange(line.id, 'account_id', accountId)
                        if (accountId) {
                          const acc = accounts.find((a) => a.id === accountId)
                          if (acc?.cost_center_ids?.length && line.cost_center_id && !acc.cost_center_ids.includes(line.cost_center_id)) {
                            handleLineChange(line.id, 'cost_center_id', null)
                          }
                        }
                      }}
                      placeholder="اختر..."
                    />
                  </td>

                  {/* المبلغ */}
                  <td className="px-2.5 py-1.5 align-middle">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(e) => handleLineChange(line.id, 'amount', e.target.value ? parseFloat(e.target.value) : 0)}
                      placeholder="0.00"
                      className="w-full h-9 border border-slate-300 rounded-lg px-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-transparent outline-none focus:ring-offset-0 text-right tabular-nums"
                      step="0.01"
                    />
                  </td>

                  {/* مركز التكلفة (مصفى حسب الربط المتقدم للحساب المختار) */}
                  <td className="px-2.5 py-1.5 align-middle">
                    <select
                      value={line.cost_center_id ?? ''}
                      onChange={(e) =>
                        handleLineChange(line.id, 'cost_center_id', e.target.value ? parseInt(e.target.value) : null)
                      }
                      className="w-full h-9 border border-slate-300 rounded-lg px-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-transparent outline-none focus:ring-offset-0 bg-white"
                    >
                      <option value="">{t.journal?.costCenter || (lang === 'ar' ? 'مركز التكلفة' : 'Cost center')}</option>
                      {getCostCentersForLine(line).map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* البيان */}
                  <td className="px-2.5 py-1.5 align-middle">
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => handleLineChange(line.id, 'description', e.target.value)}
                      placeholder={t.description || 'بيان...'}
                      className="w-full h-9 border border-slate-300 rounded-lg px-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-transparent outline-none focus:ring-offset-0"
                    />
                  </td>

                  {/* الإجراءات */}
                  <td className="px-2.5 py-1.5 align-middle">
                    <div className={`flex items-center justify-center gap-1.5 ${flexDirection}`}>
                    <button
                      onClick={() => handleMoveLineUp(index)}
                      disabled={index === 0}
                      className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="نقل لأعلى"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      onClick={() => handleMoveLineDown(index)}
                      disabled={index === data.lines.length - 1}
                      className="p-1 rounded-lg hover:bg-blue-100 text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="نقل لأسفل"
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      onClick={() => handleDeleteLine(line.id)}
                      disabled={data.lines.length <= 1}
                      className="p-1 rounded-lg hover:bg-red-100 text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="حذف"
                    >
                      <Trash2 size={15} />
                    </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <textarea
          value={data.notes}
          onChange={(e) => handleHeaderChange('notes', e.target.value)}
          placeholder={t.notes || 'ملاحظات'}
          rows={3}
          className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm leading-snug focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-transparent outline-none focus:ring-offset-0 resize-none min-h-[4.5rem]"
        />
      </div>

      {/* ──── قسم المرفق ──── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-slate-900">{t.payments?.attachment ?? (lang === 'ar' ? 'إرفاق المستندات' : 'Attach documents')}</span>
          <input
            ref={attachmentInputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="hidden"
            onChange={(e) => setAttachmentFromFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <FolderOpen size={16} className="text-primary-600" />
            {lang === 'ar' ? 'تصفح' : 'Browse'}
          </button>
          {attachmentError && <p className="text-xs text-red-600">{attachmentError}</p>}
          {attachmentFile && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
              <Paperclip size={14} className="text-primary-600 shrink-0" />
              <span className="text-xs font-medium text-slate-700 truncate max-w-[200px]">{attachmentFile.name}</span>
              <button
                type="button"
                onClick={() => setAttachmentFromFile(null)}
                disabled={isLoading}
                className="p-0.5 rounded text-slate-400 hover:text-red-500 transition-colors"
                title={lang === 'ar' ? 'إزالة' : 'Remove'}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ──── شريط الإجماليات والحفظ (Footer) ──── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className={`flex flex-col md:flex-row items-center justify-between gap-6 ${flexDirection}`}>
          {/* عرض الإجماليات */}
          <div className={textAlign}>
            <p className="mb-1 text-sm text-slate-600">{t.total}</p>
            <p className="font-mono text-3xl font-bold text-emerald-600">{fmt(totals.totalAmount)}</p>
          </div>

          {/* أزرار الحفظ والإلغاء */}
          <div className={`flex flex-wrap items-center gap-3 ${flexDirection}`}>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              onClick={onCancel ?? (() => window.history.back())}
            >
              {t.cancel || 'إلغاء'}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={
                isLoading ||
                !data.main_account_id ||
                data.lines.filter((l) => l.account_id && l.amount > 0).length === 0
              }
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isLoading ||
                !data.main_account_id ||
                data.lines.filter((l) => l.account_id && l.amount > 0).length === 0
                  ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }`}
            >
              {isLoading ? (
                <>
                  <span className="inline-block animate-spin">⟳</span>
                  {t.saving || 'جاري الحفظ...'}
                </>
              ) : (
                <>
                  <Plus size={16} />
                  {mode === 'create' ? (lang === 'ar' ? 'حفظ' : 'Save') : (lang === 'ar' ? 'حفظ التعديلات' : 'Save changes')}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onSaveAndPrint}
              disabled={
                isLoading ||
                !onSaveAndPrint ||
                !data.main_account_id ||
                data.lines.filter((l) => l.account_id && l.amount > 0).length === 0
              }
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isLoading ||
                !onSaveAndPrint ||
                !data.main_account_id ||
                data.lines.filter((l) => l.account_id && l.amount > 0).length === 0
                  ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                  : 'bg-primary-600 text-white hover:bg-primary-500'
              }`}
            >
              <FileText size={16} />
              {t.invoices?.saveAndPrint ?? 'حفظ و طباعة'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
