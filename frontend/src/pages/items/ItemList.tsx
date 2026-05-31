import { useState, useCallback, useEffect, useRef, useMemo, type MouseEvent as ReactMouseEvent, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { getModalContainer } from '../../utils/modalContainer'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchItems,
  createItem,
  updateItem,
  deleteItem,
  fetchItemCategories,
  fetchItemUnits,
  fetchItemBrands,
  fetchNextItemCode,
  fetchItemAttributeTemplates,
  fetchSettings,
  fetchItem,
  fetchItemsForFilter,
} from '../../api/tenant'
import type {
  Item,
  ItemCategory,
  ItemUnit,
  ItemBrand,
  PaginatedResponse,
  TenantSettings,
  ItemBillOfMaterialLine,
  ItemVariant,
  ItemAttributeTemplate,
} from '../../types'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, X, FileText, Layers, Printer, FileSpreadsheet, Columns3, MoreVertical } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { formatAmount } from '../../utils/currency'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

type UnitOptionRow = {
  unit_id: string
  conversion_factor: number
  is_base: boolean
  sort_order: number
  selling_price: number | ''
  cost_price: number | ''
  barcode: string
}

const emptyUnitRow = (): UnitOptionRow => ({
  unit_id: '', conversion_factor: 1, is_base: false, sort_order: 0,
  selling_price: '', cost_price: '', barcode: '',
})

type VariantProperty = {
  id: string
  name: string
  valuesText: string
  templateName?: string
}

type VariantRow = {
  id: string
  label: string
  options: Record<string, string>
  barcode: string
  selling_price: number | ''
  initial_stock: number | ''
}

type ItemColumnKey = 'code' | 'barcode' | 'name' | 'category' | 'brand' | 'unit' | 'type' | 'cost_price' | 'selling_price' | 'stock' | 'actions'
const ITEM_COLUMN_KEYS: ItemColumnKey[] = ['code', 'barcode', 'name', 'category', 'brand', 'unit', 'type', 'cost_price', 'selling_price', 'stock', 'actions']

function itemTypeLabel(
  type: Item['type'],
  itemsT: { inventory: string; service: string; manufacturing: string; assembly: string },
): string {
  switch (type) {
    case 'inventory':
      return itemsT.inventory
    case 'service':
      return itemsT.service
    case 'manufacturing':
      return itemsT.manufacturing
    case 'assembly':
      return itemsT.assembly
    default:
      return String(type)
  }
}

function itemTypeBadgeClass(type: Item['type']): string {
  switch (type) {
    case 'inventory':
      return 'bg-blue-100 text-blue-700'
    case 'service':
      return 'bg-purple-100 text-purple-700'
    case 'manufacturing':
      return 'bg-amber-100 text-amber-800'
    case 'assembly':
      return 'bg-teal-100 text-teal-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

/** Laravel يعيد العلاقة باسم item_variants؛ ندعم variants للتوافق */
function itemVariantsFromApiPayload(item: Item): ItemVariant[] {
  if (Array.isArray(item.variants) && item.variants.length > 0) {
    return item.variants
  }
  const iv = item.item_variants
  return Array.isArray(iv) ? iv : []
}

type VariantFormSlice = {
  has_variants: boolean
  variantProperties: VariantProperty[]
  variants: VariantRow[]
}

function mapApiItemVariantsToForm(variantsFromApi: ItemVariant[]): VariantFormSlice {
  if (variantsFromApi.length === 0) {
    return { has_variants: false, variantProperties: [], variants: [] }
  }
  const allOptionKeys = new Set<string>()
  for (const v of variantsFromApi) {
    const opts = (v.options ?? {}) as Record<string, string>
    Object.keys(opts).forEach((k) => allOptionKeys.add(k))
  }
  const variantProperties: VariantProperty[] = Array.from(allOptionKeys).map((key) => ({
    id: `prop-${key}`,
    name: key,
    valuesText: Array.from(
      new Set(
        variantsFromApi
          .map((v) => (v.options ?? {})[key])
          .filter((v): v is string => !!v),
      ),
    ).join(', '),
  }))
  const variants: VariantRow[] = variantsFromApi
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((v) => ({
      id: String(v.id),
      label: v.name,
      options: (v.options ?? {}) as Record<string, string>,
      barcode: v.barcode ?? '',
      selling_price: v.selling_price ?? '',
      initial_stock: v.initial_stock ?? '',
    }))
  return { has_variants: true, variantProperties, variants }
}

const ITEM_COLUMNS_STORAGE = 'itemsListVisibleColumns'

type BomFormRow = {
  key: string
  component_item_id: number
  quantity: number
  unit_id: number | null
  name: string
  unitLabel: string
  averageCost: number
  currentStock: number
}

const bomRowKey = () => `bom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const emptyForm = {
  code: '', name: '', name_en: '', description: '', unit: '',
  unit_id: '' as string, brand_id: '' as string, category_id: '' as string,
  type: 'inventory' as Item['type'],
  cost_price: 0, selling_price: 0, default_tax_percent: null as number | null, min_selling_price: 0, max_selling_price: 0, min_quantity: 0, initial_stock: 0,
  barcode: '', sku: '', is_active: true, use_serial_number: false,
  unit_options: [] as UnitOptionRow[],
  has_variants: false,
  variantProperties: [] as VariantProperty[],
  variants: [] as VariantRow[],
}

export default function ItemList() {
  const { currentTenant, can } = useAuth()
  const canViewCost = can('items.view_cost')
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const amountDecimals = Math.min(20, Math.max(0, Math.floor(Number(settings?.doc_amount_decimals ?? 2))))
  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)
  const qtyDecimals = Math.min(6, Math.max(0, Math.floor(Number(settings?.doc_quantity_decimals ?? 2))))
  const fmtQty = (n: number) =>
    Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<Item['type'] | ''>('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null)
  const [showSaveItemConfirm, setShowSaveItemConfirm] = useState(false)
  const [itemModalTab, setItemModalTab] = useState<'basic' | 'pricing' | 'units' | 'variants'>('basic')
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(ITEM_COLUMNS_STORAGE, ITEM_COLUMN_KEYS)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  const [openActionsId, setOpenActionsId] = useState<number | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<{ top: number; left: number; width: number } | null>(null)

  const closeActionsMenu = useCallback(() => {
    setOpenActionsId(null)
    setActionsAnchor(null)
  }, [])

  const openItemActionsMenu = useCallback((e: ReactMouseEvent<HTMLButtonElement>, itemId: number) => {
    e.stopPropagation()
    if (openActionsId === itemId) {
      closeActionsMenu()
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setActionsAnchor({ top: rect.bottom, left: rect.left, width: rect.width })
    setOpenActionsId(itemId)
  }, [openActionsId, closeActionsMenu])
  const [bomLines, setBomLines] = useState<BomFormRow[]>([])
  const [bomSearch, setBomSearch] = useState('')
  const { data: attributeTemplates = [] } = useQuery<ItemAttributeTemplate[]>({
    queryKey: ['item-attribute-templates', tenantId],
    queryFn: () => fetchItemAttributeTemplates(tenantId),
    enabled: !!tenantId,
  })
  const attributeTemplateNames = useMemo(
    () => Array.from(new Set(attributeTemplates.map((t) => t.name))).filter(Boolean),
    [attributeTemplates],
  )

  const generateVariants = useCallback((base: typeof emptyForm & { name: string; variantProperties?: VariantProperty[]; variants?: VariantRow[] }) => {
    const props = (base.variantProperties || [])
      .map((p) => ({
        name: p.name.trim(),
        values: p.valuesText
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      }))
      .filter((p) => p.name && p.values.length > 0)

    if (props.length === 0) return [] as VariantRow[]

    let combos: { options: Record<string, string> }[] = [{ options: {} }]
    for (const prop of props) {
      const next: { options: Record<string, string> }[] = []
      for (const combo of combos) {
        for (const val of prop.values) {
          next.push({ options: { ...combo.options, [prop.name]: val } })
        }
      }
      combos = next
    }

    return combos.map((c, idx) => {
      const labelSuffix = Object.values(c.options).join(' - ')
      const prev = base.variants?.[idx]
      return {
        id: prev?.id ?? `var-${Date.now()}-${idx}`,
        label: `${base.name || ''} - ${labelSuffix}`.trim(),
        options: c.options,
        barcode: prev?.barcode ?? '',
        selling_price: prev?.selling_price ?? base.selling_price ?? '',
        initial_stock: prev?.initial_stock ?? '',
      }
    })
  }, [])

  const params: Record<string, string> = {}
  if (search) params.search = search
  if (categoryFilter) params.category_id = categoryFilter
  if (brandFilter) params.brand_id = brandFilter
  if (typeFilter) params.type = typeFilter

  const { data, isLoading } = useQuery<PaginatedResponse<Item>>({
    queryKey: ['items', tenantId, search, categoryFilter, brandFilter, typeFilter],
    queryFn: () => fetchItems(tenantId, Object.keys(params).length ? params : undefined),
    enabled: !!tenantId,
  })

  const { data: categories = [] } = useQuery<ItemCategory[]>({
    queryKey: ['item-categories', tenantId],
    queryFn: () => fetchItemCategories(tenantId),
    enabled: !!tenantId,
  })

  const { data: units = [] } = useQuery<ItemUnit[]>({
    queryKey: ['item-units', tenantId],
    queryFn: () => fetchItemUnits(tenantId),
    enabled: !!tenantId,
  })

  const { data: brandsRaw } = useQuery({
    queryKey: ['item-brands', tenantId],
    queryFn: () => fetchItemBrands(tenantId),
    enabled: !!tenantId,
  })
  const brands: ItemBrand[] = Array.isArray(brandsRaw)
    ? brandsRaw
    : ((brandsRaw as unknown) as { data?: ItemBrand[] })?.data ?? []

  const { data: bomPickData } = useQuery({
    queryKey: ['items-bom-pick', tenantId, bomSearch],
    queryFn: () =>
      fetchItemsForFilter(tenantId, {
        search: bomSearch.trim(),
        per_page: '40',
        is_active: '1',
      }),
    enabled:
      !!tenantId &&
      showModal &&
      (form.type === 'manufacturing' || form.type === 'assembly') &&
      bomSearch.trim().length >= 1,
  })
  const bomPickItems = (bomPickData?.data ?? []).filter(
    (it) => it.id !== editing?.id && !bomLines.some((b) => b.component_item_id === it.id),
  )

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const createMut = useMutation({
    mutationFn: ({ data: d, image: img }: { data: Record<string, unknown>; image?: File | null }) => createItem(tenantId, d as Partial<Item>, img),
    onSuccess: () => { setShowSaveItemConfirm(false); queryClient.invalidateQueries({ queryKey: ['items'] }); closeModal(); showToast(t.msg.addedSuccess, 'success') },
    onError: (err: any) => { setShowSaveItemConfirm(false); showToast(err?.response?.data?.message ?? t.msg.addError, 'error') },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d, image: img }: { id: number; data: Partial<Item>; image?: File | null }) => updateItem(tenantId, id, d, img),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['items'] }); closeModal(); showToast(t.msg.updatedSuccess, 'success') },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg.updateError, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteItem(tenantId, id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['items'] }); setDeleteTarget(null); showToast(t.msg.deletedSuccess, 'success') },
    onError: (err: any) => { setDeleteTarget(null); showToast(err?.response?.data?.message ?? t.msg.deleteError, 'error') },
  })

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm({ ...emptyForm, unit_options: [] })
    setImageFile(null)
    setItemModalTab('basic')
    setBomLines([])
    setBomSearch('')
  }

  function openEdit(item: Item) {
    const opts = (item as Item & { unit_options?: { unit_id: number; conversion_factor: number; is_base: boolean; sort_order: number; selling_price?: number | null; cost_price?: number | null; barcode?: string | null }[] })?.unit_options ?? []
    const raw: UnitOptionRow[] = opts.length
      ? opts.map((o, i) => ({
          unit_id: String(o.unit_id ?? ''),
          conversion_factor: Number(o.conversion_factor ?? 1),
          is_base: Boolean(o.is_base),
          sort_order: Number(o.sort_order ?? i),
          selling_price: o.selling_price != null ? o.selling_price : '',
          cost_price: o.cost_price != null ? o.cost_price : '',
          barcode: o.barcode ?? '',
        }))
      : []
    const unit_options: UnitOptionRow[] = raw.length > 0
      ? [...raw].sort((a, b) => (a.is_base ? 0 : 1) - (b.is_base ? 0 : 1)).map((r, i) => (i === 0 ? { ...r, is_base: true, conversion_factor: 1 } : { ...r, is_base: false }))
      : []
    setEditing(item)
    const baseForm = {
      code: item.code, name: item.name, name_en: item.name_en ?? '', description: item.description ?? '',
      unit: item.unit ?? '', unit_id: item.unit_id?.toString() ?? '',
      brand_id: item.brand_id?.toString() ?? '', category_id: item.category?.id?.toString() ?? '',
      type: item.type, cost_price: item.cost_price, selling_price: item.selling_price,
      default_tax_percent: (item as Item & { default_tax_percent?: number | null }).default_tax_percent ?? null,
      min_selling_price: item.min_selling_price ?? 0,
      max_selling_price: item.max_selling_price ?? 0,
      min_quantity: item.min_quantity, initial_stock: 0,
      barcode: item.barcode ?? '', sku: item.sku ?? '', is_active: item.is_active,
      use_serial_number: (item as Item & { use_serial_number?: boolean }).use_serial_number ?? false,
      unit_options,
      has_variants: (item as Item & { has_variants?: boolean }).has_variants ?? false,
      variantProperties: [] as VariantProperty[],
      variants: [] as VariantRow[],
    }

    const variantSlice = mapApiItemVariantsToForm(itemVariantsFromApiPayload(item))
    if (variantSlice.has_variants) {
      setForm({ ...baseForm, ...variantSlice })
    } else {
      setForm(baseForm)
    }
    setItemModalTab('basic')
    setBomLines([])
    setBomSearch('')
    setShowModal(true)

    const itemId = item.id
    void fetchItem(tenantId, itemId)
      .then((full) => {
        if (full.id !== itemId) return
        const fromFull = itemVariantsFromApiPayload(full as Item)
        if (fromFull.length > 0) {
          setForm((prev) => ({ ...prev, ...mapApiItemVariantsToForm(fromFull) }))
        }
        if (full.type !== 'manufacturing' && full.type !== 'assembly') {
          setBomLines([])
          return
        }
        const raw = full.bill_of_material?.lines ?? []
        if (raw.length === 0) {
          setBomLines([])
          return
        }
        setBomLines(
          raw.map((l: ItemBillOfMaterialLine) => {
            const comp = l.component_item
            const unitLabel = comp?.item_unit
              ? getDisplayName(comp.item_unit)
              : (comp?.unit ?? '—')
            return {
              key: bomRowKey(),
              component_item_id: l.component_item_id,
              quantity: Number(l.quantity),
              unit_id: l.unit_id ?? comp?.unit_id ?? null,
              name: comp ? getDisplayName(comp) : `#${l.component_item_id}`,
              unitLabel,
              averageCost: Number(l.unit_cost ?? 0),
              currentStock: Number(l.current_stock ?? 0),
            }
          }),
        )
      })
      .catch(() => setBomLines([]))
  }

  async function addBomComponentFromPick(picked: Item) {
    if (!tenantId || picked.id === editing?.id) return
    if (bomLines.some((b) => b.component_item_id === picked.id)) return
    try {
      const meta = await fetchItem(tenantId, picked.id)
      const avg = Number(meta.average_cost ?? meta.cost_price ?? 0)
      const stock = Number(meta.current_stock ?? 0)
      const unitLabel = meta.item_unit ? getDisplayName(meta.item_unit) : meta.unit ?? '—'
      setBomLines((rows) => [
        ...rows,
        {
          key: bomRowKey(),
          component_item_id: picked.id,
          quantity: 1,
          unit_id: meta.unit_id,
          name: getDisplayName(meta),
          unitLabel,
          averageCost: avg,
          currentStock: stock,
        },
      ])
      setBomSearch('')
    } catch {
      showToast(t.msg?.networkError ?? 'فشل جلب بيانات الصنف', 'error')
    }
  }

  // فتح نافذة الإضافة عند القدوم من صفحة أخرى (مثلاً BOM) مع state.openAddModal
  useEffect(() => {
    const state = location.state as { openAddModal?: boolean } | null
    if (state?.openAddModal) {
      setForm(emptyForm)
      setEditing(null)
      setItemModalTab('basic')
      setImageFile(null)
      setBomLines([])
      setBomSearch('')
      setShowModal(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    if (!showModal) return
    if (form.type !== 'manufacturing' && form.type !== 'assembly') return
    if (!canViewCost) return
    const total = bomLines.reduce(
      (acc, row) => acc + (Number(row.quantity) || 0) * (Number(row.averageCost) || 0),
      0,
    )
    const rounded = Number(total.toFixed(4))
    setForm((f) => (f.cost_price === rounded ? f : { ...f, cost_price: rounded }))
  }, [bomLines, form.type, showModal, canViewCost])

  // توليد كود الصنف تلقائياً عند اختيار الفئة (وضع الإضافة فقط)
  useEffect(() => {
    if (!showModal || editing || !tenantId || !form.category_id) return
    const catId = parseInt(form.category_id, 10)
    if (Number.isNaN(catId)) return
    fetchNextItemCode(tenantId, catId)
      .then((code) => setForm((f) => ({ ...f, code })))
      .catch(() => {})
  }, [showModal, editing, tenantId, form.category_id])

  function buildPayload(): Record<string, unknown> {
    const selectedUnit = units.find(u => u.id === +(form.unit_id || 0))
    const payload: Record<string, unknown> = {
      code: form.code, name: form.name, name_en: form.name_en || null, description: form.description || null,
      unit: selectedUnit ? getDisplayName(selectedUnit) : (form.unit || (lang === 'ar' ? 'قطعة' : 'Piece')),
      unit_id: form.unit_id ? +form.unit_id : null,
      brand_id: form.brand_id ? +form.brand_id : null,
      category_id: form.category_id ? +form.category_id : null,
      type: form.type, cost_price: form.cost_price, selling_price: form.selling_price,
      default_tax_percent: form.default_tax_percent != null ? form.default_tax_percent : null,
      min_selling_price: form.min_selling_price ? form.min_selling_price : null,
      max_selling_price: form.max_selling_price ? form.max_selling_price : null,
      min_quantity: form.min_quantity, is_active: form.is_active,
      use_serial_number: form.use_serial_number ?? false,
      barcode: form.barcode || null, sku: form.sku || null,
    }
    if (!editing && form.initial_stock > 0 && !form.has_variants) payload.initial_stock = form.initial_stock
    if (form.unit_options && form.unit_options.length > 0) {
      const opts = form.unit_options.filter(r => r.unit_id !== '')
      payload.unit_options = opts.map((r, i) => ({
        unit_id: +r.unit_id,
        conversion_factor: i === 0 ? 1 : (Number(r.conversion_factor) || 1),
        is_base: i === 0,
        sort_order: i,
        selling_price: r.selling_price === '' ? null : Number(r.selling_price),
        cost_price: r.cost_price === '' ? null : Number(r.cost_price),
        barcode: r.barcode?.trim() || null,
      }))
      if (opts.length > 0 && form.unit_id && opts.some(r => String(r.unit_id) === String(form.unit_id))) {
        payload.unit_id = +form.unit_id
        const u = units.find(ux => ux.id === +form.unit_id)
        if (u) payload.unit = u.name
      } else if (opts.length > 0) {
        payload.unit_id = +opts[0].unit_id
        const u = units.find(ux => ux.id === +opts[0].unit_id)
        if (u) payload.unit = u.name
      }
    }
    payload.has_variants = form.has_variants ?? false
    if (form.has_variants && (form.variants?.length ?? 0) > 0) {
      payload.variants = (form.variants || []).map((v, idx) => ({
        id: v.id.startsWith('var-') ? undefined : Number.isFinite(Number(v.id)) ? Number(v.id) : undefined,
        name: v.label,
        sort_order: idx,
        barcode: v.barcode?.trim() || null,
        selling_price: v.selling_price === '' ? null : Number(v.selling_price),
        initial_stock: !editing
          ? v.initial_stock === '' ? null : Number(v.initial_stock)
          : undefined,
        options: v.options,
      }))
    }
    if (form.type === 'manufacturing' || form.type === 'assembly') {
      payload.bom_lines = bomLines.map((row, i) => ({
        component_item_id: row.component_item_id,
        quantity: Number(row.quantity) || 0,
        unit_id: row.unit_id,
        sort_order: i,
      }))
    }
    return payload
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) {
      setShowSaveItemConfirm(true)
      return
    }
    const payload = buildPayload()
    updateMut.mutate({ id: editing!.id, data: payload as Partial<Item>, image: imageFile })
  }

  const items = data?.data ?? []

  const { sort, toggleSort, sortedRows: sortedItems } = useClientSort(items, [
    { key: 'code', type: 'string', getValue: (it: Item) => it.code ?? '' },
    { key: 'barcode', type: 'string', getValue: (it: Item) => it.barcode ?? '' },
    { key: 'name', type: 'string', getValue: (it: Item) => getDisplayName(it) },
    { key: 'category', type: 'string', getValue: (it: Item) => (it.category ? getDisplayName(it.category) : '') },
    { key: 'brand', type: 'string', getValue: (it: Item) => (it.brand ? getDisplayName(it.brand) : '') },
    { key: 'unit', type: 'string', getValue: (it: Item) => (it.item_unit ? getDisplayName(it.item_unit) : (it.unit ?? '')) },
    { key: 'type', type: 'string', getValue: (it: Item) => itemTypeLabel(it.type, t.items) },
    { key: 'cost_price', type: 'number', getValue: (it: Item) => it.cost_price ?? 0 },
    { key: 'selling_price', type: 'number', getValue: (it: Item) => it.selling_price ?? 0 },
    { key: 'stock', type: 'number', getValue: (it: Item) => (it.current_stock ?? (it as any).currentStock ?? 0) },
  ], { locale })
  const isSaving = createMut.isPending || updateMut.isPending
  const textAlign = isRtl ? 'text-right' : 'text-left'

  const columnLabels: Record<ItemColumnKey, string> = {
    code: t.code,
    barcode: t.items.barcode,
    name: t.name,
    category: t.items.category,
    brand: t.items.brand,
    unit: t.items.unit,
    type: t.type,
    cost_price: t.items.costPrice,
    selling_price: t.items.sellingPrice,
    stock: t.items.currentStock,
    actions: t.actions,
  }
  const visibleColumnKeys = ITEM_COLUMN_KEYS.filter((k) => (k !== 'cost_price' || canViewCost) && visibleColumns[k])
  const dataColumnKeys = visibleColumnKeys.filter((k) => k !== 'actions')

  useEffect(() => {
    function handleClickOutside(e: globalThis.MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnsMenu])

  function handlePrint() {
    if (dataColumnKeys.length === 0) return
    const headers = dataColumnKeys.map((k) => columnLabels[k])
    const rowsHtml = items.map((item) => {
      const cells = dataColumnKeys.map((k) => {
        if (k === 'code') return `<td>${(item.code ?? '').replace(/</g, '&lt;')}</td>`
        if (k === 'barcode') return `<td>${(item.barcode ?? '—').replace(/</g, '&lt;')}</td>`
        if (k === 'name') return `<td>${(getDisplayName(item) ?? '').replace(/</g, '&lt;')}</td>`
        if (k === 'category') return `<td>${(item.category ? getDisplayName(item.category) : '—').replace(/</g, '&lt;')}</td>`
        if (k === 'brand') return `<td>${(item.brand ? getDisplayName(item.brand) : '—').replace(/</g, '&lt;')}</td>`
        if (k === 'unit') return `<td>${(item.item_unit ? getDisplayName(item.item_unit) : item.unit ?? '—').replace(/</g, '&lt;')}</td>`
        if (k === 'type') return `<td>${itemTypeLabel(item.type, t.items)}</td>`
        if (k === 'cost_price') return `<td>${fmt(item.cost_price)}</td>`
        if (k === 'selling_price') return `<td>${fmt(item.selling_price)}</td>`
        if (k === 'stock') return `<td>${item.current_stock !== undefined ? fmtQty(item.current_stock) : '—'}</td>`
        return '<td></td>'
      })
      return `<tr>${cells.join('')}</tr>`
    }).join('')
    const headerCells = headers.map((h) => `<th>${(h ?? '').replace(/</g, '&lt;')}</th>`).join('')
    const title = t.items.title
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
<!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
<meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;} th{background:#f1f5f9;}</style>
</head><body><h2>${title}</h2><table><thead><tr>${headerCells}</tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  function handleExportExcel() {
    if (dataColumnKeys.length === 0) return
    const headers = dataColumnKeys.map((k) => columnLabels[k])
    const lines = [headers.join(',')]
    items.forEach((item) => {
      const cells = dataColumnKeys.map((k) => {
        const v = k === 'code' ? (item.code ?? '') : k === 'barcode' ? (item.barcode ?? '') : k === 'name' ? (getDisplayName(item) ?? '') : k === 'category' ? (item.category ? getDisplayName(item.category) : '') : k === 'brand' ? (item.brand ? getDisplayName(item.brand) : '') : k === 'unit' ? (item.item_unit ? getDisplayName(item.item_unit) : item.unit ?? '') : k === 'type' ? itemTypeLabel(item.type, t.items) : k === 'cost_price' ? String(item.cost_price) : k === 'selling_price' ? String(item.selling_price) : k === 'stock' ? (item.current_stock !== undefined ? String(item.current_stock) : '') : ''
        return `"${String(v).replace(/"/g, '""')}"`
      })
      lines.push(cells.join(','))
    })
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'items.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="px-2 py-5 sm:px-3 md:px-4 space-y-5">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 shrink-0">{t.items.title}</h1>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button onClick={() => { setForm(emptyForm); setEditing(null); setItemModalTab('basic'); setBomLines([]); setBomSearch(''); setShowModal(true) }}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm transition-colors">
            <Plus size={18} /> {t.items.addItem}
          </button>
          <div className="relative" ref={columnsMenuRef}>
            <button type="button" onClick={() => setShowColumnsMenu((v) => !v)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}>
              <Columns3 size={18} />
            </button>
            {showColumnsMenu && (
              <div className={`absolute top-full z-50 mt-1 min-w-[200px] rounded-lg border border-slate-200 bg-white py-2 shadow-lg ${isRtl ? 'right-0' : 'left-0'}`}>
                <p className="border-b border-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">{lang === 'ar' ? 'إظهار الأعمدة' : 'Show columns'}</p>
                {ITEM_COLUMN_KEYS.filter((key) => key !== 'cost_price' || canViewCost).map((key) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
                    <input type="checkbox" checked={visibleColumns[key]} onChange={(e) => setVisibleColumns((prev) => ({ ...prev, [key]: e.target.checked }))} className="rounded border-slate-300 text-primary-600" />
                    <span className="text-sm text-slate-700">{columnLabels[key]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={handlePrint} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" title={t.payments?.printReport ?? t.accounts?.print ?? 'طباعة'}>
            <Printer size={18} />
          </button>
          <button type="button" onClick={handlePrint} className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-700 text-white hover:bg-slate-600" title={t.payments?.exportPdf ?? t.accounts?.exportPdf ?? 'تصدير PDF'}>
            <FileText size={18} />
          </button>
          <button type="button" onClick={handleExportExcel} className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-500" title={t.payments?.exportExcel ?? t.accounts?.exportExcel ?? 'تصدير Excel'}>
            <FileSpreadsheet size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="relative w-full max-w-[220px] sm:max-w-[260px] shrink-0">
          <Search size={18} className={`absolute ${isRtl ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`} />
          <input
            type="text"
            placeholder={t.search + '...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full h-10 box-border border border-slate-300 rounded-lg ${isRtl ? 'pr-10 pl-3' : 'pl-10 pr-3'} text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none`}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none shrink-0 min-w-[11rem] sm:min-w-[13rem]"
        >
          <option value="">{t.items.allCategories}</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id.toString()}>
              {cat.name}
            </option>
          ))}
        </select>
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none shrink-0 min-w-[11rem] sm:min-w-[13rem]"
          aria-label={t.items.brand}
          title={t.items.brand}
        >
          <option value="">{t.items.allBrands}</option>
          {brands.filter((b) => b.is_active).map((b) => (
            <option key={b.id} value={String(b.id)}>
              {getDisplayName(b)}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter((e.target.value || '') as Item['type'] | '')}
          className="h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none shrink-0 min-w-[11rem] sm:min-w-[13rem]"
          aria-label={t.type}
          title={t.type}
        >
          <option value="">{t.items.allItemTypes}</option>
          <option value="inventory">{t.items.inventory}</option>
          <option value="service">{t.items.service}</option>
          <option value="manufacturing">{t.items.manufacturing}</option>
          <option value="assembly">{t.items.assembly}</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {isLoading ? (
          <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  {visibleColumnKeys.map((k) =>
                    k === 'actions' ? (
                      <th key={k} className={`${textAlign} px-2 py-2.5 font-medium w-16`}>{columnLabels[k]}</th>
                    ) : (
                      <SortableTh
                        key={k}
                        label={columnLabels[k]}
                        sortKey={k}
                        sortState={sort as any}
                        onToggle={toggleSort as any}
                        widthClassName={
                          k === 'code' ? 'w-24'
                          : k === 'barcode' ? 'w-40'
                          : k === 'name' ? 'w-[22rem]'
                          : k === 'category' ? 'w-44'
                          : k === 'brand' ? 'w-44'
                          : k === 'unit' ? 'w-28'
                          : k === 'type' ? 'w-28'
                          : k === 'cost_price' || k === 'selling_price' ? 'w-32'
                          : k === 'stock' ? 'w-28'
                          : ''
                        }
                        className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`}
                      />
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedItems.length === 0 ? (
                  <tr><td colSpan={visibleColumnKeys.length} className="text-center py-8 text-slate-400">{t.items.noItems}</td></tr>
                ) : sortedItems.map((item) => (
                  <tr key={item.id} className={`hover:bg-slate-50 ${item.current_stock !== undefined && item.current_stock <= item.min_quantity ? 'bg-red-50/40' : ''}`}>
                    {visibleColumnKeys.map((k) => {
                      if (k === 'code') return <td key={k} className="px-2 py-2.5 font-mono text-xs text-slate-500">{item.code}</td>
                      if (k === 'barcode')
                        return (
                          <td key={k} className="px-2 py-2.5 font-mono text-xs text-slate-600" dir="ltr">
                            {item.barcode?.trim() ? item.barcode : '—'}
                          </td>
                        )
                      if (k === 'name') return <td key={k} className="px-2 py-2.5 font-medium text-slate-900">{getDisplayName(item)}</td>
                      if (k === 'category') return <td key={k} className="px-2 py-2.5 text-slate-500">{item.category ? getDisplayName(item.category) : '—'}</td>
                      if (k === 'brand') return <td key={k} className="px-2 py-2.5 text-slate-500">{item.brand ? getDisplayName(item.brand) : '—'}</td>
                      if (k === 'unit') return <td key={k} className="px-2 py-2.5 text-slate-600">{item.item_unit ? getDisplayName(item.item_unit) : item.unit}</td>
                      if (k === 'type') return (
                        <td key={k} className="px-2 py-2.5">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${itemTypeBadgeClass(item.type)}`}>
                            {itemTypeLabel(item.type, t.items)}
                          </span>
                        </td>
                      )
                      if (k === 'cost_price') return <td key={k} className="px-2 py-2.5">{fmt(item.cost_price)}</td>
                      if (k === 'selling_price') return <td key={k} className="px-2 py-2.5">{fmt(item.selling_price)}</td>
                      if (k === 'stock') return (
                        <td key={k} className="px-2 py-2.5">
                          <span className={`font-bold ${item.current_stock !== undefined && item.current_stock <= item.min_quantity ? 'text-red-600' : 'text-slate-900'}`}>
                            {item.current_stock !== undefined ? fmtQty(item.current_stock) : '—'}
                          </span>
                        </td>
                      )
                      if (k === 'actions') return (
                        <td key={k} className="px-2 py-2.5 align-middle">
                          <button
                            type="button"
                            onClick={(e) => openItemActionsMenu(e, item.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            title={t.actions}
                            aria-label={t.actions}
                            aria-expanded={openActionsId === item.id}
                            aria-haspopup="menu"
                          >
                            <MoreVertical size={16} />
                          </button>
                        </td>
                      )
                      return <td key={k} />
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="absolute inset-0 z-0 flex min-h-0 min-w-0 items-center justify-center bg-black/50 p-4 pointer-events-auto"
            onClick={closeModal}
            role="presentation"
          >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-[80%] max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
              <h3 className="text-lg font-semibold text-slate-900">{editing ? t.items.editItem : t.items.addItem}</h3>
              <button type="button" onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"><X size={20} /></button>
            </div>
            <div className="border-b border-slate-200 shrink-0">
              <div className="flex gap-1 px-4">
                <button type="button" onClick={() => setItemModalTab('basic')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${itemModalTab === 'basic' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {lang === 'ar' ? 'البيانات الأساسية' : 'Basic data'}
                </button>
                <button type="button" onClick={() => setItemModalTab('pricing')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${itemModalTab === 'pricing' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {lang === 'ar' ? 'الأسعار والمخزون' : 'Pricing & stock'}
                </button>
                <button type="button" onClick={() => setItemModalTab('units')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1 ${itemModalTab === 'units' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  <Layers size={14} /> {lang === 'ar' ? 'وحدات القياس المتعددة' : 'Multi units'}
                </button>
                <button
                  type="button"
                  onClick={() => setItemModalTab('variants')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${itemModalTab === 'variants' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  {lang === 'ar' ? 'المتغيرات' : 'Variants'}
                </button>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="p-4 overflow-y-auto flex-1">
                {itemModalTab === 'basic' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 items-start">
                      <div>
                        <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none">
                          <option value="">{t.items.category}</option>
                          {categories.map((c) => <option key={c.id} value={c.id}>{getDisplayName(c)}</option>)}
                        </select>
                      </div>
                      <div>
                        <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                          placeholder={t.items.itemCode + ' *'} required />
                      </div>
                      <div>
                        <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" placeholder={t.items.itemName + ' *'} required />
                      </div>
                      <div>
                        <input type="text" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" placeholder={t.nameEn} dir="ltr" />
                      </div>
                      <div>
                        <select
                          value={form.type}
                          onChange={(e) => {
                            const next = e.target.value as Item['type']
                            setForm({ ...form, type: next })
                            if (next !== 'manufacturing' && next !== 'assembly') {
                              setBomLines([])
                              setBomSearch('')
                            }
                          }}
                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                        >
                          <option value="inventory">{t.items.inventory}</option>
                          <option value="service">{t.items.service}</option>
                          <option value="manufacturing">{t.items.manufacturing}</option>
                          <option value="assembly">{t.items.assembly}</option>
                        </select>
                      </div>
                      <div>
                        <select value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none">
                          <option value="">{t.items.unit}</option>
                          {units.filter(u => u.is_active).map((u) => <option key={u.id} value={u.id}>{getDisplayName(u)} {u.symbol ? `(${u.symbol})` : ''}</option>)}
                        </select>
                      </div>
                      <div>
                        <select value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })}
                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none">
                          <option value="">{t.items.brand}</option>
                          {brands.filter(b => b.is_active).map((b) => <option key={b.id} value={b.id}>{getDisplayName(b)}</option>)}
                        </select>
                      </div>
                      <div className="min-w-0">
                        <div className="flex gap-1.5 items-center">
                          <input type="text" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                            className="flex-1 min-w-0 h-10 box-border border border-slate-300 rounded-lg px-2 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" placeholder={t.items.barcode} />
                          <button type="button" onClick={() => setForm((f) => ({ ...f, barcode: `${Date.now()}${Math.floor(1000 + Math.random() * 9000)}` }))}
                            className="shrink-0 h-10 px-3 rounded-lg border border-slate-300 text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 whitespace-nowrap inline-flex items-center justify-center box-border">
                            {lang === 'ar' ? 'توليد آلي' : 'Generate'}
                          </button>
                        </div>
                      </div>
                      <div>
                        <input type="text" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" placeholder={t.items.sku} />
                      </div>
                    </div>
                    {(form.type === 'inventory' || form.type === 'manufacturing' || form.type === 'assembly') && (
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="use_serial_number" checked={form.use_serial_number ?? false}
                          onChange={(e) => setForm({ ...form, use_serial_number: e.target.checked })}
                          className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                        <label htmlFor="use_serial_number" className="text-sm font-medium text-slate-700">
                          {lang === 'ar' ? 'يستخدم رقم تسلسلي' : 'Use serial number'}
                        </label>
                        <span className="text-xs text-slate-500">
                          {lang === 'ar' ? '(إدخال الأرقام عند المشتريات/الإضافة، واختيارها عند المبيعات)' : '(Enter on purchase/add; select on sales)'}
                        </span>
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                          {imageFile ? (
                            <img src={URL.createObjectURL(imageFile)} alt="" className="w-full h-full object-cover" />
                          ) : editing && (editing as Item & { image_url?: string }).image_url ? (
                            <img src={(editing as Item & { image_url?: string }).image_url!} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-slate-400 text-xs">{lang === 'ar' ? 'لا صورة' : 'No image'}</span>
                          )}
                        </div>
                        <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                          className="text-sm text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700" />
                      </div>
                    </div>
                    <div>
                      <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" rows={2} placeholder={t.description} />
                    </div>

                    {(form.type === 'manufacturing' || form.type === 'assembly') && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-slate-800">{t.items.bomSectionTitle}</h4>
                        <div className="relative">
                          <Search size={16} className={`absolute ${isRtl ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`} />
                          <input
                            type="text"
                            value={bomSearch}
                            onChange={(e) => setBomSearch(e.target.value)}
                            placeholder={t.items.bomSearchPlaceholder}
                            className={`w-full h-10 box-border border border-slate-300 rounded-lg text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none ${isRtl ? 'pr-10 pl-3' : 'pl-10 pr-3'}`}
                          />
                          {bomSearch.trim().length >= 1 && bomPickItems.length > 0 && (
                            <ul
                              className={`absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${isRtl ? 'right-0' : 'left-0'}`}
                            >
                              {bomPickItems.map((it) => (
                                <li key={it.id}>
                                  <button
                                    type="button"
                                    className="w-full text-start px-3 py-2 text-sm hover:bg-slate-50"
                                    onClick={() => void addBomComponentFromPick(it)}
                                  >
                                    <span className="font-mono text-xs text-slate-500">{it.code}</span>{' '}
                                    {getDisplayName(it)}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-xs sm:text-sm">
                            <thead>
                              <tr className="bg-slate-100 text-slate-600">
                                <th className={`${textAlign} px-2 py-2 font-medium`}>{t.items.bomComponentName}</th>
                                <th className={`${textAlign} px-2 py-2 font-medium w-24`}>{t.items.bomUnit}</th>
                                <th className={`${textAlign} px-2 py-2 font-medium w-28`}>{t.items.bomQty}</th>
                                {canViewCost && (
                                  <>
                                    <th className={`${textAlign} px-2 py-2 font-medium w-28`}>{t.items.bomAvgCost}</th>
                                    <th className={`${textAlign} px-2 py-2 font-medium w-28`}>{t.items.bomLineTotal}</th>
                                  </>
                                )}
                                <th className="w-10" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {bomLines.length === 0 ? (
                                <tr>
                                  <td colSpan={canViewCost ? 6 : 5} className="px-3 py-6 text-center text-slate-400">
                                    {lang === 'ar' ? 'ابحث عن صنف أعلاه لإضافته كمكوّن.' : 'Use search above to add components.'}
                                  </td>
                                </tr>
                              ) : (
                                bomLines.map((row) => {
                                  const lineTotal = (Number(row.quantity) || 0) * (Number(row.averageCost) || 0)
                                  const lowStock = row.component_item_id > 0 && (row.currentStock ?? 0) <= 0
                                  return (
                                    <tr key={row.key} className={lowStock ? 'bg-amber-50/50' : ''}>
                                      <td className={`px-2 py-2 font-medium text-slate-800 ${textAlign}`}>{row.name}</td>
                                      <td className={`px-2 py-2 text-slate-600 ${textAlign}`}>{row.unitLabel}</td>
                                      <td className="px-2 py-2">
                                        <input
                                          type="number"
                                          min={0.0001}
                                          step={0.0001}
                                          value={row.quantity}
                                          onChange={(e) => {
                                            const q = Math.max(0.0001, parseFloat(e.target.value) || 0.0001)
                                            setBomLines((lines) =>
                                              lines.map((r) => (r.key === row.key ? { ...r, quantity: q } : r)),
                                            )
                                          }}
                                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none"
                                        />
                                      </td>
                                      {canViewCost && (
                                        <>
                                          <td className={`px-2 py-2 tabular-nums ${textAlign}`}>{fmt(row.averageCost)}</td>
                                          <td className={`px-2 py-2 tabular-nums font-medium ${textAlign}`}>{fmt(lineTotal)}</td>
                                        </>
                                      )}
                                      <td className="px-1">
                                        <button
                                          type="button"
                                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                          title={t.items.bomRemoveLine}
                                          onClick={() => setBomLines((lines) => lines.filter((r) => r.key !== row.key))}
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </td>
                                    </tr>
                                  )
                                })
                              )}
                            </tbody>
                            {canViewCost && bomLines.length > 0 && (
                              <tfoot>
                                <tr className="bg-slate-50 font-semibold text-slate-800">
                                  <td colSpan={3} className={`px-2 py-2 ${textAlign}`}>
                                    {t.items.bomTotalLabel}
                                  </td>
                                  <td className="px-2 py-2" />
                                  <td className={`px-2 py-2 tabular-nums ${textAlign}`}>
                                    {fmt(
                                      bomLines.reduce(
                                        (s, r) => s + (Number(r.quantity) || 0) * (Number(r.averageCost) || 0),
                                        0,
                                      ),
                                    )}
                                  </td>
                                  <td />
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                        {bomLines.some((r) => r.component_item_id && (r.currentStock ?? 0) <= 0) && (
                          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            {t.items.bomStockZeroWarning}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {itemModalTab === 'pricing' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                      {canViewCost && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">{t.items.costPrice}</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.cost_price || ''}
                            onChange={(e) => setForm({ ...form, cost_price: +e.target.value })}
                            readOnly={
                              (form.type === 'manufacturing' || form.type === 'assembly') && bomLines.length > 0
                            }
                            className={`w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none ${
                              (form.type === 'manufacturing' || form.type === 'assembly') && bomLines.length > 0
                                ? 'bg-slate-50 text-slate-700'
                                : ''
                            }`}
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t.items.sellingPrice}</label>
                        <input type="number" step="0.01" min="0" value={form.selling_price || ''} onChange={(e) => setForm({ ...form, selling_price: +e.target.value })}
                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'نسبة الضريبة الافتراضية %' : 'Default tax %'}</label>
                        <input type="number" step="0.01" min="0" max="100" value={form.default_tax_percent ?? ''} onChange={(e) => setForm({ ...form, default_tax_percent: e.target.value === '' ? null : +e.target.value })}
                          placeholder={lang === 'ar' ? 'من إعدادات النظام' : 'From settings'}
                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'أقل سعر' : 'Min. selling price'}</label>
                        <input type="number" step="0.01" min="0" value={form.min_selling_price || ''} onChange={(e) => setForm({ ...form, min_selling_price: +e.target.value })}
                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'السعر الأعلى' : 'Max. selling price'}</label>
                        <input type="number" step="0.01" min="0" value={form.max_selling_price || ''} onChange={(e) => setForm({ ...form, max_selling_price: +e.target.value })}
                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t.items.minQuantity}</label>
                        <input type="number" min="0" value={form.min_quantity || ''} onChange={(e) => setForm({ ...form, min_quantity: +e.target.value })}
                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
                      </div>
                      {!editing && (form.type === 'inventory' || form.type === 'manufacturing' || form.type === 'assembly') && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">{t.items.initialStock}</label>
                          <input type="number" step="0.01" min="0" value={form.initial_stock || ''} onChange={(e) => setForm({ ...form, initial_stock: +e.target.value })}
                            className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
                          <p className="text-xs text-slate-400 mt-1">{t.items.initialStockHint}</p>
                        </div>
                      )}
                    </div>
                    {canViewCost && form.selling_price > 0 && form.cost_price > 0 && (
                      <div className={`text-xs px-3 py-2 rounded-lg ${form.selling_price > form.cost_price ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {t.items.profitMargin}: {((form.selling_price - form.cost_price) / form.cost_price * 100).toFixed(1)}% ({fmt(form.selling_price - form.cost_price)} {t.items.perUnit})
                      </div>
                    )}
                  </div>
                )}
                {itemModalTab === 'units' && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                      {lang === 'ar' ? 'السطر الأول دائماً هو الوحدة الأساسية (معامل = 1). أضف وحدات أكبر بمعامل تحويل صحيح. إدخال سعر الوحدة الأساسية يملأ باقي الوحدات تلقائياً كاقتراح.' : 'First row is always the base unit (factor = 1). Add larger units with integer factor. Base unit price auto-fills others as suggestion.'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-sm font-medium text-slate-700">{lang === 'ar' ? 'الوحدة الافتراضية للبيع' : 'Default sales unit'}</label>
                      <select
                        value={form.unit_id}
                        onChange={(e) => {
                          const val = e.target.value
                          setForm(f => {
                            const next = { ...f, unit_id: val }
                            const opts = f.unit_options || []
                            if (opts.length > 0 && val && !opts[0].unit_id) {
                              next.unit_options = opts.map((r, i) => i === 0 ? { ...r, unit_id: val } : r)
                            }
                            return next
                          })
                        }}
                        className="h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none min-w-[180px]"
                      >
                        <option value="">{lang === 'ar' ? 'اختر الوحدة' : 'Select unit'}</option>
                        {(() => {
                          const fromRows = (form.unit_options || []).filter(r => r.unit_id !== '')
                          if (fromRows.length > 0) {
                            return fromRows.map((r) => {
                              const u = units.find(ux => ux.id === +r.unit_id)
                              return <option key={r.unit_id} value={r.unit_id}>{u ? getDisplayName(u) : `#${r.unit_id}`}</option>
                            })
                          }
                          return units.filter(u => u.is_active).map((u) => (
                            <option key={u.id} value={u.id}>{getDisplayName(u)} {u.symbol ? `(${u.symbol})` : ''}</option>
                          ))
                        })()}
                      </select>
                      <span className="text-xs text-slate-500">{lang === 'ar' ? 'تنعكس في تبويب البيانات الأساسية' : 'Reflected in Basic data'}</span>
                    </div>
                    <div className="space-y-3">
                      {(form.unit_options || []).map((row, idx) => (
                        <div key={idx} className="p-3 border border-slate-200 rounded-lg bg-slate-50/50 space-y-2">
                          <div className="flex flex-wrap gap-2 items-center">
                            <div className="min-w-[140px]">
                              <label className="block text-xs font-medium text-slate-500 mb-0.5">{t.items.unit}</label>
                              <select
                                value={row.unit_id}
                                onChange={(e) => setForm(f => ({
                                  ...f,
                                  unit_options: (f.unit_options || []).map((r, i) => i === idx ? { ...r, unit_id: e.target.value } : r),
                                }))}
                                className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none"
                              >
                                <option value="">{lang === 'ar' ? 'اختر' : 'Select'}</option>
                                {units.filter(u => u.is_active).map(u => <option key={u.id} value={u.id}>{getDisplayName(u)}</option>)}
                              </select>
                            </div>
                            <div className="w-24">
                              <label className="block text-xs font-medium text-slate-500 mb-0.5">{lang === 'ar' ? 'معامل التحويل' : 'Factor'}</label>
                              <input type="number" min={1} step={1} value={idx === 0 ? 1 : (row.conversion_factor || '')} readOnly={idx === 0}
                                onChange={(e) => { if (idx === 0) return; const val = Math.round(parseFloat(e.target.value)) || 1; setForm(f => ({ ...f, unit_options: (f.unit_options || []).map((r, i) => i === idx ? { ...r, conversion_factor: val >= 1 ? val : 1 } : r) })) }}
                                className={`w-full h-10 box-border rounded-lg px-3 text-sm leading-none ${idx === 0 ? 'bg-slate-100 text-slate-500 border border-slate-200' : 'border border-slate-300'}`}
                              />
                            </div>
                            {idx === 0 && <span className="text-xs font-medium text-primary-600 self-center">{lang === 'ar' ? 'أساسية' : 'Base'}</span>}
                            <div className="w-28">
                              <label className="block text-xs font-medium text-slate-500 mb-0.5">{lang === 'ar' ? 'سعر البيع' : 'Sell price'}</label>
                              <input type="number" min="0" step="0.01" value={row.selling_price === '' ? '' : row.selling_price}
                                onChange={(e) => {
                                  const raw = e.target.value
                                  const v: number | '' = raw === '' ? '' : (Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : 0)
                                  setForm((f) => {
                                    const next = (f.unit_options || []).map((r, i) => (i === idx ? { ...r, selling_price: v } : r))
                                    if (idx === 0 && typeof v === 'number' && v > 0) {
                                      return { ...f, unit_options: next.map((r, i) => (i === 0 ? r : { ...r, selling_price: (r.conversion_factor || 1) * v })) }
                                    }
                                    return { ...f, unit_options: next }
                                  })
                                }}
                                className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none"
                              />
                            </div>
                            <div className="w-28">
                              <label className="block text-xs font-medium text-slate-500 mb-0.5">{lang === 'ar' ? 'سعر الشراء' : 'Cost price'}</label>
                              <input type="number" min="0" step="0.01" value={row.cost_price === '' ? '' : row.cost_price}
                                onChange={(e) => {
                                  const raw = e.target.value
                                  const v: number | '' = raw === '' ? '' : (Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : 0)
                                  setForm((f) => {
                                    const next = (f.unit_options || []).map((r, i) => (i === idx ? { ...r, cost_price: v } : r))
                                    if (idx === 0 && typeof v === 'number' && v > 0) {
                                      return { ...f, unit_options: next.map((r, i) => (i === 0 ? r : { ...r, cost_price: (r.conversion_factor || 1) * v })) }
                                    }
                                    return { ...f, unit_options: next }
                                  })
                                }}
                                className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none"
                              />
                            </div>
                            <div className="min-w-[120px]">
                              <label className="block text-xs font-medium text-slate-500 mb-0.5">{t.items.barcode} {lang === 'ar' ? '(للكاشير/المسح)' : '(cashier/scan)'}</label>
                              <input type="text" value={row.barcode} placeholder={lang === 'ar' ? 'باركود هذه الوحدة' : 'Barcode for this unit'}
                                onChange={(e) => setForm(f => ({ ...f, unit_options: (f.unit_options || []).map((r, i) => i === idx ? { ...r, barcode: e.target.value } : r) }))}
                                className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none"
                              />
                            </div>
                            <button type="button" onClick={() => { if (idx === 0 && (form.unit_options?.length ?? 0) > 1) { showToast(lang === 'ar' ? 'لا يمكن حذف الوحدة الأساسية مع وجود وحدات أخرى.' : 'Cannot remove base unit while other units exist.', 'warning'); return } setForm(f => ({ ...f, unit_options: (f.unit_options || []).filter((_, i) => i !== idx) })) }}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded">
                              <Trash2 size={14} />
                            </button>
                          </div>
                          {(() => { const baseUnit = (form.unit_options || [])[0]?.unit_id ? units.find(u => u.id === +((form.unit_options || [])[0].unit_id)) : null; const baseUnitName = baseUnit ? getDisplayName(baseUnit) : (lang === 'ar' ? 'الوحدة الأساسية' : 'Base'); const curUnit = row.unit_id ? units.find(u => u.id === +row.unit_id) : null; const curName = curUnit ? getDisplayName(curUnit) : ''; const desc = idx === 0 ? (lang === 'ar' ? 'الوحدة الأساسية (معامل = 1)' : 'Base unit (factor = 1)') : (curName && baseUnitName ? `1 ${curName} = ${row.conversion_factor} ${baseUnitName}` : ''); return desc ? <p className="text-xs text-slate-500 mt-1">{desc}</p> : null })()}
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => setForm(f => { const opts = f.unit_options || []; if (opts.length === 0) return { ...f, unit_options: [{ ...emptyUnitRow(), is_base: true, conversion_factor: 1 }] }; return { ...f, unit_options: [...opts, { ...emptyUnitRow(), is_base: false, conversion_factor: 2 }] } })}
                      className="flex items-center gap-2 text-primary-600 hover:text-primary-700 text-sm font-medium">
                      <Plus size={16} /> {lang === 'ar' ? (form.unit_options?.length ? 'إضافة وحدة أخرى' : 'إضافة الوحدة الأساسية أولاً') : (form.unit_options?.length ? 'Add another unit' : 'Add base unit first')}
                    </button>
                  </div>
                )}

                {itemModalTab === 'variants' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <input
                        id="has-variants"
                        type="checkbox"
                        checked={form.has_variants}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            has_variants: e.target.checked,
                            ...(e.target.checked ? {} : { variantProperties: [], variants: [] }),
                          }))
                        }
                      />
                      <label htmlFor="has-variants" className="text-sm font-medium text-slate-700">
                        {lang === 'ar'
                          ? 'تفعيل المتغيرات لهذا الصنف'
                          : 'Enable variants for this item'}
                      </label>
                    </div>

                    {form.has_variants && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <p className="text-sm text-slate-700">
                            {lang === 'ar'
                              ? 'اختر قوالب الخصائص التي تريد استخدامها، ثم حدد القيم من كل خاصية (مثلاً: مقاس S, M, L).'
                              : 'Pick attribute templates and select values for this item.'}
                          </p>
                          <div className="flex flex-wrap items-center gap-3">
                            <select
                              value=""
                              onChange={(e) => {
                                const name = e.target.value
                                if (!name) return
                                const related = attributeTemplates.filter((t) => t.name === name)
                                if (!related.length) return
                                const mergedValues = Array.from(
                                  new Set(
                                    related.flatMap((t) =>
                                      (t.values || []).map((v) => v.value),
                                    ),
                                  ),
                                )
                                setForm((f) => {
                                  const exists = (f.variantProperties || []).some(
                                    (p) => p.templateName === name,
                                  )
                                  if (exists) return f
                                  const valuesText = mergedValues.join(', ')
                                  const variantProperties = [
                                    ...(f.variantProperties || []),
                                    {
                                      id: `prop-${name}`,
                                      templateName: name,
                                      name,
                                      valuesText,
                                    },
                                  ]
                                  return {
                                    ...f,
                                    variantProperties,
                                    variants: generateVariants({ ...f, variantProperties }),
                                  }
                                })
                              }}
                              className="h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none min-w-[220px]"
                            >
                              <option value="">
                                {lang === 'ar'
                                  ? 'اختر خاصية من القوالب'
                                  : 'Select attribute template'}
                              </option>
                              {attributeTemplateNames
                                .filter(
                                  (name) =>
                                    !(form.variantProperties || []).some(
                                      (p) => p.templateName === name,
                                    ),
                                )
                                .map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                            </select>
                            <span className="text-xs text-slate-500">
                              {lang === 'ar'
                                ? 'يتم تعريف القوالب من صفحة التباين والمتغيرات.'
                                : 'Templates are managed on the Variants page.'}
                            </span>
                          </div>
                        </div>

                        {(form.variantProperties || []).map((prop, idx) => {
                          const related = attributeTemplates.filter(
                            (t) => t.name === prop.templateName,
                          )
                          const values = Array.from(
                            new Set(
                              related.flatMap((t) =>
                                (t.values || []).map((v) => v.value),
                              ),
                            ),
                          )
                          const selected = prop.valuesText
                            .split(',')
                            .map((v) => v.trim())
                            .filter(Boolean)
                          return (
                            <div
                              key={prop.id}
                              className="p-3 border border-slate-200 rounded-lg bg-slate-50/50 space-y-2"
                            >
                              <div className="flex justify-between items-center">
                                <div className="font-medium text-slate-800">{prop.name}</div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setForm((f) => {
                                      const list = (f.variantProperties || []).filter(
                                        (_, i) => i !== idx,
                                      )
                                      return {
                                        ...f,
                                        variantProperties: list,
                                        variants: generateVariants({ ...f, variantProperties: list }),
                                      }
                                    })
                                  }
                                  className="text-xs text-red-600 hover:underline"
                                >
                                  {lang === 'ar' ? 'إزالة الخاصية' : 'Remove attribute'}
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {values.map((val) => {
                                  const checked = selected.includes(val)
                                  return (
                                    <label
                                      key={val}
                                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-slate-300 bg-white cursor-pointer select-none"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) =>
                                          setForm((f) => {
                                            const list = [...(f.variantProperties || [])]
                                            const current = list[idx]
                                            const curVals = current.valuesText
                                              .split(',')
                                              .map((v) => v.trim())
                                              .filter(Boolean)
                                            let nextVals: string[]
                                            if (e.target.checked) {
                                              nextVals = Array.from(
                                                new Set([...curVals, val]),
                                              )
                                            } else {
                                              nextVals = curVals.filter((v) => v !== val)
                                            }
                                            list[idx] = {
                                              ...current,
                                              valuesText: nextVals.join(', '),
                                            }
                                            return {
                                              ...f,
                                              variantProperties: list,
                                              variants: generateVariants({
                                                ...f,
                                                variantProperties: list,
                                              }),
                                            }
                                          })
                                        }
                                      />
                                      <span>{val}</span>
                                    </label>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}

                        {form.has_variants && (form.variants?.length ?? 0) > 0 && (
                          <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-slate-800">
                              {lang === 'ar' ? 'جدول المتغيرات' : 'Generated variants'}
                            </h3>
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                              <table className="min-w-full text-sm">
                                <thead className="bg-slate-50">
                                  <tr>
                                    <th className="px-3 py-2 text-start">
                                      {lang === 'ar' ? 'المتغير' : 'Variant'}
                                    </th>
                                    <th className="px-3 py-2 text-start">{t.items.barcode}</th>
                                    <th className="px-3 py-2 text-start">
                                      {lang === 'ar' ? 'سعر البيع' : 'Selling price'}
                                    </th>
                                    {!editing && (
                                      <th className="px-3 py-2 text-start">
                                        {lang === 'ar' ? 'رصيد افتتاحي' : 'Opening stock'}
                                      </th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(form.variants || []).map((v, idx) => (
                                    <tr key={v.id} className="border-t border-slate-200">
                                      <td className="px-3 py-2">
                                        <div className="font-medium text-slate-800">{v.label}</div>
                                        <div className="text-xs text-slate-500">
                                          {Object.entries(v.options)
                                            .map(([k, val]) => `${k}: ${val}`)
                                            .join(' • ')}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2">
                                        <input
                                          type="text"
                                          value={v.barcode}
                                          onChange={(e) =>
                                            setForm((f) => ({
                                              ...f,
                                              variants: (f.variants || []).map((vv, i) =>
                                                i === idx
                                                  ? { ...vv, barcode: e.target.value }
                                                  : vv,
                                              ),
                                            }))
                                          }
                                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none"
                                        />
                                      </td>
                                      <td className="px-3 py-2">
                                        <input
                                          type="number"
                                          min={0}
                                          step="0.01"
                                          value={v.selling_price === '' ? '' : v.selling_price}
                                          onChange={(e) => {
                                            const raw = e.target.value
                                            const val: number | '' =
                                              raw === ''
                                                ? ''
                                                : Number.isFinite(parseFloat(raw))
                                                  ? parseFloat(raw)
                                                  : 0
                                            setForm((f) => ({
                                              ...f,
                                              variants: (f.variants || []).map((vv, i) =>
                                                i === idx ? { ...vv, selling_price: val } : vv,
                                              ),
                                            }))
                                          }}
                                          className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none"
                                        />
                                      </td>
                                      {!editing && (
                                        <td className="px-3 py-2">
                                          <input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={
                                              v.initial_stock === '' ? '' : v.initial_stock
                                            }
                                            onChange={(e) => {
                                              const raw = e.target.value
                                              const val: number | '' =
                                                raw === ''
                                                  ? ''
                                                  : Number.isFinite(parseFloat(raw))
                                                    ? parseFloat(raw)
                                                    : 0
                                              setForm((f) => ({
                                                ...f,
                                                variants: (f.variants || []).map((vv, i) =>
                                                  i === idx
                                                    ? { ...vv, initial_stock: val }
                                                    : vv,
                                                ),
                                              }))
                                            }}
                                            className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none"
                                          />
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {form.has_variants && itemModalTab === 'pricing' && (form.variants?.length ?? 0) > 0 && (
                  <div className="mt-6 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-800">
                      {lang === 'ar' ? 'تفاصيل المتغيرات' : 'Variant details'}
                    </h3>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-start">{lang === 'ar' ? 'المتغير' : 'Variant'}</th>
                            <th className="px-3 py-2 text-start">{t.items.barcode}</th>
                            <th className="px-3 py-2 text-start">
                              {lang === 'ar' ? 'سعر البيع' : 'Selling price'}
                            </th>
                            {!editing && (
                              <th className="px-3 py-2 text-start">
                                {lang === 'ar' ? 'رصيد افتتاحي' : 'Opening stock'}
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {(form.variants || []).map((v, idx) => (
                            <tr key={v.id} className="border-t border-slate-200">
                              <td className="px-3 py-2">
                                <div className="font-medium text-slate-800">{v.label}</div>
                                <div className="text-xs text-slate-500">
                                  {Object.entries(v.options)
                                    .map(([k, val]) => `${k}: ${val}`)
                                    .join(' • ')}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={v.barcode}
                                  onChange={(e) =>
                                    setForm((f) => ({
                                      ...f,
                                      variants: (f.variants || []).map((vv, i) =>
                                        i === idx ? { ...vv, barcode: e.target.value } : vv,
                                      ),
                                    }))
                                  }
                                  className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={v.selling_price === '' ? '' : v.selling_price}
                                  onChange={(e) => {
                                    const raw = e.target.value
                                    const val: number | '' =
                                      raw === '' ? '' : Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : 0
                                    setForm((f) => ({
                                      ...f,
                                      variants: (f.variants || []).map((vv, i) =>
                                        i === idx ? { ...vv, selling_price: val } : vv,
                                      ),
                                    }))
                                  }}
                                  className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none"
                                />
                              </td>
                              {!editing && (
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={v.initial_stock === '' ? '' : v.initial_stock}
                                    onChange={(e) => {
                                      const raw = e.target.value
                                      const val: number | '' =
                                        raw === ''
                                          ? ''
                                          : Number.isFinite(parseFloat(raw))
                                            ? parseFloat(raw)
                                            : 0
                                      setForm((f) => ({
                                        ...f,
                                        variants: (f.variants || []).map((vv, i) =>
                                          i === idx ? { ...vv, initial_stock: val } : vv,
                                        ),
                                      }))
                                    }}
                                    className="w-full h-10 box-border border border-slate-300 rounded-lg px-3 text-sm leading-none"
                                  />
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 p-4 border-t border-slate-200 shrink-0">
                <button type="submit" disabled={!form.code.trim() || !form.name.trim() || isSaving}
                  className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-500 disabled:opacity-50">
                  {isSaving ? t.saving : editing ? t.invoices.saveChanges : t.items.addItem}
                </button>
                <button type="button" onClick={closeModal} className="px-4 py-2.5 border border-slate-300 rounded-lg">{t.cancel}</button>
              </div>
            </form>
          </div>
        </div>,
          getModalContainer(),
        )}

      {openActionsId !== null && actionsAnchor && (() => {
        const actionItem = sortedItems.find((x) => x.id === openActionsId)
        if (!actionItem) return null
        const menuItemClass = `flex items-center gap-2 px-3 py-2 text-sm w-full ${isRtl ? 'text-right' : 'text-left'}`
        const MENU_MIN = 180
        const pad = 8
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
        const top = Math.min(actionsAnchor.top + 4, (typeof window !== 'undefined' ? window.innerHeight : 800) - 200)
        const menuStyle: CSSProperties = isRtl
          ? {
              top,
              left: Math.max(pad, Math.min(actionsAnchor.left + actionsAnchor.width, vw - MENU_MIN - pad)),
              right: 'auto',
            }
          : (() => {
              const right = vw - actionsAnchor.left
              const menuLeft = vw - right - MENU_MIN
              if (menuLeft < pad) return { top, left: pad, right: 'auto' as const }
              return { top, right, left: 'auto' as const }
            })()
        const menu = (
          <>
            <div className="fixed inset-0 z-[9998]" aria-hidden onClick={closeActionsMenu} />
            <div
              role="menu"
              dir={isRtl ? 'rtl' : 'ltr'}
              className="fixed z-[9999] min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              style={menuStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <Link
                to={`/items/${actionItem.id}/ledger`}
                role="menuitem"
                onClick={closeActionsMenu}
                className={`${menuItemClass} text-slate-700 hover:bg-slate-50`}
              >
                <FileText size={16} className="shrink-0 text-slate-600" />
                {t.inventory.itemLedger}
              </Link>
              <button
                type="button"
                role="menuitem"
                className={`${menuItemClass} text-slate-700 hover:bg-slate-50`}
                onClick={() => {
                  closeActionsMenu()
                  openEdit(actionItem)
                }}
              >
                <Pencil size={16} className="shrink-0 text-primary-600" />
                {t.edit}
              </button>
              <button
                type="button"
                role="menuitem"
                className={`${menuItemClass} text-red-600 hover:bg-red-50`}
                onClick={() => {
                  closeActionsMenu()
                  setDeleteTarget(actionItem)
                }}
              >
                <Trash2 size={16} className="shrink-0" />
                {t.delete}
              </button>
            </div>
          </>
        )
        return typeof document !== 'undefined' ? createPortal(menu, document.body) : menu
      })()}

      {showSaveItemConfirm && (
        <ConfirmDialog
          title={lang === 'ar' ? 'تأكيد الحفظ' : 'Confirm save'}
          message={lang === 'ar' ? 'هل تريد حفظ الصنف؟' : 'Do you want to save this item?'}
          confirmLabel={lang === 'ar' ? 'نعم، احفظ' : 'Yes, save'}
          variant="warning"
          isLoading={createMut.isPending}
          onConfirm={() => {
            const payload = buildPayload()
            createMut.mutate({ data: payload, image: imageFile })
          }}
          onCancel={() => setShowSaveItemConfirm(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t.items.deleteItem}
          message={t.items.confirmDelete.replace('{name}', deleteTarget.name).replace('{code}', deleteTarget.code)}
          confirmLabel={t.items.deleteItem}
          variant="danger"
          isLoading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
