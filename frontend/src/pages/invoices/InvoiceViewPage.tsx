import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import {
  fetchInvoice,
  fetchCurrencies,
  fetchSettings,
  fetchDocumentTemplate,
  fetchBoms,
  fetchBom,
  fetchWarehouses,
  markInvoiceDeliveryReady,
  unmarkInvoiceDeliveryReady,
} from '../../api/tenant'
import type { BillOfMaterial, Currency, Invoice, Warehouse } from '../../types'
import ManufacturingOrderModal from '../manufacturing/ManufacturingOrderModal'
import { finishedItemIdForSalesManufacturingBom, manufacturingFinishedQtyForBom, invoiceHasAutoManufacturingDoc } from '../../utils/manufacturingFromInvoice'
import { ArrowRight, Printer, FileText, Paperclip, X, Truck } from 'lucide-react'
import WhatsAppButton from '../../components/WhatsAppButton'
import { messageTemplateInvoice } from '../../utils/whatsapp'
import { formatDisplayDate } from '../../utils/date'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { getLocalizedName } from '../../utils/localizedName'
import InvoiceTemplateA4 from '../../components/invoice/InvoiceTemplateA4'
import DirectInvoiceRenderer from '../../components/invoice/DirectInvoiceRenderer'
import { ErrorBoundary } from '../../components/ui/ErrorBoundary'
import {
  renderTemplate,
  buildInstallmentPrintBundleFromInvoice,
  renderInstallmentScheduleOnly,
  type TemplateRenderContext,
  type ItemsTableOptions,
} from '../../utils/invoiceTemplateEngine'
import { getThemeHtml, type InvoiceThemeId } from '../../constants/invoiceThemes'
import { invoiceDocumentStatus, invoicePaymentStatus } from '../../utils/invoiceStatuses'
import { parsePrintTemplateQueryParams, resolvePrintTemplate } from '../../utils/resolvePrintTemplate'
import {
  hasRenderablePrintHtml,
  hasSubstantivePrintHtml,
  isCanvasPrintTemplateHtml,
  normalizePrintMargins,
  prepareHtmlForPrint,
  type PrintTemplatePageLayout,
  renderInvoicePrintHtml,
  resolvePrintTemplateHtmlSource,
} from '../../utils/printTemplateRender'
import { printInvoiceViaWindow } from '../../utils/printInvoiceViaWindow'
import PrintTemplateHtmlView from '../../components/print/PrintTemplateHtmlView'
import {
  buildInvoicePrintTemplateContext,
  resolveInvoicePrintDocumentType,
  printTemplatePageSizeCss,
} from '../../utils/printTemplateInvoiceContext'
import { paperOuterSizeMm } from '../../utils/printDesignerLayout'

function InvoiceViewAutoPrintTrigger({
  invoiceId,
  enabled,
  ready,
  onPrint,
}: {
  invoiceId: number
  enabled: boolean
  ready: boolean
  onPrint: () => void
}) {
  const fired = useRef(false)

  const onPrintRef = useRef(onPrint)
  onPrintRef.current = onPrint

  useEffect(() => {
    if (!enabled || !ready || fired.current) return
    const t = window.setTimeout(() => {
      fired.current = true
      onPrintRef.current()
    }, 3000)
    return () => clearTimeout(t)
  }, [enabled, ready, invoiceId])

  useEffect(() => {
    if (!enabled) return
    const onAfterPrint = () => {
      window.setTimeout(() => {
        try {
          window.close()
        } catch {
          /* ignore */
        }
      }, 300)
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [enabled])

  return null
}

export default function InvoiceViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentTenant, user } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const idNum = id != null && id !== '' ? Number(id) : NaN
  const isValidId = Number.isFinite(idNum) && idNum > 0

  const { data: currencies = [] } = useQuery<Currency[]>({
    queryKey: ['currencies', tenantId],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId,
  })
  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const { data: invoice, isLoading, error, refetch } = useQuery<Invoice>({
    queryKey: ['invoice', tenantId, id],
    queryFn: () => fetchInvoice(tenantId, idNum),
    enabled: !!tenantId && isValidId,
  })

  const printParamsFromUrl = useMemo(() => parsePrintTemplateQueryParams(searchParams), [searchParams])

  const effectivePrintDocType = useMemo(
    () => resolveInvoicePrintDocumentType(invoice, printParamsFromUrl.documentType),
    [invoice, printParamsFromUrl.documentType],
  )

  const { data: activePrintTemplate, isFetched: printTemplateFetched } = useQuery({
    queryKey: [
      'print-template-resolved',
      tenantId,
      printParamsFromUrl.templateId,
      effectivePrintDocType,
      printParamsFromUrl.paperSize,
    ],
    queryFn: () =>
      resolvePrintTemplate(tenantId, {
        templateId: printParamsFromUrl.templateId,
        documentType: effectivePrintDocType,
        paperSize: printParamsFromUrl.paperSize,
      }),
    enabled:
      !!tenantId &&
      (!!printParamsFromUrl.templateId || !!effectivePrintDocType) &&
      (!!invoice || !!printParamsFromUrl.templateId),
  })

  const isAutoPrintMode =
    searchParams.get('autoprint') === '1' ||
    searchParams.get('autoPrint') === '1' ||
    searchParams.get('print') === '1'

  useEffect(() => {
    if (!import.meta.env.DEV || !activePrintTemplate) return
    const src = resolvePrintTemplateHtmlSource(activePrintTemplate)
    // eslint-disable-next-line no-console
    console.log('[InvoiceView] template:', activePrintTemplate.name)
    // eslint-disable-next-line no-console
    console.log('[InvoiceView] html_content length:', activePrintTemplate.html_content?.length ?? 0)
    // eslint-disable-next-line no-console
    console.log('[InvoiceView] resolved source length:', src.length, 'preview:', src.slice(0, 200))
  }, [activePrintTemplate])

  const isAutoOnSale =
    (settings as Record<string, unknown> | undefined)?.manufacturing_method !== 'manual_orders'

  const finishedItemIdForMfgOrder = useMemo(() => finishedItemIdForSalesManufacturingBom(invoice), [invoice])

  const { data: bomListForMfg } = useQuery({
    queryKey: ['boms', tenantId, 'view-invoice-mfg', finishedItemIdForMfgOrder],
    queryFn: () => fetchBoms(tenantId, { finished_item_id: String(finishedItemIdForMfgOrder!), is_active: '1', per_page: '10' }),
    enabled: !!tenantId && isAutoOnSale && !!finishedItemIdForMfgOrder && invoice?.type === 'sales',
  })

  const mfgOrderBomId = bomListForMfg?.data?.[0]?.id
  const mfgOrderQty = useMemo(
    () => manufacturingFinishedQtyForBom(invoice, bomListForMfg?.data?.[0]?.finished_item_id ?? finishedItemIdForMfgOrder ?? null),
    [invoice, bomListForMfg?.data, finishedItemIdForMfgOrder]
  )

  const rawWhId = useMemo(() => {
    const wid = (settings as Record<string, unknown> | undefined)?.manufacturing_default_raw_warehouse_id
    if (wid == null || wid === '') return undefined
    const n = Number(wid)
    return n > 0 ? n : undefined
  }, [settings])

  const finWhId = useMemo(() => {
    const wid = (settings as Record<string, unknown> | undefined)?.manufacturing_default_finished_warehouse_id
    if (wid == null || wid === '') return undefined
    const n = Number(wid)
    return n > 0 ? n : undefined
  }, [settings])

  const { data: warehousesRes } = useQuery<{ data: Warehouse[] }>({
    queryKey: ['warehouses', tenantId, 'invoice-view-mfg'],
    queryFn: () => fetchWarehouses(tenantId, { per_page: '500' }),
    enabled: !!tenantId && invoice?.type === 'sales' && isAutoOnSale && !!mfgOrderBomId,
  })
  const warehouses = warehousesRes?.data ?? []

  const warehouseLabel = (whId: number | undefined) => {
    if (whId == null || whId < 1) return lang === 'ar' ? 'غير محدد في الإعدادات' : 'Not set in settings'
    const w = warehouses.find((x) => x.id === whId)
    return w ? `${w.code ? `${w.code} — ` : ''}${w.name}` : `#${whId}`
  }

  const { data: mfgBomDetail, isLoading: mfgBomDetailLoading } = useQuery<BillOfMaterial>({
    queryKey: ['bom', tenantId, mfgOrderBomId, 'invoice-view-mfg-detail', rawWhId],
    queryFn: () => fetchBom(tenantId, mfgOrderBomId!, rawWhId ? { warehouse_id: String(rawWhId) } : {}),
    enabled: !!tenantId && mfgOrderBomId != null && invoice?.type === 'sales' && isAutoOnSale,
  })

  const [showMfgOrderModal, setShowMfgOrderModal] = useState(false)
  const mfgNavStateHandledRef = useRef(false)

  const markDeliveryMut = useMutation({
    mutationFn: () => markInvoiceDeliveryReady(tenantId, idNum),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', tenantId, id] })
      queryClient.invalidateQueries({ queryKey: ['delivery-ready', tenantId] })
    },
  })
  const unmarkDeliveryMut = useMutation({
    mutationFn: () => unmarkInvoiceDeliveryReady(tenantId, idNum),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', tenantId, id] })
      queryClient.invalidateQueries({ queryKey: ['delivery-ready', tenantId] })
    },
  })

  const canToggleDeliveryReady =
    invoice?.type === 'sales' &&
    !invoice?.is_return &&
    !!invoice?.journal_entry_id &&
    invoice?.document_status !== 'cancelled' &&
    Number(invoice?.balance ?? 0) > 0.0005

  useEffect(() => {
    mfgNavStateHandledRef.current = false
  }, [idNum])

  const mfgModalContext = useMemo(
    () => ({
      invoiceNumber: invoice?.number ?? null,
      invoiceId: invoice?.id ?? null,
      operationDate: String(invoice?.date ?? '').slice(0, 10),
      userName: invoice?.createdBy?.name ?? user?.name ?? null,
      finishedUnits: mfgOrderQty,
      manufacturingJournalEntryId: invoice?.manufacturing_journal_entry?.id ?? invoice?.manufacturing_journal_entry_id ?? null,
    }),
    [invoice, mfgOrderQty, user?.name]
  )

  useEffect(() => {
    if (!invoice || !isValidId) return

    if (searchParams.get('openMfgDoc') === '1') {
      setShowMfgOrderModal(true)
      const next = new URLSearchParams(searchParams)
      next.delete('openMfgDoc')
      setSearchParams(next, { replace: true })
      return
    }

    const stateOpen = (location.state as { openManufacturingOrder?: boolean } | null)?.openManufacturingOrder === true
    if (stateOpen && !mfgNavStateHandledRef.current && mfgOrderBomId != null) {
      mfgNavStateHandledRef.current = true
      setShowMfgOrderModal(true)
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: {} })
      return
    }

    if (invoice.type !== 'sales' || !invoice.journal_entry_id) return
    if (!isAutoOnSale || mfgOrderBomId == null) return
    if (!invoiceHasAutoManufacturingDoc(invoice)) return

    const key = `erp-mfg-doc-shown-${tenantId}-${invoice.id}`
    if (sessionStorage.getItem(key) === '1') return

    setShowMfgOrderModal(true)
  }, [
    invoice,
    isValidId,
    isAutoOnSale,
    mfgOrderBomId,
    location.state,
    location.pathname,
    location.search,
    navigate,
    searchParams,
    setSearchParams,
    tenantId,
  ])

  const mfgOrderDocHref =
    invoice && isAutoOnSale && mfgOrderBomId != null
      ? (() => {
          const p = new URLSearchParams()
          p.set('openMfg', String(mfgOrderBomId))
          p.set('mfg_invoice', String(invoice.number ?? ''))
          p.set('mfg_invoice_id', String(invoice.id))
          p.set('mfg_date', String(invoice.date ?? '').slice(0, 10))
          p.set('mfg_qty', String(mfgOrderQty))
          const jid = invoice.manufacturing_journal_entry?.id ?? invoice.manufacturing_journal_entry_id
          if (jid != null && Number(jid) > 0) {
            p.set('mfg_journal', String(jid))
          }
          return `/manufacturing/bom?${p.toString()}`
        })()
      : null

  const invoiceTemplateId = settings?.invoice_template === 'custom' && settings?.invoice_template_id != null ? Number(settings.invoice_template_id) : 0
  const { data: customTemplate } = useQuery({
    queryKey: ['document-template', tenantId, invoiceTemplateId],
    queryFn: () => fetchDocumentTemplate(tenantId, invoiceTemplateId),
    enabled: !!tenantId && !!invoice && invoiceTemplateId > 0,
  })
  const qtyDecimals = coerceDecimalPlaces(settings?.doc_quantity_decimals, 2)
  const fmtQty = (n: number) => Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })

  useDocumentTitle(
    invoice
      ? lang === 'ar'
        ? `فاتورة #${invoice.number}`
        : `Invoice #${invoice.number}`
      : null
  )

  const invoiceCurrency = invoice?.currency
    ? (currencies as Currency[]).find((c) => c.code === invoice.currency) ?? { code: invoice.currency, decimal_places: 2 }
    : { decimal_places: 2 }
  const fmt = (n: number) => formatAmount(n, invoiceCurrency, locale)

  const backHref = '/invoices/sales'
  const backLabel = t.back
  const backToSales = lang === 'ar' ? 'العودة لفواتير المبيعات' : 'Back to Sales Invoices'
  const backToPurchases = lang === 'ar' ? 'العودة لفواتير المشتريات' : 'Back to Purchase Invoices'
  const fallbackMsg = t.msg?.errorOccurred ?? 'حدث خطأ غير متوقع. يرجى العودة والمحاولة مرة أخرى.'

  const [attachmentPreviewOpen, setAttachmentPreviewOpen] = useState(false)
  const [extensionWarning, setExtensionWarning] = useState(false)

  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message ?? String(e.reason ?? '')
      if (typeof msg === 'string' && msg.includes('message channel closed')) {
        setExtensionWarning(true)
      }
    }
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [])
  const attachmentUrl = invoice?.attachment_url ?? null
  const attachmentIsPdf = !!attachmentUrl && /\.pdf(\?|#|$)/i.test(attachmentUrl)

  const installmentPrintBundle = useMemo(
    () => (invoice ? buildInstallmentPrintBundleFromInvoice(invoice, formatDisplayDate) : null),
    [invoice],
  )
  const installmentQrPayload = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    if (installmentPrintBundle && invoice?.installment?.id && origin) {
      return `${origin}/installments/${invoice.installment.id}/edit`
    }
    return String(invoice?.number ?? '')
  }, [installmentPrintBundle, invoice?.installment?.id, invoice?.number])

  const printTemplateRender = useMemo(() => {
    const tpl = activePrintTemplate
    const src = tpl ? resolvePrintTemplateHtmlSource(tpl).trim() : ''
    if (!invoice || !src) return { html: null, error: null as string | null }
    const settingsRecord = settings as Record<string, unknown> | undefined
    const tenantExtra = currentTenant as Record<string, unknown> | null
    const companyName = String(settingsRecord?.company_name ?? currentTenant?.name ?? '')
    const companyLogo = settingsRecord?.company_logo as string | undefined
    const companyAddress = String(settingsRecord?.company_address ?? tenantExtra?.address ?? '')
    const companyPhone = String(settingsRecord?.company_phone ?? tenantExtra?.phone ?? '')
    const companyEmail = String(settingsRecord?.company_email ?? tenantExtra?.email ?? '')
    const taxNumber = String(settingsRecord?.company_tax_number ?? tenantExtra?.tax_registration_number ?? '')
    const docType = effectivePrintDocType
    const ctx = buildInvoicePrintTemplateContext({
      invoice,
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      taxNumber,
      companyLogo,
      currencies: currencies as Currency[],
      lang: lang === 'ar' ? 'ar' : 'en',
      formatDate: formatDisplayDate,
    })
    const accent =
      (typeof tpl?.settings?.accent_color === 'string' && tpl.settings.accent_color) ||
      (docType === 'invoice' ? '#4f46e5' : '#059669')
    const result = renderInvoicePrintHtml(src, docType, { ...ctx, accent_color: accent })
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('[print-template]', result.error)
      return { html: null, error: result.error ?? 'template render failed' }
    }
    const html = result.html?.trim() ?? ''
    if (!hasRenderablePrintHtml(html)) {
      // eslint-disable-next-line no-console
      console.warn('[print-template] rendered HTML too short or invalid', { len: html.length })
      return { html: null, error: 'empty render' }
    }
    if (!hasSubstantivePrintHtml(html)) {
      // eslint-disable-next-line no-console
      console.warn('[print-template] rendered HTML has little visible text — still using template', { len: html.length })
    }
    return { html, error: null }
  }, [activePrintTemplate, invoice, settings, currentTenant, currencies, lang, effectivePrintDocType])

  const printTemplateHtml = printTemplateRender?.html ?? null
  const printTemplateError = printTemplateRender?.error ?? null

  const invoiceLineCount = invoice?.lines?.length ?? 0
  const printPageLayout = useMemo((): PrintTemplatePageLayout | undefined => {
    if (!activePrintTemplate) return undefined
    return {
      margins: normalizePrintMargins(activePrintTemplate.margins),
      paperSize: activePrintTemplate.paper_size,
      orientation: activePrintTemplate.orientation,
    }
  }, [activePrintTemplate])
  const preparedTemplateHtml = useMemo(() => {
    if (!printTemplateHtml?.trim()) return null
    return prepareHtmlForPrint(printTemplateHtml, invoiceLineCount, printPageLayout)
  }, [printTemplateHtml, invoiceLineCount, printPageLayout])

  const printPageCss = useMemo(() => {
    if (!activePrintTemplate) return 'A4'
    return printTemplatePageSizeCss(activePrintTemplate.paper_size, activePrintTemplate.orientation)
  }, [activePrintTemplate])

  const printAreaMaxWidth = useMemo(() => {
    if (!activePrintTemplate || !printTemplateHtml) return '210mm'
    const { w } = paperOuterSizeMm(activePrintTemplate.paper_size, activePrintTemplate.orientation)
    return `${w}mm`
  }, [activePrintTemplate, printTemplateHtml])

  const openAttachmentPreview = () => {
    if (!attachmentUrl) return
    setAttachmentPreviewOpen(true)
  }

  const closeAttachmentPreview = () => setAttachmentPreviewOpen(false)

  if (!isValidId) {
    return (
      <ErrorBoundary backHref={backHref} backLabel={backLabel} fallbackMessage={fallbackMsg} isRtl={isRtl}>
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-6 p-6 bg-slate-50/50">
          <p className="text-slate-700 text-center">{t.msg?.errorOccurred ?? 'معرّف الفاتورة غير صالح.'}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/invoices/sales" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white hover:bg-primary-500 font-medium">
              <ArrowRight size={18} className={isRtl ? 'rotate-180' : ''} />
              {backToSales}
            </Link>
            <Link to="/invoices/purchases" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium">
              {backToPurchases}
            </Link>
          </div>
        </div>
      </ErrorBoundary>
    )
  }

  if (error && !invoice) {
    const axErr = error as { response?: { status?: number; data?: { message?: string } }; message?: string }
    const status = axErr?.response?.status
    const serverMessage = axErr?.response?.data?.message
    const isNotFound = status === 404
    const errorMessage = isNotFound
      ? (lang === 'ar' ? 'الفاتورة غير موجودة أو تم حذفها.' : 'Invoice not found or has been deleted.')
      : (serverMessage && String(serverMessage).trim()) || axErr?.message || (t.msg?.errorOccurred ?? 'حدث خطأ')
    return (
      <ErrorBoundary backHref={backHref} backLabel={backLabel} fallbackMessage={fallbackMsg} isRtl={isRtl}>
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-6 p-6 bg-slate-50/50">
          <p className="text-slate-700 text-center max-w-md font-medium">{errorMessage}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {!isNotFound && (
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium"
              >
                {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
              </button>
            )}
            <Link to="/invoices/sales" className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-500 font-medium">
              <ArrowRight size={18} className={isRtl ? 'rotate-180' : ''} />
              {backToSales}
            </Link>
            <Link to="/invoices/purchases" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium">
              {backToPurchases}
            </Link>
          </div>
        </div>
      </ErrorBoundary>
    )
  }

  if (isLoading || !invoice) {
    return (
      <ErrorBoundary backHref={backHref} backLabel={backLabel} fallbackMessage={fallbackMsg} isRtl={isRtl}>
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-6 p-6 bg-slate-50/50">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/invoices/sales" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white hover:bg-primary-500 font-medium">
              <ArrowRight size={18} className={isRtl ? 'rotate-180' : ''} />
              {backToSales}
            </Link>
            <Link to="/invoices/purchases" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium">
              {backToPurchases}
            </Link>
          </div>
        </div>
      </ErrorBoundary>
    )
  }

  const safeInvoice = { ...invoice, lines: invoice.lines ?? [] }

  const partyName = invoice.type === 'sales' ? getDisplayName(invoice.customer) : getDisplayName(invoice.vendor)
  const typeLabel = invoice.type === 'sales' ? t.invoices.sales : t.invoices.purchase
  const partyLabel = invoice.type === 'sales' ? t.invoices.customer : t.invoices.vendor
  const invoiceTemplate = (settings?.invoice_template as string) ?? 'professional-a4'
  const themeIds: InvoiceThemeId[] = ['classic', 'modern', 'compact']
  const useNewTheme = themeIds.includes(invoiceTemplate as InvoiceThemeId)
  const useCustomHtml = invoiceTemplate === 'custom' && customTemplate?.content
  const useA4Template = !useNewTheme && !useCustomHtml && invoiceTemplate === 'professional-a4'
  const tenantExtra = currentTenant as Record<string, unknown> | null
  const settingsRecord = settings as Record<string, unknown> | undefined
  const companyName = String(settingsRecord?.company_name ?? currentTenant?.name ?? '')
  const companyLogo = settingsRecord?.company_logo as string | undefined
  const companyAddress = String(settingsRecord?.company_address ?? tenantExtra?.address ?? '')
  const companyPhone = String(settingsRecord?.company_phone ?? tenantExtra?.phone ?? '')
  const companyEmail = String(settingsRecord?.company_email ?? tenantExtra?.email ?? '')
  const taxNumber = String(settingsRecord?.company_tax_number ?? tenantExtra?.tax_registration_number ?? '')
  const partyTaxNumber = invoice.type === 'sales' ? (invoice.customer as { tax_number?: string } | null)?.tax_number : (invoice.vendor as { tax_number?: string } | null)?.tax_number
  const itemsTableOptions: ItemsTableOptions = {
    show_discount: (settingsRecord?.template_show_discount as boolean) !== false,
    show_tax: (settingsRecord?.template_show_tax as boolean) !== false,
    show_item_code: (settingsRecord?.template_show_item_code as boolean) === true,
  }

  const templateContext: TemplateRenderContext = {
    logo: companyLogo ?? (tenantExtra?.logo as string | null),
    company_name: companyName,
    company_address: companyAddress,
    company_phone: companyPhone,
    company_email: companyEmail,
    tax_number: taxNumber,
    party_tax_number: partyTaxNumber ?? undefined,
    invoice: {
      number: String(invoice.number),
      date: formatDisplayDate(invoice.date),
      due_date: invoice.due_date ? formatDisplayDate(invoice.due_date) : undefined,
      type: invoice.type,
      payment_timing: invoice.payment_timing ?? null,
      subtotal: Number(invoice.subtotal ?? 0),
      discount_amount: Number(invoice.discount_amount ?? 0),
      tax_amount: Number(invoice.tax_amount ?? 0),
      total: Number(invoice.total ?? 0),
      amount_paid: Number(invoice.amount_paid ?? 0),
      balance: Number(invoice.balance ?? 0),
      lines: (invoice.lines ?? []).map((line) => ({
        item: line.item ? { name: line.item.name, name_en: (line.item as { name_en?: string }).name_en, code: (line.item as { code?: string }).code } : undefined,
        description: line.description,
        quantity: Number(line.quantity ?? 0),
        unit_price: Number(line.unit_price ?? 0),
        discount_percent: Number(line.discount_percent ?? 0),
        tax_percent: Number(line.tax_percent ?? 0),
        total: Number(line.total ?? 0),
      })),
    },
    customer_name: invoice.type === 'sales' ? (partyName ?? '') : undefined,
    customer_phone: invoice.type === 'sales' ? (invoice.customer as { phone?: string } | null)?.phone : undefined,
    customer_address: invoice.type === 'sales' ? (invoice.customer as { address?: string } | null)?.address : undefined,
    vendor_name: invoice.type === 'purchase' ? (partyName ?? '') : undefined,
    vendor_phone: invoice.type === 'purchase' ? (invoice.vendor as { phone?: string } | null)?.phone : undefined,
    vendor_address: invoice.type === 'purchase' ? (invoice.vendor as { address?: string } | null)?.address : undefined,
    warehouse_name: invoice.warehouse?.name,
    terms: (settingsRecord?.invoice_terms as string) ?? undefined,
    installment: installmentPrintBundle,
    qr_code_payload: installmentQrPayload,
    isRtl: isRtl,
    lang: lang === 'ar' ? 'ar' : 'en',
    fmt,
    fmtQty,
    labels: {
      invoiceNumber: t.invoices.invoiceNumber,
      invoiceDate: t.invoices.invoiceDate,
      dueDate: t.invoices.dueDate,
      customer: t.invoices.customer,
      vendor: t.invoices.vendor,
      item: t.invoices.item,
      quantity: t.invoices.quantity,
      unitPrice: t.invoices.unitPrice,
      discount: t.invoices.discount,
      tax: t.invoices.tax,
      amount: t.amount,
      subtotal: t.invoices.subtotal,
      discountAmount: t.invoices.discountAmount,
      taxAmount: t.invoices.taxAmount,
      total: t.total,
      balance: t.invoices.balance,
      installmentScheduleTitle: t.invoices.installmentScheduleTitle,
      installmentColSeq: t.invoices.installmentColSeq,
      installmentColDue: t.invoices.installmentColDue,
      installmentColAmount: t.invoices.installmentColAmount,
      installmentPrintAck: t.invoices.installmentPrintAck,
      installmentSignerName: t.invoices.installmentSignerName,
      installmentSignatureLine: t.invoices.installmentSignatureLine,
      installmentThumbprint: t.invoices.installmentThumbprint,
    },
  }

  const customHtmlContent = (() => {
    if (useNewTheme) {
      const themeHtml = getThemeHtml(invoiceTemplate as InvoiceThemeId)
      return renderTemplate(themeHtml, templateContext, itemsTableOptions)
    }
    if (useCustomHtml && customTemplate?.content) {
      const raw = customTemplate.content
      const usesShortTags =
        raw.includes('{company_name}') ||
        raw.includes('{items_table}') ||
        raw.includes('{invoice_info}') ||
        raw.includes('{installments_block}')
      if (usesShortTags) {
        return renderTemplate(raw, templateContext, itemsTableOptions)
      }
      const customer = invoice.type === 'sales' ? invoice.customer : null
      const vendor = invoice.type === 'purchase' ? invoice.vendor : null
      const party = customer ?? vendor
      let html = raw
        .replace(/\{\{company\.name\}\}/g, companyName)
        .replace(/\{\{company\.address\}\}/g, companyAddress)
        .replace(/\{\{company\.phone\}\}/g, companyPhone)
        .replace(/\{\{company\.email\}\}/g, companyEmail)
        .replace(/\{\{invoice\.number\}\}/g, String(invoice.number))
        .replace(/\{\{invoice\.date\}\}/g, formatDisplayDate(invoice.date))
        .replace(/\{\{invoice\.due_date\}\}/g, invoice.due_date ? formatDisplayDate(invoice.due_date) : '')
        .replace(/\{\{customer\.name\}\}/g, String(party ? getDisplayName(party) : ''))
        .replace(/\{\{customer\.phone\}\}/g, String(party?.phone ?? ''))
        .replace(/\{\{customer\.address\}\}/g, String(party?.address ?? ''))
        .replace(/\{\{subtotal\}\}/g, fmt(Number(invoice?.subtotal ?? 0)))
        .replace(/\{\{tax_amount\}\}/g, fmt(Number(invoice?.tax_amount ?? 0)))
        .replace(/\{\{discount_amount\}\}/g, fmt(Number(invoice?.discount_amount ?? 0)))
        .replace(/\{\{total\}\}/g, fmt(Number(invoice?.total ?? 0)))
        .replace(/\{\{amount_paid\}\}/g, fmt(Number(invoice?.amount_paid ?? 0)))
        .replace(
          /\{\{change_due\}\}/g,
          fmt(Math.max(0, Number(invoice?.amount_paid ?? 0) - Number(invoice?.total ?? 0))),
        )
        .replace(/\{\{balance\}\}/g, fmt(Number(invoice?.balance ?? 0)))
        .replace(/\{\{warehouse\.name\}\}/g, String(invoice.warehouse?.name ?? ''))
        .replace(/\{\{logo\}\}/g, String(companyLogo ?? tenantExtra?.logo ?? ''))
        .replace(/\{\{ref_num_barcode\}\}/g, `<img src="https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(String(invoice.number))}&code=Code128&dpi=96" alt="Barcode" style="height:36px;min-width:120px" />`)
        .replace(
          /\{\{ref_num_qrcode\}\}/g,
          `<img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(installmentQrPayload)}" alt="QR" style="width:80px;height:80px" />`,
        )
      const productsRows = (invoice.lines ?? []).map((line) => `<tr><td>${line.item ? getLocalizedName(line.item, lang) : (line.description ?? '—')}</td><td>${fmtQty(Number(line?.quantity ?? 0))}</td><td>${fmt(Number(line?.unit_price ?? 0))}</td><td>${fmt(Number(line?.total ?? 0))}</td></tr>`).join('')
      const productsTable = `<table class="w-full border-collapse"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>المبلغ</th></tr></thead><tbody>${productsRows}</tbody></table>`
      html = html.replace(/\{\{products\}\}/g, productsTable)
      const installmentsCustomHtml = templateContext.installment
        ? renderInstallmentScheduleOnly({
            installment: templateContext.installment,
            fmt,
            labels: templateContext.labels,
            isRtl,
            lang: lang === 'ar' ? 'ar' : 'en',
          })
        : ''
      html = html.replace(/\{\{installments_block\}\}/g, installmentsCustomHtml)
      return html
    }
    return null
  })()

  const hasPrintHtml = !!(printTemplateHtml?.trim() && printTemplateHtml.trim().length > 100)
  const hasCustomHtml = hasSubstantivePrintHtml(customHtmlContent)
  const isCanvasPrintTemplate = isCanvasPrintTemplateHtml(printTemplateHtml)
  const displayHtmlContent = hasPrintHtml
    ? (preparedTemplateHtml ?? printTemplateHtml)
    : hasCustomHtml
      ? customHtmlContent
      : null
  const useLegacyTemplates = !displayHtmlContent
  const showDirectInvoice = !displayHtmlContent && !useNewTheme && !useCustomHtml
  const htmlForPrint = printTemplateHtml ?? customHtmlContent

  const printTemplateAccent =
    (typeof activePrintTemplate?.settings?.accent_color === 'string' && activePrintTemplate.settings.accent_color) ||
    (invoice?.type === 'purchase' ? '#059669' : '#4f46e5')

  /** HTML المُصَرَّف للطباعة (~8942 حرف عند قالب canvas) — المصدر: printTemplateHtml */
  const invoicePrintHtml = (displayHtmlContent ?? htmlForPrint ?? printTemplateHtml ?? '').trim()

  const handlePrint = () => {
    const itemsCount = invoiceLineCount
    const htmlToPrint = (preparedTemplateHtml ?? invoicePrintHtml).trim()
    if (htmlToPrint.length > 100) {
      printInvoiceViaWindow(htmlToPrint, printTemplateAccent, itemsCount, printPageLayout)
    } else {
      window.print()
    }
  }

  const handleDownloadPdf = () => handlePrint()

  const printContentReady =
    printTemplateFetched &&
    !!(hasPrintHtml || displayHtmlContent || showDirectInvoice || (useLegacyTemplates && useA4Template))

  const templateT = {
    invoiceNumber: t.invoices.invoiceNumber,
    referenceNumber: t.invoices.referenceNumber,
    invoiceDate: t.invoices.invoiceDate,
    dueDate: t.invoices.dueDate,
    warehouse: t.invoices.warehouse,
    lineItems: t.invoices.lineItems,
    item: t.invoices.item,
    quantity: t.invoices.quantity,
    unitPrice: t.invoices.unitPrice,
    discount: t.invoices.discount,
    tax: t.invoices.tax,
    taxNumber: (t as { customers?: { taxNumber?: string } }).customers?.taxNumber ?? (t as { accounts?: { taxNumber?: string } }).accounts?.taxNumber ?? 'الرقم الضريبي',
    amount: t.amount,
    subtotal: t.invoices.subtotal,
    taxAmount: t.invoices.taxAmount,
    discountAmount: t.invoices.discountAmount,
    total: t.total,
    balance: t.invoices.balance,
    paymentStatus: t.invoices.paymentStatus,
    notes: t.notes,
    voucherProof: t.invoices.voucherProof,
    voucherNumber: t.invoices.voucherNumber,
    voucherDate: t.invoices.voucherDate,
    refNumBarcode: t.invoices.refNumBarcode,
    refNumQrcode: t.invoices.refNumQrcode,
    installmentScheduleTitle: t.invoices.installmentScheduleTitle,
    installmentColSeq: t.invoices.installmentColSeq,
    installmentColDue: t.invoices.installmentColDue,
    installmentColAmount: t.invoices.installmentColAmount,
    installmentPrintAck: t.invoices.installmentPrintAck,
    installmentSignerName: t.invoices.installmentSignerName,
    installmentSignatureLine: t.invoices.installmentSignatureLine,
    installmentThumbprint: t.invoices.installmentThumbprint,
    installmentQrHint: t.invoices.installmentQrHint,
  }

  const viewBackHref = invoice.type === 'purchase' ? '/invoices/purchases' : '/invoices/sales'

  const docSt = invoiceDocumentStatus(safeInvoice)
  const paySt = invoicePaymentStatus(safeInvoice)
  const showCancelledStamp = docSt === 'cancelled'
  const showPaidStamp = !showCancelledStamp && paySt === 'paid'

  return (
    <ErrorBoundary backHref={viewBackHref} backLabel={backLabel} fallbackMessage={fallbackMsg} isRtl={isRtl}>
    <div className="invoice-view-page">
      <InvoiceViewAutoPrintTrigger
        invoiceId={invoice.id}
        enabled={isAutoPrintMode}
        ready={printContentReady}
        onPrint={handlePrint}
      />
      {extensionWarning && !isAutoPrintMode ? (
        <div
          className="no-print bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {lang === 'ar'
            ? 'يبدو أن إضافة في المتصفح تؤثر على التحميل. جرّب وضع التصفح الخاص (Ctrl+Shift+N) أو عطّل الإضافات مؤقتاً.'
            : 'A browser extension may be interfering. Try Incognito mode (Ctrl+Shift+N) or disable extensions temporarily.'}
        </div>
      ) : null}
      {/* Toolbar - hidden when printing or auto-print embed */}
      {!isAutoPrintMode ? (
      <div className="no-print shrink-0 p-6 pb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white shadow-sm">
        <Link
          to={invoice.type === 'purchase' ? '/invoices/purchases' : '/invoices/sales'}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowRight size={20} className={isRtl ? 'rotate-180' : ''} />
          {t.back}
        </Link>
        <div className="flex items-center gap-2">
          {invoice.payments && invoice.payments.length > 0 && (
            <Link
              to={`/payments?invoice_id=${invoice.id}`}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <FileText size={18} />
              {t.invoices.viewLinkedVoucher}
            </Link>
          )}
          {invoice.type === 'sales' && isAutoOnSale && mfgOrderBomId != null && (
            <button
              type="button"
              onClick={() => setShowMfgOrderModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-100 border border-amber-300 text-amber-950 rounded-lg hover:bg-amber-200 transition-colors"
            >
              <FileText size={18} />
              {lang === 'ar' ? 'أمر التصنيع الآلي' : 'Manufacturing order'}
            </button>
          )}
          {canToggleDeliveryReady && (
            invoice.delivery_ready_at ? (
              <button
                type="button"
                onClick={() => unmarkDeliveryMut.mutate()}
                disabled={unmarkDeliveryMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-300 text-slate-800 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                title={lang === 'ar' ? 'إلغاء تعليم جاهز للتوصيل' : 'Clear delivery-ready flag'}
              >
                <Truck size={18} />
                {lang === 'ar' ? 'إلغاء جاهز للتوصيل' : 'Unmark delivery ready'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => markDeliveryMut.mutate()}
                disabled={markDeliveryMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-sky-100 border border-sky-400 text-sky-950 rounded-lg hover:bg-sky-200 transition-colors disabled:opacity-50"
                title={lang === 'ar' ? 'تعليم الفاتورة جاهزة للتوصيل' : 'Mark invoice as delivery-ready'}
              >
                <Truck size={18} />
                {lang === 'ar' ? 'جاهز للتوصيل' : 'Mark delivery ready'}
              </button>
            )
          )}
          <WhatsAppButton
            phone={invoice.type === 'sales' ? (invoice.customer as { phone?: string } | null)?.phone : (invoice.vendor as { phone?: string } | null)?.phone}
            message={messageTemplateInvoice(
              {
                customerName: partyName ?? '',
                invoiceNumber: String(invoice.number),
                total: fmt(Number(invoice?.total ?? 0)),
                pdfOrViewUrl: typeof window !== 'undefined' ? `${window.location.origin}/invoices/${invoice.id}` : undefined,
                lang: lang === 'ar' ? 'ar' : 'en',
              },
              (settings as Record<string, unknown>)?.whatsapp_invoice_message_ar as string | undefined,
              (settings as Record<string, unknown>)?.whatsapp_invoice_message_en as string | undefined
            )}
            defaultCountryCode={(settings as Record<string, unknown>)?.whatsapp_default_country_code as string | undefined}
            label={lang === 'ar' ? 'إرسال عبر واتساب' : 'Send via WhatsApp'}
          />
          {attachmentUrl && (
            <button
              type="button"
              onClick={openAttachmentPreview}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              title={lang === 'ar' ? 'عرض المرفق' : 'View attachment'}
            >
              <Paperclip size={18} />
              {lang === 'ar' ? 'عرض المرفق' : 'View attachment'}
            </button>
          )}
          <button
            type="button"
            onClick={handleDownloadPdf}
            title={lang === 'ar' ? 'افتح نافذة الطباعة واختر «الحفظ كـ PDF»' : 'Open print dialog and choose Save as PDF'}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
          >
            <FileText size={18} />
            {lang === 'ar' ? 'تحميل PDF' : 'Download PDF'}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
          >
            <Printer size={18} />
            {t.invoices.viewPrint}
          </button>
        </div>
      </div>
      ) : null}

      {/* Invoice document — قالب مخصص HTML أو A4 احترافي أو افتراضي */}
      <div id="invoice-print-area" className="invoice-print-document relative p-6 md:p-10 max-w-4xl mx-auto">
        {(showCancelledStamp || showPaidStamp) && (
          <div
            className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center print:z-[100]"
            aria-hidden
          >
            <div className="flex flex-col items-center gap-6 -rotate-12">
              {showCancelledStamp && (
                <div
                  className="rounded-xl border-[3px] border-red-600 px-10 py-4 text-2xl sm:text-3xl font-black uppercase tracking-[0.2em] text-red-600 opacity-80 print:opacity-95 shadow-sm"
                  style={{ fontFamily: 'inherit' }}
                >
                  {t.invoices.printStampCancelled}
                </div>
              )}
              {showPaidStamp && (
                <div
                  className="rounded-xl border-[3px] border-emerald-600 px-12 py-4 text-2xl sm:text-3xl font-black uppercase tracking-[0.25em] text-emerald-700 opacity-70 print:opacity-90 shadow-sm"
                  style={{ fontFamily: 'inherit' }}
                >
                  {t.invoices.printStampPaid}
                </div>
              )}
            </div>
          </div>
        )}
        {printTemplateError && activePrintTemplate && !hasPrintHtml && !displayHtmlContent ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4"
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            {lang === 'ar'
              ? `تعذّر عرض قالب الطباعة «${activePrintTemplate.name}». يتم عرض النسخة الافتراضية.`
              : `Could not render print template «${activePrintTemplate.name}». Showing default layout.`}
          </div>
        ) : null}
        {displayHtmlContent && hasPrintHtml ? (
          <PrintTemplateHtmlView
            html={displayHtmlContent}
            accentColor={printTemplateAccent}
            paperSize={activePrintTemplate?.paper_size ?? 'A4'}
            orientation={activePrintTemplate?.orientation ?? 'portrait'}
            className="relative z-10 rounded-xl border border-slate-200 print:shadow-none print:border print:border-slate-300"
            style={{ maxWidth: printAreaMaxWidth }}
          />
        ) : displayHtmlContent ? (
          <div
            className="invoice-custom-template bg-white rounded-xl border border-slate-200 overflow-visible print:shadow-none print:border print:border-slate-300 mx-auto p-0"
            dir={isRtl ? 'rtl' : 'ltr'}
            dangerouslySetInnerHTML={{ __html: displayHtmlContent }}
          />
        ) : showDirectInvoice ? (
          <DirectInvoiceRenderer
            invoice={safeInvoice}
            companyName={(companyName || currentTenant?.name) ?? 'First Click'}
            companyLogo={companyLogo ?? (tenantExtra?.logo as string | null | undefined)}
            companyAddress={companyAddress || (tenantExtra?.address as string | undefined)}
            companyPhone={companyPhone || (tenantExtra?.phone as string | undefined)}
            companyEmail={companyEmail || (tenantExtra?.email as string | undefined)}
            companyTaxNumber={
              (settingsRecord?.company_tax_number as string | null | undefined) ??
              (tenantExtra?.tax_registration_number as string | null | undefined) ??
              (settingsRecord?.tax_number as string | undefined)
            }
            partyLabel={partyLabel}
            partyName={partyName ?? '—'}
            partyPhone={
              invoice.type === 'sales'
                ? (invoice.customer as { phone?: string } | null)?.phone
                : (invoice.vendor as { phone?: string } | null)?.phone
            }
            partyAddress={
              invoice.type === 'sales'
                ? (invoice.customer as { address?: string } | null)?.address
                : (invoice.vendor as { address?: string } | null)?.address
            }
            partyTaxNumber={
              invoice.type === 'sales'
                ? (invoice.customer as { tax_number?: string } | null)?.tax_number
                : (invoice.vendor as { tax_number?: string } | null)?.tax_number
            }
            typeLabel={typeLabel}
            accentColor={printTemplateAccent}
            isRtl={isRtl}
            lang={lang}
            fmt={fmt}
            fmtQty={fmtQty}
            labels={{
              invoiceNumber: templateT.invoiceNumber,
              invoiceDate: templateT.invoiceDate,
              dueDate: templateT.dueDate,
              item: templateT.item,
              quantity: templateT.quantity,
              unitPrice: templateT.unitPrice,
              tax: templateT.tax,
              amount: templateT.amount,
              subtotal: templateT.subtotal,
              discountAmount: templateT.discountAmount,
              taxAmount: templateT.taxAmount,
              total: templateT.total,
              balance: templateT.balance,
              notes: templateT.notes,
            }}
          />
        ) : useLegacyTemplates && useA4Template ? (
          <InvoiceTemplateA4
            invoice={safeInvoice}
            companyName={(companyName || currentTenant?.name) ?? 'First Click'}
            companyLogo={companyLogo ?? (tenantExtra?.logo as string | null | undefined)}
            companyAddress={companyAddress || (tenantExtra?.address as string | undefined)}
            companyPhone={companyPhone || (tenantExtra?.phone as string | undefined)}
            companyEmail={companyEmail || (tenantExtra?.email as string | undefined)}
            companyTaxNumber={(settingsRecord?.company_tax_number as string | null | undefined) ?? (tenantExtra?.tax_registration_number as string | null | undefined) ?? (settingsRecord?.tax_number as string | undefined)}
            partyTaxNumber={invoice.type === 'sales' ? (invoice.customer as { tax_number?: string } | null)?.tax_number : (invoice.vendor as { tax_number?: string } | null)?.tax_number}
            typeLabel={typeLabel}
            partyLabel={partyLabel}
            partyName={partyName ?? '—'}
            warehouseName={invoice.warehouse ? getDisplayName(invoice.warehouse) : null}
            lang={lang}
            t={templateT}
            isRtl={isRtl}
            fmt={fmt}
            fmtQty={fmtQty}
          />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border print:border-slate-300">
            <div className="px-8 py-6 border-b border-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">{(companyName || currentTenant?.name) ?? 'First Click'}</h1>
                  <p className="text-slate-500 text-sm mt-1">{typeLabel}</p>
                </div>
                <div className={`${textAlign}`}>
                  <p className="text-lg font-semibold text-primary-600">#{safeInvoice.number}</p>
                  <p className="text-slate-600 text-sm">{t.invoices.invoiceDate}: {formatDisplayDate(invoice.date)}</p>
                  {invoice.due_date && (
                    <p className="text-slate-500 text-sm">{t.invoices.dueDate}: {formatDisplayDate(invoice.due_date)}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="px-8 py-4 flex flex-wrap justify-between gap-6 border-b border-slate-100">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{partyLabel}</p>
                <p className="text-slate-900 font-medium mt-1">{partyName ?? '—'}</p>
              </div>
              <div className={`flex flex-wrap gap-6 ${textAlign}`}>
                {invoice.warehouse?.name && (
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{t.invoices.warehouse}</p>
                    <p className="text-slate-700 mt-1">{invoice.warehouse.name}</p>
                  </div>
                )}
                {invoice.reference_number && (
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{t.invoices.referenceNumber}</p>
                    <p className="text-slate-700 mt-1">{invoice.reference_number}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="px-8 py-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">{t.invoices.lineItems}</h3>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-slate-600">
                    <th className={`${textAlign} py-3 font-medium`}>{t.invoices.item}</th>
                    <th className={`${textAlign} py-3 font-medium`}>{t.invoices.quantity}</th>
                    <th className={`${textAlign} py-3 font-medium`}>{t.invoices.unitPrice}</th>
                    <th className={`${textAlign} py-3 font-medium`}>{t.invoices.discount} %</th>
                    <th className={`${textAlign} py-3 font-medium`}>{t.invoices.tax} %</th>
                    <th className={`${textAlign} py-3 font-medium`}>{t.amount}</th>
                  </tr>
                </thead>
                <tbody>
                  {(safeInvoice.lines ?? []).map((line, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-3 text-slate-800">{line.item?.name ?? line.description ?? '—'}</td>
                      <td className="py-3">{fmtQty(Number(line?.quantity ?? 0))}</td>
                      <td className="py-3">{fmt(Number(line?.unit_price ?? 0))}</td>
                      <td className="py-3">{Number(line?.discount_percent ?? 0)}%</td>
                      <td className="py-3">{Number(line?.tax_percent ?? 0)}%</td>
                      <td className={`py-3 font-medium ${textAlign}`}>{fmt(Number(line?.total ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {installmentPrintBundle && (
              <div
                className="px-8 py-4 border-t border-slate-100 print:break-inside-avoid"
                dangerouslySetInnerHTML={{
                  __html: renderInstallmentScheduleOnly({
                    installment: installmentPrintBundle,
                    fmt,
                    labels: templateContext.labels,
                    isRtl,
                    lang: lang === 'ar' ? 'ar' : 'en',
                  }),
                }}
              />
            )}
            <div className="px-8 py-4 border-t border-slate-200">
              <div className="max-w-xs ml-auto space-y-1">
                {(Number(invoice.discount_amount) || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t.invoices.discountAmount}</span>
                    <span>{fmt(Number(invoice.discount_amount) || 0)}</span>
                  </div>
                )}
                {(Number(invoice.tax_amount) || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t.invoices.taxAmount}</span>
                    <span>{fmt(Number(invoice.tax_amount) || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-2 border-t border-slate-200">
                  <span>{t.total}</span>
                  <span>{fmt(Number(invoice?.total ?? 0))}</span>
                </div>
                {(Number(invoice.amount_paid) || 0) > 0 && (
                  <>
                    <div className="flex justify-between text-sm pt-1">
                      <span className="text-slate-500">{t.invoices.balance}</span>
                      <span>{fmt(Number(invoice?.balance ?? 0))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">{t.invoices.paymentStatus ?? 'المدفوع'}</span>
                      <span>{fmt(Number(invoice?.amount_paid ?? 0))}</span>
                    </div>
                    {Math.max(0, Number(invoice.amount_paid ?? 0) - Number(invoice.total ?? 0)) > 0.0005 && (
                      <div className="flex justify-between text-sm font-semibold text-amber-800 pt-0.5">
                        <span>{lang === 'ar' ? 'الباقي للعميل' : 'Change due'}</span>
                        <span dir="ltr">
                          {fmt(Math.max(0, Number(invoice.amount_paid ?? 0) - Number(invoice.total ?? 0)))}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            {invoice.journal_entry && (
              <div className="px-8 py-4 border-t border-slate-200 bg-slate-50/50">
                <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  {t.invoices.linkedJournalEntry}: {invoice.journal_entry.number}
                </h3>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-slate-500">
                      <th className={`${textAlign} py-2 font-medium`}>{t.accounts?.accountCode ?? 'رمز الحساب'}</th>
                      <th className={`${textAlign} py-2 font-medium`}>{t.accounts?.accountName ?? 'اسم الحساب'}</th>
                      <th className={`${textAlign} py-2 font-medium w-24`}>{t.journal?.debit ?? 'مدين'}</th>
                      <th className={`${textAlign} py-2 font-medium w-24`}>{t.journal?.credit ?? 'دائن'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(invoice.journal_entry.lines ?? []).map((jl, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 font-mono text-slate-500">{jl.account?.code ?? '—'}</td>
                        <td className="py-1.5 text-slate-800">{jl.account?.name ?? '—'}</td>
                        <td className="py-1.5">{(Number(jl?.debit) || 0) > 0 ? fmt(Number(jl.debit)) : ''}</td>
                        <td className="py-1.5">{(Number(jl?.credit) || 0) > 0 ? fmt(Number(jl.credit)) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 font-bold text-slate-900">
                      <td colSpan={2} className="py-1.5">{t.total}</td>
                      <td className="py-1.5">{fmt(Number(invoice.journal_entry?.total_debit ?? 0))}</td>
                      <td className="py-1.5">{fmt(Number(invoice.journal_entry?.total_credit ?? 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {(invoice.manufacturing_journal_entry || mfgOrderDocHref) && (
              <div className="px-8 py-3 border-t border-slate-200 bg-amber-50/40 space-y-2">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {invoice.manufacturing_journal_entry ? (
                    <Link
                      to={`/journal-entries/create?id=${invoice.manufacturing_journal_entry.id}`}
                      className="text-sm font-semibold text-primary-700 hover:text-primary-600 hover:underline"
                    >
                      {t.invoices.openManufacturingJournal ?? (lang === 'ar' ? 'عرض قيد التصنيع المرتبط' : 'Open linked manufacturing entry')}:{' '}
                      {invoice.manufacturing_journal_entry.number}
                    </Link>
                  ) : null}
                  {mfgOrderBomId != null && isAutoOnSale && invoice.type === 'sales' ? (
                    <button
                      type="button"
                      onClick={() => setShowMfgOrderModal(true)}
                      className="text-sm font-semibold text-slate-800 hover:text-primary-600 hover:underline"
                    >
                      {lang === 'ar' ? 'أمر تصنيع آلي (مستند)' : 'Manufacturing order document'}
                    </button>
                  ) : null}
                  {mfgOrderDocHref ? (
                    <Link to={mfgOrderDocHref} className="text-xs text-slate-600 hover:text-primary-600 hover:underline">
                      {lang === 'ar' ? 'فتح في قائمة BOM' : 'Open in BOM list'}
                    </Link>
                  ) : null}
                </div>
                {invoice.manufacturing_journal_entry?.description ? (
                  <p className="text-xs text-slate-600">{invoice.manufacturing_journal_entry.description}</p>
                ) : null}
              </div>
            )}
            {invoice.notes && (
              <div className="px-8 py-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">{t.notes}</p>
                <p className="text-sm text-slate-700 mt-1">{invoice.notes}</p>
              </div>
            )}
            {invoice.payments && invoice.payments.length > 0 && (
              <div className="px-8 py-3 border-t border-slate-200 bg-slate-50/50 print:bg-transparent">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">{t.invoices.voucherProof}</p>
                <div className="flex flex-wrap gap-4">
                  {invoice.payments.map((p) => (
                    <span key={p.id} className="text-sm text-slate-700">
                      {t.invoices.voucherNumber}: <strong>{p.number}</strong> — {t.invoices.voucherDate}: {formatDisplayDate(p.date)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {attachmentPreviewOpen && attachmentUrl && (
        <div className="no-print fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" onMouseDown={closeAttachmentPreview} />
          <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <div className="font-semibold text-slate-900">{lang === 'ar' ? 'معاينة المرفق' : 'Attachment Preview'}</div>
              <button
                type="button"
                onClick={closeAttachmentPreview}
                className="rounded-lg px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
                title={lang === 'ar' ? 'إغلاق' : 'Close'}
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 bg-white max-h-[70vh] overflow-auto">
              {attachmentIsPdf ? (
                <iframe
                  src={attachmentUrl}
                  title="attachment-preview"
                  className="w-full h-[70vh] rounded-lg border border-slate-200"
                />
              ) : (
                <img
                  src={attachmentUrl}
                  alt="attachment"
                  className="max-w-full mx-auto rounded-lg border border-slate-200"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {invoice && mfgOrderBomId != null && (
        <ManufacturingOrderModal
          open={showMfgOrderModal}
          onClose={() => {
            setShowMfgOrderModal(false)
            try {
              sessionStorage.setItem(`erp-mfg-doc-shown-${tenantId}-${invoice.id}`, '1')
            } catch {
              /* ignore */
            }
          }}
          loading={mfgBomDetailLoading}
          bom={mfgBomDetail}
          tenantId={tenantId}
          lang={lang}
          isRtl={isRtl}
          fmt={fmt}
          fmtQty={fmtQty}
          rawWarehouseLabel={warehouseLabel(rawWhId)}
          finishedWarehouseLabel={warehouseLabel(finWhId)}
          companyLogoUrl={(settings as Record<string, unknown>)?.company_logo as string | undefined}
          settings={settings}
          context={mfgModalContext}
        />
      )}

      {/* CSS طباعة الصفحة — معطّل مؤقتاً (الطباعة عبر iframe فقط)
      <style>{`
        @media print {
          @page { size: ${printPageCss}; margin: 10mm; }
          .no-print,
          .no-print * { display: none !important; }
          body.invoice-printing > *:not(#invoice-print-portal) {
            display: none !important;
          }
          body.invoice-printing #invoice-print-portal {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }
        }
      `}</style>
      */}
    </div>
    </ErrorBoundary>
  )
}
