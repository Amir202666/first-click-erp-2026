/**
 * معاينة سريعة للسند من كارت الصنف — جلب AJAX + ملخص + جدول أسطر هذا الصنف + أدوات + مرفقات
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchInvoice,
  fetchTransfer,
  fetchOpeningStock,
  fetchProductionOrder,
  fetchInventoryAdjustment,
  fetchSettings,
  deleteInvoice,
  deleteTransfer,
  deleteOpeningStock,
  deleteProductionOrder,
  deleteInventoryAdjustment,
} from '../../api/tenant'
import type { Invoice, TransferHeader, OpeningStockHeader, ProductionOrder, InventoryAdjustment } from '../../types'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { formatDisplayDate } from '../../utils/date'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { Printer, Pencil, Trash2, FileText, X, Paperclip, Loader2 } from 'lucide-react'

export interface LedgerMovementLike {
  id: number
  reference_type?: string | null
  reference_id?: number | null
  date: string
  source: {
    label: string
    url?: string
    view_url?: string
    edit_url?: string
    print_url?: string
    voucher_kind?: string
    voucher_number?: string | null
  }
}

type DocKind = 'invoice' | 'transfer' | 'opening_stock' | 'production_order' | 'inventory_adjustment' | 'unknown'

function resolveDocKind(rt: string): DocKind {
  if (rt.includes('Invoice')) return 'invoice'
  if (rt.includes('TransferHeader')) return 'transfer'
  if (rt.includes('OpeningStockHeader')) return 'opening_stock'
  if (rt.includes('ProductionOrder')) return 'production_order'
  if (rt.includes('InventoryAdjustment')) return 'inventory_adjustment'
  return 'unknown'
}

function normalizePath(raw: string | undefined | null): string | null {
  const s = String(raw ?? '').trim()
  if (!s || s === '#') return null
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  return s.startsWith('/') ? s : `/${s}`
}

function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const p = path.startsWith('/') ? path : `/${path}`
  return `${window.location.origin}${p}`
}

type LedgerDeleteTarget = {
  kind: 'invoice' | 'transfer' | 'opening_stock' | 'production_order' | 'inventory_adjustment'
  id: number
}

function ledgerDeleteTarget(m: LedgerMovementLike): LedgerDeleteTarget | null {
  const id = m.reference_id
  const n = typeof id === 'number' ? id : Number(id)
  if (!Number.isFinite(n) || n <= 0) return null
  const rt = m.reference_type ?? ''
  if (rt.includes('Invoice')) return { kind: 'invoice', id: n }
  if (rt.includes('TransferHeader')) return { kind: 'transfer', id: n }
  if (rt.includes('OpeningStockHeader')) return { kind: 'opening_stock', id: n }
  if (rt.includes('ProductionOrder')) return { kind: 'production_order', id: n }
  if (rt.includes('InventoryAdjustment')) return { kind: 'inventory_adjustment', id: n }
  return null
}

function ledgerEditPath(m: LedgerMovementLike): string | null {
  return normalizePath(m.source?.edit_url)
}

interface Props {
  movement: LedgerMovementLike
  ledgerItemId: number
  tenantId: number
  onClose: () => void
}

export default function ItemLedgerDocumentPreviewModal({ movement, ledgerItemId, tenantId, onClose }: Props) {
  const { t, lang, isRtl } = useLanguage()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const numAlign = 'text-right'

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const refId = movement.reference_id
  const refNum = typeof refId === 'number' ? refId : Number(refId)
  const rt = movement.reference_type ?? ''
  const docKind = resolveDocKind(rt)
  const hasRef = Number.isFinite(refNum) && refNum > 0
  const deleteTarget = ledgerDeleteTarget(movement)
  const editPath = ledgerEditPath(movement)

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: tenantId > 0,
  })
  const amountDecimals = coerceDecimalPlaces(settings?.doc_amount_decimals, 2)
  const qtyDecimals = coerceDecimalPlaces(settings?.doc_quantity_decimals, 2)
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmtMoney = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)
  const fmtQty = (n: number) =>
    Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })

  const invoiceQ = useQuery({
    queryKey: ['ledger-preview-invoice', tenantId, refNum],
    queryFn: () => fetchInvoice(tenantId, refNum),
    enabled: tenantId > 0 && hasRef && docKind === 'invoice',
  })

  const transferQ = useQuery({
    queryKey: ['ledger-preview-transfer', tenantId, refNum],
    queryFn: () => fetchTransfer(tenantId, refNum),
    enabled: tenantId > 0 && hasRef && docKind === 'transfer',
  })

  const openingQ = useQuery({
    queryKey: ['ledger-preview-opening', tenantId, refNum],
    queryFn: () => fetchOpeningStock(tenantId, refNum),
    enabled: tenantId > 0 && hasRef && docKind === 'opening_stock',
  })

  const poQ = useQuery({
    queryKey: ['ledger-preview-po', tenantId, refNum],
    queryFn: () => fetchProductionOrder(tenantId, refNum),
    enabled: tenantId > 0 && hasRef && docKind === 'production_order',
  })

  const adjQ = useQuery({
    queryKey: ['ledger-preview-inventory-adjustment', tenantId, refNum],
    queryFn: () => fetchInventoryAdjustment(tenantId, refNum),
    enabled: tenantId > 0 && hasRef && docKind === 'inventory_adjustment',
  })

  const loadingDoc =
    (docKind === 'invoice' && invoiceQ.isLoading) ||
    (docKind === 'transfer' && transferQ.isLoading) ||
    (docKind === 'opening_stock' && openingQ.isLoading) ||
    (docKind === 'production_order' && poQ.isLoading) ||
    (docKind === 'inventory_adjustment' && adjQ.isLoading)

  const docError =
    (docKind === 'invoice' && invoiceQ.error) ||
    (docKind === 'transfer' && transferQ.error) ||
    (docKind === 'opening_stock' && openingQ.error) ||
    (docKind === 'production_order' && poQ.error) ||
    (docKind === 'inventory_adjustment' && adjQ.error)

  const deleteMut = useMutation({
    mutationFn: async (target: LedgerDeleteTarget) => {
      switch (target.kind) {
        case 'invoice':
          return deleteInvoice(tenantId, target.id)
        case 'transfer':
          return deleteTransfer(tenantId, target.id)
        case 'opening_stock':
          return deleteOpeningStock(tenantId, target.id)
        case 'production_order':
          return deleteProductionOrder(tenantId, target.id)
        case 'inventory_adjustment':
          return deleteInventoryAdjustment(tenantId, target.id)
        default:
          throw new Error('unsupported')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-ledger', tenantId, ledgerItemId] })
      setDeleteOpen(false)
      onClose()
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { message?: string } } }
      const msg = ax?.response?.data?.message
      setActionError(
        typeof msg === 'string' && msg.trim()
          ? msg
          : lang === 'ar'
            ? 'تعذر الحذف'
            : 'Delete failed',
      )
    },
  })

  const invoiceLinesFiltered = useMemo(() => {
    const inv = invoiceQ.data as Invoice | undefined
    if (!inv?.lines?.length) return []
    const hit = inv.lines.filter((l) => l.item_id === ledgerItemId)
    return hit.length > 0 ? hit : inv.lines
  }, [invoiceQ.data, ledgerItemId])

  const transferLinesFiltered = useMemo(() => {
    const tr = transferQ.data as TransferHeader | undefined
    const lines = tr?.lines ?? []
    const hit = lines.filter((l) => l.item_id === ledgerItemId)
    return hit.length > 0 ? hit : lines
  }, [transferQ.data, ledgerItemId])

  const openingItemsFiltered = useMemo(() => {
    const h = openingQ.data as OpeningStockHeader | undefined
    const items = h?.items ?? []
    const hit = items.filter((i) => i.item_id === ledgerItemId)
    return hit.length > 0 ? hit : items
  }, [openingQ.data, ledgerItemId])

  const poMaterialsFiltered = useMemo(() => {
    const po = poQ.data as ProductionOrder | undefined
    const mats = po?.materials ?? []
    const hit = mats.filter((m) => m.item_id === ledgerItemId)
    if (hit.length > 0) return { rows: hit, mode: 'material' as const }
    if (po?.finished_item_id === ledgerItemId) return { rows: [], mode: 'finished' as const, po }
    return { rows: mats, mode: 'all' as const }
  }, [poQ.data, ledgerItemId])

  const adjLinesFiltered = useMemo(() => {
    const adj = adjQ.data as InventoryAdjustment | undefined
    const lines = adj?.lines ?? []
    const hit = lines.filter((l) => l.item_id === ledgerItemId)
    return hit.length > 0 ? hit : lines
  }, [adjQ.data, ledgerItemId])

  function handlePrint() {
    setActionError(null)
    let url =
      normalizePath(movement.source?.print_url) ||
      normalizePath(movement.source?.view_url) ||
      normalizePath(movement.source?.url)

    if (docKind === 'invoice' && hasRef) {
      const pathOnly = url ? url.replace(/^https?:\/\/[^/]+/i, '') : ''
      const wrongListStyle = /^\/invoices\/\d+$/.test(pathOnly)
      if (wrongListStyle) {
        const id = pathOnly.match(/^\/invoices\/(\d+)$/)?.[1]
        url = id ? `/invoices/view/${id}` : `/invoices/view/${refNum}`
      } else if (!url) {
        url = `/invoices/view/${refNum}`
      }
    }

    if (docKind === 'inventory_adjustment' && hasRef && !url) {
      url = `/inventory/adjustments/view/${refNum}`
    }

    if (!url) {
      setActionError(lang === 'ar' ? 'لا يوجد رابط طباعة' : 'No print URL')
      return
    }
    const w = window.open(absoluteUrl(url), '_blank', 'noopener,noreferrer')
    if (w) {
      w.onload = () => {
        try {
          w.focus()
          w.print()
        } catch {
          /* ignore */
        }
      }
    }
  }

  function headerBlock() {
    const inv = invoiceQ.data as Invoice | undefined
    if (docKind === 'invoice' && inv) {
      const account =
        inv.type === 'purchase'
          ? inv.vendor?.name ?? (lang === 'ar' ? 'مورد' : 'Vendor')
          : inv.customer?.name ?? (lang === 'ar' ? 'عميل' : 'Customer')
      return (
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm ${textAlign}`}>
          <div>
            <span className="text-slate-500">{lang === 'ar' ? 'رقم السند' : 'Document no.'}:</span>{' '}
            <span className="font-mono font-semibold text-slate-900">{inv.number}</span>
          </div>
          <div>
            <span className="text-slate-500">{t.date}:</span>{' '}
            <span className="text-slate-900">{formatDisplayDate(inv.date)}</span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500">{lang === 'ar' ? 'الحساب' : 'Account'}:</span>{' '}
            <span className="text-slate-900">{account}</span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500">{lang === 'ar' ? 'البيان' : 'Notes'}:</span>{' '}
            <span className="text-slate-800">{inv.notes?.trim() || '—'}</span>
          </div>
        </div>
      )
    }

    const tr = transferQ.data as TransferHeader | undefined
    if (docKind === 'transfer' && tr) {
      return (
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm ${textAlign}`}>
          <div>
            <span className="text-slate-500">{lang === 'ar' ? 'رقم السند' : 'Document no.'}:</span>{' '}
            <span className="font-mono font-semibold text-slate-900">{tr.number}</span>
          </div>
          <div>
            <span className="text-slate-500">{t.date}:</span>{' '}
            <span className="text-slate-900">{formatDisplayDate(tr.date)}</span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500">{lang === 'ar' ? 'المسار' : 'Route'}:</span>{' '}
            <span className="text-slate-900">
              {tr.from_warehouse?.name ?? '—'} → {tr.to_warehouse?.name ?? '—'}
            </span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500">{lang === 'ar' ? 'البيان' : 'Notes'}:</span>{' '}
            <span className="text-slate-800">{tr.notes?.trim() || '—'}</span>
          </div>
        </div>
      )
    }

    const os = openingQ.data as OpeningStockHeader | undefined
    if (docKind === 'opening_stock' && os) {
      return (
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm ${textAlign}`}>
          <div>
            <span className="text-slate-500">{lang === 'ar' ? 'المرجع' : 'Reference'}:</span>{' '}
            <span className="font-mono font-semibold text-slate-900">{os.reference_number ?? '—'}</span>
          </div>
          <div>
            <span className="text-slate-500">{t.date}:</span>{' '}
            <span className="text-slate-900">{formatDisplayDate(os.date)}</span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500">{lang === 'ar' ? 'الفرع / المخزن' : 'Branch / Warehouse'}:</span>{' '}
            <span className="text-slate-900">
              {os.branch?.name ?? '—'} / {os.warehouse?.name ?? '—'}
            </span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500">{lang === 'ar' ? 'البيان' : 'Notes'}:</span>{' '}
            <span className="text-slate-800">{os.notes?.trim() || '—'}</span>
          </div>
        </div>
      )
    }

    const po = poQ.data as ProductionOrder | undefined
    if (docKind === 'production_order' && po) {
      return (
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm ${textAlign}`}>
          <div>
            <span className="text-slate-500">{lang === 'ar' ? 'رقم الأمر' : 'Order no.'}:</span>{' '}
            <span className="font-mono font-semibold text-slate-900">{po.number}</span>
          </div>
          <div>
            <span className="text-slate-500">{t.date}:</span>{' '}
            <span className="text-slate-900">{formatDisplayDate(po.order_date)}</span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500">{lang === 'ar' ? 'الصنف التام' : 'Finished item'}:</span>{' '}
            <span className="text-slate-900">{po.finished_item?.name ?? po.finishedItem?.name ?? '—'}</span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500">{lang === 'ar' ? 'البيان' : 'Notes'}:</span>{' '}
            <span className="text-slate-800">{po.notes?.trim() || '—'}</span>
          </div>
        </div>
      )
    }

    const adj = adjQ.data as InventoryAdjustment | undefined
    if (docKind === 'inventory_adjustment' && adj) {
      const typeLabel =
        adj.adjustment_type === 'out'
          ? lang === 'ar'
            ? 'صرف (نقص)'
            : 'Out (decrease)'
          : lang === 'ar'
            ? 'إضافة (زيادة)'
            : 'In (increase)'
      return (
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm ${textAlign}`}>
          <div>
            <span className="text-slate-500">{lang === 'ar' ? 'رقم السند' : 'Document no.'}:</span>{' '}
            <span className="font-mono font-semibold text-slate-900">{adj.number?.trim() || `#${adj.id}`}</span>
          </div>
          <div>
            <span className="text-slate-500">{t.date}:</span>{' '}
            <span className="text-slate-900">{formatDisplayDate(adj.date)}</span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500">{lang === 'ar' ? 'نوع التسوية' : 'Adjustment type'}:</span>{' '}
            <span className="text-slate-900">{typeLabel}</span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500">{lang === 'ar' ? 'المخزن' : 'Warehouse'}:</span>{' '}
            <span className="text-slate-900">{adj.warehouse?.name ?? '—'}</span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500">{lang === 'ar' ? 'البيان' : 'Notes'}:</span>{' '}
            <span className="text-slate-800">{adj.notes?.trim() || '—'}</span>
          </div>
        </div>
      )
    }

    return (
      <div className={`text-sm text-slate-600 ${textAlign}`}>
        <p>{movement.source?.label ?? '—'}</p>
        <p className="mt-1">
          <span className="text-slate-500">{t.date}:</span> {formatDisplayDate(movement.date)}
        </p>
      </div>
    )
  }

  function linesTable() {
    if (docKind === 'invoice' && invoiceQ.data) {
      const inv = invoiceQ.data as Invoice
      return (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className={`px-2 py-2 ${textAlign}`}>{lang === 'ar' ? 'الصنف' : 'Item'}</th>
                <th className={`px-2 py-2 ${numAlign} w-24`}>{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                <th className={`px-2 py-2 ${numAlign} w-28`}>{lang === 'ar' ? 'سعر' : 'Price'}</th>
                <th className={`px-2 py-2 ${numAlign} w-28`}>{lang === 'ar' ? 'الإجمالي' : 'Line total'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoiceLinesFiltered.map((line) => (
                <tr key={line.id ?? `${line.item_id}-${line.description}`} className="bg-white">
                  <td className={`px-2 py-2 ${textAlign}`}>
                    <div className="font-medium text-slate-800">{line.item?.name ?? line.description}</div>
                    {line.description && line.item?.name && (
                      <div className="text-slate-500 text-[11px]">{line.description}</div>
                    )}
                  </td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtQty(Number(line.quantity))}</td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtMoney(Number(line.unit_price))}</td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign} font-medium`}>
                    {fmtMoney(Number(line.total ?? line.amount ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (docKind === 'transfer' && transferQ.data) {
      return (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className={`px-2 py-2 ${textAlign}`}>{lang === 'ar' ? 'الصنف' : 'Item'}</th>
                <th className={`px-2 py-2 ${numAlign} w-24`}>{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                <th className={`px-2 py-2 ${numAlign} w-28`}>{lang === 'ar' ? 'تكلفة' : 'Cost'}</th>
                <th className={`px-2 py-2 ${numAlign} w-28`}>{lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transferLinesFiltered.map((line) => (
                <tr key={line.id} className="bg-white">
                  <td className={`px-2 py-2 ${textAlign}`}>{line.item?.name ?? `#${line.item_id}`}</td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtQty(Number(line.quantity))}</td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtMoney(Number(line.unit_cost))}</td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtMoney(Number(line.total_cost))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (docKind === 'opening_stock' && openingQ.data) {
      return (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className={`px-2 py-2 ${textAlign}`}>{lang === 'ar' ? 'الصنف' : 'Item'}</th>
                <th className={`px-2 py-2 ${numAlign} w-24`}>{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                <th className={`px-2 py-2 ${numAlign} w-28`}>{lang === 'ar' ? 'تكلفة' : 'Cost'}</th>
                <th className={`px-2 py-2 ${numAlign} w-28`}>{lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {openingItemsFiltered.map((line) => (
                <tr key={line.id ?? line.item_id} className="bg-white">
                  <td className={`px-2 py-2 ${textAlign}`}>{line.item?.name ?? `#${line.item_id}`}</td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtQty(Number(line.quantity))}</td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtMoney(Number(line.unit_cost))}</td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtMoney(Number(line.total_cost))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (docKind === 'inventory_adjustment' && adjQ.data) {
      return (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className={`px-2 py-2 ${textAlign}`}>{lang === 'ar' ? 'الصنف' : 'Item'}</th>
                <th className={`px-2 py-2 ${numAlign} w-24`}>{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                <th className={`px-2 py-2 ${numAlign} w-28`}>{lang === 'ar' ? 'م . التكلفة' : 'Avg cost'}</th>
                <th className={`px-2 py-2 ${numAlign} w-28`}>{lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adjLinesFiltered.map((line) => (
                <tr key={line.id} className="bg-white">
                  <td className={`px-2 py-2 ${textAlign}`}>{line.item?.name ?? `#${line.item_id}`}</td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtQty(Number(line.quantity))}</td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtMoney(Number(line.unit_cost))}</td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtMoney(Number(line.total_cost))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (docKind === 'production_order' && poQ.data) {
      const po = poQ.data as ProductionOrder
      const { rows, mode } = poMaterialsFiltered as {
        rows: import('../../types').ProductionOrderMaterial[]
        mode: 'material' | 'finished' | 'all'
        po?: ProductionOrder
      }
      if (mode === 'finished') {
        return (
          <div className={`rounded-lg border border-slate-200 p-3 text-sm ${textAlign} bg-white`}>
            <p className="text-slate-700">
              {lang === 'ar' ? 'حركة الصنف التام: الكمية المطلوبة' : 'Finished item movement — quantity'}{' '}
              <span className="font-semibold tabular-nums">{fmtQty(Number(po.quantity))}</span>
            </p>
          </div>
        )
      }
      return (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className={`px-2 py-2 ${textAlign}`}>{lang === 'ar' ? 'المادة' : 'Material'}</th>
                <th className={`px-2 py-2 ${numAlign} w-24`}>{lang === 'ar' ? 'مطلوب' : 'Req.'}</th>
                <th className={`px-2 py-2 ${numAlign} w-24`}>{lang === 'ar' ? 'مستهلك' : 'Used'}</th>
                <th className={`px-2 py-2 ${numAlign} w-28`}>{lang === 'ar' ? 'التكلفة' : 'Cost'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((line) => (
                <tr key={line.id} className="bg-white">
                  <td className={`px-2 py-2 ${textAlign}`}>{line.item?.name ?? `#${line.item_id}`}</td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtQty(Number(line.quantity_required))}</td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtQty(Number(line.quantity_consumed))}</td>
                  <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtMoney(Number(line.total_cost))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    return (
      <p className={`text-xs text-slate-500 ${textAlign}`}>
        {lang === 'ar' ? 'لا تفاصيل أسطر متاحة لهذا السند.' : 'No line details available.'}
      </p>
    )
  }

  const previewAttachment =
    docKind === 'invoice'
      ? (invoiceQ.data as Invoice | undefined)?.attachment_url
      : docKind === 'inventory_adjustment'
        ? (adjQ.data as InventoryAdjustment | undefined)?.attachment_url
        : undefined

  return (
    <>
      <div
        className="no-print fixed inset-0 z-[140] flex items-center justify-center p-2 sm:p-4"
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          className="absolute inset-0 z-0 bg-slate-900/55 cursor-default"
          aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
          onClick={onClose}
        />
        <div
          className={`relative z-[141] flex flex-col w-full max-w-3xl max-h-[92vh] rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden ${isRtl ? 'rtl' : 'ltr'}`}
        >
          {/* شريط أدوات */}
          <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-2 justify-between">
            <div className={`flex flex-wrap items-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              >
                <Printer size={14} />
                {t.accounts?.print ?? (lang === 'ar' ? 'طباعة' : 'Print')}
              </button>
              {editPath && (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    navigate(editPath)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-900 hover:bg-primary-100"
                >
                  <Pencil size={14} />
                  {t.edit}
                </button>
              )}
              {deleteTarget && (
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null)
                    setDeleteOpen(true)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-900 hover:bg-red-100"
                >
                  <Trash2 size={14} />
                  {t.delete}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"
              aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{movement.source?.label ?? '—'}</h2>
            </div>

            {loadingDoc && (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
                <Loader2 className="animate-spin" size={22} />
                <span className="text-sm">{lang === 'ar' ? 'جاري التحميل…' : 'Loading…'}</span>
              </div>
            )}

            {docError && !loadingDoc && (
              <p className="text-sm text-red-600">
                {lang === 'ar' ? 'تعذر تحميل تفاصيل السند.' : 'Could not load document details.'}
              </p>
            )}

            {!loadingDoc && !docError && (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">{headerBlock()}</div>
                <div>{linesTable()}</div>
                {previewAttachment && (
                  <div className={`rounded-lg border border-amber-200 bg-amber-50/60 p-3 ${textAlign}`}>
                    <div className="text-xs font-semibold text-amber-900 mb-2 flex items-center gap-2">
                      <Paperclip size={14} />
                      {lang === 'ar' ? 'مرفقات' : 'Attachments'}
                    </div>
                    <a
                      href={previewAttachment}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary-700 hover:underline break-all"
                    >
                      <FileText size={14} />
                      {lang === 'ar' ? 'فتح المرفق' : 'Open attachment'}
                    </a>
                  </div>
                )}
                {actionError && <p className="text-xs text-red-600">{actionError}</p>}
              </>
            )}
          </div>
        </div>
      </div>

      {deleteOpen && deleteTarget && (
        <ConfirmDialog
          overlayZClass="z-[150]"
          variant="danger"
          title={lang === 'ar' ? 'تأكيد الحذف' : 'Confirm delete'}
          message={
            lang === 'ar'
              ? 'سيتم حذف السند نهائياً إن سمحت الصلاحيات وحالة المستند. المتابعة؟'
              : 'The document will be deleted if permitted. Continue?'
          }
          confirmLabel={t.delete}
          isLoading={deleteMut.isPending}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => deleteMut.mutate(deleteTarget)}
        />
      )}
    </>
  )
}
