import { useMemo, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X, Printer, FileText } from 'lucide-react'
import { fetchInvoice, fetchItem, fetchJournalEntry } from '../../api/tenant'
import type { BillOfMaterial, BillOfMaterialLine, Invoice, InvoiceLine, Item, JournalEntry, TenantSettings } from '../../types'

function inferInvoiceIdFromManufacturingJournal(je: JournalEntry | undefined): number | null {
  if (!je) return null
  if (je.source?.type === 'invoice' && je.source.id != null && Number(je.source.id) > 0) {
    return Number(je.source.id)
  }
  const rt = String(je.reference_type ?? '')
  const rid = je.reference_id
  if (rid != null && Number(rid) > 0 && (rt.endsWith('Invoice') || rt.includes('Invoice'))) {
    return Number(rid)
  }
  return null
}

function lineLinkedItem(line: InvoiceLine): Item | undefined {
  return line.item ?? (line as unknown as { item?: Item }).item
}

function itemDisplayName(item: Item | undefined | null, lang: string): string | null {
  if (!item) return null
  const ar = typeof item.name === 'string' ? item.name.trim() : ''
  if (ar) return ar
  const en = typeof item.name_en === 'string' ? item.name_en.trim() : ''
  if (en) return en
  const code = typeof item.code === 'string' ? item.code.trim() : ''
  if (code && lang !== 'ar') return code
  return null
}

/** رابط مطلق لفتح فاتورة المبيعات في تبويب جديد (الطباعة تحتفظ بنص الرقم) */
function invoiceSalesViewAbsoluteUrl(invoiceId: number): string {
  const base = import.meta.env.BASE_URL || '/'
  const root = base.endsWith('/') ? base : `${base}/`
  return new URL(`invoices/view/${invoiceId}`, `${window.location.origin}${root}`).href
}

/** يفتح التبويب الجديد صراحةً؛ يترك النقر مع Ctrl/⌘/زر أوسط للسلوك الافتراضي للمتصفح */
function openInvoiceInNewTab(e: MouseEvent<HTMLAnchorElement>, invoiceId: number): void {
  e.stopPropagation()
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  if (e.button !== 0) return
  e.preventDefault()
  const url = invoiceSalesViewAbsoluteUrl(invoiceId)
  const w = window.open(url, '_blank', 'noopener,noreferrer')
  if (w == null) {
    window.location.assign(url)
  }
}

export type MfgOrderContext = {
  invoiceNumber?: string | null
  invoiceId?: number | null
  operationDate?: string | null
  userName?: string | null
  finishedUnits?: number
  manufacturingJournalEntryId?: number | null
}

type Props = {
  open: boolean
  onClose: () => void
  loading: boolean
  bom: BillOfMaterial | undefined
  tenantId: number
  lang: string
  isRtl: boolean
  fmt: (n: number) => string
  fmtQty: (n: number) => string
  rawWarehouseLabel: string
  finishedWarehouseLabel: string
  companyLogoUrl?: string | null
  settings?: TenantSettings
  context: MfgOrderContext
}

function requiredComponentQty(line: BillOfMaterialLine, finishedUnits: number): number {
  const u = Math.max(0.0001, finishedUnits)
  return Number(line.quantity) * u
}

function unitCostForLine(line: BillOfMaterialLine): number {
  if (line.unit_cost != null && Number.isFinite(Number(line.unit_cost))) {
    return Number(line.unit_cost)
  }
  const item = line.componentItem as Item | undefined
  return item?.cost_price != null ? Number(item.cost_price) : 0
}

export default function ManufacturingOrderModal({
  open,
  onClose,
  loading,
  bom,
  tenantId,
  lang,
  isRtl,
  fmt,
  fmtQty,
  rawWarehouseLabel,
  finishedWarehouseLabel,
  companyLogoUrl,
  settings,
  context,
}: Props) {
  const explicitInvoiceId = context.invoiceId != null && context.invoiceId > 0 ? context.invoiceId : null
  const mfgJournalId =
    context.manufacturingJournalEntryId != null && Number(context.manufacturingJournalEntryId) > 0
      ? Number(context.manufacturingJournalEntryId)
      : null
  const { data: mfgJournal } = useQuery<JournalEntry>({
    queryKey: ['journal-entry', tenantId, mfgJournalId, 'mfg-resolve-invoice'],
    queryFn: () => fetchJournalEntry(tenantId, mfgJournalId!),
    enabled: open && tenantId > 0 && explicitInvoiceId == null && mfgJournalId != null,
  })

  const inferredInvoiceId = useMemo(
    () => inferInvoiceIdFromManufacturingJournal(mfgJournal),
    [mfgJournal]
  )

  const invoiceIdToFetch = explicitInvoiceId ?? inferredInvoiceId

  const isManualManufacturing = String(settings?.manufacturing_method ?? '') === 'manual_orders'
  const salesTrackingPlaceholder = lang === 'ar' ? 'لا يوجد / يدوي' : 'N/A / manual'
  const showSalesTrackingPlaceholder = isManualManufacturing || invoiceIdToFetch == null

  const { data: linkedInvoice, isLoading: invoiceQueryLoading } = useQuery<Invoice>({
    queryKey: ['invoice', tenantId, invoiceIdToFetch, 'mfg-modal-full'],
    queryFn: () => fetchInvoice(tenantId, invoiceIdToFetch!),
    enabled: open && tenantId > 0 && invoiceIdToFetch != null,
  })

  const invoiceDetailsLoading = invoiceIdToFetch != null && invoiceQueryLoading && linkedInvoice == null

  const finishedItemId = bom?.finished_item_id != null && Number(bom.finished_item_id) > 0 ? Number(bom.finished_item_id) : null
  const { data: finishedItemDetail } = useQuery<Item>({
    queryKey: ['item', tenantId, finishedItemId, 'mfg-modal-name'],
    queryFn: () => fetchItem(tenantId, finishedItemId!),
    enabled: open && tenantId > 0 && finishedItemId != null,
  })

  const snapshot = useMemo(() => {
    const raw = (linkedInvoice?.metadata as Record<string, unknown> | null | undefined)?.auto_manufacturing_order_snapshot
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  }, [linkedInvoice?.metadata])

  const resolvedJournalId = useMemo(() => {
    if (mfgJournalId != null) {
      return mfgJournalId
    }
    const jid = linkedInvoice?.manufacturing_journal_entry?.id ?? linkedInvoice?.manufacturing_journal_entry_id
    return jid != null && Number(jid) > 0 ? Number(jid) : null
  }, [mfgJournalId, linkedInvoice])

  const finishedUnits = Math.max(1, context.finishedUnits ?? 1)

  const finished = (bom?.finishedItem ?? (bom as unknown as { finished_item?: Item | null } | undefined)?.finished_item) as
    | Item
    | undefined
  const finishedName = finished?.name ?? ''
  const finishedCode =
    (finishedItemDetail?.code?.trim() || finishedItemDetail?.sku?.trim() || finished?.code || finished?.sku || '—') as string

  const lines = bom?.lines ?? []

  const invoiceNumber = useMemo(() => {
    const n = snapshot?.invoice_number
    if (typeof n === 'string' && n.trim() !== '') return n.trim()
    const fromInvoice = linkedInvoice?.number?.trim()
    const fromCtx = context.invoiceNumber?.trim()
    if (fromInvoice) return fromInvoice
    if (fromCtx) return fromCtx
    return invoiceIdToFetch ? `#${invoiceIdToFetch}` : null
  }, [snapshot, linkedInvoice?.number, context.invoiceNumber, invoiceIdToFetch])

  const branchName = useMemo(() => {
    const n = snapshot?.branch_name
    if (typeof n === 'string' && n.trim() !== '') return n.trim()
    const flat = linkedInvoice?.branch_name
    if (typeof flat === 'string' && flat.trim() !== '') return flat.trim()
    const inv = linkedInvoice as unknown as { branch?: { name?: string } | null } | undefined
    const b = linkedInvoice?.branch?.name ?? inv?.branch?.name
    return typeof b === 'string' && b.trim() !== '' ? b.trim() : null
  }, [snapshot, linkedInvoice])

  const costCenterName = useMemo(() => {
    const n = snapshot?.cost_center_name
    if (typeof n === 'string' && n.trim() !== '') return n.trim()
    const flat = linkedInvoice?.cost_center_name
    if (typeof flat === 'string' && flat.trim() !== '') return flat.trim()
    const c =
      (linkedInvoice as unknown as { costCenter?: { name?: string } | null; cost_center?: { name?: string } | null } | undefined)
        ?.costCenter?.name ??
      (linkedInvoice as unknown as { cost_center?: { name?: string } | null } | undefined)?.cost_center?.name
    return typeof c === 'string' && c.trim() !== '' ? c.trim() : null
  }, [snapshot, linkedInvoice])

  const manufacturedItemName = useMemo(() => {
    const n = snapshot?.finished_item_name
    if (typeof n === 'string' && n.trim() !== '') return n.trim()
    const fromFetchedItem = itemDisplayName(finishedItemDetail, lang)
    if (fromFetchedItem) return fromFetchedItem
    if (linkedInvoice && bom) {
      const fid = Number(bom.finished_item_id)
      const line = (linkedInvoice.lines ?? []).find((l) => Number(l.item_id) === fid)
      if (line) {
        const fromLine = itemDisplayName(lineLinkedItem(line), lang)
        if (fromLine) return fromLine
        const desc = line.description?.trim()
        if (desc) return desc
      }
    }
    if (typeof finishedName === 'string' && finishedName.trim() !== '') return finishedName.trim()
    const fallbackName =
      (bom?.finishedItem?.name ??
        (bom as unknown as { finished_item?: { name?: string } | null } | undefined)?.finished_item?.name) as
        | string
        | undefined
    if (fallbackName && fallbackName.trim() !== '') return fallbackName.trim()
    return bom ? `#${bom.finished_item_id}` : '—'
  }, [snapshot, linkedInvoice, bom, finishedName, finishedItemDetail, lang])

  const computedRows =
    bom == null
      ? []
      : lines.map((line: BillOfMaterialLine, idx: number) => {
          const rawLine = line as unknown as Record<string, unknown>
          const item = (line.componentItem ?? rawLine.component_item) as Item | undefined
          const categoryObj = item?.category
          const categoryName =
            categoryObj && typeof categoryObj === 'object' && categoryObj && 'name' in categoryObj
              ? String((categoryObj as { name?: string }).name ?? '')
              : ''
          const unitObj =
            item?.item_unit ??
            (item as { itemUnit?: { name?: string } })?.itemUnit ??
            line.unit ??
            rawLine.unit
          const unitName =
            unitObj && typeof unitObj === 'object' && 'name' in unitObj
              ? String((unitObj as { name?: string }).name ?? '')
              : ''
          const uc = unitCostForLine(line)
          const req = requiredComponentQty(line, finishedUnits)
          const avail =
            line.current_stock != null && Number.isFinite(Number(line.current_stock))
              ? Number(line.current_stock)
              : null
          const ok = avail === null ? true : avail + 1e-9 >= req
          const lt = req * uc
          return { line, idx, item, categoryName, unitName, uc, req, avail, ok, lt }
        })

  const rawMaterialsTotal = computedRows.reduce((s, r) => s + r.lt, 0)

  if (!open) {
    return null
  }

  const logo = companyLogoUrl?.trim() || null

  return (
    <>
      <style>{`
        @media print {
          .no-print-mfg { display: none !important; }
          .mfg-order-overlay { position: fixed !important; inset: 0 !important; background: white !important; align-items: flex-start !important; padding: 0 !important; }
          .mfg-order-print { box-shadow: none !important; max-height: none !important; max-width: none !important; overflow: visible !important; border-radius: 0 !important; width: 100% !important; }
          .mfg-print-body { padding: 12mm 14mm !important; }
        }
      `}</style>
      <div
        className="mfg-order-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4"
        onClick={onClose}
      >
        <div
          className="mfg-order-print pointer-events-auto bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <div className="no-print-mfg flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-3 shrink-0 gap-3">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900">
              {lang === 'ar' ? 'أمر تصنيع آلي' : 'Automated manufacturing order'}
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" />
                {lang === 'ar' ? 'طباعة PDF' : 'Print PDF'}
              </button>
              {resolvedJournalId != null ? (
                <Link
                  to={`/journal-entries/create?id=${resolvedJournalId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-500"
                >
                  <FileText className="h-4 w-4" />
                  {lang === 'ar' ? 'عرض القيد المحاسبي' : 'View journal entry'}
                </Link>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500"
                  title={
                    lang === 'ar'
                      ? 'يظهر بعد ترحيل فاتورة المبيعات المرتبطة أو عند فتح المستند من الفاتورة المرحّلة'
                      : 'Appears after posting the linked sales invoice, or open this document from the posted invoice'
                  }
                >
                  {lang === 'ar' ? 'لا يوجد قيد مرتبط' : 'No linked entry'}
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mfg-print-body p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 text-sm">
            {/* ترويسة طباعة: شعار + عنوان */}
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 print:border-slate-300">
              <div className="flex items-center gap-4 min-w-0">
                {logo ? (
                  <img src={logo} alt="" className="h-14 sm:h-16 max-w-[200px] object-contain print:h-20" />
                ) : (
                  <div className="h-14 w-28 rounded border border-dashed border-slate-200 bg-slate-50 print:hidden" />
                )}
              </div>
              <div className={`min-w-0 ${isRtl ? 'text-right' : 'text-left'}`}>
                <p className="text-xl font-bold text-slate-900">{lang === 'ar' ? 'أمر تصنيع آلي' : 'Automated manufacturing order'}</p>
              </div>
            </div>

            {loading ? (
              <div className="py-16 text-center text-slate-500">{lang === 'ar' ? 'جاري التحميل…' : 'Loading…'}</div>
            ) : !bom ? (
              <div className="py-16 text-center text-slate-500">{lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</div>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5 mb-6 print:bg-white print:border-slate-300">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-3">
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                          {lang === 'ar' ? 'المنتج التام' : 'Finished product'}
                        </p>
                        <p className="text-lg font-bold text-slate-900">{manufacturedItemName}</p>
                        <p className="text-sm text-slate-600">
                          {lang === 'ar' ? 'الكود' : 'Code'}: <span className="font-mono">{finishedCode}</span>
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-slate-700">
                        <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                          <p className="text-xs text-slate-500">{lang === 'ar' ? 'تاريخ العملية' : 'Operation date'}</p>
                          <p className="font-semibold text-slate-900">{context.operationDate?.trim() || '—'}</p>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                          <p className="text-xs text-slate-500">{lang === 'ar' ? 'المستخدم' : 'User'}</p>
                          <p className="font-semibold text-slate-900">{context.userName?.trim() || '—'}</p>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                          <p className="text-xs text-slate-500">{lang === 'ar' ? 'كمية التصنيع (وحدات تامة)' : 'Finished units'}</p>
                          <p className="font-semibold text-slate-900 tabular-nums">{fmtQty(finishedUnits)}</p>
                        </div>
                      </div>

                      {/* صف واحد (عريض): فاتورة | فرع | مركز تكلفة | مخزن خام | مخزن تام */}
                      {!invoiceIdToFetch && !isManualManufacturing && (
                        <div className="no-print-mfg rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          {lang === 'ar'
                            ? 'لعرض رقم فاتورة البيع والفرع ومركز التكلفة: افتح هذا المستند من رابط «أمر تصنيع آلي» داخل الفاتورة، أو من فاتورة مرحّلة تحتوي قيد تصنيع (MFG).'
                            : 'To show invoice #, branch, and cost center: open this document from the invoice link, or use a posted invoice with an MFG entry.'}
                        </div>
                      )}
                      <div className="overflow-x-auto print:overflow-visible -mx-0.5">
                        <div className="grid w-full min-w-[40rem] grid-cols-5 gap-2 text-slate-700">
                          <div className="min-w-0 min-h-[4.5rem] rounded-lg bg-white border border-slate-200 px-2.5 py-3 flex flex-col justify-center gap-1">
                            <p className="text-[10px] sm:text-xs text-slate-500 leading-snug">{lang === 'ar' ? 'رقم الفاتورة' : 'Invoice number'}</p>
                            {showSalesTrackingPlaceholder ? (
                              <p className="text-xs font-semibold text-slate-700 truncate">{salesTrackingPlaceholder}</p>
                            ) : (
                              <a
                                href={invoiceSalesViewAbsoluteUrl(invoiceIdToFetch!)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => openInvoiceInNewTab(e, invoiceIdToFetch!)}
                                className="block text-xs font-semibold text-primary-700 hover:text-primary-600 hover:underline truncate print:text-slate-900 print:no-underline"
                                title={invoiceNumber ?? undefined}
                              >
                                {invoiceDetailsLoading && !(invoiceNumber && invoiceNumber.trim() !== '')
                                  ? lang === 'ar'
                                    ? '…'
                                    : '…'
                                  : invoiceNumber || `#${invoiceIdToFetch}`}
                              </a>
                            )}
                          </div>
                          <div className="min-w-0 min-h-[4.5rem] rounded-lg bg-white border border-slate-200 px-2.5 py-3 flex flex-col justify-center gap-1">
                            <p className="text-[10px] sm:text-xs text-slate-500 leading-snug">{lang === 'ar' ? 'الفرع' : 'Branch'}</p>
                            <p
                              className="text-xs font-semibold text-slate-900 truncate"
                              title={
                                showSalesTrackingPlaceholder
                                  ? salesTrackingPlaceholder
                                  : invoiceDetailsLoading
                                    ? undefined
                                    : (branchName ?? undefined)
                              }
                            >
                              {showSalesTrackingPlaceholder
                                ? salesTrackingPlaceholder
                                : invoiceDetailsLoading
                                  ? lang === 'ar'
                                    ? '…'
                                    : '…'
                                  : branchName || '—'}
                            </p>
                          </div>
                          <div className="min-w-0 min-h-[4.5rem] rounded-lg bg-white border border-slate-200 px-2.5 py-3 flex flex-col justify-center gap-1">
                            <p className="text-[10px] sm:text-xs text-slate-500 leading-snug">{lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}</p>
                            <p
                              className="text-xs font-semibold text-slate-900 truncate"
                              title={
                                showSalesTrackingPlaceholder
                                  ? salesTrackingPlaceholder
                                  : invoiceDetailsLoading
                                    ? undefined
                                    : (costCenterName ?? undefined)
                              }
                            >
                              {showSalesTrackingPlaceholder
                                ? salesTrackingPlaceholder
                                : invoiceDetailsLoading
                                  ? lang === 'ar'
                                    ? '…'
                                    : '…'
                                  : costCenterName || '—'}
                            </p>
                          </div>
                          <div className="min-w-0 min-h-[4.5rem] rounded-lg border border-emerald-200 bg-emerald-50/50 px-2.5 py-3 print:bg-white flex flex-col justify-center gap-1">
                            <p className="text-[10px] sm:text-xs font-medium text-emerald-800 leading-snug">
                              {lang === 'ar' ? 'مخزن سحب الخام' : 'Raw warehouse'}
                            </p>
                            <p className="text-xs text-emerald-950 truncate" title={rawWarehouseLabel}>
                              {rawWarehouseLabel}
                            </p>
                          </div>
                          <div className="min-w-0 min-h-[4.5rem] rounded-lg border border-sky-200 bg-sky-50/50 px-2.5 py-3 print:bg-white flex flex-col justify-center gap-1">
                            <p className="text-[10px] sm:text-xs font-medium text-sky-800 leading-snug">
                              {lang === 'ar' ? 'مخزن استلام التام' : 'Finished warehouse'}
                            </p>
                            <p className="text-xs text-sky-950 truncate" title={finishedWarehouseLabel}>
                              {finishedWarehouseLabel}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden print:border-slate-300">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[880px]">
                      <thead className="bg-slate-100 border-b border-slate-200 print:bg-slate-50">
                        <tr>
                          <th className="w-12 px-2 py-3 text-center font-semibold text-slate-700">
                            {lang === 'ar' ? 'حالة التوفر' : 'Availability'}
                          </th>
                          <th className="px-3 py-3 text-start font-semibold text-slate-700 min-w-[140px]">
                            {lang === 'ar' ? 'المكوّن' : 'Component'}
                          </th>
                          <th className="px-3 py-3 text-start font-semibold text-slate-700 min-w-[100px]">
                            {lang === 'ar' ? 'الفئة' : 'Category'}
                          </th>
                          <th className="px-3 py-3 text-start font-semibold text-slate-700 w-24">
                            {lang === 'ar' ? 'الوحدة' : 'Unit'}
                          </th>
                          <th className="px-3 py-3 text-end font-semibold text-slate-700 w-28">
                            {lang === 'ar' ? 'المطلوب' : 'Required'}
                          </th>
                          <th className="px-3 py-3 text-end font-semibold text-slate-700 w-28">
                            {lang === 'ar' ? 'المتوفر' : 'Available'}
                          </th>
                          <th className="px-3 py-3 text-end font-semibold text-slate-700 w-28">
                            {lang === 'ar' ? 'تكلفة الوحدة' : 'Unit cost'}
                          </th>
                          <th className="px-3 py-3 text-end font-semibold text-slate-700 min-w-[110px]">
                            {lang === 'ar' ? 'إجمالي المكوّن' : 'Line total'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {computedRows.map(({ line, idx, item, categoryName, unitName, uc, req, avail, ok, lt }) => (
                          <tr key={line.id ?? idx} className="hover:bg-slate-50/80 print:hover:bg-transparent">
                            <td className="px-2 py-2.5 text-center align-middle">
                              <span
                                className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
                                title={
                                  ok
                                    ? lang === 'ar'
                                      ? 'متوفر'
                                      : 'Sufficient'
                                    : lang === 'ar'
                                      ? 'نقص'
                                      : 'Shortage'
                                }
                                aria-hidden
                              />
                              <span className="sr-only">
                                {ok ? (lang === 'ar' ? 'متوفر' : 'OK') : lang === 'ar' ? 'نقص' : 'Short'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-medium text-slate-900">{item?.name ?? line.component_item_id}</td>
                            <td className="px-3 py-2.5 text-slate-700">{categoryName || '—'}</td>
                            <td className="px-3 py-2.5 text-slate-700">{unitName || '—'}</td>
                            <td className="px-3 py-2.5 text-end tabular-nums">{fmtQty(req)}</td>
                            <td className="px-3 py-2.5 text-end tabular-nums">{avail === null ? '—' : fmtQty(avail)}</td>
                            <td className="px-3 py-2.5 text-end tabular-nums">{fmt(uc)}</td>
                            <td className="px-3 py-2.5 text-end font-medium tabular-nums text-slate-900">{fmt(lt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border-2 border-slate-200 bg-white p-4 sm:p-5 space-y-3 print:border-slate-400">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className="text-base font-bold text-slate-800">
                      {lang === 'ar' ? 'إجمالي تكلفة المواد الخام' : 'Total raw material cost'}
                    </span>
                    <span className="text-xl font-bold text-primary-700 tabular-nums">{fmt(rawMaterialsTotal)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
