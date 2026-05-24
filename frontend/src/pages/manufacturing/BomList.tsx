import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchBoms, fetchBom, deleteBom, fetchSettings, fetchWarehouses } from '../../api/tenant'
import type { BillOfMaterial, PaginatedResponse, TenantSettings, Warehouse } from '../../types'
import { formatAmount, coerceDecimalPlaces } from '../../utils/currency'
import { MoreVertical, Plus, Pencil, Trash2 } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ManufacturingOrderModal from './ManufacturingOrderModal'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

export default function BomList() {
  const { currentTenant, user } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [deleteTarget, setDeleteTarget] = useState<BillOfMaterial | null>(null)
  const [viewBomId, setViewBomId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [openActionsId, setOpenActionsId] = useState<number | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<{
    /** موضع رأسي للقائمة (px) — fixed */
    top?: number
    bottom?: number
    /** محاذاة أفقية — fixed */
    left?: number
    right?: number
  } | null>(null)

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const isAutoOnSale =
    (settings as Record<string, unknown> | undefined)?.manufacturing_method !== 'manual_orders'

  const { data: warehousesRes } = useQuery<{ data: Warehouse[] }>({
    queryKey: ['warehouses', tenantId, 'bom-list'],
    queryFn: () => fetchWarehouses(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })
  const warehouses = warehousesRes?.data ?? []

  const rawWhId = useMemo(() => {
    const id = settings?.manufacturing_default_raw_warehouse_id
    if (id == null || id === '') return undefined
    const n = Number(id)
    return n > 0 ? n : undefined
  }, [settings])

  const finWhId = useMemo(() => {
    const id = settings?.manufacturing_default_finished_warehouse_id
    if (id == null || id === '') return undefined
    const n = Number(id)
    return n > 0 ? n : undefined
  }, [settings])

  const warehouseLabel = (id: number | undefined) => {
    if (id == null || id < 1) return lang === 'ar' ? 'غير محدد في الإعدادات' : 'Not set in settings'
    const w = warehouses.find((x) => x.id === id)
    return w ? `${w.code ? `${w.code} — ` : ''}${w.name}` : `#${id}`
  }

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const qtyDecimals = coerceDecimalPlaces(settings?.doc_quantity_decimals, 2)
  const fmtQty = (n: number) =>
    Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })
  const fmt = (n: number) => formatAmount(Number(n), { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)

  const { data, isLoading } = useQuery<PaginatedResponse<BillOfMaterial>>({
    queryKey: ['boms', tenantId],
    queryFn: () => fetchBoms(tenantId),
    enabled: !!tenantId,
  })

  const { data: viewBom, isLoading: viewBomLoading } = useQuery<BillOfMaterial>({
    queryKey: ['bom', tenantId, viewBomId, rawWhId],
    queryFn: () => fetchBom(tenantId, viewBomId!, rawWhId ? { warehouse_id: String(rawWhId) } : {}),
    enabled: !!tenantId && viewBomId != null,
  })

  useEffect(() => {
    const open = searchParams.get('openMfg')
    if (!isAutoOnSale) {
      return
    }
    if (open && /^\d+$/.test(open)) {
      setViewBomId(Number(open))
    }
  }, [searchParams, isAutoOnSale])

  const mfgContext = useMemo(
    () => ({
      invoiceNumber: searchParams.get('mfg_invoice')?.trim() || null,
      invoiceId: (() => {
        const raw = searchParams.get('mfg_invoice_id')
        if (!raw) return null
        const s = raw.trim()
        if (!/^\d+$/.test(s)) return null
        const n = Number(s)
        return n > 0 ? n : null
      })(),
      operationDate: searchParams.get('mfg_date')?.trim() || null,
      userName: searchParams.get('mfg_user')?.trim() || user?.name || null,
      finishedUnits: searchParams.get('mfg_qty') ? Math.max(0.0001, Number(searchParams.get('mfg_qty'))) : 1,
      manufacturingJournalEntryId: (() => {
        const raw = searchParams.get('mfg_journal')
        if (!raw) return null
        const s = raw.trim()
        if (!/^\d+$/.test(s)) return null
        const n = Number(s)
        return n > 0 ? n : null
      })(),
    }),
    [searchParams, user?.name]
  )

  const displayMfgContext = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return {
      ...mfgContext,
      operationDate: mfgContext.operationDate || today,
      userName: mfgContext.userName || user?.name || null,
      finishedUnits: Number.isFinite(mfgContext.finishedUnits) && mfgContext.finishedUnits > 0 ? mfgContext.finishedUnits : 1,
    }
  }, [mfgContext, user?.name])

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteBom(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms', tenantId] })
      setDeleteTarget(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
    },
  })

  const list = data?.data ?? []

  const closeActionsMenu = () => {
    setOpenActionsId(null)
    setActionsAnchor(null)
  }

  const openActionsMenu = (e: React.MouseEvent, bom: BillOfMaterial) => {
    e.preventDefault()
    e.stopPropagation()
    if (openActionsId === bom.id) {
      closeActionsMenu()
      return
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 8
    const estMenuW = 220
    const estMenuH = 96 // تقدير لارتفاع قائمتين؛ كافٍ لاختيار فتح للأعلى/للأسفل
    const spaceBelow = vh - rect.bottom
    const openUp = spaceBelow < estMenuH && rect.top > spaceBelow

    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

    // محاذاة أفقية: في RTL نريد أن تمتد القائمة نحو داخل الصفحة (يمينًا) بدل أن تخرج من الحافة اليسرى
    const horizontal = isRtl
      ? {
          left: clamp(rect.right - estMenuW, margin, vw - margin - estMenuW),
        }
      : {
          left: clamp(rect.left, margin, vw - margin - estMenuW),
        }

    // فتح "للداخل": نفضّل للأعلى عند ضيق المساحة أسفل الزر حتى لا تخرج القائمة خارج الصفحة
    const nextAnchor = openUp
      ? { bottom: vh - rect.top + margin, ...horizontal }
      : { top: rect.bottom + margin, ...horizontal }

    setOpenActionsId(bom.id)
    setActionsAnchor(nextAnchor)
  }

  type BomSortKey = 'id' | 'name' | 'code' | 'is_active' | 'total_cost'
  const bomSortColumns = useMemo((): SortColumn<BillOfMaterial, BomSortKey>[] => {
    return [
      { key: 'id', type: 'number', getValue: (b) => b.id },
      // نرتّب على اسم الصنف النهائي (وليس رقم الصنف)
      {
        key: 'name',
        type: 'string',
        getValue: (b) =>
          b.name ??
          b.finishedItem?.name ??
          (b as unknown as { finished_item?: { name?: string | null } | null }).finished_item?.name ??
          '',
      },
      { key: 'code', type: 'string', getValue: (b) => b.finishedItem?.code ?? '' },
      { key: 'is_active', type: 'string', getValue: (b) => (b.is_active ? '1' : '0') },
      { key: 'total_cost', type: 'number', getValue: (b) => Number((b as BillOfMaterial & { total_cost?: number }).total_cost ?? 0) },
    ]
  }, [])
  const { sort, toggleSort, sortedRows: sortedBoms } = useClientSort(list, bomSortColumns, { locale })

  const mfgTitleId =
    displayMfgContext.manufacturingJournalEntryId != null && displayMfgContext.manufacturingJournalEntryId > 0
      ? displayMfgContext.manufacturingJournalEntryId
      : displayMfgContext.invoiceId != null && displayMfgContext.invoiceId > 0
        ? displayMfgContext.invoiceId
        : viewBomId

  useDocumentTitle(
    !isAutoOnSale
      ? (lang === 'ar' ? (t.nav?.bom ?? 'قائمة المواد (BOM)') : (t.nav?.bom ?? 'Bill of Materials (BOM)'))
      : viewBomId != null
        ? (lang === 'ar'
            ? `أمر تصنيع رقم #${mfgTitleId ?? viewBomId}`
            : `Manufacturing Order #${mfgTitleId ?? viewBomId}`)
        : (lang === 'ar' ? (t.nav?.bom ?? 'قائمة المواد (BOM)') : (t.nav?.bom ?? 'Bill of Materials (BOM)'))
  )

  return (
    <div className="w-full max-w-full min-w-0 p-3 md:p-4 space-y-3">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {!isAutoOnSale && searchParams.get('openMfg') ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {lang === 'ar'
            ? 'التصنيع مضبوط على «يدوي عبر أوامر التصنيع»، لذا مستند «أمر تصنيع آلي» غير متاح حالياً.'
            : 'Manufacturing is set to manual orders, so the automated manufacturing document is not available.'}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900">{t.nav?.bom ?? 'قائمة المواد (BOM)'}</h1>
        <Link
          to="/manufacturing/bom/create"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          {t.add}
        </Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white w-full">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">{t.loading}</div>
        ) : sortedBoms.length === 0 ? (
          <div className="p-8 text-center text-slate-500">{t.noData}</div>
        ) : (
          <table className="w-full min-w-[640px] text-xs table-fixed">
            <thead className="border-b bg-slate-50">
              <tr className="[&_*]:whitespace-normal [&_*]:break-words">
                <SortableTh
                  label="#"
                  sortKey="id"
                  sortState={sort}
                  onToggle={toggleSort}
                  truncateLabel={false}
                  className="px-0 py-0 text-right font-medium text-slate-700 w-20"
                />
                <SortableTh
                  label={t.name}
                  sortKey="name"
                  sortState={sort}
                  onToggle={toggleSort}
                  truncateLabel={false}
                  className="px-0 py-0 text-right font-medium text-slate-700 min-w-[140px]"
                />
                <SortableTh
                  label={t.code}
                  sortKey="code"
                  sortState={sort}
                  onToggle={toggleSort}
                  truncateLabel={false}
                  className="px-0 py-0 text-right font-medium text-slate-700 min-w-[70px]"
                />
                <SortableTh
                  label={t.status}
                  sortKey="is_active"
                  sortState={sort}
                  onToggle={toggleSort}
                  truncateLabel={false}
                  className="px-0 py-0 text-right font-medium text-slate-700 min-w-[60px]"
                />
                <SortableTh
                  label={t.total}
                  sortKey="total_cost"
                  sortState={sort}
                  onToggle={toggleSort}
                  truncateLabel={false}
                  className="px-0 py-0 text-right font-medium text-slate-700 min-w-[90px]"
                />
                <th className="px-2 py-1.5 text-right font-medium text-slate-700 w-20 shrink-0 whitespace-normal break-words">
                  {t.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedBoms.map((bom) => (
                <tr
                  key={bom.id}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setViewBomId(bom.id)}
                >
                  <td className="px-2 py-1.5 tabular-nums">{bom.id}</td>
                  <td className="px-2 py-1.5 font-medium text-slate-900">
                    {bom.name ??
                      bom.finishedItem?.name ??
                      (bom as unknown as { finished_item?: { name?: string | null } | null }).finished_item?.name ??
                      '—'}
                  </td>
                  <td className="px-2 py-1.5">{bom.finishedItem?.code ?? '—'}</td>
                  <td className="px-2 py-1.5">{bom.is_active ? (t.active ?? 'نشط') : (t.inactive ?? 'غير نشط')}</td>
                  <td className="px-2 py-1.5">{fmt((bom as BillOfMaterial & { total_cost?: number }).total_cost ?? 0)}</td>
                  <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => openActionsMenu(e, bom)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      title={t.actions}
                      aria-label={t.actions}
                    >
                      <MoreVertical size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openActionsId != null && actionsAnchor && (() => {
        const openBom = sortedBoms.find((b) => b.id === openActionsId)
        if (!openBom) return null
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={closeActionsMenu} aria-hidden />
            <div
              className={`fixed z-50 bg-white rounded-lg border border-slate-200 shadow-lg py-1 min-w-[160px] max-w-[min(280px,calc(100vw-16px))] ${isRtl ? 'text-right' : 'text-left'}`}
              style={{
                ...(actionsAnchor.top != null ? { top: actionsAnchor.top } : {}),
                ...(actionsAnchor.bottom != null ? { bottom: actionsAnchor.bottom } : {}),
                ...(actionsAnchor.left != null ? { left: actionsAnchor.left } : {}),
                ...(actionsAnchor.right != null ? { right: actionsAnchor.right } : {}),
              }}
            >
              <Link
                to={`/manufacturing/bom/edit/${openBom.id}`}
                onClick={closeActionsMenu}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Pencil size={16} className="text-primary-600" />
                <span>{t.edit}</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  closeActionsMenu()
                  setDeleteTarget(openBom)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 size={16} />
                <span>{t.delete}</span>
              </button>
            </div>
          </>
        )
      })()}

      <ManufacturingOrderModal
        open={viewBomId != null}
        onClose={() => setViewBomId(null)}
        loading={viewBomLoading}
        bom={viewBom}
        tenantId={tenantId}
        lang={lang}
        isRtl={isRtl}
        fmt={fmt}
        fmtQty={fmtQty}
        rawWarehouseLabel={warehouseLabel(rawWhId)}
        finishedWarehouseLabel={warehouseLabel(finWhId)}
        companyLogoUrl={(settings as Record<string, unknown>)?.company_logo as string | undefined}
        settings={settings}
        context={displayMfgContext}
      />

      {deleteTarget && (
        <ConfirmDialog
          title={t.delete}
          message={`${t.confirm} حذف قائمة المواد: ${deleteTarget.name ?? deleteTarget.finishedItem?.name ?? deleteTarget.id}؟`}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isLoading={deleteMut.isPending}
        />
      )}
    </div>
  )
}
