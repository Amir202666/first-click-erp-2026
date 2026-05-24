/**
 * Barcode Labels Page - طباعة باركود الأصناف
 * Standalone page: item selection (with warehouse), label settings, live preview, print engine.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchItemsForFilter,
  fetchWarehouses,
  fetchInvoices,
  fetchInvoice,
  fetchSettings,
} from '../../api/tenant'
import type { Item, Invoice, InvoiceLine, Warehouse } from '../../types'
import { formatAmount } from '../../utils/currency'
import { Plus, Trash2, FileDown, Package } from 'lucide-react'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import JsBarcode from 'jsbarcode'

// ─── Types ─────────────────────────────────────────────────────────────────
interface SelectionRow {
  id: string
  itemId: number | null
  item: Item | null
  warehouseId: number | null
  labelCount: number
}

type ContentAlign = 'right' | 'center' | 'left'

interface LabelSettings {
  widthCm: number
  heightCm: number
  showName: boolean
  showPrice: boolean
  showBarcode: boolean
  showCode: boolean
  showCompany: boolean
  /** حجم خط موحّد لجميع عناصر الملصق */
  fontSize: number
  /** محاذاة المحتويات داخل الملصق */
  contentAlign: ContentAlign
  /** تباعد بين السطور (مضاعف لارتفاع السطر) */
  lineSpacing: number
}

const DEFAULT_LABEL: LabelSettings = {
  widthCm: 5,
  heightCm: 3,
  showName: true,
  showPrice: true,
  showBarcode: true,
  showCode: true,
  showCompany: true,
  fontSize: 10,
  contentAlign: 'right',
  lineSpacing: 1.25,
}

// cm to px at 96 DPI (1 cm = 10 mm, 1 inch = 25.4 mm)
const CM_TO_PX = (10 * 96) / 25.4
// mm to px at 96 DPI (للمسافات الآمنة والحواف)
const MM_TO_PX = 96 / 25.4

// ─── Helpers ───────────────────────────────────────────────────────────────
/** خيارات الأصناف: بحث بالاسم/الكود/الباركود، عرض اسم بارز + كود وباركود فرعي، وعند الاختيار يظهر الاسم فقط */
function toItemOptions(items: Item[], lang: 'ar' | 'en'): SearchableSelectOption[] {
  return items.map((i) => {
    const name = lang === 'ar' ? (i.name || i.code) : (i.name_en || i.name || i.code)
    const code = i.code || ''
    const barcode = (i.barcode || '').trim()
    const searchParts = [name, code, barcode].filter(Boolean)
    const label = searchParts.join(' ')
    const secondaryLabel = [code, barcode].filter(Boolean).join(' | ')
    return {
      value: i.id,
      label: label || String(i.id),
      primaryLabel: name || code || String(i.id),
      secondaryLabel: secondaryLabel || undefined,
    }
  })
}

function toWarehouseOptions(warehouses: Warehouse[]): SearchableSelectOption[] {
  return warehouses.map((w) => ({ value: w.id, label: w.name }))
}

// ─── Single label preview (reusable for preview and print) ───────────────────
function LabelBlock({
  item,
  settings,
  companyName,
  lang,
  scale = 1,
  className = '',
}: {
  item: Item | null
  settings: LabelSettings
  companyName: string
  lang: 'ar' | 'en'
  scale?: number
  className?: string
}) {
  const barcodeRef = useRef<SVGSVGElement>(null)
  const displayName = item ? (lang === 'ar' ? item.name : (item.name_en || item.name)) : '—'
  const code = item?.code ?? ''
  const price = item?.selling_price ?? 0
  const barcodeValue = (item?.barcode || item?.code || '').trim() || '0'

  useEffect(() => {
    if (!settings.showBarcode || !barcodeRef.current || !barcodeValue) return
    try {
      JsBarcode(barcodeRef.current, barcodeValue, {
        format: 'CODE128',
        width: 1.2,
        height: Math.min(settings.heightCm * 7, 56),
        displayValue: false,
        margin: 0,
      })
    } catch {
      // ignore invalid barcode
    }
  }, [barcodeValue, settings.showBarcode, settings.heightCm])

  const wPx = settings.widthCm * CM_TO_PX * scale
  const hPx = settings.heightCm * CM_TO_PX * scale

  const alignClass = settings.contentAlign === 'center' ? 'justify-center' : settings.contentAlign === 'right' ? 'justify-end' : 'justify-start'
  const textAlignStyle = { textAlign: settings.contentAlign }
  const lineHeightStyle = { lineHeight: settings.lineSpacing }
  // تباعد السطور يتحكم في الـ gap بين الصفوف (يزيد بزيادة القيمة)
  const gapPx = Math.max(2, 6 * settings.lineSpacing) * scale

  const paddingPx = 2 * MM_TO_PX * scale
  const rowFontSize = settings.fontSize * scale
  const rowBase = { fontSize: rowFontSize, ...textAlignStyle, ...lineHeightStyle }
  return (
    <div
      dir="ltr"
      className={`border border-slate-300 bg-white flex flex-col overflow-hidden box-border ${className}`}
      style={{
        width: wPx,
        height: hPx,
        padding: paddingPx,
        gap: gapPx,
        justifyContent: 'space-between',
        ...textAlignStyle,
        ...lineHeightStyle,
      }}
    >
      {settings.showCompany && companyName && (
        <div
          className={`flex w-full flex-1 min-h-0 items-center ${alignClass}`}
          style={{ ...rowBase, color: 'rgb(71,85,105)' }}
        >
          <span className="truncate max-w-full">{companyName}</span>
        </div>
      )}
      {settings.showName && (
        <div className={`font-semibold text-slate-900 truncate w-full flex-1 min-h-0 flex items-center ${alignClass}`} style={rowBase}>
          {displayName}
        </div>
      )}
      {settings.showBarcode && barcodeValue && (
        <div className={`flex w-full flex-1 min-h-0 items-center ${alignClass} overflow-hidden`} style={{ minHeight: 0 }}>
          <svg ref={barcodeRef} className="max-w-full max-h-full block" style={{ verticalAlign: 'middle' }} />
        </div>
      )}
      {settings.showCode && (
        <div className={`tabular-nums text-slate-600 w-full flex-1 min-h-0 flex items-center ${alignClass}`} style={rowBase}>
          {code}
        </div>
      )}
      {settings.showPrice && (
        <div className={`font-bold text-slate-900 tabular-nums w-full flex-1 min-h-0 flex items-center ${alignClass}`} style={rowBase}>
          {formatAmount(price, { decimal_places: 2 }, lang === 'ar' ? 'ar' : 'en-US')}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function BarcodeLabelsPage() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const [rows, setRows] = useState<SelectionRow[]>(() => [
    { id: crypto.randomUUID(), itemId: null, item: null, warehouseId: null, labelCount: 1 },
  ])
  const [settings, setSettings] = useState<LabelSettings>(DEFAULT_LABEL)
  const [companyName, setCompanyName] = useState('')
  const [purchaseInvoiceModal, setPurchaseInvoiceModal] = useState(false)
  const [purchaseInvoiceId, setPurchaseInvoiceId] = useState<number | null>(null)
  const [purchaseInvoiceLoading, setPurchaseInvoiceLoading] = useState(false)

  const { data: settingsData } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const resolvedCompanyName =
    companyName || (settingsData as { company_name?: string })?.company_name || 'First Click'

  const { data: itemsData } = useQuery({
    queryKey: ['items-for-barcode', tenantId],
    queryFn: () => fetchItemsForFilter(tenantId, { per_page: '2000' }),
    enabled: !!tenantId,
  })
  const items: Item[] = (itemsData as { data?: Item[] })?.data ?? []
  const itemOptions = useMemo(() => toItemOptions(items, lang), [items, lang])

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: !!tenantId,
  })
  const warehouses: Warehouse[] = (warehousesData as { data?: Warehouse[] })?.data ?? []

  const { data: purchaseInvoicesData } = useQuery({
    queryKey: ['invoices', 'purchase', tenantId],
    queryFn: () =>
      fetchInvoices(tenantId, { type: 'purchase', per_page: '100', page: '1' }),
    enabled: !!tenantId && purchaseInvoiceModal,
  })
  const purchaseInvoices: Invoice[] = (purchaseInvoicesData as { data?: Invoice[] })?.data ?? []
  const purchaseInvoiceOptions: SearchableSelectOption[] = purchaseInvoices.map((inv) => ({
    value: inv.id,
    label: `${inv.number} - ${inv.date}`,
  }))

  const addRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        itemId: null,
        item: null,
        warehouseId: null,
        labelCount: 1,
      },
    ])
  }, [])

  const updateRow = useCallback(
    (id: string, field: keyof SelectionRow, value: unknown) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r
          if (field === 'itemId') {
            const item = items.find((i) => i.id === Number(value))
            return { ...r, itemId: value as number | null, item: item ?? null }
          }
          if (field === 'warehouseId') return { ...r, warehouseId: value as number | null }
          if (field === 'labelCount') return { ...r, labelCount: Math.max(1, Number(value) || 1) }
          return r
        })
      )
    },
    [items]
  )

  const removeRow = useCallback((id: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)))
  }, [])

  const importFromPurchaseInvoice = useCallback(async () => {
    if (!purchaseInvoiceId) return
    setPurchaseInvoiceLoading(true)
    try {
      const inv = await fetchInvoice(tenantId, purchaseInvoiceId)
      const lines = (inv.lines ?? []) as (InvoiceLine & { item?: Item })[]
      const newRows: SelectionRow[] = lines
        .filter((l) => l.item_id && (l.item || l.item_id))
        .map((line) => {
          const item = line.item ?? items.find((i) => i.id === line.item_id!) ?? null
          return {
            id: crypto.randomUUID(),
            itemId: line.item_id,
            item: item as Item | null,
            warehouseId: inv.warehouse_id ?? null,
            labelCount: Math.max(1, Math.round(line.quantity)),
          }
        })
      if (newRows.length) setRows((prev) => [...prev, ...newRows])
      setPurchaseInvoiceModal(false)
      setPurchaseInvoiceId(null)
    } finally {
      setPurchaseInvoiceLoading(false)
    }
  }, [tenantId, purchaseInvoiceId, items])

  const previewItem = rows[0]?.item ?? items[0] ?? null
  const labelsToPrint = useMemo(() => {
    const out: Item[] = []
    rows.forEach((r) => {
      if (r.item) for (let i = 0; i < r.labelCount; i++) out.push(r.item!)
    })
    return out
  }, [rows])

  const startPrint = useCallback(() => {
    if (labelsToPrint.length === 0) return
    const a4ContentWidthCm = 19
    const labelsPerRow = Math.max(1, Math.floor(a4ContentWidthCm / settings.widthCm))
    const wPx = settings.widthCm * CM_TO_PX
    const hPx = settings.heightCm * CM_TO_PX
    const barcodeHeight = Math.min(settings.heightCm * 7, 56)
    const getBarcodeSvgHtml = (code: string): string => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      svg.setAttribute('class', 'barcode-svg')
      try {
        JsBarcode(svg, (code || '0').trim() || '0', { format: 'CODE128', width: 1.2, height: barcodeHeight, displayValue: false, margin: 0 })
        return svg.outerHTML
      } catch {
        return ''
      }
    }
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    const textAlignCss = `text-align:${settings.contentAlign};`
    const lineHeightCss = `line-height:${settings.lineSpacing};`
    const gapPxPrint = Math.max(2, Math.round(6 * settings.lineSpacing))
    const gapCss = `gap:${gapPxPrint}px;`
    const paddingMm = 2
    const paddingPxPrint = Math.round(paddingMm * 96 / 25.4)
    const rowFlex = 'flex:1;min-height:0;display:flex;align-items:center;'
    const barcodeJustify = settings.contentAlign === 'center' ? 'center' : settings.contentAlign === 'right' ? 'flex-end' : 'flex-start'
    const barcodeWrapStyle = `flex:1;min-height:24px;display:flex;align-items:center;justify-content:${barcodeJustify};`
    const content = labelsToPrint
      .map(
        (item) => {
          const barcodeSvg = settings.showBarcode ? getBarcodeSvgHtml((item.barcode || item.code || '').trim() || '0') : ''
          return `
        <div class="label-cell" style="width:${wPx}px;height:${hPx}px;padding:${paddingPxPrint}px;border:1px solid #ccc;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;${gapCss}${textAlignCss}${lineHeightCss}">
          ${settings.showCompany ? `<div style="font-size:${settings.fontSize}px;color:#475569;${textAlignCss}${lineHeightCss}${rowFlex}justify-content:${barcodeJustify}">${resolvedCompanyName}</div>` : ''}
          ${settings.showName ? `<div style="font-size:${settings.fontSize}px;font-weight:400;${textAlignCss}${lineHeightCss}${rowFlex}justify-content:${barcodeJustify}">${lang === 'ar' ? item.name : (item.name_en || item.name)}</div>` : ''}
          ${settings.showBarcode ? `<div class="barcode-wrap" style="${barcodeWrapStyle}">${barcodeSvg}</div>` : ''}
          ${settings.showCode ? `<div style="font-size:${settings.fontSize}px;${textAlignCss}${lineHeightCss}${rowFlex}justify-content:${barcodeJustify}">${item.code}</div>` : ''}
          ${settings.showPrice ? `<div style="font-size:${settings.fontSize}px;font-weight:400;${textAlignCss}${lineHeightCss}${rowFlex}justify-content:${barcodeJustify}">${formatAmount(item.selling_price, { decimal_places: 2 }, lang === 'ar' ? 'ar' : 'en-US')}</div>` : ''}
        </div>`
        }
      )
      .join('')
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="${isRtl ? 'rtl' : 'ltr'}">
      <head>
        <meta charset="utf-8">
        <title>${lang === 'ar' ? 'طباعة الباركود' : 'Barcode Labels'}</title>
        <style>
          @page { size: A4; margin: 10mm; }
          body { margin: 0; padding: 10mm; font-family: Arial, sans-serif; box-sizing: border-box; }
          * { box-sizing: border-box; }
          .grid { display: grid; grid-template-columns: repeat(${labelsPerRow}, ${wPx}px); gap: 4px; justify-content: start; }
          .label-cell { background: #fff; page-break-inside: avoid; }
          .barcode-wrap svg { max-width: 100%; height: auto; display: block; }
        </style>
      </head>
      <body>
        <div class="grid">${content}</div>
        <script>
          window.addEventListener('load', function() {
            requestAnimationFrame(function() {
              setTimeout(function() {
                window.print();
                window.onafterprint = function() { window.close(); };
              }, 100);
            });
          });
        </script>
      </body>
      </html>`)
    printWindow.document.close()
  }, [labelsToPrint, settings, resolvedCompanyName, lang, isRtl])

  const textAlign = isRtl ? 'text-right' : 'text-left'

  return (
    <div className="w-full max-w-full py-4 px-2 md:px-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-col gap-6">
        {/* ─── Selection + Settings (الجداول ولوحة التحكم) ─────────────────── */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Package className="w-5 h-5" />
                {lang === 'ar' ? 'اختيار الأصناف' : 'Selection Area'}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPurchaseInvoiceModal(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50"
                >
                  <FileDown className="w-4 h-4" />
                  {lang === 'ar' ? 'استيراد من فاتورة مشتريات' : 'Import from purchase invoice'}
                </button>
                <button
                  type="button"
                  onClick={addRow}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-500"
                >
                  <Plus className="w-4 h-4" />
                  {lang === 'ar' ? 'إضافة صنف' : 'Add item'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className={`px-3 py-2 font-medium ${textAlign}`}>
                      {lang === 'ar' ? 'الصنف' : 'Item'}
                    </th>
                    <th className={`px-3 py-2 font-medium whitespace-nowrap min-w-[10rem] ${textAlign}`}>
                      {lang === 'ar' ? 'عدد الملصقات' : 'Labels'}
                    </th>
                    <th className="px-3 py-2 w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="w-full min-w-0">
                          <SearchableSelect
                            label={lang === 'ar' ? 'الصنف' : 'Item'}
                            options={itemOptions}
                            value={row.itemId}
                            onChange={(v) => updateRow(row.id, 'itemId', v)}
                            placeholder={lang === 'ar' ? 'بحث بالاسم أو الكود أو مسح الباركود' : 'Search by name, code or scan barcode'}
                            textAlign={isRtl ? 'right' : 'left'}
                            wrapOptions
                            className="w-full"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="w-full min-w-0 min-h-[3.25rem] flex flex-col">
                          <div className={`text-xs font-medium text-slate-600 mb-1.5 min-h-[1.25rem] leading-normal flex items-center shrink-0 ${isRtl ? 'text-right justify-end' : 'text-left justify-start'}`}>
                            <span>{lang === 'ar' ? 'عدد الملصقات' : 'Labels'}</span>
                          </div>
                          <input
                            type="number"
                            min={1}
                            max={9999}
                            value={row.labelCount}
                            onChange={(e) => updateRow(row.id, 'labelCount', Math.max(1, Math.min(9999, Number(e.target.value) || 1)))}
                            className="w-full h-9 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            style={{ textAlign: isRtl ? 'right' : 'left', MozAppearance: 'textfield' }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                          title={t.delete}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── Label Settings Panel ───────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 rounded-t-xl">
              <h2 className="text-lg font-semibold text-slate-800">
                {lang === 'ar' ? 'لوحة التحكم في الملصق' : 'Label Settings'}
              </h2>
            </div>
            <div className="p-4 space-y-4 overflow-visible">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex-1 min-w-[180px] basis-0 flex flex-col gap-2">
                  <label className={`block text-sm font-medium text-slate-600 leading-[1.4] min-h-[1.4em] ${isRtl ? 'text-right' : 'text-left'}`}>
                    {lang === 'ar' ? 'عرض (سم)' : 'Width (cm)'}
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    step={0.1}
                    value={settings.widthCm}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, widthCm: Number(e.target.value) || 5 }))
                    }
                    className="w-full h-10 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none leading-normal"
                    style={{ textAlign: isRtl ? 'right' : 'left' }}
                  />
                </div>
                <div className="flex-1 min-w-[180px] basis-0 flex flex-col gap-2">
                  <label className={`block text-sm font-medium text-slate-600 leading-[1.4] min-h-[1.4em] ${isRtl ? 'text-right' : 'text-left'}`}>
                    {lang === 'ar' ? 'ارتفاع (سم)' : 'Height (cm)'}
                  </label>
                  <input
                    type="number"
                    min={1.5}
                    max={8}
                    step={0.1}
                    value={settings.heightCm}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, heightCm: Number(e.target.value) || 3 }))
                    }
                    className="w-full h-10 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none leading-normal"
                    style={{ textAlign: isRtl ? 'right' : 'left' }}
                  />
                </div>
                <div className="flex-1 min-w-[180px] basis-0 flex flex-col gap-2">
                  <label className={`block text-sm font-medium text-slate-600 leading-[1.4] min-h-[1.4em] ${isRtl ? 'text-right' : 'text-left'}`}>
                    {lang === 'ar' ? 'حجم الخط' : 'Font size'}
                  </label>
                  <select
                    value={settings.fontSize}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, fontSize: Number(e.target.value) }))
                    }
                    className="w-full h-10 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none leading-normal appearance-none"
                    style={{ textAlign: isRtl ? 'right' : 'left' }}
                  >
                    {[6, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[180px] basis-0 flex flex-col gap-2">
                  <label className={`block text-sm font-medium text-slate-600 leading-[1.4] min-h-[1.4em] ${isRtl ? 'text-right' : 'text-left'}`}>
                    {lang === 'ar' ? 'المحاذاة' : 'Alignment'}
                  </label>
                  <select
                    value={settings.contentAlign}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, contentAlign: e.target.value as ContentAlign }))
                    }
                    className="w-full h-10 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none leading-normal appearance-none"
                    style={{ textAlign: isRtl ? 'right' : 'left' }}
                  >
                    <option value="right">{lang === 'ar' ? 'يمين' : 'Right'}</option>
                    <option value="center">{lang === 'ar' ? 'وسط' : 'Center'}</option>
                    <option value="left">{lang === 'ar' ? 'يسار' : 'Left'}</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[180px] basis-0 flex flex-col gap-2">
                  <label className={`block text-sm font-medium text-slate-600 leading-[1.4] min-h-[1.4em] ${isRtl ? 'text-right' : 'text-left'}`}>
                    {lang === 'ar' ? 'تباعد السطور' : 'Line spacing'}
                  </label>
                  <select
                    value={settings.lineSpacing}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, lineSpacing: Number(e.target.value) }))
                    }
                    className="w-full h-10 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none leading-normal appearance-none"
                    style={{ textAlign: isRtl ? 'right' : 'left' }}
                  >
                    {[1, 1.1, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6, 1.7, 1.75, 1.8, 1.9, 2].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <span className="text-sm font-medium text-slate-600 block mb-2">
                  {lang === 'ar' ? 'المحتويات' : 'Contents'}
                </span>
                <div className="flex flex-wrap gap-4">
                  {[
                    {
                      key: 'showName',
                      ar: 'اسم الصنف',
                      en: 'Item name',
                    },
                    { key: 'showPrice', ar: 'السعر', en: 'Price' },
                    { key: 'showBarcode', ar: 'الباركود (خطوط)', en: 'Barcode' },
                    { key: 'showCode', ar: 'الكود الرقمي', en: 'Code' },
                    { key: 'showCompany', ar: 'اسم الشركة', en: 'Company name' },
                  ].map(({ key, ar: labelAr, en: labelEn }) => (
                    <label key={key} className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings[key as keyof LabelSettings] as boolean}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, [key]: e.target.checked }))
                        }
                        className="rounded border-slate-300 text-primary-600"
                      />
                      <span className="text-sm text-slate-700">
                        {lang === 'ar' ? labelAr : labelEn}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">
                  {lang === 'ar' ? 'اسم الشركة (على الملصق)' : 'Company name (on label)'}
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={resolvedCompanyName}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── المعاينة المباشرة (أسفل الجداول) ───────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-lg font-semibold text-slate-800">
              {lang === 'ar' ? 'المعاينة المباشرة' : 'Live preview'}
            </h2>
          </div>
          <div className="p-4 flex justify-center items-start">
            <LabelBlock
              item={previewItem}
              settings={settings}
              companyName={resolvedCompanyName}
              lang={lang}
              scale={1.2}
              className="shadow-md"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {labelsToPrint.length > 0 && (
            <p className={`text-sm text-slate-600 ${isRtl ? 'text-right' : 'text-left'}`}>
              {lang === 'ar' ? `الإجمالي: ${labelsToPrint.length} ملصق` : `Total: ${labelsToPrint.length} label(s)`}
            </p>
          )}
          <button
            type="button"
            onClick={startPrint}
            disabled={labelsToPrint.length === 0}
            className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Package className="w-5 h-5" />
            {lang === 'ar' ? 'بدء الطباعة' : 'Start print'}
          </button>
        </div>
      </div>

      {/* ─── Modal: Import from purchase invoice ───────────────────────────── */}
      {purchaseInvoiceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !purchaseInvoiceLoading && setPurchaseInvoiceModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800 mb-4">
              {lang === 'ar' ? 'استيراد من فاتورة مشتريات' : 'Import from purchase invoice'}
            </h3>
            <div className="mb-4">
              <SearchableSelect
                options={purchaseInvoiceOptions}
                value={purchaseInvoiceId}
                onChange={(v) => setPurchaseInvoiceId(v as number | null)}
                placeholder={lang === 'ar' ? 'اختر الفاتورة' : 'Select invoice'}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPurchaseInvoiceModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={importFromPurchaseInvoice}
                disabled={!purchaseInvoiceId || purchaseInvoiceLoading}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50"
              >
                {purchaseInvoiceLoading
                  ? (lang === 'ar' ? 'جاري الاستيراد...' : 'Importing...')
                  : lang === 'ar'
                    ? 'استيراد'
                    : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
