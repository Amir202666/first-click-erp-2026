import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitleContext } from '../../contexts/DocumentTitleContext'
import {
  fetchAccounts,
  fetchBranches,
  fetchCostCenters,
  fetchPaymentMethods,
  fetchSettings,
  fetchCurrencies,
  createPayment,
  fetchPayment,
  updatePayment,
  uploadPaymentAttachment,
  fetchInvoice,
  fetchInstallment,
  payInstallmentLine,
} from '../../api/tenant'
import type { TenantSettings, Account, Branch, CostCenter, PaymentMethod, Payment, Currency, Invoice, Installment } from '../../types'
import VoucherForm, { VoucherFormData, VoucherEntryLine } from '../../components/VoucherForm'
import Toast from '../../components/ui/Toast'
import { splitVoucherNotesFromAutoSummary } from '../../utils/voucherNotes'

export default function CreateVoucher() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const { setPageTitle } = useDocumentTitleContext()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const { voucherId: voucherIdFromPath } = useParams<{ voucherId?: string }>()
  const idFromQuery = searchParams.get('id')
  const voucherId =
    voucherIdFromPath ||
    (idFromQuery && /^\d+$/.test(idFromQuery) ? idFromQuery : undefined)
  const isEdit = !!voucherId
  const invoiceIdFromQuery = searchParams.get('invoice_id')
  const invoiceIdNum = invoiceIdFromQuery && /^\d+$/.test(invoiceIdFromQuery) ? parseInt(invoiceIdFromQuery, 10) : 0
  const installmentIdFromQuery = searchParams.get('installment_id')
  const installmentLineIdFromQuery = searchParams.get('installment_line_id')
  const installmentIdNum =
    installmentIdFromQuery && /^\d+$/.test(installmentIdFromQuery) ? parseInt(installmentIdFromQuery, 10) : 0
  const installmentLineIdNum =
    installmentLineIdFromQuery && /^\d+$/.test(installmentLineIdFromQuery)
      ? parseInt(installmentLineIdFromQuery, 10)
      : 0
  const isInstallmentCollectPrefill = !isEdit && installmentIdNum > 0 && installmentLineIdNum > 0
  const prefillAppliedRef = useRef<number | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [payLineSaving, setPayLineSaving] = useState(false)

  // الحصول على الإعدادات
  const { data: settings, isFetched: settingsFetched } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  // الحصول على البيانات المرجعية
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId, 'postable'],
    queryFn: () => fetchAccounts(tenantId, { postable_only: '1', active_only: '1' }),
    enabled: !!tenantId,
  })

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId).then((data: any) => data.data || data || []),
    enabled: !!tenantId,
  })

  const { data: costCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })

  const { data: paymentMethods = [] } = useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods', tenantId],
    queryFn: () => fetchPaymentMethods(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })

  const { data: currencies = [] } = useQuery<Currency[]>({
    queryKey: ['currencies', tenantId],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId,
  })

  // الحصول على بيانات السند الموجود (إذا كان تعديل)
  const { data: existingPayment } = useQuery<Payment>({
    queryKey: ['payment', tenantId, voucherId],
    queryFn: () => fetchPayment(tenantId, parseInt(String(voucherId), 10)),
    enabled: !!tenantId && isEdit && !!voucherId,
  })

  const { data: invoiceForPrefill } = useQuery<Invoice>({
    queryKey: ['invoice', tenantId, invoiceIdNum],
    queryFn: () => fetchInvoice(tenantId, invoiceIdNum),
    enabled: !!tenantId && !isEdit && invoiceIdNum > 0 && !isInstallmentCollectPrefill,
  })

  const { data: installmentForPrefill } = useQuery<Installment>({
    queryKey: ['installment', tenantId, installmentIdNum],
    queryFn: () => fetchInstallment(tenantId, installmentIdNum),
    enabled: !!tenantId && isInstallmentCollectPrefill,
  })

  // حالة النموذج
  const [formData, setFormData] = useState<VoucherFormData>({
    date: new Date().toISOString().slice(0, 10),
    number: '',
    voucher_type: (searchParams.get('voucher_type') as 'receipt' | 'payment' | 'transfer') || 'receipt',
    branch_id: null,
    cost_center_id: null,
    currency: '',
    reference: '',
    main_account_id: null,
    payment_method_id: null,
    notes: '',
    lines: [
      {
        id: `line-${Date.now()}`,
        account_id: null,
        amount: 0,
        cost_center_id: null,
        description: '',
      },
    ],
  })

  // ضبط العملة الافتراضية عند توفر الإعدادات/العملات
  useEffect(() => {
    if (!tenantId || isEdit) return
    const defaultCode =
      (settings?.doc_default_currency_code as string | undefined) ||
      (currencies.find((c) => c.is_default)?.code ?? '')
    if (defaultCode && !formData.currency) {
      setFormData((prev) => ({ ...prev, currency: defaultCode }))
    }
  }, [tenantId, isEdit, settings?.doc_default_currency_code, currencies, formData.currency])

  // تحميل بيانات السند الموجود
  useEffect(() => {
    if (!isEdit || !existingPayment) return

    const { userNotes, lineDescriptionsByIndex } = splitVoucherNotesFromAutoSummary(
      existingPayment.notes ?? '',
    )

    const lines: VoucherEntryLine[] = [
      {
        id: `line-${existingPayment.id}`,
        account_id: existingPayment.counterpart_account_id ?? null,
        amount: existingPayment.amount,
        cost_center_id: existingPayment.cost_center_id ?? null,
        description: lineDescriptionsByIndex.get(0) ?? '',
      },
    ]

    setFormData({
      date: (existingPayment.date as string).slice(0, 10),
      number: existingPayment.number,
      voucher_type: existingPayment.type as 'receipt' | 'payment' | 'transfer',
      branch_id: existingPayment.branch_id ?? null,
      cost_center_id: existingPayment.cost_center_id ?? null,
      currency: existingPayment.currency ?? '',
      reference: existingPayment.reference ?? '',
      main_account_id: existingPayment.cash_bank_account_id ?? null,
      payment_method_id: existingPayment.payment_method_id ?? null,
      notes: userNotes,
      lines,
    })
  }, [existingPayment, isEdit])

  /** فاتورة مبيعات → سند قبض / مشتريات → سند صرف؛ التعبئة من رصيد الفاتورة */
  useEffect(() => {
    if (isInstallmentCollectPrefill) return
    if (isEdit || !invoiceForPrefill || invoiceForPrefill.id !== invoiceIdNum) return
    if (prefillAppliedRef.current === invoiceForPrefill.id) return
    prefillAppliedRef.current = invoiceForPrefill.id
    const voucherType: 'receipt' | 'payment' = invoiceForPrefill.type === 'purchase' ? 'payment' : 'receipt'
    const balance = Number(invoiceForPrefill.balance) || 0
    const accountId =
      invoiceForPrefill.type === 'sales'
        ? invoiceForPrefill.customer?.account_id ?? null
        : invoiceForPrefill.vendor?.account_id ?? null
    setFormData((prev) => ({
      ...prev,
      voucher_type: voucherType,
      branch_id: invoiceForPrefill.branch_id ?? prev.branch_id,
      cost_center_id: invoiceForPrefill.cost_center_id ?? prev.cost_center_id,
      currency: invoiceForPrefill.currency || prev.currency,
      reference: invoiceForPrefill.number ?? prev.reference,
      lines: [
        {
          id: `prefill-inv-${invoiceForPrefill.id}`,
          account_id: accountId,
          amount: balance,
          cost_center_id: invoiceForPrefill.cost_center_id ?? null,
          description: invoiceForPrefill.number ?? '',
        },
      ],
    }))
  }, [isEdit, invoiceForPrefill, invoiceIdNum, isInstallmentCollectPrefill])

  /** تحصيل قسط: تعبئة سند القبض/الصرف من جدول الأقساط ثم الحفظ عبر payInstallmentLine */
  useEffect(() => {
    if (!isInstallmentCollectPrefill || !installmentForPrefill) return
    const line = installmentForPrefill.lines?.find((l) => Number(l.id) === installmentLineIdNum)
    if (!line) return
    const inst = installmentForPrefill
    const isVendor = !!(inst.vendor_id && !inst.customer_id)
    /** مورد: نحتاج account_id على الجدول أو إعدادات التزام الأقساط. عميل: نفس منطق InstallmentService — حساب العميل ثم حساب العملاء الافتراضي */
    if (isVendor) {
      if (!inst.account_id && !settingsFetched) return
    } else {
      if (!settingsFetched) return
    }
    const remaining = Math.max(0, Number(line.amount) - Number(line.paid_amount ?? 0))
    const accSettings = settings as unknown as {
      installments_payable_account_id?: number | null
      installments_receivable_account_id?: number | null
      installments_payable_account?: Account | null
      installments_receivable_account?: Account | null
      customers_account_id?: number | null
      customers_account?: Account | null
    } | undefined
    const payableFromSettings =
      accSettings?.installments_payable_account_id ?? accSettings?.installments_payable_account?.id ?? null
    let counterpart: number | null = null
    if (isVendor) {
      counterpart = inst.account_id ?? payableFromSettings ?? null
    } else {
      counterpart =
        inst.customer?.account_id ??
        accSettings?.customers_account_id ??
        accSettings?.customers_account?.id ??
        null
    }
    const voucherType: 'receipt' | 'payment' = isVendor ? 'payment' : 'receipt'
    const notesDefault =
      lang === 'ar'
        ? `سداد قسط ${line.sequence} — جدول ${inst.number}`
        : `Installment line ${line.sequence} — schedule ${inst.number}`
    setFormData((prev) => ({
      ...prev,
      voucher_type: voucherType,
      date: new Date().toISOString().slice(0, 10),
      branch_id: inst.branch_id ?? prev.branch_id,
      cost_center_id: inst.cost_center_id ?? prev.cost_center_id,
      currency: inst.currency || prev.currency,
      reference: inst.number ?? prev.reference,
      notes: notesDefault,
      lines: [
        {
          id: `prefill-inst-line-${line.id}`,
          account_id: counterpart != null ? Number(counterpart) : null,
          amount: remaining,
          cost_center_id: inst.cost_center_id ?? null,
          description: `${inst.number} / ${line.sequence}`,
        },
      ],
    }))
  }, [
    isInstallmentCollectPrefill,
    installmentForPrefill,
    settings?.installments_payable_account_id,
    settings?.installments_payable_account,
    settings?.installments_receivable_account_id,
    settings?.installments_receivable_account,
    settings?.customers_account_id,
    settings?.customers_account,
    installmentIdNum,
    installmentLineIdNum,
    lang,
    settingsFetched,
  ])

  // عنوان التبويب (document.title) حسب نوع السند
  useEffect(() => {
    const baseTitle = isEdit
      ? (formData.voucher_type === 'receipt'
          ? (t.payments?.documentReceiptVoucher ?? 'سند قبض')
          : formData.voucher_type === 'payment'
            ? (t.payments?.documentPaymentVoucher ?? 'سند صرف')
            : (t.payments?.documentTransfer ?? 'تحويل مالي'))
      : (formData.voucher_type === 'receipt'
          ? (t.payments?.newReceipt ?? 'سند قبض جديد')
          : formData.voucher_type === 'payment'
            ? (t.payments?.newPayment ?? 'سند صرف جديد')
            : (t.payments?.newTransfer ?? 'تحويل مالي جديد'))
    setPageTitle(baseTitle)
    return () => setPageTitle(null)
    // نعتمد على voucher_type والتعريب حتى يتحدث العنوان عند تغييرهما
  }, [formData.voucher_type, isEdit, t.payments, setPageTitle])

  // Mutation للحفظ
  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (isEdit && voucherId) {
        return updatePayment(tenantId, parseInt(String(voucherId), 10), payload)
      } else {
        return createPayment(tenantId, payload)
      }
    },
  })

  // بناء الـ payload المشترك
  const buildPayload = () => {
    const validLines = formData.lines.filter((line) => line.account_id && line.amount > 0)

    if (!formData.main_account_id) {
      setToast({ message: 'يرجى اختيار حساب الاستقبال/الخزن', type: 'error' })
      return null
    }

    if (validLines.length === 0) {
      setToast({ message: 'يرجى إضافة سطر واحد على الأقل مع حساب ومبلغ', type: 'error' })
      return
    }

    const totalAmount = validLines.reduce((sum, line) => sum + line.amount, 0)

    const firstLine = validLines[0]
    const trimmedNotes = formData.notes?.trim() ?? ''

    const payload: Record<string, unknown> = {
      type: formData.voucher_type,
      date: formData.date,
      amount: totalAmount,
      currency: formData.currency || null,
      reference: formData.reference || null,
      /** يُحفظ نص المستخدم فقط — دون دمج أسماء الحسابات والمبالغ (يظهر في التعديل وكشف الحساب) */
      notes: trimmedNotes !== '' ? trimmedNotes : null,
      branch_id: formData.branch_id,
      cost_center_id: firstLine.cost_center_id ?? formData.cost_center_id,
      payment_method_id: formData.payment_method_id,
      cash_bank_account_id: formData.main_account_id,
      counterpart_account_id: firstLine.account_id,
      /** بدونها يبقى السند مسودة ولا يُنشَأ قيد محاسبي (افتراضي الـ API = draft) */
      status: 'approved',
    }

    if (!isEdit && invoiceIdNum > 0) {
      payload.invoice_id = invoiceIdNum
    }

    console.log('📤 Saving voucher:', payload)
    return payload
  }

  async function submitInstallmentCollect(andPrint: boolean) {
    const validLines = formData.lines.filter((l) => l.account_id && l.amount > 0)
    const payAmount = validLines.reduce((s, l) => s + l.amount, 0)
    if (!formData.main_account_id) {
      setToast({ message: 'يرجى اختيار حساب الاستقبال/الخزن', type: 'error' })
      return
    }
    if (payAmount <= 0) {
      setToast({ message: 'يرجى إدخال مبلغ صالح للقسط', type: 'error' })
      return
    }
    setPayLineSaving(true)
    try {
      const result = await payInstallmentLine(tenantId, installmentLineIdNum, {
        amount: payAmount,
        date: formData.date,
        payment_method_id: formData.payment_method_id ?? undefined,
        cash_bank_account_id: formData.main_account_id ?? undefined,
        notes: formData.notes?.trim() || undefined,
      })
      const paymentId = result.payment?.id
      queryClient.invalidateQueries({ queryKey: ['payments', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['installments', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['installment', tenantId, installmentIdNum] })
      setToast({
        message: lang === 'ar' ? 'تم تسجيل التحصيل وربطه بالقسط.' : 'Collection recorded and linked to the installment line.',
        type: 'success',
      })
      setTimeout(() => {
        if (andPrint && paymentId) {
          const basePath = formData.voucher_type === 'receipt' ? '/receipt-vouchers' : '/payment-vouchers'
          navigate(`${basePath}?view=${paymentId}`)
        } else {
          navigate(`/installments/${installmentIdNum}`)
        }
      }, 800)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      const message = err.response?.data?.message || err.message || 'حدث خطأ في الحفظ'
      setToast({ message, type: 'error' })
    } finally {
      setPayLineSaving(false)
    }
  }

  // معالج الحفظ (حفظ + ترحيل فقط)
  const handleSave = async () => {
    if (isInstallmentCollectPrefill) {
      await submitInstallmentCollect(false)
      return
    }
    const payload = buildPayload()
    if (!payload) return
    try {
      const saved = await mutation.mutateAsync(payload)
      const savedId = (saved as any)?.id as number | undefined

      if (attachmentFile && savedId) {
        setUploadingAttachment(true)
        await uploadPaymentAttachment(tenantId, savedId, attachmentFile)
        setAttachmentFile(null)
        setUploadingAttachment(false)
      }

      queryClient.invalidateQueries({ queryKey: ['payments', tenantId] })
      setToast({ message: isEdit ? 'تم تحديث السند بنجاح' : 'تم إنشاء السند بنجاح', type: 'success' })

      setTimeout(() => {
        const basePath =
          formData.voucher_type === 'receipt'
            ? '/receipt-vouchers'
            : formData.voucher_type === 'transfer'
              ? '/financial-transfers'
              : '/payment-vouchers'
        navigate(basePath)
      }, 1000)
    } catch (error: any) {
      setUploadingAttachment(false)
      const message = error.response?.data?.message || error.message || 'حدث خطأ في الحفظ'
      setToast({ message, type: 'error' })
    }
  }

  // معالج الحفظ والطباعة (حفظ + ترحيل + فتح شاشة الطباعة)
  const handleSaveAndPrint = async () => {
    if (isInstallmentCollectPrefill) {
      await submitInstallmentCollect(true)
      return
    }
    const payload = buildPayload()
    if (!payload) return
    try {
      const saved = await mutation.mutateAsync(payload)
      const savedId = (saved as any)?.id as number | undefined

      if (attachmentFile && savedId) {
        setUploadingAttachment(true)
        await uploadPaymentAttachment(tenantId, savedId, attachmentFile)
        setAttachmentFile(null)
        setUploadingAttachment(false)
      }

      queryClient.invalidateQueries({ queryKey: ['payments', tenantId] })
      setToast({ message: isEdit ? 'تم تحديث السند بنجاح' : 'تم إنشاء السند بنجاح', type: 'success' })

      setTimeout(() => {
        const basePath =
          formData.voucher_type === 'receipt'
            ? '/receipt-vouchers'
            : formData.voucher_type === 'transfer'
              ? '/financial-transfers'
              : '/payment-vouchers'
        navigate(`${basePath}?view=${savedId}`)
      }, 1000)
    } catch (error: any) {
      setUploadingAttachment(false)
      const message = error.response?.data?.message || error.message || 'حدث خطأ في الحفظ'
      setToast({ message, type: 'error' })
    }
  }

  // نفس الهامش الأفقي للشريط العلوي والمحتوى (الجداول والبطاقات)
  const voucherPagePadX = 'px-3 sm:px-4'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 voucher-full-bleed">
      {/* شريط العنوان: يتحرك مع الصفحة (غير ثابت) حتى لا تختفي حقول السند تحته عند التمرير */}
      <div>
        <div
          className={`${voucherPagePadX} py-2.5 bg-white border-b border-slate-200 ${isRtl ? 'text-right' : 'text-left'}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => navigate(-1)}
                className="text-slate-600 hover:text-slate-900 mb-1 inline-flex items-center gap-1 text-xs"
              >
                ← {t.back || 'رجوع'}
              </button>
              <h1 className="text-lg font-semibold text-slate-900">
                {isEdit
                  ? (formData.voucher_type === 'receipt'
                      ? (t.payments?.documentReceiptVoucher ?? 'سند قبض')
                      : formData.voucher_type === 'payment'
                        ? (t.payments?.documentPaymentVoucher ?? 'سند صرف')
                        : (t.payments?.documentTransfer ?? 'تحويل مالي'))
                  : (formData.voucher_type === 'receipt'
                      ? (t.payments?.newReceipt ?? 'سند قبض')
                      : formData.voucher_type === 'payment'
                        ? (t.payments?.newPayment ?? 'سند صرف')
                        : (t.payments?.newTransfer ?? 'تحويل مالي'))}
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* المحتوى الرئيسي */}
      <div className={`w-full max-w-full py-6 ${voucherPagePadX}`}>
        {toast && (
          <div className="mb-6">
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          </div>
        )}

        <VoucherForm
          data={formData}
          onDataChange={setFormData}
          accounts={accounts}
          branches={branches}
          costCenters={costCenters}
          paymentMethods={paymentMethods}
          currencies={currencies || []}
          settings={settings}
          isLoading={mutation.isPending || uploadingAttachment || payLineSaving}
          onSave={handleSave}
          onSaveAndPrint={handleSaveAndPrint}
          onCancel={() => navigate(-1)}
          mode={isEdit ? 'edit' : 'create'}
          attachmentFile={attachmentFile}
          onAttachmentFileChange={setAttachmentFile}
        />
      </div>
    </div>
  )
}
