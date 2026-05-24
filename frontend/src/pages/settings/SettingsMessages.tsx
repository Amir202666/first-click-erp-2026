import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchSettings, updateSettings } from '../../api/tenant'
import type { TenantSettings } from '../../types'
import { MessageSquare, Save, Loader2 } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import {
  DEFAULT_TEMPLATE_INVOICE_AR,
  DEFAULT_TEMPLATE_INVOICE_EN,
  DEFAULT_TEMPLATE_INSTALLMENT_AR,
  DEFAULT_TEMPLATE_INSTALLMENT_EN,
  DEFAULT_TEMPLATE_RECEIPT_AR,
  DEFAULT_TEMPLATE_RECEIPT_EN,
} from '../../utils/whatsapp'

const MESSAGE_KEYS = [
  'whatsapp_invoice_message_ar',
  'whatsapp_invoice_message_en',
  'whatsapp_installment_message_ar',
  'whatsapp_installment_message_en',
  'whatsapp_receipt_message_ar',
  'whatsapp_receipt_message_en',
  'whatsapp_default_country_code',
] as const

const PLACEHOLDERS = {
  invoice: ['{{customerName}}', '{{invoiceNumber}}', '{{total}}', '{{pdfOrViewUrl}}'],
  installment: ['{{customerName}}', '{{installmentAmount}}', '{{dueDate}}', '{{scheduleNumber}}'],
  receipt: ['{{customerName}}', '{{amountReceived}}', '{{voucherNumber}}', '{{reference}}'],
}

export default function SettingsMessages() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})

  const { data: settings, isLoading } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const updateMut = useMutation({
    mutationFn: (data: Partial<TenantSettings>) => updateSettings(tenantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setToast({ message: lang === 'ar' ? 'تم حفظ إعدادات الرسائل بنجاح' : 'Message settings saved successfully', type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? (lang === 'ar' ? 'فشل الحفظ' : 'Save failed'), type: 'error' })
    },
  })

  useEffect(() => {
    if (!settings) return
    const next: Record<string, string> = {}
    MESSAGE_KEYS.forEach((key) => {
      const val = settings[key]
      next[key] = val != null && typeof val === 'string' ? val : ''
    })
    setForm(next)
  }, [settings])

  const handleChange = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) return
    const payload: Partial<TenantSettings> = {}
    MESSAGE_KEYS.forEach((key) => {
      payload[key] = form[key] ?? ''
    })
    updateMut.mutate(payload)
  }

  const restoreDefault = (type: 'invoice' | 'installment' | 'receipt', langKey: 'ar' | 'en') => {
    const key = type === 'invoice' ? 'whatsapp_invoice_message' : type === 'installment' ? 'whatsapp_installment_message' : 'whatsapp_receipt_message'
    const fullKey = `${key}_${langKey}` as (typeof MESSAGE_KEYS)[number]
    const defaultVal =
      type === 'invoice' ? (langKey === 'ar' ? DEFAULT_TEMPLATE_INVOICE_AR : DEFAULT_TEMPLATE_INVOICE_EN)
      : type === 'installment' ? (langKey === 'ar' ? DEFAULT_TEMPLATE_INSTALLMENT_AR : DEFAULT_TEMPLATE_INSTALLMENT_EN)
      : (langKey === 'ar' ? DEFAULT_TEMPLATE_RECEIPT_AR : DEFAULT_TEMPLATE_RECEIPT_EN)
    handleChange(fullKey, defaultVal)
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const title = lang === 'ar' ? 'إعدادات الرسائل' : 'Message Settings'
  const subtitle = lang === 'ar'
    ? 'ضبط قوالب رسائل واتساب للفاتورة، الأقساط، وسندات القبض. استخدم المتغيرات بين قوسين لاستبدالها تلقائياً بالبيانات.'
    : 'Configure WhatsApp message templates for invoices, installments, and receipt vouchers. Use the variables in curly braces to be replaced with actual data.'

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center gap-3">
        <MessageSquare className="text-primary-600" size={28} />
        <div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={32} />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* كود الدولة الافتراضي */}
          <section className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">
              {lang === 'ar' ? 'كود الدولة الافتراضي للهاتف' : 'Default country code for phone'}
            </h2>
            <p className="text-xs text-slate-500 mb-3">
              {lang === 'ar' ? 'يُستخدم عند إرسال رسالة واتساب إذا لم يكن رقم العميل يبدأ بكود الدولة (مثال: 965 للكويت، 966 للسعودية).' : 'Used when sending WhatsApp message if the customer phone does not start with country code (e.g. 965 Kuwait, 966 Saudi).'}
            </p>
            <input
              type="text"
              value={form.whatsapp_default_country_code ?? ''}
              onChange={(e) => handleChange('whatsapp_default_country_code', e.target.value)}
              placeholder="965"
              className="w-full max-w-xs border border-slate-300 rounded-lg px-3 py-2 text-sm"
              dir="ltr"
            />
          </section>

          {/* قالب الفاتورة */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">
              {lang === 'ar' ? 'قالب رسالة الفاتورة' : 'Invoice message template'}
            </h2>
            <p className="text-xs text-slate-500">
              {lang === 'ar' ? 'المتغيرات: ' : 'Variables: '}
              {PLACEHOLDERS.invoice.join(', ')}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">العربية</label>
                <textarea
                  value={form.whatsapp_invoice_message_ar ?? ''}
                  onChange={(e) => handleChange('whatsapp_invoice_message_ar', e.target.value)}
                  rows={6}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-y"
                  dir="rtl"
                  placeholder={DEFAULT_TEMPLATE_INVOICE_AR}
                />
                <button type="button" onClick={() => restoreDefault('invoice', 'ar')} className="mt-1 text-xs text-primary-600 hover:underline">
                  {lang === 'ar' ? 'استعادة الافتراضي' : 'Restore default'}
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">English</label>
                <textarea
                  value={form.whatsapp_invoice_message_en ?? ''}
                  onChange={(e) => handleChange('whatsapp_invoice_message_en', e.target.value)}
                  rows={6}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-y"
                  dir="ltr"
                  placeholder={DEFAULT_TEMPLATE_INVOICE_EN}
                />
                <button type="button" onClick={() => restoreDefault('invoice', 'en')} className="mt-1 text-xs text-primary-600 hover:underline">
                  {lang === 'ar' ? 'استعادة الافتراضي' : 'Restore default'}
                </button>
              </div>
            </div>
          </section>

          {/* قالب الأقساط */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">
              {lang === 'ar' ? 'قالب رسالة الأقساط' : 'Installment message template'}
            </h2>
            <p className="text-xs text-slate-500">
              {lang === 'ar' ? 'المتغيرات: ' : 'Variables: '}
              {PLACEHOLDERS.installment.join(', ')}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">العربية</label>
                <textarea
                  value={form.whatsapp_installment_message_ar ?? ''}
                  onChange={(e) => handleChange('whatsapp_installment_message_ar', e.target.value)}
                  rows={6}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-y"
                  dir="rtl"
                  placeholder={DEFAULT_TEMPLATE_INSTALLMENT_AR}
                />
                <button type="button" onClick={() => restoreDefault('installment', 'ar')} className="mt-1 text-xs text-primary-600 hover:underline">
                  {lang === 'ar' ? 'استعادة الافتراضي' : 'Restore default'}
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">English</label>
                <textarea
                  value={form.whatsapp_installment_message_en ?? ''}
                  onChange={(e) => handleChange('whatsapp_installment_message_en', e.target.value)}
                  rows={6}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-y"
                  dir="ltr"
                  placeholder={DEFAULT_TEMPLATE_INSTALLMENT_EN}
                />
                <button type="button" onClick={() => restoreDefault('installment', 'en')} className="mt-1 text-xs text-primary-600 hover:underline">
                  {lang === 'ar' ? 'استعادة الافتراضي' : 'Restore default'}
                </button>
              </div>
            </div>
          </section>

          {/* قالب سند القبض */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">
              {lang === 'ar' ? 'قالب رسالة سند القبض' : 'Receipt voucher message template'}
            </h2>
            <p className="text-xs text-slate-500">
              {lang === 'ar' ? 'المتغيرات: ' : 'Variables: '}
              {PLACEHOLDERS.receipt.join(', ')}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">العربية</label>
                <textarea
                  value={form.whatsapp_receipt_message_ar ?? ''}
                  onChange={(e) => handleChange('whatsapp_receipt_message_ar', e.target.value)}
                  rows={6}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-y"
                  dir="rtl"
                  placeholder={DEFAULT_TEMPLATE_RECEIPT_AR}
                />
                <button type="button" onClick={() => restoreDefault('receipt', 'ar')} className="mt-1 text-xs text-primary-600 hover:underline">
                  {lang === 'ar' ? 'استعادة الافتراضي' : 'Restore default'}
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">English</label>
                <textarea
                  value={form.whatsapp_receipt_message_en ?? ''}
                  onChange={(e) => handleChange('whatsapp_receipt_message_en', e.target.value)}
                  rows={6}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-y"
                  dir="ltr"
                  placeholder={DEFAULT_TEMPLATE_RECEIPT_EN}
                />
                <button type="button" onClick={() => restoreDefault('receipt', 'en')} className="mt-1 text-xs text-primary-600 hover:underline">
                  {lang === 'ar' ? 'استعادة الافتراضي' : 'Restore default'}
                </button>
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={updateMut.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-500 disabled:opacity-50 font-medium"
            >
              {updateMut.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {lang === 'ar' ? 'حفظ الإعدادات' : 'Save settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
