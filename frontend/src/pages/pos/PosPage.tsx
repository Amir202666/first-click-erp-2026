import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchPosItems,
  fetchPosShift,
  openPosShift,
  createPosSale,
  createPosReturn,
  holdPosCart,
  fetchPosHeldList,
  resumePosHeld,
  fetchPosXReport,
  closePosShift,
  fetchBranches,
  fetchWarehouses,
  fetchPaymentMethods,
  fetchItemCategories,
  fetchItemUnits,
  fetchCustomers,
  createCustomer,
  createItem,
  fetchSettings,
  fetchNextItemCode,
  fetchItemBrands,
  fetchPosExpenseItems,
  recordPosExpense,
  fetchInvoice,
  fetchDeliveryDrivers,
} from '../../api/tenant'
import type { PosItem, PosCartLine, Branch, Warehouse, PaymentMethod, PosXReport, PosZReport, ItemCategory, ItemUnit, ItemBrand, Customer, Item, TenantSettings, PosExpenseItem, Invoice, DeliveryDriver, PaginatedResponse } from '../../types'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { asArray } from '../../utils/asArray'
import { processInvoiceTotals } from '../../utils/totalsCalculation'
import { ShoppingCart, Search, Plus, Minus, Trash2, CreditCard, X, Pause, Play, FileText, Lock, FolderTree, UserPlus, Package, Receipt, RotateCcw, ChevronDown, Download, LayoutGrid, List, Loader2 } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import WhatsAppButton from '../../components/WhatsAppButton'
import { messageTemplateInvoice } from '../../utils/whatsapp'
import { invoiceDocumentStatus } from '../../utils/invoiceStatuses'
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner'
import { LoyaltyPOSSection } from '../../components/loyalty/LoyaltyPOSSection'
import { loyaltyApi } from '../../api/loyalty'
import { openInvoiceViewForPrint, posPrintOptionsFromSettings } from '../../utils/openInvoicePrintDialog'

const VAT_RATE = 0

/** ألوان أزرار النقد السريع في نافذة الدفع */
const POS_PAY_QUICK_CASH_BTN: Record<number, string> = {
  1: 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100',
  10: 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100',
  20: 'bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100',
  50: 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100',
  100: 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100',
  500: 'bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100',
  1000: 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100',
  5000: 'bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100',
}

function posPaymentLineId(): string {
  return `l-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

type PosPaymentLine = { id: string; methodId: number | null; amount: number }

function getPosPaymentMethodIcon(type: string): string {
  const t = (type || '').toLowerCase()
  const icons: Record<string, string> = {
    cash: '💵',
    bank: '🏦',
    credit: '📋',
    other: '💰',
  }
  return icons[t] ?? '💰'
}

/** قائمة شريط POS مخصصة بدل عنصر select لتفادي الفراغات التي يفرضها المتصفح في القائمة المنسدلة */
function PosBarPicker({
  label,
  items,
  value,
  onChange,
  disabled,
  allowClear,
  isRtl,
}: {
  label: string
  items: { id: number; label: string }[]
  value: number | null
  onChange: (id: number | null) => void
  disabled?: boolean
  allowClear?: boolean
  isRtl: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selected = value != null ? items.find((i) => i.id === value) : undefined
  const display = selected?.label ?? '—'
  const canPick = !disabled && items.length > 1
  const barBtn =
    'h-8 rounded-md border border-white/40 bg-white/15 text-[11px] font-medium text-white px-2 shadow-sm transition-colors hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white/35 disabled:opacity-75 disabled:cursor-not-allowed disabled:hover:bg-white/15'

  if (!canPick) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0 min-w-0" ref={rootRef}>
        <span className="text-[11px] font-medium text-white/95 whitespace-nowrap">{label}</span>
        <span
          className={`${barBtn} inline-flex min-w-[11rem] max-w-[min(320px,72vw)] items-center truncate cursor-default sm:min-w-[13rem]`}
          title={display}
        >
          {display}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0 min-w-0" ref={rootRef}>
      <span className="text-[11px] font-medium text-white/95 whitespace-nowrap">{label}</span>
      <div className={`relative inline-flex flex-shrink-0 ${open ? 'z-[60]' : ''}`}>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((v) => !v)}
          className={`${barBtn} inline-flex min-w-[11rem] max-w-[min(320px,72vw)] items-center gap-1 sm:min-w-[13rem]`}
        >
          <span className={`truncate min-w-0 flex-1 ${isRtl ? 'text-right' : 'text-left'}`}>{display}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-80 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {open ? (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-[70] mt-0.5 max-h-[min(50vh,12rem)] w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-0.5 shadow-lg"
        >
          {allowClear ? (
            <li role="none">
              <button
                type="button"
                role="option"
                aria-selected={value == null}
                className="w-full whitespace-nowrap px-2 py-1 text-left text-xs text-slate-800 hover:bg-slate-100 rtl:text-right"
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                —
              </button>
            </li>
          ) : null}
          {items.map((it) => (
            <li key={it.id} role="none">
              <button
                type="button"
                role="option"
                aria-selected={value === it.id}
                className={`w-full whitespace-nowrap px-2 py-1 text-left text-xs hover:bg-slate-100 rtl:text-right ${
                  value === it.id ? 'bg-primary-50 text-primary-800 font-medium' : 'text-slate-800'
                }`}
                onClick={() => {
                  onChange(it.id)
                  setOpen(false)
                }}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
        ) : null}
      </div>
    </div>
  )
}

function beepNotFound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 400
    gain.gain.value = 0.15
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.15)
  } catch (_) {}
}

function calcLineTotal(qty: number, price: number, discountAmount: number, taxPct: number) {
  const gross = qty * price
  const safeDiscount = Math.max(0, Math.min(discountAmount, gross))
  const amount = gross - safeDiscount
  const tax = amount * (taxPct / 100)
  return { amount, tax, total: amount + tax }
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function posEffectiveStock(item: PosItem): number {
  if (item.track_quantity === false) return Number.POSITIVE_INFINITY
  return Number(item.current_stock ?? 0)
}

function PosStockBadge({ item, lang }: { item: PosItem; lang: string }) {
  const track = item.track_quantity !== false
  const stock = track ? Number(item.current_stock ?? 0) : 1
  const minQty = Number(item.min_quantity ?? 5)
  const cls = 'absolute top-1.5 start-1.5 z-10 text-[9px] px-1.5 py-0.5 rounded-full font-medium'
  if (track && stock <= 0) {
    return (
      <span className={`${cls} bg-red-50 text-red-700`} dir="rtl">
        {lang === 'ar' ? 'نفذ ✕' : 'Out'}
      </span>
    )
  }
  if (track && stock <= minQty) {
    return (
      <span className={`${cls} bg-amber-50 text-amber-700`} dir="rtl">
        {lang === 'ar' ? 'منخفض !' : 'Low'}
      </span>
    )
  }
  return (
    <span className={`${cls} bg-green-50 text-green-700`} dir="rtl">
      {lang === 'ar' ? 'متوفر ✓' : 'OK'}
    </span>
  )
}

/** شعار آمن للطباعة (روابط http(s) أو مسار نسبي) */
function safeLogoUrlForPrint(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const t = url.trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  if (t.startsWith('/') && !t.startsWith('//')) return t
  return null
}

function computeCloseShiftBreakdown(closeShiftSummary: PosXReport) {
  const byMethod = closeShiftSummary.by_payment_method ?? []
  const isCash = (ty: string, n: string) => /cash|نقد|كاش/i.test(ty) || /cash|نقد|كاش/i.test(n)
  const isCard = (ty: string, n: string) => /card|credit|فيزا|بطاقة|شبكة/i.test(ty) || /card|visa|فيزا|بطاقة|شبكة/i.test(n)
  const isBank = (ty: string, n: string) => /bank|تحويل|بنك/i.test(ty) || /bank|تحويل|بنك/i.test(n)
  const cashSales = byMethod.filter((m) => isCash(m.type, m.name)).reduce((s, m) => s + (m.amount ?? 0), 0)
  const cardSales = byMethod.filter((m) => isCard(m.type, m.name)).reduce((s, m) => s + (m.amount ?? 0), 0)
  const bankSales = byMethod.filter((m) => isBank(m.type, m.name)).reduce((s, m) => s + (m.amount ?? 0), 0)
  const otherSales = byMethod
    .filter((m) => !isCash(m.type, m.name) && !isCard(m.type, m.name) && !isBank(m.type, m.name))
    .reduce((s, m) => s + (m.amount ?? 0), 0)
  const totalReceived = cashSales + cardSales + bankSales + otherSales
  const returns = closeShiftSummary.total_returns ?? 0
  const discount = 0
  const totalCashSalesNet = Math.max(0, totalReceived - returns - discount)
  const creditSales = Math.max(0, (closeShiftSummary.total_sales ?? 0) - returns - totalReceived)
  const totalSales = closeShiftSummary.total_sales ?? 0
  const expenses = closeShiftSummary.total_expenses ?? 0
  const netCash = closeShiftSummary.expected_cash ?? 0
  return {
    cashSales,
    cardSales,
    bankSales,
    otherSales,
    totalReceived,
    returns,
    discount,
    totalCashSalesNet,
    creditSales,
    totalSales,
    expenses,
    netCash,
  }
}

export default function PosPage() {
  const { currentTenant, user: currentUser, meData, can } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [branchId, setBranchId] = useState<number | null>(null)
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [searchQ, setSearchQ] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  /** فئات ذكية: تعرض أصنافاً من كل الفئات (لا تُمرَّر category_id للـ API) */
  const [smartShelf, setSmartShelf] = useState<null | 'popular' | 'discounted'>(null)
  const [sortBy, setSortBy] = useState<'popular' | 'price_asc' | 'price_desc' | 'name'>('popular')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [editingNoteFor, setEditingNoteFor] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState('')
  const [showManualItem, setShowManualItem] = useState(false)
  const [manualItem, setManualItem] = useState({ name: '', price: 0, qty: 1 })
  const [manualItemSaving, setManualItemSaving] = useState(false)
  const [cart, setCart] = useState<PosCartLine[]>([])
  const [invoiceDiscount, setInvoiceDiscount] = useState(0)
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<'amount' | 'percentage'>('amount')
  const [showOpenShift, setShowOpenShift] = useState(false)
  const [openingCash, setOpeningCash] = useState('0')
  const [showPayModal, setShowPayModal] = useState(false)
  const [posPayLines, setPosPayLines] = useState<PosPaymentLine[]>([])
  const [posFulfillment, setPosFulfillment] = useState<'' | 'delivery'>('')
  const [posDriverId, setPosDriverId] = useState<number | null>(null)
  const [showHeldList, setShowHeldList] = useState(false)
  const [showXReport, setShowXReport] = useState(false)
  const [xReportData, setXReportData] = useState<PosXReport | null>(null)
  const [showCloseShift, setShowCloseShift] = useState(false)
  const [closingCash, setClosingCash] = useState('')
  const [closeShiftSummary, setCloseShiftSummary] = useState<PosXReport | null>(null)
  const [closeShiftSummaryLoadError, setCloseShiftSummaryLoadError] = useState(false)
  const [showZReportPrint, setShowZReportPrint] = useState(false)
  const [lastZReport, setLastZReport] = useState<PosZReport | null>(null)
  const [lastShiftInfo, setLastShiftInfo] = useState<{ branchName?: string; userName?: string }>({})
  const zReportPrintRef = useRef<HTMLDivElement>(null)
  const closeShiftReportExportRef = useRef<HTMLDivElement>(null)
  const [closeShiftPdfExporting, setCloseShiftPdfExporting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [loyaltyProgram, setLoyaltyProgram] = useState<any>(null)
  const [loyaltyRedeemPoints, setLoyaltyRedeemPoints] = useState(0)
  const [loyaltyRedeemDiscount, setLoyaltyRedeemDiscount] = useState(0)
  const [loyaltyProgramId, setLoyaltyProgramId] = useState<number | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: number; name: string; phone?: string | null } | null>(null)
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const customerDropdownRef = useRef<HTMLDivElement>(null)
  const payModalCustomerIdRef = useRef<number | null>(null)
  const selectedCustomerRef = useRef<{ id: number; name: string; phone?: string | null } | null>(null)
  useEffect(() => {
    selectedCustomerRef.current = selectedCustomer
  }, [selectedCustomer])
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '' })
  const [showAddItemModal, setShowAddItemModal] = useState(false)
  const [posAddItemTab, setPosAddItemTab] = useState<'basic' | 'pricing'>('basic')
  const [newItemImageFile, setNewItemImageFile] = useState<File | null>(null)
  const newItemFormInitial = {
    code: '', name: '', name_en: '', description: '',
    selling_price: 0, cost_price: 0, barcode: '', category_id: '' as string, unit_id: '' as string,
    brand_id: '' as string,
    min_quantity: 0, initial_stock: 0,
    min_selling_price: 0, max_selling_price: 0,
    type: 'inventory' as 'inventory' | 'service',
  }
  const [newItemForm, setNewItemForm] = useState(newItemFormInitial)
  const [showAddItemConfirm, setShowAddItemConfirm] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [expenseForm, setExpenseForm] = useState<{ expense_item_id: string; payment_method_id: string; amount: string; notes: string }>({
    expense_item_id: '',
    payment_method_id: '',
    amount: '',
    notes: '',
  })
  const openPayAsCreditRef = useRef(false)
  /** بعد إتمام البيع: عرض نافذة طباعة / إرسال واتساب */
  const [lastSaleInfo, setLastSaleInfo] = useState<{
    invoiceId: number
    invoiceNumber: string
    total: number
    customerName: string
    customerPhone: string | null
  } | null>(null)

  // وضع العملية: بيع عادي أو مرتجع من فاتورة
  const [mode, setMode] = useState<'sale' | 'return'>('sale')
  const [returnInvoiceIdInput, setReturnInvoiceIdInput] = useState('')
  const [returnInvoice, setReturnInvoice] = useState<Invoice | null>(null)
  const [loadingReturnInvoice, setLoadingReturnInvoice] = useState(false)

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches: Branch[] = asArray<Branch>(branchesData)

  const { data: warehousesResp } = useQuery<{ data: Warehouse[] }>({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: !!tenantId,
  })
  const warehouses = warehousesResp?.data ?? []

  const posBarBranchItems = useMemo(
    () =>
      branches
        .filter((b) => b.is_active)
        .map((b) => ({ id: b.id, label: `${b.code} - ${b.name}` })),
    [branches],
  )
  const posBarWarehouseItems = useMemo(
    () =>
      warehouses.map((w) => ({
        id: w.id,
        label: w.code ? `${w.code} - ${w.name}` : w.name,
      })),
    [warehouses],
  )

  const { data: posSettings, isFetched: posSettingsFetched } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  useEffect(() => {
    if (!tenantId) return
    loyaltyApi.getProgram(tenantId).then((r) => setLoyaltyProgram(r.data.data ?? null)).catch(() => {})
  }, [tenantId])

  const isRestrictedToBranchWarehouse = !!(meData?.restrict_to_branch_warehouse && (meData?.default_branch_id != null || meData?.default_warehouse_id != null))
  const canChangeBranchWarehouse = can('*') || meData?.role_slug === 'admin'

  useEffect(() => {
    if (!meData) return
    if (meData.restrict_to_branch_warehouse && meData.default_branch_id != null) {
      setBranchId(meData.default_branch_id)
    }
    if (meData.restrict_to_branch_warehouse && meData.default_warehouse_id != null) {
      setWarehouseId(meData.default_warehouse_id)
    }
  }, [meData?.restrict_to_branch_warehouse, meData?.default_branch_id, meData?.default_warehouse_id])

  useEffect(() => {
    if (!tenantId || !posSettingsFetched) return
    if (isRestrictedToBranchWarehouse && meData?.default_branch_id != null) return
    if (branches.length === 0 || branchId !== null) return
    const def =
      posSettings &&
      posSettings.pos_use_default_branch &&
      posSettings.pos_default_branch_id != null &&
      posSettings.pos_default_branch_id !== ''
        ? Number(posSettings.pos_default_branch_id)
        : null
    const pick =
      def != null && branches.some((b) => b.id === def && b.is_active) ? def : branches[0].id
    setBranchId(pick)
  }, [
    tenantId,
    posSettingsFetched,
    branches,
    branchId,
    isRestrictedToBranchWarehouse,
    meData?.default_branch_id,
    posSettings?.pos_use_default_branch,
    posSettings?.pos_default_branch_id,
  ])

  useEffect(() => {
    if (!tenantId || !posSettingsFetched) return
    if (isRestrictedToBranchWarehouse && meData?.default_warehouse_id != null) return
    if (warehouses.length === 0 || warehouseId !== null) return
    const def =
      posSettings &&
      posSettings.pos_use_default_warehouse &&
      posSettings.pos_default_warehouse_id != null &&
      posSettings.pos_default_warehouse_id !== ''
        ? Number(posSettings.pos_default_warehouse_id)
        : null
    const pick = def != null && warehouses.some((w) => w.id === def) ? def : warehouses[0].id
    setWarehouseId(pick)
  }, [
    tenantId,
    posSettingsFetched,
    warehouses,
    warehouseId,
    isRestrictedToBranchWarehouse,
    meData?.default_warehouse_id,
    posSettings?.pos_use_default_warehouse,
    posSettings?.pos_default_warehouse_id,
  ])

  const amountDecimals = coerceDecimalPlaces(posSettings?.doc_amount_decimals, 2)
  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)
  const roundAmount = (n: number) => {
    const d = 10 ** amountDecimals
    return Math.round(n * d) / d
  }

  const posItemIconSizeRaw = (posSettings as Record<string, unknown> | undefined)?.pos_item_icon_size
  const posItemIconSize = typeof posItemIconSizeRaw === 'string' && ['small', 'medium', 'large'].includes(posItemIconSizeRaw) ? posItemIconSizeRaw : 'medium'
  const posDisplayConfig = useMemo(() => {
    const medium = {
      cardMinH: 'min-h-[120px] sm:min-h-[130px]',
      cardPadding: 'p-3',
      imageH: 'h-20',
      cardTitle: 'text-sm font-semibold',
      cardCode: 'text-xs',
      cardPrice: 'text-sm',
      packageIcon: 28,
      gridCols: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7',
      categoryBtn: 'py-3 px-5 rounded-xl text-base font-semibold min-h-[48px]',
    }
    if (posItemIconSize === 'small') {
      return {
        cardMinH: 'min-h-[100px] sm:min-h-[120px]',
        cardPadding: 'p-2',
        imageH: 'h-14',
        cardTitle: 'text-xs font-semibold',
        cardCode: 'text-[10px]',
        cardPrice: 'text-xs',
        packageIcon: 20,
        gridCols: 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8',
        categoryBtn: 'py-2 px-3 rounded-lg text-sm font-medium min-h-[44px]',
      }
    }
    if (posItemIconSize === 'large') {
      return {
        cardMinH: 'min-h-[160px]',
        cardPadding: 'p-4',
        imageH: 'h-24',
        cardTitle: 'text-base font-semibold',
        cardCode: 'text-sm',
        cardPrice: 'text-base',
        packageIcon: 32,
        gridCols: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5',
        categoryBtn: 'py-4 px-6 rounded-xl text-lg font-semibold min-h-[56px]',
      }
    }
    return medium
  }, [posItemIconSize])

  const useDefaultCustomer = Boolean(
    posSettings &&
      typeof posSettings === 'object' &&
      (posSettings as Record<string, unknown>).pos_use_default_customer &&
      (posSettings as Record<string, unknown>).pos_default_customer_id != null
  )
  const { data: defaultCustomersData } = useQuery({
    queryKey: ['customers', tenantId, 'pos-default-apply', branchId],
    queryFn: () =>
      fetchCustomers(tenantId, {
        per_page: '500',
        ...(branchId != null ? { branch_id: String(branchId) } : {}),
      }),
    enabled: !!tenantId && useDefaultCustomer,
  })
  const defaultCustomersList: Customer[] = defaultCustomersData?.data ?? []

  const defaultsAppliedRef = useRef(false)
  useEffect(() => {
    try {
      const s = posSettings as Record<string, unknown> | undefined
      if (!s || typeof s !== 'object' || defaultsAppliedRef.current) return
      if (s.pos_use_default_category && s.pos_default_category_id != null) {
        setSmartShelf(null)
        setSelectedCategoryId(Number(s.pos_default_category_id))
      }
      const needCustomer = s.pos_use_default_customer && s.pos_default_customer_id != null
      if (needCustomer && Array.isArray(defaultCustomersList) && defaultCustomersList.length > 0) {
        const id = Number(s.pos_default_customer_id)
        const customer = defaultCustomersList.find((c) => c.id === id)
        if (customer) {
          setSelectedCustomer({ id: customer.id, name: customer.name, phone: customer.phone ?? null })
        }
      }
      if (!needCustomer || defaultCustomersList.length > 0) defaultsAppliedRef.current = true
    } catch {
      defaultsAppliedRef.current = true
    }
  }, [posSettings, defaultCustomersList])

  // توليد كود الصنف تلقائياً عند اختيار الفئة في مودال إضافة صنف من POS
  useEffect(() => {
    if (!showAddItemModal || !tenantId || !newItemForm.category_id) return
    const catId = parseInt(newItemForm.category_id, 10)
    if (Number.isNaN(catId)) return
    fetchNextItemCode(tenantId, catId)
      .then((code) => setNewItemForm((f) => ({ ...f, code })))
      .catch(() => {})
  }, [showAddItemModal, tenantId, newItemForm.category_id])

  const { data: shiftData, refetch: refetchShift } = useQuery({
    queryKey: ['pos-shift', tenantId, branchId],
    queryFn: () => fetchPosShift(tenantId, branchId!),
    enabled: !!tenantId && !!branchId,
  })
  const currentShift = shiftData?.shift ?? null

  const { data: posBarXReport } = useQuery({
    queryKey: ['pos-x-report-bar', tenantId, branchId],
    queryFn: () => fetchPosXReport(tenantId, branchId!),
    enabled: !!tenantId && !!branchId && !!currentShift,
    refetchInterval: 60_000,
  })

  const { data: heldListBarData } = useQuery({
    queryKey: ['pos-held-bar', tenantId, branchId],
    queryFn: () => fetchPosHeldList(tenantId, branchId!),
    enabled: !!tenantId && !!branchId,
    refetchInterval: 45_000,
  })
  const heldCartsBarCount = (heldListBarData as { data?: unknown[] } | undefined)?.data?.length ?? 0

  const closeShiftBreakdown = useMemo(
    () => (closeShiftSummary ? computeCloseShiftBreakdown(closeShiftSummary) : null),
    [closeShiftSummary],
  )

  const printCloseShiftCashCountReport = useCallback(() => {
    if (!closeShiftSummary || !closeShiftBreakdown || !currentShift) return
    const isAr = lang === 'ar'
    const dir = isAr ? 'rtl' : 'ltr'
    const logo = safeLogoUrlForPrint((posSettings as Record<string, unknown> | undefined)?.pos_invoice_logo)
    const company = escHtml(currentTenant?.name ?? '')
    const cashier = escHtml(currentShift.user?.name ?? '—')
    const manager = escHtml(currentUser?.name ?? '—')
    const branch = escHtml(currentShift.branch?.name ?? currentShift.branch?.code ?? '—')
    const openedRaw = closeShiftSummary.opened_at ?? currentShift.opened_at
    const openedStr = openedRaw
      ? new Date(openedRaw).toLocaleString(isAr ? 'ar-SA' : 'en-GB', { hour12: true })
      : '—'
    const printNow = new Date().toLocaleString(isAr ? 'ar-SA' : 'en-GB', { hour12: true })
    const closingNote = isAr
      ? 'لم يُسجَّل بعد — الوردية مفتوحة (يُثبَّت عند الضغط على «إغلاق الوردية»)'
      : 'Not recorded yet — shift open (recorded on «Close shift»)'
    const b = closeShiftBreakdown
    const fmtN = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)
    const row = (label: string, val: string, valClass = '') =>
      `<tr><td>${escHtml(label)}</td><td class="num ${valClass}">${val}</td></tr>`
    const sec = (t: string) => `<tr><td colspan="2" class="sec">${escHtml(t)}</td></tr>`
    const tableBody = [
      sec(isAr ? 'المبيعات حسب طريقة الدفع' : 'Sales by payment method'),
      row(isAr ? 'مبيعات نقداً' : 'Cash sales', fmtN(b.cashSales)),
      row(isAr ? 'مبيعات فيزا / بطاقة' : 'Card sales', fmtN(b.cardSales)),
      row(isAr ? 'تحويلات بنكية' : 'Bank transfers', fmtN(b.bankSales)),
      row(isAr ? 'أخرى' : 'Other', fmtN(b.otherSales)),
      row(isAr ? '− مرتجعات' : '− Returns', `- ${fmtN(b.returns)}`, 'neg'),
      row(isAr ? '− خصم' : '− Discount', `- ${fmtN(b.discount)}`, 'neg'),
      row(isAr ? 'إجمالي المبيعات النقدية' : 'Total cash sales', fmtN(b.totalCashSalesNet), 'bold'),
      row(isAr ? 'مبيعات بالآجل' : 'Credit sales', fmtN(b.creditSales)),
      row(isAr ? 'إجمالي المبيعات' : 'Total sales', fmtN(b.totalSales), 'bold'),
      row(isAr ? 'المصروفات' : 'Expenses', `- ${fmtN(b.expenses)}`, 'neg'),
      row(isAr ? 'صافي النقدية' : 'Net cash', fmtN(b.netCash), 'total'),
    ].join('')

    const tLine = (k: string, v: string, extra = '') =>
      `<div class="ti ${extra}"><div class="tik">${escHtml(k)}</div><div class="tiv">${v}</div></div>`
    const tSec = (t: string) => `<div class="tisec">${escHtml(t)}</div>`
    const thermalBody = [
      tSec(isAr ? 'المبيعات حسب طريقة الدفع' : 'Sales by payment method'),
      tLine(isAr ? 'مبيعات نقداً' : 'Cash sales', fmtN(b.cashSales)),
      tLine(isAr ? 'مبيعات فيزا / بطاقة' : 'Card sales', fmtN(b.cardSales)),
      tLine(isAr ? 'تحويلات بنكية' : 'Bank transfers', fmtN(b.bankSales)),
      tLine(isAr ? 'أخرى' : 'Other', fmtN(b.otherSales)),
      tLine(isAr ? '− مرتجعات' : '− Returns', `- ${fmtN(b.returns)}`, 'neg'),
      tLine(isAr ? '− خصم' : '− Discount', `- ${fmtN(b.discount)}`, 'neg'),
      tLine(isAr ? 'إجمالي المبيعات النقدية' : 'Total cash sales', fmtN(b.totalCashSalesNet), 'strong'),
      tLine(isAr ? 'مبيعات بالآجل' : 'Credit sales', fmtN(b.creditSales)),
      tLine(isAr ? 'إجمالي المبيعات' : 'Total sales', fmtN(b.totalSales), 'strong'),
      tLine(isAr ? 'المصروفات' : 'Expenses', `- ${fmtN(b.expenses)}`, 'neg'),
      tLine(isAr ? 'صافي النقدية' : 'Net cash', fmtN(b.netCash), 'total'),
    ].join('')

    const title = isAr ? 'تقرير مطابقة وجرد وردية مبيعات' : 'Sales shift reconciliation & cash count report'
    const modeLabel = isAr ? 'نمط الطباعة' : 'Print layout'
    const lblA4 = isAr ? 'A4 (مكتبية)' : 'A4 (office)'
    const lblTh = isAr ? 'حراري 80مم' : 'Thermal 80mm'
    const btnPrint = isAr ? 'طباعة' : 'Print'
    const hint = isAr ? 'اختر النمط ثم اضغط طباعة. حجم الورق يُضبط تلقائياً مع نمط الطباعة.' : 'Choose layout, then Print. Paper size follows the selected layout.'

    const html = `<!DOCTYPE html><html dir="${dir}" lang="${isAr ? 'ar' : 'en'}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escHtml(title)}</title>
<style id="page-size-rule"></style>
<style>
  *{box-sizing:border-box;}
  body{margin:0;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#0f172a;background:#e2e8f0;}
  .toolbar.no-print{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;padding:12px 16px;background:#1e293b;color:#f8fafc;border-bottom:2px solid #0f172a;}
  .toolbar .ttl{font-weight:700;font-size:0.9rem;}
  .toolbar label{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:0.85rem;}
  .toolbar input{accent-color:#38bdf8;}
  .toolbar button#printGo{margin-inline-start:auto;background:#0ea5e9;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.9rem;}
  .toolbar button#printGo:hover{background:#0284c7;}
  .hint{width:100%;font-size:0.72rem;opacity:0.85;margin:0;}
  .wrap{padding:16px;display:flex;justify-content:center;}
  /* A4 sheet (معاينة وطباعة) */
  #sheet-a4{display:block;width:100%;max-width:210mm;margin:0 auto;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.12);padding:20px 24px;border-radius:8px;}
  body.mode-thermal #sheet-a4{display:none !important;}
  #sheet-a4 .logo{text-align:center;margin-bottom:10px;}
  #sheet-a4 .logo img{max-height:72px;max-width:240px;object-fit:contain;}
  #sheet-a4 h1{font-size:1.15rem;text-align:center;font-weight:700;margin:6px 0 14px;}
  #sheet-a4 .company{text-align:center;font-size:0.85rem;color:#64748b;margin-bottom:12px;}
  #sheet-a4 .meta{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;font-size:0.82rem;margin-bottom:16px;border:1px solid #cbd5e1;padding:12px;border-radius:8px;background:#f8fafc;}
  #sheet-a4 .meta .cell{display:flex;flex-direction:column;gap:3px;}
  #sheet-a4 .meta .k{color:#64748b;font-size:0.72rem;}
  #sheet-a4 .meta .v{font-weight:600;}
  #sheet-a4 .meta .full{grid-column:1/-1;}
  #sheet-a4 table{width:100%;border-collapse:collapse;font-size:0.84rem;table-layout:fixed;}
  #sheet-a4 th,#sheet-a4 td{border:1px solid #cbd5e1;padding:8px 10px;word-wrap:break-word;}
  #sheet-a4 th{background:#e2e8f0;font-weight:600;}
  #sheet-a4 th:first-child{width:62%;}
  #sheet-a4 .sec{background:#f1f5f9;font-size:0.72rem;font-weight:700;color:#475569;}
  #sheet-a4 .num{text-align:left;direction:ltr;font-variant-numeric:tabular-nums;}
  [dir="rtl"] #sheet-a4 .num{text-align:right;}
  #sheet-a4 .neg{color:#dc2626;}
  #sheet-a4 .bold{font-weight:700;background:#f1f5f9;}
  #sheet-a4 .total{font-weight:800;background:#e0f2fe;color:#0369a1;}
  #sheet-a4 .sign{margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:28px;page-break-inside:avoid;}
  #sheet-a4 .sign .lbl{font-size:0.78rem;color:#475569;margin-bottom:6px;}
  #sheet-a4 .sign .line{border-bottom:1px solid #334155;min-height:40px;}
  #sheet-a4 .print-foot{margin-top:14px;font-size:0.75rem;color:#64748b;}
  /* حراري */
  #sheet-thermal{display:none;width:80mm;max-width:80mm;margin:0 auto;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.1);padding:6px 8px 10px;font-size:11px;line-height:1.35;}
  body.mode-thermal #sheet-thermal{display:block !important;}
  #sheet-thermal .tlogo{text-align:center;margin-bottom:4px;}
  #sheet-thermal .tlogo img{max-height:36px;max-width:140px;object-fit:contain;}
  #sheet-thermal h1{font-size:11px;font-weight:800;text-align:center;margin:4px 0 6px;line-height:1.3;}
  #sheet-thermal .tco{text-align:center;font-size:9px;color:#64748b;margin-bottom:6px;}
  #sheet-thermal .tmeta{border-top:1px dashed #94a3b8;border-bottom:1px dashed #94a3b8;padding:6px 0;margin-bottom:6px;}
  #sheet-thermal .tmeta .row{display:flex;flex-direction:row;align-items:baseline;justify-content:space-between;gap:6px;margin-bottom:4px;}
  #sheet-thermal .tmeta .rk{flex:1;min-width:0;font-size:9px;color:#64748b;text-align:start;}
  #sheet-thermal .tmeta .rv{flex-shrink:0;font-weight:600;font-size:10px;text-align:end;max-width:55%;}
  #sheet-thermal .tisec{font-size:9px;font-weight:700;color:#475569;background:#f1f5f9;padding:3px 4px;margin:6px 0 2px;}
  #sheet-thermal .ti{display:flex;flex-direction:row;align-items:baseline;justify-content:space-between;gap:6px;border-bottom:1px dotted #cbd5e1;padding:3px 2px;}
  #sheet-thermal .tik{flex:1;min-width:0;font-size:9px;color:#334155;text-align:start;line-height:1.25;}
  #sheet-thermal .tiv{flex-shrink:0;font-size:11px;font-weight:700;direction:ltr;unicode-bidi:embed;text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap;}
  #sheet-thermal .ti.neg .tiv{color:#dc2626;}
  #sheet-thermal .ti.strong .tik{font-weight:700;}
  #sheet-thermal .ti.total{background:#e0f2fe;}
  #sheet-thermal .ti.total .tiv{color:#0369a1;}
  #sheet-thermal .tsign{margin-top:10px;padding-top:6px;border-top:1px dashed #94a3b8;font-size:9px;display:flex;justify-content:space-between;gap:8px;}
  #sheet-thermal .tsign span{flex:1;text-align:center;}
  #sheet-thermal .tfoot{margin-top:6px;font-size:8px;color:#64748b;text-align:center;}
  @media print{
    body{background:#fff !important;padding:0 !important;}
    .no-print{display:none !important;}
    .wrap{padding:0 !important;}
    #sheet-a4,#sheet-thermal{box-shadow:none !important;border-radius:0 !important;max-width:none !important;width:100% !important;}
    body.mode-a4 #sheet-thermal{display:none !important;}
    body.mode-thermal #sheet-a4{display:none !important;}
    body.mode-thermal #sheet-thermal{width:80mm !important;max-width:80mm !important;margin:0 auto !important;padding:2mm !important;}
  }
</style></head><body class="mode-a4">
  <header class="toolbar no-print">
    <span class="ttl">${escHtml(modeLabel)}</span>
    <label><input type="radio" name="printMode" value="a4" checked/> ${escHtml(lblA4)}</label>
    <label><input type="radio" name="printMode" value="thermal"/> ${escHtml(lblTh)}</label>
    <button type="button" id="printGo">${escHtml(btnPrint)}</button>
    <p class="hint">${escHtml(hint)}</p>
  </header>
  <div class="wrap">
  <div id="sheet-a4">
  ${logo ? `<div class="logo"><img src="${escHtml(logo)}" alt=""/></div>` : ''}
  <h1>${escHtml(title)}</h1>
  ${company ? `<div class="company">${company}</div>` : ''}
  <div class="meta">
    <div class="cell"><span class="k">${isAr ? 'اسم الكاشير (فاتح الوردية)' : 'Cashier (opened shift)'}</span><span class="v">${cashier}</span></div>
    <div class="cell"><span class="k">${isAr ? 'اسم المدير / المُغلق' : 'Manager / closing user'}</span><span class="v">${manager}</span></div>
    <div class="cell"><span class="k">${isAr ? 'تاريخ ووقت فتح الوردية' : 'Shift opened at'}</span><span class="v">${escHtml(openedStr)}</span></div>
    <div class="cell"><span class="k">${isAr ? 'تاريخ ووقت إغلاق الوردية' : 'Shift closed at'}</span><span class="v">${escHtml(closingNote)}</span></div>
    <div class="cell full"><span class="k">${isAr ? 'الفرع' : 'Branch'}</span><span class="v">${branch}</span></div>
    <div class="cell full"><span class="k">${isAr ? 'وقت طباعة التقرير' : 'Report printed at'}</span><span class="v">${escHtml(printNow)}</span></div>
  </div>
  <table><thead><tr><th>${isAr ? 'البند' : 'Item'}</th><th>${isAr ? 'المبلغ' : 'Amount'}</th></tr></thead><tbody>${tableBody}</tbody></table>
  <div class="sign">
    <div><div class="lbl">${isAr ? 'توقيع الكاشير' : 'Cashier signature'}</div><div class="line"></div></div>
    <div><div class="lbl">${isAr ? 'توقيع المشرف' : 'Supervisor signature'}</div><div class="line"></div></div>
  </div>
  <div class="print-foot">${isAr ? 'وثيقة رقابية — جرد صندوق قبل إغلاق الوردية' : 'Control document — pre-close cash count'}</div>
  </div>
  <div id="sheet-thermal">
    ${logo ? `<div class="tlogo"><img src="${escHtml(logo)}" alt=""/></div>` : ''}
    <h1>${escHtml(title)}</h1>
    ${company ? `<div class="tco">${company}</div>` : ''}
    <div class="tmeta">
      <div class="row"><div class="rk">${isAr ? 'الكاشير' : 'Cashier'}</div><div class="rv">${cashier}</div></div>
      <div class="row"><div class="rk">${isAr ? 'المدير / المُغلق' : 'Manager'}</div><div class="rv">${manager}</div></div>
      <div class="row"><div class="rk">${isAr ? 'فتح الوردية' : 'Opened'}</div><div class="rv">${escHtml(openedStr)}</div></div>
      <div class="row"><div class="rk">${isAr ? 'إغلاق' : 'Close'}</div><div class="rv">${escHtml(closingNote)}</div></div>
      <div class="row"><div class="rk">${isAr ? 'الفرع' : 'Branch'}</div><div class="rv">${branch}</div></div>
      <div class="row"><div class="rk">${isAr ? 'طباعة' : 'Printed'}</div><div class="rv">${escHtml(printNow)}</div></div>
    </div>
    ${thermalBody}
    <div class="tsign">
      <span>____ ${isAr ? 'كاشير' : 'Cash.'}</span>
      <span>____ ${isAr ? 'مشرف' : 'Sup.'}</span>
    </div>
    <div class="tfoot">${isAr ? 'جرد صندوق — وردية مفتوحة' : 'Cash count — open shift'}</div>
  </div>
  </div>
<script>
(function(){
  var pageEl=document.getElementById('page-size-rule');
  function setPageRule(mode){
    if(!pageEl)return;
    if(mode==='thermal'){
      pageEl.textContent='@media print{@page{size:80mm auto;margin:2mm;}body{margin:0;}}';
    }else{
      pageEl.textContent='@media print{@page{size:A4 portrait;margin:12mm;}body{margin:0;}}';
    }
  }
  function setMode(mode){
    document.body.className=mode==='thermal'?'mode-thermal':'mode-a4';
    setPageRule(mode);
  }
  document.querySelectorAll('input[name="printMode"]').forEach(function(r){
    r.addEventListener('change',function(){if(r.checked)setMode(r.value);});
  });
  document.getElementById('printGo').addEventListener('click',function(){
    var m=document.querySelector('input[name="printMode"]:checked');
    setMode(m?m.value:'a4');
    window.print();
  });
  setMode('a4');
})();
</script>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
  }, [
    closeShiftSummary,
    closeShiftBreakdown,
    currentShift,
    currentUser,
    currentTenant,
    posSettings,
    lang,
    amountDecimals,
    locale,
  ])

  const exportCloseShiftReportPdf = useCallback(async () => {
    const el = closeShiftReportExportRef.current
    if (!el) {
      setToast({ message: lang === 'ar' ? 'لا يوجد تقرير للتصدير بعد التحميل.' : 'No report to export yet.', type: 'error' })
      return
    }
    setCloseShiftPdfExporting(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
      })
      const imgData = canvas.toDataURL('image/png', 1.0)
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW
      const imgH = (canvas.height * imgW) / canvas.width
      let heightLeft = imgH
      let y = 0
      pdf.addImage(imgData, 'PNG', 0, y, imgW, imgH, undefined, 'FAST')
      heightLeft -= pageH
      while (heightLeft > 0) {
        y = heightLeft - imgH
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, y, imgW, imgH, undefined, 'FAST')
        heightLeft -= pageH
      }
      const d = new Date().toISOString().slice(0, 10)
      const fname =
        lang === 'ar' ? `جرد-صندوق-فرع-${branchId}-${d}.pdf` : `cash-count-branch-${branchId}-${d}.pdf`
      pdf.save(fname)
      setToast({ message: lang === 'ar' ? 'تم تصدير PDF بنجاح' : 'PDF exported successfully', type: 'success' })
    } catch {
      setToast({ message: lang === 'ar' ? 'تعذر تصدير PDF. حاول مجدداً.' : 'PDF export failed. Try again.', type: 'error' })
    } finally {
      setCloseShiftPdfExporting(false)
    }
  }, [lang, branchId])

  const { data: categoriesData } = useQuery({
    queryKey: ['item-categories', tenantId],
    queryFn: () => fetchItemCategories(tenantId),
    enabled: !!tenantId,
  })
  const categories: ItemCategory[] = (Array.isArray(categoriesData) ? categoriesData : []).filter(
    (c) => (c.show_in_pos ?? true) && c.is_active !== false,
  )

  const { data: unitsData } = useQuery({
    queryKey: ['item-units', tenantId],
    queryFn: () => fetchItemUnits(tenantId),
    enabled: !!tenantId && showAddItemModal,
  })
  const itemUnits: ItemUnit[] = Array.isArray(unitsData) ? unitsData : []

  const { data: brandsData } = useQuery({
    queryKey: ['item-brands', tenantId],
    queryFn: () => fetchItemBrands(tenantId),
    enabled: !!tenantId && showAddItemModal,
  })
  const itemBrands: ItemBrand[] = Array.isArray(brandsData) ? brandsData : []

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['pos-items', tenantId, searchQ, smartShelf, selectedCategoryId],
    queryFn: () =>
      fetchPosItems(tenantId, {
        q: searchQ || undefined,
        category_id: smartShelf != null ? undefined : selectedCategoryId ?? undefined,
        per_page: smartShelf != null ? 100 : 60,
      }),
    enabled: !!tenantId,
  })
  const items: PosItem[] = itemsData?.data ?? []

  const filteredShelfItems = useMemo(() => {
    if (smartShelf === 'popular') {
      return [...items].sort((a, b) => Number(b.sales_count ?? 0) - Number(a.sales_count ?? 0)).slice(0, 20)
    }
    if (smartShelf === 'discounted') {
      return items.filter((i) => i.is_promo === true)
    }
    return items
  }, [items, smartShelf])

  const sortedDisplayItems = useMemo(() => {
    const arr = [...filteredShelfItems]
    const itemLabel = (it: PosItem) => (lang === 'ar' ? it.name : (it.name_en || it.name))
    switch (sortBy) {
      case 'price_asc':
        return arr.sort((a, b) => Number(a.selling_price) - Number(b.selling_price))
      case 'price_desc':
        return arr.sort((a, b) => Number(b.selling_price) - Number(a.selling_price))
      case 'name':
        return arr.sort((a, b) => itemLabel(a).localeCompare(itemLabel(b), lang === 'ar' ? 'ar' : 'en'))
      default:
        return arr.sort((a, b) => Number(b.sales_count ?? 0) - Number(a.sales_count ?? 0))
    }
  }, [filteredShelfItems, sortBy, lang])

  const { data: paymentMethodsData, isLoading: paymentMethodsLoading } = useQuery({
    queryKey: ['payment-methods', tenantId, 'active'],
    queryFn: () => fetchPaymentMethods(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })
  const paymentMethods: PaymentMethod[] = paymentMethodsData ?? []

  const { data: expenseItems = [] } = useQuery<PosExpenseItem[]>({
    queryKey: ['pos-expense-items', tenantId],
    queryFn: async () => {
      try {
        return await fetchPosExpenseItems(tenantId)
      } catch {
        return []
      }
    },
    enabled: !!tenantId && showExpenseModal,
  })

  const { data: heldListData, refetch: refetchHeld } = useQuery({
    queryKey: ['pos-held', tenantId, branchId],
    queryFn: () => fetchPosHeldList(tenantId, branchId!),
    enabled: !!tenantId && !!branchId && showHeldList,
  })
  const heldList = heldListData?.data ?? []

  const { data: posDriversRes } = useQuery({
    queryKey: ['delivery-drivers', tenantId, 'pos-pay'],
    queryFn: () => fetchDeliveryDrivers(tenantId, { per_page: '200', is_active: '1' }),
    enabled: !!tenantId && showPayModal,
  })
  const posDrivers: DeliveryDriver[] = (posDriversRes as PaginatedResponse<DeliveryDriver> | undefined)?.data ?? []

  const { data: posCustomersData } = useQuery({
    queryKey: ['customers', tenantId, 'pos-dropdown', branchId],
    queryFn: () =>
      fetchCustomers(tenantId, {
        per_page: '500',
        ...(branchId != null ? { branch_id: String(branchId) } : {}),
      }),
    enabled: !!tenantId,
  })
  const posCustomersList: Customer[] = posCustomersData?.data ?? []

  // فلترة العملاء للبحث بالاسم أو رقم التليفون
  const filteredCustomersForPos = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase()
    if (!q) return posCustomersList.slice(0, 50)
    return posCustomersList.filter((c) => {
      const name = (c.name ?? '').toLowerCase()
      const phone = String(c.phone ?? '')
      return name.includes(q) || phone.includes(customerSearchQuery.trim())
    }).slice(0, 50)
  }, [posCustomersList, customerSearchQuery])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const tick = () => {
      setCurrentTime(
        new Date().toLocaleTimeString(lang === 'ar' ? 'ar-KW' : 'en-GB', { hour: '2-digit', minute: '2-digit' }),
      )
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [lang])

  const openShiftMut = useMutation({
    mutationFn: (cash: number) => openPosShift(tenantId, { branch_id: branchId!, opening_cash: cash }),
    onSuccess: () => {
      refetchShift()
      queryClient.invalidateQueries({ queryKey: ['pos-shifts-report'] })
      queryClient.invalidateQueries({ queryKey: ['pos-shifts-report-cashiers'] })
      setShowOpenShift(false)
      setOpeningCash('0')
      setToast({ message: t.msg?.addedSuccess ?? 'تم فتح الوردية', type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? t.msg?.addError ?? 'خطأ', type: 'error' })
    },
  })

  const saleMut = useMutation({
    mutationFn: (payload: Parameters<typeof createPosSale>[1]) => createPosSale(tenantId, payload),
    onSuccess: (data) => {
      setCart([])
      setInvoiceDiscount(0)
      setEditingNoteFor(null)
      payModalCustomerIdRef.current = null
      setPosFulfillment('')
      setPosDriverId(null)
      setLoyaltyRedeemPoints(0)
      setLoyaltyRedeemDiscount(0)
      setLoyaltyProgramId(null)
      setShowPayModal(false)
      setToast({ message: t.msg?.addedSuccess ?? 'تم إتمام البيع', type: 'success' })
      if (data?.invoice) {
        const inv = data.invoice as { id: number; number: string; total?: number }
        const cust = (data.invoice as { customer?: { name?: string; phone?: string | null } })?.customer
        setLastSaleInfo({
          invoiceId: inv.id,
          invoiceNumber: String(inv.number ?? ''),
          total: Number(inv.total ?? 0),
          customerName: cust?.name ?? selectedCustomer?.name ?? '',
          customerPhone: cust?.phone ?? selectedCustomer?.phone ?? null,
        })
      }
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? t.msg?.addError ?? 'خطأ', type: 'error' })
    },
  })

  const holdMut = useMutation({
    mutationFn: () => holdPosCart(tenantId, { branch_id: branchId!, payload: { cart, invoiceDiscount, invoiceDiscountType } }),
    onSuccess: () => {
      setCart([])
      setInvoiceDiscount(0)
      setToast({ message: 'تم تعليق السلة', type: 'success' })
      refetchHeld()
      queryClient.invalidateQueries({ queryKey: ['pos-held-bar', tenantId, branchId] })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? 'خطأ', type: 'error' })
    },
  })

  const closeShiftMut = useMutation({
    mutationFn: (cash: number) => closePosShift(tenantId, { branch_id: branchId!, closing_cash: cash }),
    onSuccess: (data) => {
      setShowCloseShift(false)
      setClosingCash('')
      setCloseShiftSummary(null)
      setLastZReport(data.z_report)
      setLastShiftInfo({ branchName: (data.shift as { branch?: { name?: string } })?.branch?.name, userName: (data.shift as { user?: { name?: string } })?.user?.name })
      setShowZReportPrint(true)
      refetchShift()
      queryClient.invalidateQueries({ queryKey: ['pos-shifts-report'] })
      queryClient.invalidateQueries({ queryKey: ['pos-shifts-report-cashiers'] })
      setToast({ message: `تم إغلاق الوردية. الفرق: ${fmt(data.z_report.difference)}`, type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? 'خطأ', type: 'error' })
    },
  })

  const createCustomerMut = useMutation({
    mutationFn: (d: { name: string; phone?: string }) => createCustomer(tenantId, d),
    onSuccess: (newCustomer) => {
      setSelectedCustomer({ id: newCustomer.id, name: newCustomer.name, phone: newCustomer.phone ?? null })
      setCustomerSearchQuery('')
      setCustomerDropdownOpen(false)
      setShowAddCustomerModal(false)
      setNewCustomerForm({ name: '', phone: '' })
      queryClient.invalidateQueries({ queryKey: ['customers', tenantId] })
      setToast({ message: t.msg?.addedSuccess ?? 'تم إضافة العميل', type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? 'خطأ', type: 'error' })
    },
  })

  const createItemMut = useMutation({
    mutationFn: ({ data: d, image: img }: { data: Record<string, unknown>; image?: File | null }) =>
      createItem(tenantId, d as Partial<Item>, img),
    onSuccess: () => {
      setShowAddItemConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['pos-items', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['items', tenantId] })
      setShowAddItemModal(false)
      setNewItemForm(newItemFormInitial)
      setNewItemImageFile(null)
      setPosAddItemTab('basic')
      setToast({ message: t.msg?.addedSuccess ?? 'تم إضافة الصنف', type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setShowAddItemConfirm(false)
      setToast({ message: err?.response?.data?.message ?? 'خطأ', type: 'error' })
    },
  })

  const recordExpenseMut = useMutation({
    mutationFn: (payload: { expense_item_id: number; payment_method_id: number; amount: number; notes?: string | null }) =>
      recordPosExpense(tenantId, {
        branch_id: branchId!,
        shift_id: currentShift?.id ?? null,
        expense_item_id: payload.expense_item_id,
        payment_method_id: payload.payment_method_id,
        amount: payload.amount,
        notes: payload.notes || null,
      }),
    onSuccess: () => {
      setShowExpenseModal(false)
      setExpenseForm({ expense_item_id: '', payment_method_id: '', amount: '', notes: '' })
      refetchShift()
      setToast({ message: lang === 'ar' ? 'تم تسجيل المصروف وإنشاء سند الصرف' : 'Expense recorded and voucher created', type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? (lang === 'ar' ? 'فشل تسجيل المصروف' : 'Failed to record expense'), type: 'error' })
    },
  })

  const posReturnMut = useMutation({
    mutationFn: (payload: Parameters<typeof createPosReturn>[1]) => createPosReturn(tenantId, payload),
    onSuccess: () => {
      setCart([])
      setInvoiceDiscount(0)
      setEditingNoteFor(null)
      payModalCustomerIdRef.current = null
      setShowPayModal(false)
      setReturnInvoice(null)
      setReturnInvoiceIdInput('')
      setMode('sale')
      setToast({ message: lang === 'ar' ? 'تم إتمام المرتجع' : 'Return completed', type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? (lang === 'ar' ? 'فشل تنفيذ المرتجع' : 'Failed to complete return'), type: 'error' })
    },
  })

  const addToCart = useCallback((item: PosItem, qty: number = 1) => {
    if (mode === 'return') {
      // في وضع المرتجع لا نسمح بإضافة أصناف حرة إلى السلة
      setToast({ message: lang === 'ar' ? 'في وضع المرتجع يجب اختيار الفاتورة الأصلية أولاً.' : 'In return mode, select an original invoice first.', type: 'info' })
      return
    }
    if (posEffectiveStock(item) <= 0) {
      setToast({ message: lang === 'ar' ? 'هذا الصنف غير متوفر في المخزن' : 'This item is out of stock', type: 'error' })
      return
    }
    const existing = cart.find((l) => l.item_id === item.id)
    const discountPct = 0
    const taxPct = VAT_RATE
    if (existing) {
      const newQty = existing.quantity + qty
      const { amount, tax, total } = calcLineTotal(newQty, existing.unit_price, existing.discount_percent, taxPct)
      setCart((prev) =>
        prev.map((l) =>
          l.item_id === item.id
            ? { ...l, quantity: newQty, amount, tax_amount: tax, total }
            : l
        )
      )
    } else {
      const { amount, tax, total } = calcLineTotal(qty, item.selling_price, discountPct, taxPct)
      setCart((prev) => [
        ...prev,
        {
          item_id: item.id,
          item_name: lang === 'ar' ? item.name : (item.name_en || item.name),
          code: item.code,
          quantity: qty,
          unit_price: item.selling_price,
          discount_percent: discountPct,
          tax_percent: taxPct,
          amount,
          tax_amount: tax,
          total,
        },
      ])
    }
  }, [cart, lang, mode, setToast])

  const updateCartQty = useCallback((itemId: number, delta: number) => {
    setCart((prev) => {
      const line = prev.find((l) => l.item_id === itemId)
      if (!line) return prev
      const newQty = Math.max(0, line.quantity + delta)
      if (newQty === 0) return prev.filter((l) => l.item_id !== itemId)
      const { amount, tax, total } = calcLineTotal(newQty, line.unit_price, line.discount_percent, line.tax_percent)
      return prev.map((l) => (l.item_id === itemId ? { ...l, quantity: newQty, amount, tax_amount: tax, total } : l))
    })
  }, [])

  const updateCartLine = useCallback((itemId: number, updates: { quantity?: number; unit_price?: number; discount_percent?: number }) => {
    setCart((prev) => {
      const line = prev.find((l) => l.item_id === itemId)
      if (!line) return prev
      const newQty = updates.quantity !== undefined ? Math.max(0, updates.quantity) : line.quantity
      if (newQty === 0) return prev.filter((l) => l.item_id !== itemId)
      const newPrice = updates.unit_price !== undefined ? Math.max(0, roundAmount(updates.unit_price)) : line.unit_price
      const newDisc = updates.discount_percent !== undefined ? Math.max(0, updates.discount_percent) : line.discount_percent
      const { amount, tax, total } = calcLineTotal(newQty, newPrice, newDisc, line.tax_percent)
      return prev.map((l) =>
        l.item_id === itemId ? { ...l, quantity: newQty, unit_price: newPrice, discount_percent: newDisc, amount, tax_amount: tax, total } : l
      )
    })
  }, [amountDecimals])

  const removeFromCart = useCallback((itemId: number) => {
    setCart((prev) => prev.filter((l) => l.item_id !== itemId))
  }, [])

  const addItemByCodeOrBarcode = useCallback(() => {
    const q = searchQ.trim()
    if (!q) {
      setToast({ message: lang === 'ar' ? 'أدخل الكود أو الباركود في خانة البحث أولاً' : 'Enter code or barcode in the search field first', type: 'info' })
      searchInputRef.current?.focus()
      return
    }
    const qLower = q.toLowerCase()
    const found = items.find((i) => {
      const code = String(i.code ?? '').toLowerCase()
      const barcode = String(i.barcode ?? '').toLowerCase()
      return code === qLower || barcode === qLower || code.includes(qLower) || barcode.includes(qLower)
    })
    if (found) {
      if (posEffectiveStock(found) <= 0) {
        setToast({ message: lang === 'ar' ? 'هذا الصنف غير متوفر في المخزن' : 'This item is out of stock', type: 'error' })
        beepNotFound()
        return
      }
      addToCart(found, 1)
      setSearchQ('')
      setToast({ message: t.msg?.addedSuccess ?? 'تمت الإضافة', type: 'success' })
    } else if (items.length === 1) {
      if (posEffectiveStock(items[0]) <= 0) {
        setToast({ message: lang === 'ar' ? 'هذا الصنف غير متوفر في المخزن' : 'This item is out of stock', type: 'error' })
        beepNotFound()
        return
      }
      addToCart(items[0], 1)
      setSearchQ('')
      setToast({ message: t.msg?.addedSuccess ?? 'تمت الإضافة', type: 'success' })
    } else {
      setToast({ message: lang === 'ar' ? 'الصنف غير موجود' : 'Item not found', type: 'error' })
      beepNotFound()
    }
  }, [searchQ, items, addToCart, lang, t.msg?.addedSuccess])

  const handleBarcodeScan = useCallback(
    (barcode: string) => {
      const qLower = barcode.trim().toLowerCase()
      if (!qLower) return
      const found = items.find((i) => {
        const code = String(i.code ?? '').toLowerCase()
        const bar = String(i.barcode ?? '').toLowerCase()
        return code === qLower || bar === qLower
      })
      if (found) {
        if (posEffectiveStock(found) <= 0) {
          setToast({ message: lang === 'ar' ? 'هذا الصنف غير متوفر في المخزن' : 'This item is out of stock', type: 'error' })
          beepNotFound()
          return
        }
        addToCart(found, 1)
        setToast({ message: t.msg?.addedSuccess ?? 'تمت الإضافة', type: 'success' })
        return
      }
      setToast({ message: lang === 'ar' ? 'الصنف غير موجود' : 'Item not found', type: 'error' })
      beepNotFound()
    },
    [items, addToCart, lang, t.msg?.addedSuccess],
  )

  useBarcodeScanner(handleBarcodeScan)

  const subtotal = cart.reduce((s, l) => s + l.amount, 0)
  const taxRate = Number((posSettings as Record<string, unknown>)?.default_vat_rate ?? 15) / 100
  const posTotals = processInvoiceTotals(subtotal, invoiceDiscount, invoiceDiscountType, taxRate)
  const discountAmount = Number(posTotals.discount)
  const taxTotal = Number(posTotals.tax)
  const total = Number(posTotals.total)
  /** إجمالي مستحق الدفع في نافذة الدفع بعد خصم نقاط الولاء */
  const posPayDueTotal = Math.max(0, parseFloat((total - loyaltyRedeemDiscount).toFixed(3)))

  const payModalTotalPaid = useMemo(
    () => posPayLines.reduce((s, l) => s + (Number(l.amount) || 0), 0),
    [posPayLines],
  )

  const addPosPaymentLine = useCallback(() => {
    setPosPayLines((prev) => {
      const totalPaidInner = prev.reduce((s, l) => s + (Number(l.amount) || 0), 0)
      const due = Math.max(0, parseFloat((total - loyaltyRedeemDiscount).toFixed(3)))
      const remaining = Math.max(0, due - totalPaidInner)
      const activeMethods = paymentMethods.filter((m) => m.is_active)
      const nonCash = activeMethods.find((m) => m.type !== 'cash')
      const defaultMethod = nonCash ?? activeMethods[1] ?? activeMethods[0]
      return [
        ...prev,
        {
          id: posPaymentLineId(),
          methodId: defaultMethod?.id ?? null,
          amount: parseFloat(remaining.toFixed(3)),
        },
      ]
    })
  }, [paymentMethods, total, loyaltyRedeemDiscount])

  const removePosPaymentLine = useCallback((id: string) => {
    setPosPayLines((prev) => {
      if (prev.length <= 1) return prev
      const removed = prev.find((l) => l.id === id)
      const next = prev.filter((l) => l.id !== id)
      if (removed && next.length > 0) {
        next[0] = {
          ...next[0],
          amount: parseFloat(((Number(next[0].amount) || 0) + (Number(removed.amount) || 0)).toFixed(3)),
        }
      }
      return next
    })
  }, [])

  const updatePosPayLineMethod = useCallback((id: string, methodId: number) => {
    setPosPayLines((prev) => prev.map((l) => (l.id === id ? { ...l, methodId } : l)))
  }, [])

  const updatePosPayLineAmount = useCallback((id: string, amount: number) => {
    setPosPayLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, amount: parseFloat((Number(amount) || 0).toFixed(3)) } : l)),
    )
  }, [])

  const applyQuickCashPosFirstLine = useCallback((amount: number) => {
    setPosPayLines((prev) => {
      if (!prev.length) return prev
      const next = [...prev]
      next[0] = { ...next[0], amount: parseFloat(Number(amount).toFixed(3)) }
      return next
    })
  }, [])

  const resetPosPayLinesToSingle = useCallback(() => {
    const activeMethods = paymentMethods.filter((m) => m.is_active)
    const cashId = activeMethods.find((m) => m.type === 'cash')?.id ?? activeMethods[0]?.id ?? null
    const due = Math.max(0, parseFloat((total - loyaltyRedeemDiscount).toFixed(3)))
    setPosPayLines([{ id: posPaymentLineId(), methodId: cashId, amount: due }])
  }, [paymentMethods, total, loyaltyRedeemDiscount])

  useEffect(() => {
    const id = setTimeout(() => searchInputRef.current?.focus(), 100)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!showCloseShift || !branchId || !tenantId) return
    setCloseShiftSummary(null)
    setCloseShiftSummaryLoadError(false)
    fetchPosXReport(tenantId, branchId)
      .then((r) => {
        if (r.report) setCloseShiftSummary(r.report)
        else setCloseShiftSummaryLoadError(true)
      })
      .catch(() => setCloseShiftSummaryLoadError(true))
  }, [showCloseShift, branchId, tenantId])

  useEffect(() => {
    if (!showPayModal) return
    if (openPayAsCreditRef.current) {
      openPayAsCreditRef.current = false
      setPosPayLines([{ id: posPaymentLineId(), methodId: null, amount: 0 }])
      return
    }
    setPosPayLines([{ id: posPaymentLineId(), methodId: null, amount: parseFloat(total.toFixed(3)) }])
  }, [showPayModal, total])

  /** عند تغيّر خصم الولاء وصف دفع واحد: تحديث المبلغ دون مسح طريقة الدفع */
  useEffect(() => {
    if (!showPayModal) return
    if (openPayAsCreditRef.current) return
    setPosPayLines((prev) => {
      if (prev.length !== 1) return prev
      const due = Math.max(0, parseFloat((total - loyaltyRedeemDiscount).toFixed(3)))
      return [{ ...prev[0], amount: due }]
    })
  }, [loyaltyRedeemDiscount, total, showPayModal])

  useEffect(() => {
    if (!showPayModal || paymentMethods.length === 0) return
    setPosPayLines((prev) => {
      if (!prev.length) return prev
      const active = paymentMethods.filter((m) => m.is_active)
      const pick = active.find((m) => m.type === 'cash') ?? active[0]
      if (!pick) return prev
      if (!prev.some((l) => l.methodId == null)) return prev
      return prev.map((l) => (l.methodId == null ? { ...l, methodId: pick.id } : l))
    })
  }, [showPayModal, paymentMethods])

  const handlePay = () => {
    if (!branchId || cart.length === 0) return

    // وضع المرتجع من فاتورة موجودة
    if (mode === 'return') {
      if (!returnInvoice) {
        setToast({ message: lang === 'ar' ? 'يرجى تحميل الفاتورة الأصلية أولاً.' : 'Please load the original invoice first.', type: 'error' })
        return
      }
      const linesForApi: { invoice_line_id: number; quantity: number }[] = []
      for (const line of cart) {
        // نعتمد على خاصية اختيارية source_invoice_line_id في السطر
        const anyLine = line as PosCartLine & { source_invoice_line_id?: number }
        const qty = Number(line.quantity) || 0
        if (qty <= 0) continue
        if (!anyLine.source_invoice_line_id) {
          continue
        }
        linesForApi.push({ invoice_line_id: anyLine.source_invoice_line_id, quantity: qty })
      }
      if (!linesForApi.length) {
        setToast({ message: lang === 'ar' ? 'لم يتم تحديد أي كميات مرتجعة.' : 'No return quantities selected.', type: 'error' })
        return
      }

      posReturnMut.mutate({
        mode: 'by_invoice',
        invoice_id: returnInvoice.id,
        branch_id: branchId,
        warehouse_id: warehouseId ?? returnInvoice.warehouse_id ?? null,
        shift_id: currentShift?.id ?? null,
        lines: linesForApi,
      })
      return
    }

    // وضع البيع العادي
    const deferToDriverCustody = posFulfillment === 'delivery' && posDriverId != null && posDriverId > 0
    const totalPaid = payModalTotalPaid
    const isCredit = totalPaid <= 0 || deferToDriverCustody
    if (deferToDriverCustody && !selectedCustomer?.id) {
      setToast({
        message:
          lang === 'ar'
            ? 'يجب اختيار عميل عند التوصيل مع تعيين سائق.'
            : 'Select a customer when delivery includes a driver.',
        type: 'error',
      })
      return
    }
    if (totalPaid <= 0 && !deferToDriverCustody && !selectedCustomer?.id) {
      setToast({ message: lang === 'ar' ? 'يرجى اختيار عميل أولاً عند البيع الآجل.' : 'Please select a customer first for credit sales.', type: 'error' })
      return
    }
    if (!isCredit && totalPaid > 0) {
      if (posPayLines.some((l) => l.methodId == null)) {
        setToast({ message: lang === 'ar' ? 'يرجى اختيار طريقة دفع لكل صف.' : 'Select a payment method for each line.', type: 'error' })
        return
      }
      if (posPayLines.some((l) => (Number(l.amount) || 0) < 0.001)) {
        setToast({
          message:
            lang === 'ar' ? 'كل طريقة دفع يجب أن يكون لها مبلغ أكبر من صفر.' : 'Each payment line needs a positive amount.',
          type: 'error',
        })
        return
      }
      if (totalPaid + 0.005 < posPayDueTotal) {
        setToast({
          message:
            lang === 'ar'
              ? `المبلغ المدفوع (${totalPaid.toFixed(3)}) أقل من الإجمالي المستحق (${posPayDueTotal.toFixed(3)}).`
              : `Amount paid (${totalPaid.toFixed(3)}) is below total due (${posPayDueTotal.toFixed(3)}).`,
          type: 'error',
        })
        return
      }
    }
    const lines = cart.map((l) => {
      const base = {
        item_id: l.item_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_percent: l.discount_percent,
        tax_percent: l.tax_percent,
      }
      const note = (l.line_note ?? '').trim()
      if (note) {
        const title = (l.item_name ?? '').trim()
        return { ...base, description: title ? `${title} — ${note}` : note }
      }
      return base
    })
    const defaultCustomerId = useDefaultCustomer && (posSettings as Record<string, unknown>)?.pos_default_customer_id != null
      ? Number((posSettings as Record<string, unknown>).pos_default_customer_id)
      : undefined
    const customerIdToSend = payModalCustomerIdRef.current ?? selectedCustomer?.id ?? defaultCustomerId ?? undefined
    const paymentLinesPayload =
      !isCredit && totalPaid > 0
        ? posPayLines.map((l) => ({
            payment_method_id: l.methodId!,
            amount: Number((Number(l.amount) || 0).toFixed(3)),
          }))
        : undefined

    const loyaltyDiscount =
      loyaltyProgram?.is_active && loyaltyProgram?.apply_on_pos && customerIdToSend != null
        ? loyaltyRedeemDiscount
        : 0

    saleMut.mutate({
      branch_id: branchId,
      warehouse_id: warehouseId ?? undefined,
      shift_id: currentShift?.id,
      customer_id: customerIdToSend,
      discount_amount: Number((discountAmount + loyaltyDiscount).toFixed(3)),
      ...(loyaltyProgram?.is_active &&
      loyaltyProgram?.apply_on_pos &&
      customerIdToSend != null &&
      loyaltyProgramId != null
        ? { loyalty_program_id: loyaltyProgramId }
        : {}),
      ...(loyaltyDiscount > 0.0005
        ? { redeem_points: loyaltyRedeemPoints, loyalty_discount: Number(loyaltyDiscount.toFixed(3)) }
        : {}),
      payment_method_id: !isCredit && totalPaid > 0 ? posPayLines[0]?.methodId ?? undefined : undefined,
      payment_amount: isCredit ? 0 : totalPaid,
      ...(paymentLinesPayload && paymentLinesPayload.length > 0 ? { payment_lines: paymentLinesPayload } : {}),
      ...(posFulfillment === 'delivery'
        ? {
            order_type: 'delivery' as const,
            ...(posDriverId ? { delivery_driver_id: posDriverId } : {}),
          }
        : {}),
      lines,
    })
  }

  const handlePayRef = useRef(handlePay)
  handlePayRef.current = handlePay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2' || (e.ctrlKey && e.key === 'f')) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      if (e.key === 'F8') {
        e.preventDefault()
        if (showPayModal) handlePayRef.current()
        else if (cart.length > 0) {
          const defaultId = useDefaultCustomer && (posSettings as Record<string, unknown>)?.pos_default_customer_id != null
            ? Number((posSettings as Record<string, unknown>).pos_default_customer_id)
            : null
          payModalCustomerIdRef.current = selectedCustomerRef.current?.id ?? defaultId ?? null
          setPosFulfillment('')
          setPosDriverId(null)
          setLoyaltyRedeemPoints(0)
          setLoyaltyRedeemDiscount(0)
          setLoyaltyProgramId(null)
          setShowPayModal(true)
        }
      }
      if ((e.key === 'F3' || e.key === 'F7') && !showPayModal && cart.length > 0 && !(e.target as HTMLElement).closest('input, select, textarea')) {
        e.preventDefault()
        holdMut.mutate()
      }
      if (e.key === 'F4' && !showPayModal && cart.length > 0 && !(e.target as HTMLElement).closest('input, select, textarea')) {
        e.preventDefault()
        setCart([])
        setInvoiceDiscount(0)
        setInvoiceDiscountType('amount')
        setEditingNoteFor(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showPayModal, cart.length])

  async function handleConfirmManualItem() {
    const name = manualItem.name.trim()
    if (!name || manualItem.price <= 0) {
      setToast({ message: lang === 'ar' ? 'أدخل اسماً وسعراً صالحين' : 'Enter name and price', type: 'info' })
      return
    }
    const catRaw = (posSettings as Record<string, unknown> | undefined)?.pos_default_category_id
    if (catRaw == null || catRaw === '') {
      setToast({
        message:
          lang === 'ar'
            ? 'حدّد فئة افتراضية للـ POS من الإعدادات لاستخدام الصنف اليدوي.'
            : 'Set a default POS item category in settings to use manual items.',
        type: 'error',
      })
      return
    }
    const catId = Number(catRaw)
    if (Number.isNaN(catId) || catId <= 0) {
      setToast({ message: lang === 'ar' ? 'فئة افتراضية غير صالحة' : 'Invalid default category', type: 'error' })
      return
    }
    setManualItemSaving(true)
    try {
      const code = await fetchNextItemCode(tenantId, catId)
      const created = await createItem(
        tenantId,
        {
          code,
          name,
          selling_price: manualItem.price,
          type: 'service',
          track_quantity: false,
          category_id: catId,
        } as Partial<Item>,
        null,
      )
      const posItem: PosItem = {
        id: created.id,
        code: String(created.code ?? code),
        name: created.name,
        name_en: created.name_en ?? null,
        selling_price: Number(created.selling_price ?? manualItem.price),
        unit: created.unit ?? '',
        track_quantity: false,
      }
      addToCart(posItem, Math.max(1, Math.floor(manualItem.qty) || 1))
      setManualItem({ name: '', price: 0, qty: 1 })
      setShowManualItem(false)
      queryClient.invalidateQueries({ queryKey: ['pos-items', tenantId] })
      setToast({ message: lang === 'ar' ? 'تمت إضافة الصنف اليدوي للسلة' : 'Manual item added to cart', type: 'success' })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setToast({
        message: e?.response?.data?.message ?? (lang === 'ar' ? 'تعذر إنشاء الصنف' : 'Could not create item'),
        type: 'error',
      })
    } finally {
      setManualItemSaving(false)
    }
  }

  if (!tenantId) {
    return (
      <div className="p-6">
        <p className="text-amber-600">{t.accountDefaults?.ensureClientSelected ?? 'يرجى اختيار الشركة أولاً'}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* شريط علوي: الفرع، المخزن، الوردية، سلات معلقة، وضع المرتجع */}
      <div className="flex flex-wrap items-center gap-2 p-2 bg-primary-600 text-white flex-shrink-0">
        <div
          title={isRestrictedToBranchWarehouse && !canChangeBranchWarehouse ? (lang === 'ar' ? 'الفرع مرتبط بحسابك ولا يمكن تغييره' : 'Branch is tied to your account') : undefined}
        >
          <PosBarPicker
            label={t.journal?.branch ?? 'الفرع'}
            items={posBarBranchItems}
            value={branchId}
            onChange={(id) => {
              setBranchId(id)
              setCart([])
            }}
            disabled={isRestrictedToBranchWarehouse && !canChangeBranchWarehouse}
            allowClear={false}
            isRtl={isRtl}
          />
        </div>
        <div
          title={isRestrictedToBranchWarehouse && !canChangeBranchWarehouse ? (lang === 'ar' ? 'المخزن مرتبط بحسابك ولا يمكن تغييره' : 'Warehouse is tied to your account') : undefined}
        >
          <PosBarPicker
            label={t.invoices?.warehouse ?? 'المخزن'}
            items={posBarWarehouseItems}
            value={warehouseId}
            onChange={(id) => setWarehouseId(id)}
            disabled={isRestrictedToBranchWarehouse && !canChangeBranchWarehouse}
            allowClear={false}
            isRtl={isRtl}
          />
        </div>
        {branchId && (
          <div className="flex items-center gap-2">
            {currentShift ? (
              <>
                <span className="text-xs text-emerald-200 whitespace-nowrap">وردية مفتوحة</span>
                <button
                  type="button"
                  onClick={() => { setExpenseForm({ expense_item_id: '', payment_method_id: '', amount: '', notes: '' }); setShowExpenseModal(true); }}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-amber-400 bg-amber-300/90 text-[11px] font-medium text-amber-900 hover:bg-amber-400 hover:text-white transition-colors"
                >
                  <Receipt size={14} />
                  {lang === 'ar' ? 'تسجيل مصروف' : 'Expense'}
                </button>
                <button
                  type="button"
                  onClick={async () => { const res = await fetchPosXReport(tenantId, branchId); setXReportData(res.report ?? null); setShowXReport(true); }}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-white/40 bg-white/15 text-[11px] font-medium text-white hover:bg-white/25 transition-colors"
                >
                  <FileText size={14} />
                  {lang === 'ar' ? 'تقرير X' : 'X Report'}
                </button>
                <button
                  type="button"
                  onClick={() => { setClosingCash(''); setShowCloseShift(true) }}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-red-500 bg-red-500/85 text-[11px] font-medium text-white hover:bg-red-500 transition-colors"
                >
                  <Lock size={14} />
                  {lang === 'ar' ? 'إغلاق الوردية' : 'Close shift'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowOpenShift(true)}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-amber-400 bg-amber-300 text-[11px] font-medium text-amber-900 hover:bg-amber-400 hover:text-white transition-colors"
              >
                <Play size={14} />
                {lang === 'ar' ? 'فتح وردية' : 'Open shift'}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setShowHeldList(true); refetchHeld() }}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-white/40 bg-white/15 text-[11px] font-medium text-white hover:bg-white/25 transition-colors"
            >
              <Pause size={14} />
              {lang === 'ar' ? 'سلات معلقة' : 'Held carts'}
            </button>
          </div>
        )}

        {/* زر المرتجع الوحيد في الشريط العلوي (الوضع الافتراضي بيع؛ عند الضغط يظهر نافذة المرتجع في القسم الأيسر) */}
        <div className="ml-auto flex items-center">
          <button
            type="button"
            onClick={() => {
              if (mode === 'return') {
                // الرجوع لوضع البيع
                setMode('sale')
                setReturnInvoice(null)
                setReturnInvoiceIdInput('')
                setCart([])
                setInvoiceDiscount(0)
              } else {
                // الدخول في وضع المرتجع
                setMode('return')
                setCart([])
                setInvoiceDiscount(0)
              }
            }}
            className="inline-flex items-center gap-1 h-8 px-4 rounded-md border border-amber-400 bg-amber-300 text-[11px] font-semibold text-amber-900 hover:bg-amber-400 hover:text-white transition-colors"
          >
            <RotateCcw size={14} />
            مرتجع
          </button>
        </div>
      </div>

        {/* تقسيم ثنائي: يسار (عميل + بحث + سلة + ملخص + أزرار) | يمين (فئات + منتجات) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* العمود الأيسر — العميل، البحث، السلة، الملخص، أزرار الدفع */}
        <div className={`flex flex-col w-[45%] min-w-[360px] max-w-[600px] bg-white border-slate-200 shrink-0 ${isRtl ? 'border-r' : 'border-l'} border-t-0`} style={isRtl ? { order: 2 } : { order: 1 }}>
          <div className="p-3 border-b border-slate-200 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{lang === 'ar' ? 'العميل' : 'Customer'}</label>
              <div className="flex gap-1.5" ref={customerDropdownRef}>
                <div className="flex-1 min-w-0 relative">
                  <input
                    type="text"
                    value={customerDropdownOpen ? customerSearchQuery : (selectedCustomer ? `${selectedCustomer.name}${selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ''}` : '')}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value)
                      setCustomerDropdownOpen(true)
                    }}
                    onFocus={() => {
                      setCustomerDropdownOpen(true)
                      if (selectedCustomer && !customerSearchQuery.trim()) setCustomerSearchQuery(selectedCustomer.name)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setCustomerDropdownOpen(false)
                    }}
                    placeholder={lang === 'ar' ? 'بحث بالاسم أو رقم التليفون...' : 'Search by name or phone...'}
                    className={`w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm ${selectedCustomer && !customerDropdownOpen ? (isRtl ? 'pl-8' : 'pr-8') : ''}`}
                  />
                  {selectedCustomer && !customerDropdownOpen && (
                    <button type="button" onClick={() => { setSelectedCustomer(null); setCustomerSearchQuery(''); setCustomerDropdownOpen(true) }} className={`absolute top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 ${isRtl ? 'left-1.5' : 'right-1.5'}`} title={lang === 'ar' ? 'مسح' : 'Clear'}><X size={14} /></button>
                  )}
                  {customerDropdownOpen && (
                    <div className={`absolute z-20 w-full mt-0.5 rounded-lg border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto ${isRtl ? 'right-0' : 'left-0'}`}>
                      {filteredCustomersForPos.length === 0 ? (
                        <p className="px-3 py-2 text-slate-500 text-sm">{lang === 'ar' ? 'لا نتائج' : 'No results'}</p>
                      ) : (
                        <ul className="py-1">
                          {filteredCustomersForPos.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone ?? null })
                                  setCustomerSearchQuery('')
                                  setCustomerDropdownOpen(false)
                                }}
                                className={`w-full px-3 py-2 text-sm text-left hover:bg-primary-50 ${isRtl ? 'text-right' : 'text-left'} ${selectedCustomer?.id === c.id ? 'bg-primary-50 font-medium' : ''}`}
                              >
                                {c.name}{c.phone ? ` · ${c.phone}` : ''}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => setShowAddCustomerModal(true)} className="shrink-0 p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-primary-600" title={lang === 'ar' ? 'إضافة عميل' : 'Add customer'}><UserPlus size={18} /></button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{lang === 'ar' ? 'البحث عن المنتجات عبر الاسم / رقم الباركود' : 'Search by name / barcode'}</label>
              <div className="flex gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <Search size={16} className={`absolute top-1/2 -translate-y-1/2 text-slate-400 ${isRtl ? 'right-2.5' : 'left-2.5'}`} aria-hidden />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItemByCodeOrBarcode())}
                    placeholder={lang === 'ar' ? 'اسم الصنف أو الباركود...' : 'Name or barcode...'}
                    className={`w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm ${isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
                  />
                </div>
                <button type="button" onClick={() => setShowAddItemModal(true)} className="shrink-0 p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-primary-600" title={lang === 'ar' ? 'إضافة صنف' : 'Add item'}>
                  <Plus size={18} />
                </button>
              </div>
            </div>
            {mode === 'return' && (
              <div className="pt-1 border-t border-dashed border-slate-200">
                <label className="block text-xs font-medium text-amber-700 mb-1">{lang === 'ar' ? 'رقم الفاتورة الأصلية (ID)' : 'Original invoice ID'}</label>
                <div className="flex gap-1.5 items-center">
                  <input
                    type="number"
                    value={returnInvoiceIdInput}
                    onChange={(e) => setReturnInvoiceIdInput(e.target.value)}
                    className="w-32 border border-amber-300 rounded-lg px-2 py-1.5 text-sm text-slate-800"
                    placeholder="123"
                  />
                  <button
                    type="button"
                    disabled={!returnInvoiceIdInput || !branchId || loadingReturnInvoice}
                    onClick={async () => {
                      if (!tenantId || !returnInvoiceIdInput) return
                      try {
                        setLoadingReturnInvoice(true)
                        const inv = await fetchInvoice(tenantId, Number(returnInvoiceIdInput))
                        const invDoc = invoiceDocumentStatus(inv)
                        if (inv.type !== 'sales' || inv.is_return || invDoc === 'draft' || invDoc === 'cancelled') {
                          setToast({ message: lang === 'ar' ? 'لا يمكن إنشاء مرتجع من هذه الفاتورة.' : 'Cannot create a return from this invoice.', type: 'error' })
                          setReturnInvoice(null)
                          setCart([])
                        } else {
                          setReturnInvoice(inv)
                          // بناء سلة مرتجع أولية بكامل الكميات؛ يمكن للمستخدم تقليل الكميات أو حذف الأسطر.
                          const newCart: PosCartLine[] = (inv.lines || []).map((line) => ({
                            item_id: line.item_id!,
                            item_name: lang === 'ar' ? (line.item?.name ?? '') : (line.item?.name_en || line.item?.name || ''),
                            code: line.item?.code ?? '',
                            quantity: Number(line.quantity) || 0,
                            unit_price: Number(line.unit_price) || 0,
                            discount_percent: Number(line.discount_percent) || 0,
                            tax_percent: Number(line.tax_percent) || 0,
                            amount: Number(line.quantity) * Number(line.unit_price),
                            tax_amount: 0,
                            total: Number(line.quantity) * Number(line.unit_price),
                            // هوية سطر الفاتورة الأصلية لاستخدامها في الـ API
                            source_invoice_line_id: line.id,
                          }))
                          setCart(newCart)
                          setInvoiceDiscount(0)
                          setToast({ message: lang === 'ar' ? 'تم تحميل الفاتورة. عدّل الكميات المراد إرجاعها ثم اضغط دفع لإتمام المرتجع.' : 'Invoice loaded. Adjust quantities to return, then press Pay to complete the return.', type: 'info' })
                        }
                      } catch (e) {
                        setToast({ message: lang === 'ar' ? 'تعذر جلب الفاتورة.' : 'Failed to fetch invoice.', type: 'error' })
                        setReturnInvoice(null)
                        setCart([])
                      } finally {
                        setLoadingReturnInvoice(false)
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingReturnInvoice ? (lang === 'ar' ? 'جاري البحث...' : 'Loading...') : (lang === 'ar' ? 'جلب الفاتورة' : 'Load invoice')}
                  </button>
                </div>
                {returnInvoice && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    {lang === 'ar'
                      ? `فاتورة #${returnInvoice.number} — العميل: ${returnInvoice.customer?.name ?? '—'}`
                      : `Invoice #${returnInvoice.number} — Customer: ${returnInvoice.customer?.name_en || returnInvoice.customer?.name || '—'}`}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* جدول السلة — رؤوس: الصنف، السعر، الكمية، الخصم (مبلغ)، المجموع */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col border-b border-slate-200">
            <div className="grid grid-cols-[1fr_82px_100px_80px_auto_32px] gap-2 px-2 py-1.5 bg-slate-100 text-xs font-semibold text-slate-600 border-b border-slate-200 shrink-0">
              <span className={isRtl ? 'text-right' : 'text-left'}>{lang === 'ar' ? 'الصنف' : 'Item'}</span>
              <span className="text-right">{lang === 'ar' ? 'السعر' : 'Price'}</span>
              <span className="text-center">
                {mode === 'return' ? (lang === 'ar' ? 'كمية مرتجع' : 'Return qty') : (lang === 'ar' ? 'الكمية' : 'Qty')}
              </span>
              <span className="text-right">{lang === 'ar' ? 'الخصم' : 'Discount'}</span>
              <span className="text-right">
                {mode === 'return' ? (lang === 'ar' ? 'مبلغ المرتجع' : 'Return amount') : (lang === 'ar' ? 'المجموع' : 'Total')}
              </span>
              <span />
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-1 scrollbar-hide">
              {cart.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">{lang === 'ar' ? 'السلة فارغة' : 'Cart is empty'}</p>
              ) : (
                <div className="space-y-0.5">
                  {cart.map((line) => (
                    <div key={line.item_id} className="grid grid-cols-[1fr_82px_100px_80px_auto_32px] gap-2 items-center py-2 px-2 rounded border border-slate-100 bg-slate-50/50 hover:bg-slate-50 text-sm">
                      <div
                        className="min-w-0 space-y-1"
                        onDoubleClick={() => {
                          if (mode === 'return') return
                          setEditingNoteFor(line.item_id)
                        }}
                      >
                        <input
                          type="text"
                          value={line.item_name}
                          onChange={(e) => setCart((prev) => prev.map((l) => (l.item_id === line.item_id ? { ...l, item_name: e.target.value } : l)))}
                          className={`min-w-0 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-base font-medium text-slate-800 focus:border-primary-500 focus:ring-1 focus:ring-inset focus:ring-primary-500 ${isRtl ? 'text-right' : 'text-left'}`}
                          dir={isRtl ? 'rtl' : 'ltr'}
                        />
                        {(line.line_note ?? '').trim() ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 inline-block max-w-full truncate" title={line.line_note ?? ''}>
                            {line.line_note}
                          </span>
                        ) : null}
                        {editingNoteFor === line.item_id && mode !== 'return' ? (
                          <input
                            autoFocus
                            type="text"
                            placeholder={lang === 'ar' ? 'أضف ملاحظة للصنف...' : 'Line note...'}
                            defaultValue={line.line_note ?? ''}
                            className="mt-0.5 w-full text-xs border border-amber-300 rounded px-1.5 py-0.5 bg-amber-50"
                            dir={isRtl ? 'rtl' : 'ltr'}
                            onBlur={(e) => {
                              const v = e.target.value.trim()
                              setCart((prev) => prev.map((l) => (l.item_id === line.item_id ? { ...l, line_note: v || null } : l)))
                              setEditingNoteFor(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Escape') {
                                const v = (e.target as HTMLInputElement).value.trim()
                                setCart((prev) => prev.map((l) => (l.item_id === line.item_id ? { ...l, line_note: v || null } : l)))
                                setEditingNoteFor(null)
                              }
                            }}
                          />
                        ) : null}
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={Number(line.unit_price).toFixed(amountDecimals)}
                        onChange={(e) => {
                          if (!can('pos.edit_price')) return
                          const v = e.target.value.replace(/,/g, '.')
                          const num = parseFloat(v)
                          updateCartLine(line.item_id, { unit_price: Number.isFinite(num) ? num : 0 })
                        }}
                        readOnly={!can('pos.edit_price')}
                        title={!can('pos.edit_price') ? (lang === 'ar' ? 'لا يمكنك تعديل السعر' : 'You cannot edit price') : undefined}
                        className={`w-full min-w-0 rounded border border-slate-200 px-1.5 py-1.5 text-sm text-slate-700 text-right tabular-nums ${can('pos.edit_price') ? 'bg-white focus:border-primary-500 focus:ring-1 focus:ring-inset focus:ring-primary-500' : 'bg-slate-100 cursor-not-allowed'}`}
                        dir="ltr"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateCartQty(line.item_id, -1)}
                          className="inline-flex items-center justify-center w-11 h-11 sm:w-10 sm:h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 active:bg-slate-200 transition-colors shrink-0 touch-manipulation"
                        >
                          <Minus size={16} className="text-slate-600" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={line.quantity}
                          onChange={(e) => updateCartLine(line.item_id, { quantity: parseInt(e.target.value, 10) || 0 })}
                          className="w-full min-w-[2.5rem] rounded border border-slate-200 bg-white px-2 py-1.5 text-base text-center font-semibold text-slate-800 tabular-nums focus:border-primary-500 focus:ring-1 focus:ring-inset focus:ring-primary-500"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => updateCartQty(line.item_id, 1)}
                          className="inline-flex items-center justify-center w-11 h-11 sm:w-10 sm:h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 active:bg-slate-200 transition-colors shrink-0 touch-manipulation"
                        >
                          <Plus size={16} className="text-slate-600" />
                        </button>
                      </div>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.discount_percent}
                        onChange={(e) => updateCartLine(line.item_id, { discount_percent: parseFloat(e.target.value) || 0 })}
                        className="w-full min-w-0 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 text-right tabular-nums focus:border-primary-500 focus:ring-1 focus:ring-inset focus:ring-primary-500"
                        dir="ltr"
                      />
                      <span className={`font-semibold text-right tabular-nums text-base ${mode === 'return' ? 'text-red-600' : 'text-primary-600'}`} dir="ltr">
                        {mode === 'return' ? `- ${fmt(line.total)}` : fmt(line.total)}
                      </span>
                      <button type="button" onClick={() => removeFromCart(line.item_id)} className="p-1.5 rounded hover:bg-red-100 text-red-600 shrink-0" title={lang === 'ar' ? 'حذف' : 'Remove'}><X size={18} /></button>
                    </div>
                  ))}
                </div>
              )}
              {cart.length > 0 ? (
                <p className="text-[10px] text-slate-400 text-center py-1" dir="rtl">
                  {lang === 'ar' ? 'انقر مزدوجاً على الصنف لإضافة ملاحظة' : 'Double-click the item name to add a note'}
                </p>
              ) : null}
            </div>
          </div>

          {/* ملخص الفاتورة — الضريبة 15% على الوعاء (المجموع − الخصم) فقط */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-1.5 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-600">
                {mode === 'return' ? (lang === 'ar' ? 'إجمالي قيمة المرتجع' : 'Return subtotal') : (lang === 'ar' ? 'المجموع' : 'Subtotal')}
              </span>
              <span className={`font-semibold tabular-nums ${mode === 'return' ? 'text-red-600' : ''}`} dir="ltr">
                {mode === 'return' ? `- ${fmt(subtotal)}` : fmt(subtotal)}
              </span>
            </div>
            <div className="flex justify-between items-center gap-2 py-1.5" dir="rtl">
              <span className="text-xs text-slate-600">{lang === 'ar' ? 'الخصم' : 'Discount'}</span>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                <input
                  type="number"
                  min={0}
                  max={invoiceDiscountType === 'percentage' ? 100 : undefined}
                  step="0.01"
                  value={invoiceDiscount || ''}
                  onChange={(e) => setInvoiceDiscount(Number(e.target.value) || 0)}
                  className="w-16 text-xs text-center border border-slate-200 rounded-lg px-2 py-1 tabular-nums bg-white"
                  disabled={mode === 'return'}
                  title={invoiceDiscountType === 'percentage' ? '%' : lang === 'ar' ? 'مبلغ' : 'Amount'}
                />
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceDiscountType((prev) => (prev === 'percentage' ? 'amount' : 'percentage'))
                    setInvoiceDiscount(0)
                  }}
                  className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 min-w-[2.25rem]"
                  disabled={mode === 'return'}
                >
                  {invoiceDiscountType === 'percentage' ? '%' : lang === 'ar' ? 'مبلغ' : 'Amt'}
                </button>
                {discountAmount > 0 ? (
                  <span className="text-xs text-red-600 tabular-nums" dir="ltr">
                    −{fmt(discountAmount)}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">{lang === 'ar' ? 'الضريبة (15%)' : 'VAT (15%)'}</span>
              <span className={`font-semibold tabular-nums ${mode === 'return' ? 'text-red-600' : ''}`} dir="ltr">
                {mode === 'return' ? `- ${fmt(taxTotal)}` : fmt(taxTotal)}
              </span>
            </div>
            {/* TODO: عند توفر loyalty_points في نموذج العميل والـ API، اعرض نقاط المكافآت هنا للعميل المحدد (غير عميل الكاش الافتراضي). */}
            <div className="pt-2 mt-2 border-t-2 border-slate-200 flex justify-between items-baseline">
              <span className="font-bold text-slate-800">
                {mode === 'return' ? (lang === 'ar' ? 'إجمالي المرتجع' : 'Total return') : (lang === 'ar' ? 'إجمالي المستحق' : 'Total Due')}
              </span>
              <span className={`text-xl font-extrabold tabular-nums ${mode === 'return' ? 'text-red-600' : 'text-primary-600'}`} dir="ltr">
                {mode === 'return' ? `- ${fmt(total)}` : fmt(total)}
              </span>
            </div>
          </div>

          {/* أزرار الإجراء: وقف التنفيذ، إلغاء، دفع */}
          <div className="p-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => cart.length > 0 && holdMut.mutate()}
              disabled={cart.length === 0 || !branchId || holdMut.isPending || mode === 'return'}
              className="flex-1 min-w-[100px] py-2.5 rounded-lg font-semibold text-sm bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              title="F3/F7"
            >
              {lang === 'ar' ? 'وقف التنفيذ F7' : 'Hold F7'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCart([])
                setInvoiceDiscount(0)
                setInvoiceDiscountType('amount')
                setEditingNoteFor(null)
              }}
              disabled={cart.length === 0}
              className="flex-1 min-w-[100px] py-2.5 rounded-lg font-semibold text-sm bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              title="F4"
            >
              {lang === 'ar' ? 'إلغاء F4' : 'Cancel F4'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (cart.length > 0) {
                  const defaultId = useDefaultCustomer && (posSettings as Record<string, unknown>)?.pos_default_customer_id != null
                    ? Number((posSettings as Record<string, unknown>).pos_default_customer_id)
                    : null
                  payModalCustomerIdRef.current = selectedCustomer?.id ?? defaultId ?? null
                  setPosFulfillment('')
                  setPosDriverId(null)
                  setLoyaltyRedeemPoints(0)
                  setLoyaltyRedeemDiscount(0)
                  setLoyaltyProgramId(null)
                  setShowPayModal(true)
                }
              }}
              disabled={cart.length === 0 || !branchId}
              className="flex-[2] min-w-[120px] py-3 rounded-lg font-bold text-base bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              title="F8"
            >
              {mode === 'return' ? (lang === 'ar' ? 'تنفيذ المرتجع F8' : 'Complete return F8') : (lang === 'ar' ? 'دفع F8' : 'Pay F8')}
            </button>
          </div>
        </div>

        {/* العمود الأيمن — الفئات ثم شبكة المنتجات */}
        <div className={`flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50/50 ${isRtl ? 'border-r border-slate-200' : 'border-l border-slate-200'}`} style={isRtl ? { order: 1 } : { order: 2 }}>
          {/* شريط الفئات أفقياً */}
          <div className="flex-shrink-0 p-2 border-b border-slate-200 bg-white">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSmartShelf(null)
                  setSelectedCategoryId(null)
                  setSearchQ('')
                }}
                className={`${posDisplayConfig.categoryBtn} transition-all ${smartShelf === null && selectedCategoryId === null ? 'bg-primary-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'}`}
              >
                {lang === 'ar' ? 'الكل' : 'All'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSmartShelf('popular')
                  setSelectedCategoryId(null)
                  setSearchQ('')
                }}
                className={`${posDisplayConfig.categoryBtn} transition-all ${smartShelf === 'popular' ? 'bg-primary-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'}`}
              >
                {lang === 'ar' ? '⭐ الأكثر مبيعاً' : '⭐ Top sellers'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSmartShelf('discounted')
                  setSelectedCategoryId(null)
                  setSearchQ('')
                }}
                className={`${posDisplayConfig.categoryBtn} transition-all ${smartShelf === 'discounted' ? 'bg-primary-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'}`}
              >
                {lang === 'ar' ? '🔥 العروض' : '🔥 Promos'}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSmartShelf(null)
                    setSelectedCategoryId(cat.id)
                    setSearchQ('')
                  }}
                  className={`${posDisplayConfig.categoryBtn} transition-all truncate max-w-[180px] ${smartShelf === null && selectedCategoryId === cat.id ? 'bg-primary-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'}`}
                >
                  {lang === 'ar' ? cat.name : (cat.name_en || cat.name)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-white/60">
            <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-slate-100" dir="rtl">
              <span className="text-xs text-slate-400">
                {sortedDisplayItems.length} {lang === 'ar' ? 'صنف' : 'items'}
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white max-w-[9.5rem]"
                >
                  <option value="popular">{lang === 'ar' ? 'الأكثر مبيعاً' : 'Best sellers'}</option>
                  <option value="price_asc">{lang === 'ar' ? 'السعر: الأقل' : 'Price: low'}</option>
                  <option value="price_desc">{lang === 'ar' ? 'السعر: الأعلى' : 'Price: high'}</option>
                  <option value="name">{lang === 'ar' ? 'الاسم' : 'Name'}</option>
                </select>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`w-11 h-11 lg:w-7 lg:h-7 rounded-lg border flex items-center justify-center touch-manipulation ${viewMode === 'grid' ? 'bg-primary-50 border-primary-400 text-primary-600' : 'border-slate-200 text-slate-400'}`}
                  title={lang === 'ar' ? 'عرض شبكة' : 'Grid'}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`w-11 h-11 lg:w-7 lg:h-7 rounded-lg border flex items-center justify-center touch-manipulation ${viewMode === 'list' ? 'bg-primary-50 border-primary-400 text-primary-600' : 'border-slate-200 text-slate-400'}`}
                  title={lang === 'ar' ? 'عرض قائمة' : 'List'}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 scrollbar-hide">
              {itemsLoading ? (
                <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" /></div>
              ) : sortedDisplayItems.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-12">
                  {smartShelf === 'discounted'
                    ? (lang === 'ar' ? 'لا توجد أصناف بعروض/خصومات سابقة ضمن النتائج' : 'No promo items in current results')
                    : selectedCategoryId != null || searchQ.length >= 1 || smartShelf != null
                      ? (lang === 'ar' ? 'لا توجد أصناف' : 'No items')
                      : (lang === 'ar' ? 'اختر فئة أو ابحث' : 'Select category or search')}
                </p>
              ) : viewMode === 'grid' ? (
                <div className={`grid ${posDisplayConfig.gridCols} gap-3 pb-2`}>
                  {sortedDisplayItems.map((item) => {
                    const oos = item.track_quantity !== false && posEffectiveStock(item) <= 0
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addToCart(item, 1)}
                        className={`relative ${posDisplayConfig.cardPadding} rounded-2xl border-2 border-slate-200 bg-white hover:border-primary-400 hover:bg-primary-50/50 hover:shadow-md transition-all flex flex-col items-stretch touch-manipulation select-none cursor-pointer active:scale-95 active:transition-transform ${posDisplayConfig.cardMinH} ${isRtl ? 'text-right' : 'text-left'} ${oos ? 'opacity-60 cursor-not-allowed hover:border-slate-200 hover:bg-white' : ''}`}
                      >
                        <PosStockBadge item={item} lang={lang} />
                        <div className={`w-full ${posDisplayConfig.imageH} rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center shrink-0 relative`}>
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                ;(e.target as HTMLImageElement).style.display = 'none'
                                ;(e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden')
                              }}
                            />
                          ) : null}
                          <div className={`absolute inset-0 flex items-center justify-center text-slate-300 ${item.image_url ? 'hidden' : ''}`}>
                            <Package size={posDisplayConfig.packageIcon} />
                          </div>
                        </div>
                        <div className={`${posDisplayConfig.cardTitle} text-slate-800 truncate mt-1.5`}>{lang === 'ar' ? item.name : (item.name_en || item.name)}</div>
                        <div className={`${posDisplayConfig.cardCode} text-slate-500 truncate`}>{item.code}</div>
                        <div className={`${posDisplayConfig.cardPrice} font-bold text-primary-600 mt-0.5`} dir="ltr">
                          {fmt(item.selling_price)}
                        </div>
                      </button>
                    )
                  })}
                  {mode === 'sale' ? (
                    <button
                      type="button"
                      onClick={() => setShowManualItem(true)}
                      className={`${posDisplayConfig.cardPadding} rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-primary-400 hover:bg-primary-50/40 transition-all flex flex-col items-center justify-center gap-1 ${posDisplayConfig.cardMinH} text-slate-500`}
                    >
                      <span className="text-2xl text-slate-300">+</span>
                      <span className="text-[10px]">{lang === 'ar' ? 'صنف يدوي' : 'Manual item'}</span>
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-1 pb-2">
                  {sortedDisplayItems.map((item) => {
                    const oos = item.track_quantity !== false && posEffectiveStock(item) <= 0
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addToCart(item, 1)}
                        className={`flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-100 hover:border-primary-300 transition-colors text-start ${oos ? 'opacity-60 cursor-not-allowed' : ''}`}
                        dir="rtl"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-slate-400 shrink-0">{item.code}</span>
                          <span className="text-sm font-medium text-slate-900 truncate">{lang === 'ar' ? item.name : (item.name_en || item.name)}</span>
                          {oos ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 shrink-0">{lang === 'ar' ? 'نفذ' : 'Out'}</span>
                          ) : null}
                        </div>
                        <span className="text-sm font-semibold text-primary-600 tabular-nums shrink-0" dir="ltr">
                          {fmt(item.selling_price)}
                        </span>
                      </button>
                    )
                  })}
                  {mode === 'sale' ? (
                    <button
                      type="button"
                      onClick={() => setShowManualItem(true)}
                      className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 text-slate-500 hover:border-primary-300 hover:bg-primary-50/30"
                      dir="rtl"
                    >
                      <span className="text-xl">+</span>
                      <span className="text-xs">{lang === 'ar' ? 'صنف يدوي' : 'Manual item'}</span>
                    </button>
                  ) : null}
                </div>
              )}
            </div>
            <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1.5 border-t border-slate-100 bg-white text-[11px] text-slate-500" dir="rtl">
              <span>
                🕐 {currentTime || '—'} · {lang === 'ar' ? 'الوردية:' : 'Shift:'}{' '}
                <strong className="text-slate-700">{currentShift ? (lang === 'ar' ? 'مفتوحة' : 'Open') : (lang === 'ar' ? 'لا توجد' : 'None')}</strong>
              </span>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  {lang === 'ar' ? 'مبيعات الوردية:' : 'Shift sales:'}
                  <strong className="text-primary-600 mx-1 tabular-nums" dir="ltr">
                    {Number(posBarXReport?.report?.total_sales ?? 0).toLocaleString('ar-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </strong>
                </span>
                <span>
                  {lang === 'ar' ? 'فواتير:' : 'Inv.:'}
                  <strong className="text-slate-700 mx-1 tabular-nums">{posBarXReport?.report?.invoices_count ?? 0}</strong>
                </span>
                {heldCartsBarCount > 0 ? (
                  <span>
                    {lang === 'ar' ? 'سلات معلقة:' : 'Held:'}
                    <strong className="text-amber-600 mx-1 tabular-nums">{heldCartsBarCount}</strong>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* نافذة فتح الوردية */}
      {showOpenShift && branchId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-4">فتح وردية</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">رصيد افتتاحي نقدي</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openShiftMut.mutate(parseFloat(openingCash) || 0)}
                disabled={openShiftMut.isPending}
                className="flex-1 py-2 bg-primary-600 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {openShiftMut.isPending ? t.saving : 'فتح'}
              </button>
              <button type="button" onClick={() => setShowOpenShift(false)} className="px-4 py-2 border border-slate-300 rounded-lg">
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* صنف يدوي */}
      {showManualItem && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm shadow-xl border border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">{lang === 'ar' ? 'إضافة صنف يدوي' : 'Manual line item'}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">{lang === 'ar' ? 'اسم الصنف *' : 'Name *'}</label>
                <input
                  autoFocus
                  type="text"
                  value={manualItem.name}
                  onChange={(e) => setManualItem((p) => ({ ...p, name: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                  placeholder={lang === 'ar' ? 'مثال: رسوم خدمة' : 'e.g. Service fee'}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">{lang === 'ar' ? 'السعر *' : 'Price *'}</label>
                <input
                  type="number"
                  min={0}
                  step="0.001"
                  value={manualItem.price || ''}
                  onChange={(e) => setManualItem((p) => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 tabular-nums"
                  placeholder="0.000"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">{lang === 'ar' ? 'الكمية' : 'Qty'}</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={manualItem.qty}
                  onChange={(e) => setManualItem((p) => ({ ...p, qty: parseInt(e.target.value, 10) || 1 }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                  dir="ltr"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
              {lang === 'ar'
                ? 'يُنشأ صنف خدمة مؤقت في المخزن (بفئة POS الافتراضية) ويُضاف للسلة. تأكد من ضبط الفئة الافتراضية في إعدادات نقطة البيع.'
                : 'Creates a service item using the default POS category and adds it to the cart.'}
            </p>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                disabled={manualItemSaving}
                onClick={() => void handleConfirmManualItem()}
                className="flex-1 bg-primary-600 text-white text-sm py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {manualItemSaving ? (lang === 'ar' ? 'جاري الإضافة...' : 'Saving...') : lang === 'ar' ? 'إضافة للفاتورة' : 'Add to cart'}
              </button>
              <button
                type="button"
                disabled={manualItemSaving}
                onClick={() => setShowManualItem(false)}
                className="px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة الدفع */}
      {showPayModal && (() => {
        const payModalTotalUnits = cart.reduce((s, l) => s + Number(l.quantity), 0)
        const closePayModal = () => {
          payModalCustomerIdRef.current = null
          setPosFulfillment('')
          setPosDriverId(null)
          setLoyaltyRedeemPoints(0)
          setLoyaltyRedeemDiscount(0)
          setLoyaltyProgramId(null)
          setShowPayModal(false)
        }
        const payDiff = payModalTotalPaid - posPayDueTotal
        const paidEnough = payDiff >= -0.001
        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
            <div className="bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-2xl flex max-h-[95vh] min-h-0">
              {/* النقد السريع */}
              <div className="w-[5.5rem] sm:w-24 flex-shrink-0 flex flex-col p-2 gap-1.5 bg-slate-50 border-e border-slate-200">
                <span className="text-slate-600 text-[10px] font-bold text-center py-1 leading-tight">
                  {lang === 'ar' ? 'النقد السريع' : 'Quick cash'}
                </span>
                {[1, 10, 20, 50, 100, 500, 1000, 5000].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => applyQuickCashPosFirstLine(n)}
                    className={`w-full min-h-[2.25rem] rounded-lg text-xs font-bold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 ${POS_PAY_QUICK_CASH_BTN[n] ?? 'bg-slate-100 text-slate-700 border border-slate-200'}`}
                  >
                    {n.toLocaleString(lang === 'ar' ? 'ar-KW' : 'en-US')}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => resetPosPayLinesToSingle()}
                  className="w-full min-h-[2.25rem] rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-all mt-auto"
                >
                  {lang === 'ar' ? 'مسح ✕' : 'Clear ✕'}
                </button>
              </div>
              {/* المحتوى الرئيسي */}
              <div className="flex-1 flex flex-col min-w-0 min-h-0">
                <div className="bg-gradient-to-l from-[#0d2137] to-[#1e3a5f] px-4 sm:px-5 py-3.5 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center text-sm shrink-0" aria-hidden>
                      💳
                    </div>
                    <span className="text-white font-bold text-base truncate">
                      {lang === 'ar' ? 'إتمام الدفع' : 'Complete payment'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={closePayModal}
                    className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors text-lg leading-none shrink-0"
                    aria-label={t.cancel}
                  >
                    ×
                  </button>
                </div>
                <div className="p-4 sm:p-5 flex-1 overflow-y-auto min-h-0 flex flex-col">
                  <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-l from-emerald-50 to-green-50 border border-emerald-200 rounded-xl mb-4">
                    <div className="min-w-0">
                      <p className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wide">
                        {lang === 'ar' ? 'إجمالي المستحق' : 'Total due'}
                      </p>
                      <p className="text-[10px] text-emerald-600 mt-0.5">
                        {payModalTotalUnits}{' '}
                        {lang === 'ar' ? (payModalTotalUnits === 1 ? 'وحدة' : 'وحدات') : payModalTotalUnits === 1 ? 'unit' : 'units'}
                      </p>
                    </div>
                    <div className="text-end shrink-0" dir="ltr">
                      <span className="text-2xl font-extrabold text-emerald-600 tabular-nums">{fmt(posPayDueTotal)}</span>
                      <span className="text-sm text-emerald-500 font-semibold ms-1">KWD</span>
                    </div>
                  </div>
                  {loyaltyRedeemDiscount > 0.0005 && (
                    <p className="text-[11px] text-amber-700 text-end mb-4 -mt-2" dir="rtl">
                      {lang === 'ar' ? 'خصم النقاط:' : 'Points discount:'}{' '}
                      <span className="font-semibold tabular-nums" dir="ltr">
                        - {fmt(loyaltyRedeemDiscount)} KWD
                      </span>
                      {lang === 'ar' ? (
                        <span className="text-gray-500 font-normal ms-1">
                          ({loyaltyRedeemPoints} {loyaltyRedeemPoints === 1 ? 'نقطة' : 'نقاط'})
                        </span>
                      ) : null}
                    </p>
                  )}

                  {loyaltyProgram?.is_active && loyaltyProgram?.apply_on_pos && (
                    <div className="mb-4">
                      <LoyaltyPOSSection
                        tenantId={tenantId}
                        customerId={(payModalCustomerIdRef.current ?? selectedCustomer?.id ?? null) as number | null}
                        orderTotal={total}
                        onRedeemChange={(_programId, points, discount) => {
                          setLoyaltyRedeemPoints(points)
                          setLoyaltyRedeemDiscount(discount)
                        }}
                        onProgramChange={(pid) => setLoyaltyProgramId(pid)}
                        module="pos"
                      />
                    </div>
                  )}

                  <div className="mb-3" dir="rtl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">
                        {lang === 'ar' ? 'طرق الدفع' : 'Payment methods'}
                      </span>
                      <div className="flex items-center gap-2">
                        {posPayLines.length > 1 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                            {lang === 'ar' ? 'دفع مختلط' : 'Split payment'}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={addPosPaymentLine}
                          disabled={paymentMethodsLoading || paymentMethods.length === 0}
                          className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 disabled:opacity-40"
                        >
                          + {lang === 'ar' ? 'إضافة طريقة' : 'Add method'}
                        </button>
                      </div>
                    </div>
                    {paymentMethodsLoading ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                        {lang === 'ar' ? 'جاري تحميل طرق الدفع...' : 'Loading payment methods...'}
                      </div>
                    ) : paymentMethods.length === 0 ? (
                      <div className="text-center py-4 text-xs text-red-500">
                        {lang === 'ar'
                          ? 'لا توجد طرق دفع نشطة — أضف طرق دفع من الإعدادات أولاً'
                          : 'No active payment methods. Add methods in settings.'}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {posPayLines.map((line, index) => {
                          const selectedMethod = paymentMethods.find((m) => m.id === line.methodId)
                          return (
                            <div
                              key={line.id}
                              className={`grid grid-cols-1 sm:grid-cols-[1fr_120px_32px] gap-2 items-center px-3 py-2.5 rounded-xl border-2 transition-colors ${
                                index === 0
                                  ? 'border-emerald-400 bg-emerald-50/50'
                                  : 'border-gray-200 bg-gray-50'
                              } focus-within:border-emerald-400 focus-within:bg-emerald-50/30`}
                            >
                              <div>
                                <p className="text-[9px] text-gray-400 font-semibold mb-0.5">
                                  {lang === 'ar' ? 'طريقة الدفع' : 'Method'}
                                </p>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-base flex-shrink-0" aria-hidden>
                                    {selectedMethod ? getPosPaymentMethodIcon(selectedMethod.type) : '💰'}
                                  </span>
                                  <select
                                    value={line.methodId ?? ''}
                                    onChange={(e) => updatePosPayLineMethod(line.id, parseInt(e.target.value, 10))}
                                    className="flex-1 text-sm font-medium text-gray-800 bg-transparent border-none outline-none cursor-pointer min-w-0"
                                  >
                                    <option value="" disabled>
                                      {lang === 'ar' ? 'اختر طريقة...' : 'Choose...'}
                                    </option>
                                    {paymentMethods.filter((m) => m.is_active).map((method) => (
                                      <option key={method.id} value={method.id}>
                                        {lang === 'ar' ? method.name : method.name_en || method.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div>
                                <p className="text-[9px] text-gray-400 font-semibold mb-0.5">
                                  {lang === 'ar' ? 'المبلغ (KWD)' : 'Amount (KWD)'}
                                </p>
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  value={line.amount || ''}
                                  onChange={(e) => updatePosPayLineAmount(line.id, parseFloat(e.target.value) || 0)}
                                  className="w-full text-center text-sm font-bold text-emerald-600 border border-gray-200 rounded-lg py-1.5 px-2 focus:border-emerald-400 focus:outline-none bg-white tabular-nums"
                                  placeholder="0.000"
                                  dir="ltr"
                                  autoFocus={index === 0 && posPayLines.length === 1}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => removePosPaymentLine(line.id)}
                                disabled={posPayLines.length <= 1}
                                title={
                                  posPayLines.length <= 1
                                    ? lang === 'ar'
                                      ? 'لا يمكن حذف الصف الوحيد'
                                      : 'Cannot remove the only line'
                                    : lang === 'ar'
                                      ? 'حذف هذه الطريقة'
                                      : 'Remove this line'
                                }
                                className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 mx-auto sm:mx-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide block mb-1">
                        {(t as { delivery?: { fulfillmentType?: string } }).delivery?.fulfillmentType ?? (lang === 'ar' ? 'نوع الطلب' : 'Order type')}
                      </label>
                      <select
                        value={posFulfillment}
                        onChange={(e) => {
                          const v = e.target.value === 'delivery' ? 'delivery' : ''
                          setPosFulfillment(v)
                          if (v !== 'delivery') setPosDriverId(null)
                        }}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:border-emerald-400 focus:outline-none"
                      >
                        <option value="">
                          {(t as { delivery?: { fulfillmentStandard?: string } }).delivery?.fulfillmentStandard ?? (lang === 'ar' ? 'عادي' : 'Standard')}
                        </option>
                        <option value="delivery">
                          {(t as { delivery?: { fulfillmentDelivery?: string } }).delivery?.fulfillmentDelivery ?? (lang === 'ar' ? 'توصيل' : 'Delivery')}
                        </option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide block mb-1">
                        {lang === 'ar' ? 'الكاشير' : 'Cashier'}
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={currentUser?.name ?? ''}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-100 text-gray-600 cursor-default"
                      />
                    </div>
                  </div>
                  {posFulfillment === 'delivery' && (
                    <div className="mb-4">
                      <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide block mb-1">
                        {(t as { delivery?: { driverField?: string } }).delivery?.driverField ?? (lang === 'ar' ? 'السائق' : 'Driver')}
                      </label>
                      <select
                        value={posDriverId ?? ''}
                        onChange={(e) => setPosDriverId(e.target.value ? Number(e.target.value) : null)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:border-emerald-400 focus:outline-none"
                      >
                        <option value="">—</option>
                        {posDrivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="mb-4">
                    <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide block mb-1">
                      {lang === 'ar' ? 'حالة البيع' : 'Sale status'}
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={lang === 'ar' ? 'عملية مكتملة' : 'Operation complete'}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-100 text-gray-600 cursor-default"
                    />
                  </div>
                  <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 space-y-1.5" dir="rtl">
                    <div className="flex justify-between text-xs text-gray-500 gap-2">
                      <span>{lang === 'ar' ? 'الإجمالي المستحق' : 'Total due'}</span>
                      <span className="font-medium text-gray-700 tabular-nums shrink-0" dir="ltr">
                        {fmt(posPayDueTotal)} KWD
                      </span>
                    </div>
                    {loyaltyRedeemDiscount > 0.0005 && (
                      <div className="flex justify-between text-[11px] text-amber-700 gap-2">
                        <span>
                          {lang === 'ar'
                            ? `خصم النقاط (${loyaltyRedeemPoints} ${loyaltyRedeemPoints === 1 ? 'نقطة' : 'نقاط'})`
                            : `Points discount (${loyaltyRedeemPoints} pts)`}
                        </span>
                        <span className="font-semibold tabular-nums shrink-0" dir="ltr">
                          - {fmt(loyaltyRedeemDiscount)} KWD
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs text-gray-500 gap-2">
                      <span>{lang === 'ar' ? 'إجمالي المدفوع' : 'Total paid'}</span>
                      <span className="font-medium text-gray-700 tabular-nums shrink-0" dir="ltr">
                        {fmt(payModalTotalPaid)} KWD
                      </span>
                    </div>
                    {posPayLines.length > 1 &&
                      posPayLines.map((line, idx) => {
                        const method = paymentMethods.find((m) => m.id === line.methodId)
                        return (
                          <div key={line.id} className="flex justify-between text-[10px] text-gray-400 gap-2 pe-2">
                            <span>
                              • {method?.name ?? (lang === 'ar' ? `طريقة ${idx + 1}` : `Line ${idx + 1}`)}
                            </span>
                            <span className="tabular-nums shrink-0" dir="ltr">
                              {fmt(line.amount)} KWD
                            </span>
                          </div>
                        )
                      })}
                    <div className="border-t border-gray-200 pt-1.5 flex justify-between gap-2 items-center">
                      <span className="text-sm font-bold text-gray-700">
                        {paidEnough
                          ? lang === 'ar'
                            ? 'الفكة / الباقي'
                            : 'Change'
                          : lang === 'ar'
                            ? 'مبلغ ناقص'
                            : 'Short'}
                      </span>
                      <span
                        className={`text-sm font-bold tabular-nums shrink-0 ${paidEnough ? 'text-emerald-600' : 'text-red-500'}`}
                        dir="ltr"
                      >
                        {fmt(Math.abs(payDiff))} KWD
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 px-4 sm:px-5 pb-4 sm:pb-5 pt-2 border-t border-gray-100 shrink-0">
                  <button
                    type="button"
                    onClick={closePayModal}
                    className="px-5 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all duration-150"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={handlePay}
                    disabled={saleMut.isPending}
                    className="flex-1 py-3 bg-gradient-to-l from-emerald-500 to-emerald-600 text-white rounded-xl text-sm font-bold shadow-[0_4px_12px_rgba(16,185,129,0.35)] hover:shadow-[0_6px_16px_rgba(16,185,129,0.45)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                  >
                    {saleMut.isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin shrink-0" aria-hidden />
                        <span>{t.saving}</span>
                      </>
                    ) : (
                      <>
                        <span aria-hidden>✓</span>
                        <span>{lang === 'ar' ? 'إتمام العملية' : 'Complete sale'}</span>
                        <span className="bg-white/20 rounded px-1.5 py-0.5 text-xs font-semibold">F8</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* نافذة نجاح البيع — طباعة / إرسال واتساب */}
      {lastSaleInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setLastSaleInfo(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">{lang === 'ar' ? 'تم إتمام البيع' : 'Sale completed'}</h3>
            <p className="text-slate-600 text-sm mb-1">
              {lang === 'ar' ? 'رقم الفاتورة:' : 'Invoice:'} <span className="font-mono font-semibold">{lastSaleInfo.invoiceNumber}</span>
            </p>
            <p className="text-slate-600 text-sm mb-4">
              {lang === 'ar' ? 'الإجمالي:' : 'Total:'} <span className="font-semibold" dir="ltr">{fmt(lastSaleInfo.total)}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  openInvoiceViewForPrint(
                    lastSaleInfo.invoiceId,
                    posPrintOptionsFromSettings(posSettings as Record<string, unknown>),
                  )
                  setLastSaleInfo(null)
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-500"
              >
                <Receipt size={18} />
                {lang === 'ar' ? 'عرض وطباعة' : 'View & Print'}
              </button>
              <WhatsAppButton
                phone={lastSaleInfo.customerPhone}
                message={messageTemplateInvoice(
                  {
                    customerName: lastSaleInfo.customerName,
                    invoiceNumber: lastSaleInfo.invoiceNumber,
                    total: fmt(lastSaleInfo.total),
                    pdfOrViewUrl: typeof window !== 'undefined' ? `${window.location.origin}/invoices/view/${lastSaleInfo.invoiceId}` : '',
                    lang: lang === 'ar' ? 'ar' : 'en',
                  },
                  (posSettings as Record<string, unknown>)?.whatsapp_invoice_message_ar as string | undefined,
                  (posSettings as Record<string, unknown>)?.whatsapp_invoice_message_en as string | undefined
                )}
                defaultCountryCode={(posSettings as Record<string, unknown>)?.whatsapp_default_country_code as string | undefined}
                label={lang === 'ar' ? 'واتساب' : 'WhatsApp'}
                iconSize={20}
              />
              <button type="button" onClick={() => setLastSaleInfo(null)} className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
                {lang === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة السلات المعلقة */}
      {showHeldList && branchId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">السلات المعلقة</h3>
              <button type="button" onClick={() => setShowHeldList(false)} className="p-2 rounded-lg hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {heldList.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-6">لا توجد سلات معلقة</p>
              ) : (
                <ul className="space-y-2">
                  {heldList.map((h) => {
                    const heldPayload = h.payload as {
                      cart?: PosCartLine[]
                      invoiceDiscount?: number
                      invoiceDiscountType?: 'amount' | 'percentage'
                    }
                    return (
                    <li key={h.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div>
                        <span className="text-sm text-slate-600">
                          {Array.isArray(heldPayload.cart) ? heldPayload.cart.length : 0} صنف
                          {h.user?.name ? ` · ${h.user.name}` : ''}
                        </span>
                        <span className="block text-xs text-slate-400">
                          {new Date(h.created_at).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await resumePosHeld(tenantId, branchId, h.id)
                            const pl = res.payload as { cart?: PosCartLine[]; invoiceDiscount?: number; invoiceDiscountType?: 'amount' | 'percentage' }
                            if (Array.isArray(pl?.cart)) setCart(pl.cart)
                            if (typeof pl?.invoiceDiscount === 'number') setInvoiceDiscount(pl.invoiceDiscount)
                            if (pl?.invoiceDiscountType === 'percentage' || pl?.invoiceDiscountType === 'amount') {
                              setInvoiceDiscountType(pl.invoiceDiscountType)
                            } else {
                              setInvoiceDiscountType('amount')
                            }
                            setShowHeldList(false)
                            queryClient.invalidateQueries({ queryKey: ['pos-held-bar', tenantId, branchId] })
                            setToast({ message: 'تم استئناف السلة', type: 'success' })
                          } catch (e: unknown) {
                            const err = e as { response?: { data?: { message?: string } } }
                            setToast({ message: err?.response?.data?.message ?? 'خطأ', type: 'error' })
                          }
                        }}
                        className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-500 flex items-center gap-1"
                      >
                        <Play size={14} /> استئناف
                      </button>
                    </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* نافذة تسجيل مصروف */}
      {showExpenseModal && branchId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{lang === 'ar' ? 'تسجيل مصروف' : 'Record Expense'}</h3>
              <button type="button" onClick={() => setShowExpenseModal(false)} className="p-2 rounded-lg hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const itemId = expenseForm.expense_item_id ? Number(expenseForm.expense_item_id) : 0
                const methodId = expenseForm.payment_method_id ? Number(expenseForm.payment_method_id) : 0
                const amt = parseFloat(expenseForm.amount) || 0
                if (!itemId || !methodId || amt <= 0) {
                  setToast({ message: lang === 'ar' ? 'اختر بند المصروف وطريقة الدفع وأدخل مبلغاً صحيحاً' : 'Select expense item, payment method and enter a valid amount', type: 'error' })
                  return
                }
                recordExpenseMut.mutate({ expense_item_id: itemId, payment_method_id: methodId, amount: amt, notes: expenseForm.notes.trim() || null })
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'بند المصروف *' : 'Expense Item *'}</label>
                <select
                  value={expenseForm.expense_item_id}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, expense_item_id: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm"
                  required
                >
                  <option value="">{lang === 'ar' ? 'اختر بند المصروف' : 'Select expense item'}</option>
                  {expenseItems.filter((i) => i.is_active !== false).map((item) => (
                    <option key={item.id} value={item.id}>{lang === 'ar' ? item.name : (item.name_en || item.name)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'طريقة الدفع *' : 'Payment Method *'}</label>
                <select
                  value={expenseForm.payment_method_id}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, payment_method_id: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm"
                  required
                >
                  <option value="">{lang === 'ar' ? 'اختر طريقة الدفع' : 'Select payment method'}</option>
                  {paymentMethods.filter((m) => m.is_active).map((m) => (
                    <option key={m.id} value={m.id}>{lang === 'ar' ? m.name : (m.name_en || m.name)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'المبلغ *' : 'Amount *'}</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'الملاحظات' : 'Notes'}</label>
                <textarea
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm min-h-[80px]"
                  placeholder={lang === 'ar' ? 'اختياري' : 'Optional'}
                  rows={3}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={recordExpenseMut.isPending}
                  className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-500 disabled:opacity-50"
                >
                  {recordExpenseMut.isPending ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ' : 'Save')}
                </button>
                <button type="button" onClick={() => setShowExpenseModal(false)} className="px-4 py-2.5 border border-slate-300 rounded-lg">
                  {t.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تقرير X */}
      {showXReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-lg font-semibold">تقرير X (لحظة الحالية)</h3>
              <button type="button" onClick={() => setShowXReport(false)} className="p-2 rounded-lg hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {xReportData ? (
                <>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-600">عدد الفواتير</span>
                    <span className="font-mono text-right">{xReportData.invoices_count}</span>
                    <span className="text-slate-600">إجمالي المبيعات</span>
                    <span className="font-mono text-right font-semibold">{fmt(xReportData.total_sales)}</span>
                    <span className="text-slate-600">رصيد افتتاحي</span>
                    <span className="font-mono text-right">{fmt(xReportData.opening_cash)}</span>
                    <span className="text-slate-600">نقداً مستلم</span>
                    <span className="font-mono text-right">{fmt(xReportData.cash_received)}</span>
                    {typeof xReportData.total_expenses === 'number' && (
                      <>
                        <span className="text-slate-600">{lang === 'ar' ? 'إجمالي المصروفات' : 'Total expenses'}</span>
                        <span className="font-mono text-right text-red-600">- {fmt(xReportData.total_expenses)}</span>
                        <span className="text-slate-600">{lang === 'ar' ? 'المتوقع في الصندوق (بعد المصروفات)' : 'Expected cash (after expenses)'}</span>
                        <span className="font-mono text-right font-semibold">{fmt(Math.max(0, (xReportData.expected_cash ?? 0) - xReportData.total_expenses))}</span>
                      </>
                    )}
                    {typeof xReportData.total_expenses !== 'number' && (
                      <>
                        <span className="text-slate-600">{lang === 'ar' ? 'المتوقع في الصندوق' : 'Expected cash'}</span>
                        <span className="font-mono text-right">{fmt(xReportData.expected_cash)}</span>
                      </>
                    )}
                  </div>
                  {xReportData.by_payment_method?.length > 0 && (
                    <div className="pt-2 border-t border-slate-200">
                      <h4 className="text-sm font-medium text-slate-700 mb-2">حسب طريقة الدفع</h4>
                      <ul className="space-y-1 text-sm">
                        {xReportData.by_payment_method.map((pm: { payment_method_id: number; name: string; amount: number; count: number }) => (
                          <li key={pm.payment_method_id} className="flex justify-between">
                            <span>{pm.name}</span>
                            <span>{fmt(pm.amount)} ({pm.count})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-500 text-sm">لا توجد وردية مفتوحة أو لا توجد بيانات.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* نافذة إغلاق الوردية — جرد احترافي */}
      {showCloseShift && currentShift && branchId && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 py-4 px-4">
          <div className="mx-auto w-full max-w-2xl bg-white rounded-2xl shadow-xl my-2 sm:my-4">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xl font-semibold text-slate-900">{lang === 'ar' ? 'جرد الصندوق — إغلاق الوردية' : 'Cash Count — Close Shift'}</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printCloseShiftCashCountReport()}
                  disabled={!closeShiftSummary}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium disabled:opacity-50"
                >
                  <FileText size={18} />
                  {lang === 'ar' ? 'طباعة التقرير' : 'Print Report'}
                </button>
                <button
                  type="button"
                  onClick={() => exportCloseShiftReportPdf()}
                  disabled={!closeShiftSummary || closeShiftPdfExporting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-50 hover:bg-primary-100 text-primary-800 border border-primary-200 text-sm font-medium disabled:opacity-50"
                >
                  <Download size={18} />
                  {closeShiftPdfExporting ? (lang === 'ar' ? 'جاري التصدير...' : 'Exporting...') : lang === 'ar' ? 'تصدير PDF' : 'Export PDF'}
                </button>
                <button type="button" onClick={() => setShowCloseShift(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700">
                  <X size={22} />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-5">
              {!closeShiftSummary && !closeShiftSummaryLoadError && (
                <div className="flex items-center justify-center py-8 text-slate-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mr-2" />
                  {lang === 'ar' ? 'جاري تحميل ملخص الوردية...' : 'Loading shift summary...'}
                </div>
              )}
              {closeShiftSummaryLoadError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm flex items-center justify-between gap-2">
                  <span>{lang === 'ar' ? 'تعذر تحميل ملخص الوردية.' : 'Could not load shift summary.'}</span>
                  <button type="button" onClick={() => { setCloseShiftSummaryLoadError(false); setCloseShiftSummary(null); fetchPosXReport(tenantId!, branchId!).then((r) => { if (r.report) { setCloseShiftSummary(r.report); setCloseShiftSummaryLoadError(false); } else setCloseShiftSummaryLoadError(true); }).catch(() => setCloseShiftSummaryLoadError(true)) }} className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 font-medium">
                    {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                  </button>
                </div>
              )}
              {closeShiftSummary && closeShiftBreakdown && currentShift && (() => {
                const logoSrc = safeLogoUrlForPrint((posSettings as Record<string, unknown> | undefined)?.pos_invoice_logo)
                const openedStrUi =
                  (closeShiftSummary.opened_at ?? currentShift.opened_at)
                    ? new Date(closeShiftSummary.opened_at ?? currentShift.opened_at).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB', { hour12: true })
                    : '—'
                const {
                  cashSales,
                  cardSales,
                  bankSales,
                  otherSales,
                  returns,
                  discount,
                  totalCashSalesNet,
                  creditSales,
                  totalSales,
                  expenses,
                  netCash,
                } = closeShiftBreakdown
                return (
                  <div ref={closeShiftReportExportRef} className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3 print:border-slate-300">
                      {logoSrc ? (
                        <div className="flex justify-center">
                          <img src={logoSrc} alt="" className="max-h-[72px] max-w-[240px] object-contain" />
                        </div>
                      ) : null}
                      <h4 className="text-center text-base font-bold text-slate-900">
                        {lang === 'ar' ? 'تقرير مطابقة وجرد وردية مبيعات' : 'Sales shift reconciliation & cash count report'}
                      </h4>
                      {currentTenant?.name ? (
                        <p className="text-center text-xs text-slate-500">{currentTenant.name}</p>
                      ) : null}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-slate-500">{lang === 'ar' ? 'اسم الكاشير (فاتح الوردية)' : 'Cashier (opened shift)'}</div>
                          <div className="font-semibold text-slate-800">{currentShift.user?.name ?? '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">{lang === 'ar' ? 'اسم المدير / المُغلق' : 'Manager / closing user'}</div>
                          <div className="font-semibold text-slate-800">{currentUser?.name ?? '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">{lang === 'ar' ? 'تاريخ ووقت فتح الوردية' : 'Shift opened at'}</div>
                          <div className="font-semibold text-slate-800">{openedStrUi}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">{lang === 'ar' ? 'تاريخ ووقت إغلاق الوردية' : 'Shift closed at'}</div>
                          <div className="font-semibold text-slate-800">
                            {lang === 'ar'
                              ? 'لم يُسجَّل بعد — الوردية مفتوحة (يُثبَّت عند «إغلاق الوردية»)'
                              : 'Not recorded yet — shift open (on «Close shift»)'}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <div className="text-slate-500">{lang === 'ar' ? 'الفرع' : 'Branch'}</div>
                          <div className="font-semibold text-slate-800">{currentShift.branch?.name ?? currentShift.branch?.code ?? '—'}</div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-100 text-slate-600">
                              <th className={`py-2.5 px-4 font-semibold ${isRtl ? 'text-right' : 'text-left'}`}>{lang === 'ar' ? 'البند' : 'Item'}</th>
                              <th className="py-2.5 px-4 font-semibold text-right">{lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            <tr><td colSpan={2} className="py-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">{lang === 'ar' ? 'المبيعات حسب طريقة الدفع' : 'Sales by payment method'}</td></tr>
                            <tr className="hover:bg-slate-50/50"><td className="py-2 px-4 pl-6 text-slate-700">{lang === 'ar' ? 'مبيعات نقداً' : 'Cash sales'}</td><td className="py-2 px-4 text-right font-mono tabular-nums">{fmt(cashSales)}</td></tr>
                            <tr className="hover:bg-slate-50/50"><td className="py-2 px-4 pl-6 text-slate-700">{lang === 'ar' ? 'مبيعات فيزا / بطاقة' : 'Card / Visa sales'}</td><td className="py-2 px-4 text-right font-mono tabular-nums">{fmt(cardSales)}</td></tr>
                            <tr className="hover:bg-slate-50/50"><td className="py-2 px-4 pl-6 text-slate-700">{lang === 'ar' ? 'تحويلات بنكية' : 'Bank transfers'}</td><td className="py-2 px-4 text-right font-mono tabular-nums">{fmt(bankSales)}</td></tr>
                            <tr className="hover:bg-slate-50/50"><td className="py-2 px-4 pl-6 text-slate-700">{lang === 'ar' ? 'أخرى' : 'Other'}</td><td className="py-2 px-4 text-right font-mono tabular-nums">{fmt(otherSales)}</td></tr>
                            <tr className="hover:bg-slate-50/50"><td className="py-2 px-4 pl-6 text-slate-600">{lang === 'ar' ? '− مرتجعات' : '− Returns'}</td><td className="py-2 px-4 text-right font-mono tabular-nums text-red-600">- {fmt(returns)}</td></tr>
                            <tr className="hover:bg-slate-50/50"><td className="py-2 px-4 pl-6 text-slate-600">{lang === 'ar' ? '− خصم' : '− Discount'}</td><td className="py-2 px-4 text-right font-mono tabular-nums text-red-600">- {fmt(discount)}</td></tr>
                            <tr className="bg-slate-100"><td className="py-2.5 px-4 font-semibold text-slate-800">{lang === 'ar' ? 'إجمالي المبيعات النقدية' : 'Total cash sales'}</td><td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums">{fmt(totalCashSalesNet)}</td></tr>
                            <tr className="hover:bg-slate-50/50"><td className="py-2 px-4 text-slate-700">{lang === 'ar' ? 'مبيعات بالآجل' : 'Credit sales'}</td><td className="py-2 px-4 text-right font-mono tabular-nums">{fmt(creditSales)}</td></tr>
                            <tr className="bg-slate-100"><td className="py-2.5 px-4 font-semibold text-slate-800">{lang === 'ar' ? 'إجمالي المبيعات' : 'Total sales'}</td><td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums">{fmt(totalSales)}</td></tr>
                            <tr className="hover:bg-slate-50/50"><td className="py-2 px-4 text-slate-700">{lang === 'ar' ? 'المصروفات' : 'Expenses'}</td><td className="py-2 px-4 text-right font-mono tabular-nums text-red-600">- {fmt(expenses)}</td></tr>
                            <tr className="bg-primary-50"><td className="py-3 px-4 font-bold text-slate-900">{lang === 'ar' ? 'صافي النقدية' : 'Net cash'}</td><td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-primary-700">{fmt(netCash)}</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 text-xs text-slate-600">
                      <div>
                        <div className="mb-1 font-medium">{lang === 'ar' ? 'توقيع الكاشير' : 'Cashier signature'}</div>
                        <div className="border-b border-slate-400 min-h-[36px]" />
                      </div>
                      <div>
                        <div className="mb-1 font-medium">{lang === 'ar' ? 'توقيع المشرف' : 'Supervisor signature'}</div>
                        <div className="border-b border-slate-400 min-h-[36px]" />
                      </div>
                    </div>
                  </div>
                )
              })()}
              {closeShiftSummary && (() => {
                const totalSalesVal = closeShiftSummary.total_sales ?? 0
                const totalReceivedVal = (closeShiftSummary.by_payment_method ?? []).reduce((s: number, m: { amount?: number }) => s + (m.amount ?? 0), 0)
                const invoicesCountVal = closeShiftSummary.invoices_count ?? 0
                const invalidClose = totalSalesVal < 0.001 && (totalReceivedVal >= 0.001 || invoicesCountVal > 0)
                return invalidClose ? (
                  <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm font-medium">
                    {lang === 'ar' ? 'لا يمكن إغلاق الوردية: إجمالي المبيعات يظهر صفراً مع وجود حركات بيع. يرجى مراجعة الفواتير والمرتجعات قبل الترحيل.' : 'Cannot close shift: total sales is zero but there are sales movements. Please review invoices and returns before posting.'}
                  </div>
                ) : null
              })()}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{lang === 'ar' ? 'المبلغ الفعلي في الصندوق' : 'Actual cash in till'}</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full max-w-xs border border-slate-300 rounded-lg px-4 py-3 text-base font-mono tabular-nums focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              {closeShiftSummary && closingCash !== '' && (
                <div className={`rounded-xl border-2 p-4 ${(parseFloat(closingCash) || 0) - closeShiftSummary.expected_cash < 0 ? 'bg-red-50 border-red-200' : (parseFloat(closingCash) || 0) - closeShiftSummary.expected_cash > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                  <span className="text-sm font-medium text-slate-700">{lang === 'ar' ? 'الفرق (فعلي − متوقع):' : 'Variance (actual − expected):'}</span>
                  <span className={`block font-mono text-xl font-bold mt-1 ${((parseFloat(closingCash) || 0) - closeShiftSummary.expected_cash) < 0 ? 'text-red-700' : ((parseFloat(closingCash) || 0) - closeShiftSummary.expected_cash) > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                    {((parseFloat(closingCash) || 0) - closeShiftSummary.expected_cash) < 0 ? (lang === 'ar' ? 'عجز' : 'Shortage') : ((parseFloat(closingCash) || 0) - closeShiftSummary.expected_cash) > 0 ? (lang === 'ar' ? 'زيادة' : 'Surplus') : (lang === 'ar' ? 'متطابق' : 'Match')}{' '}
                    {fmt(Math.abs((parseFloat(closingCash) || 0) - closeShiftSummary.expected_cash))}
                  </span>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (closeShiftSummary) {
                      const totalSalesVal = closeShiftSummary.total_sales ?? 0
                      const totalReceivedVal = (closeShiftSummary.by_payment_method ?? []).reduce((s: number, m: { amount?: number }) => s + (m.amount ?? 0), 0)
                      const invoicesCountVal = closeShiftSummary.invoices_count ?? 0
                      if (totalSalesVal < 0.001 && (totalReceivedVal >= 0.001 || invoicesCountVal > 0)) {
                        setToast({ message: lang === 'ar' ? 'لا يمكن إغلاق الوردية: إجمالي المبيعات صفر مع وجود حركات بيع. راجع الفواتير والمرتجعات.' : 'Cannot close shift: total sales is zero with sales movements.', type: 'error' })
                        return
                      }
                    }
                    closeShiftMut.mutate(parseFloat(closingCash) || 0)
                  }}
                  disabled={!!(closeShiftMut.isPending || (closeShiftSummary && (closeShiftSummary.total_sales ?? 0) < 0.001 && ((closeShiftSummary.by_payment_method ?? []).reduce((s: number, m: { amount?: number }) => s + (m.amount ?? 0), 0) >= 0.001 || (closeShiftSummary.invoices_count ?? 0) > 0)))}
                  className="flex-1 py-3.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-500 disabled:opacity-50 transition-colors"
                >
                  {closeShiftMut.isPending ? (lang === 'ar' ? 'جاري الإغلاق...' : 'Closing...') : (lang === 'ar' ? 'إغلاق الوردية' : 'Close Shift')}
                </button>
                <button type="button" onClick={() => setShowCloseShift(false)} className="px-6 py-3.5 border border-slate-300 rounded-xl font-medium text-slate-700 hover:bg-slate-50">
                  {t.cancel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة طباعة تقرير Z */}
      {showZReportPrint && lastZReport && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 py-4 px-4">
          <div className="mx-auto w-full max-w-md bg-white rounded-xl shadow-xl my-2 sm:my-4">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{lang === 'ar' ? 'تقرير Z' : 'Z Report'}</h3>
              <div className="flex gap-2">
                <button type="button" onClick={() => window.print()} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium">{lang === 'ar' ? 'طباعة' : 'Print'}</button>
                <button type="button" onClick={() => { setShowZReportPrint(false); setLastZReport(null); }} className="p-2 rounded-lg hover:bg-slate-100"><X size={20} /></button>
              </div>
            </div>
            <div ref={zReportPrintRef} className="p-4 print:p-2 print:max-w-[80mm] print:text-xs print:mx-auto font-mono">
              {(() => {
                const zLogo = safeLogoUrlForPrint((posSettings as Record<string, unknown> | undefined)?.pos_invoice_logo)
                return (
                  <div className="border-b border-dashed border-slate-300 pb-3 mb-3 space-y-2">
                    {zLogo ? (
                      <div className="flex justify-center">
                        <img src={zLogo} alt="" className="max-h-16 max-w-[200px] object-contain mx-auto" />
                      </div>
                    ) : null}
                    <div className="text-center font-bold text-sm leading-snug">
                      {lang === 'ar' ? 'تقرير مطابقة وجرد وردية مبيعات' : 'Sales shift reconciliation & cash count report'}
                    </div>
                    <div className="text-center text-xs font-semibold text-slate-600">
                      {lang === 'ar' ? '(تقرير Z — إغلاق نهائي)' : '(Z report — final close)'}
                    </div>
                    {currentTenant?.name ? <div className="text-center text-slate-500 text-xs">{currentTenant.name}</div> : null}
                    <div className="grid grid-cols-1 gap-1.5 text-[11px] pt-1 font-sans">
                      <div className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                        <span className="text-slate-500 shrink-0">{lang === 'ar' ? 'اسم الكاشير (فاتح الوردية)' : 'Cashier (opened)'}</span>
                        <span className="font-medium text-slate-800 text-end">{lastShiftInfo.userName ?? '—'}</span>
                      </div>
                      <div className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                        <span className="text-slate-500 shrink-0">{lang === 'ar' ? 'اسم المدير / المُغلق' : 'Manager / closed by'}</span>
                        <span className="font-medium text-slate-800 text-end">{currentUser?.name ?? '—'}</span>
                      </div>
                      <div className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                        <span className="text-slate-500 shrink-0">{lang === 'ar' ? 'فتح الوردية' : 'Opened'}</span>
                        <span className="text-slate-800 text-end">{new Date(lastZReport.opened_at).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB', { hour12: true })}</span>
                      </div>
                      <div className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                        <span className="text-slate-500 shrink-0">{lang === 'ar' ? 'إغلاق الوردية' : 'Closed'}</span>
                        <span className="text-slate-800 text-end">{new Date(lastZReport.closed_at).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB', { hour12: true })}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-500 shrink-0">{lang === 'ar' ? 'الفرع' : 'Branch'}</span>
                        <span className="font-medium text-slate-800 text-end">{lastShiftInfo.branchName ?? '—'}</span>
                      </div>
                    </div>
                  </div>
                )
              })()}
              <div className="border-t border-dashed border-slate-300 mt-3 pt-3 space-y-1">
                <div className="flex justify-between font-medium"><span>{lang === 'ar' ? 'عدد الفواتير' : 'Invoices'}</span><span>{lastZReport.invoices_count}</span></div>
                <div className="flex justify-between"><span>{lang === 'ar' ? 'الأصناف المباعة' : 'Items sold'}</span><span>{lastZReport.items_sold_count ?? '—'}</span></div>
                <div className="flex justify-between"><span>{lang === 'ar' ? 'المرتجعات' : 'Returns'}</span><span>{lastZReport.returns_count ?? 0}</span></div>
                <div className="flex justify-between"><span>{lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales'}</span><span>{fmt(lastZReport.total_sales)}</span></div>
                <div className="flex justify-between"><span>{lang === 'ar' ? 'المرتجعات' : 'Returns'}</span><span>- {fmt(lastZReport.total_returns ?? 0)}</span></div>
                <div className="flex justify-between"><span>{lang === 'ar' ? 'الضريبة (15%)' : 'Tax (15%)'}</span><span>{fmt(lastZReport.total_tax ?? 0)}</span></div>
                <div className="flex justify-between"><span>{lang === 'ar' ? 'المصروفات' : 'Expenses'}</span><span>- {fmt(lastZReport.total_expenses ?? 0)}</span></div>
                <div className="flex justify-between"><span>{lang === 'ar' ? 'الرصيد الافتتاحي' : 'Opening'}</span><span>{fmt(lastZReport.opening_cash)}</span></div>
                <div className="flex justify-between"><span>{lang === 'ar' ? 'المتوقع' : 'Expected'}</span><span>{fmt(lastZReport.expected_cash)}</span></div>
                <div className="flex justify-between"><span>{lang === 'ar' ? 'الفعلي' : 'Actual'}</span><span>{fmt(lastZReport.closing_cash)}</span></div>
                <div className={`flex justify-between font-bold ${(lastZReport.difference) < 0 ? 'text-red-600' : (lastZReport.difference) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  <span>{lang === 'ar' ? 'الفرق' : 'Variance'}</span><span>{(lastZReport.difference) < 0 ? (lang === 'ar' ? 'عجز' : 'Shortage') : (lastZReport.difference) > 0 ? (lang === 'ar' ? 'زيادة' : 'Surplus') : '0'} {fmt(Math.abs(lastZReport.difference))}</span>
                </div>
              </div>
              <div className="border-t border-dashed border-slate-300 mt-4 pt-4 space-y-4">
                <div><div className="text-xs text-slate-500 mb-1">{lang === 'ar' ? 'توقيع الكاشير' : 'Cashier signature'}</div><div className="border-b border-slate-400 h-8 w-full" /></div>
                <div><div className="text-xs text-slate-500 mb-1">{lang === 'ar' ? 'توقيع المشرف' : 'Supervisor signature'}</div><div className="border-b border-slate-400 h-8 w-full" /></div>
              </div>
              <div className="text-center text-xs text-slate-400 mt-4">{new Date(lastZReport.generated_at).toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة إضافة عميل */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">إضافة عميل جديد</h3>
              <button type="button" onClick={() => { setShowAddCustomerModal(false); setNewCustomerForm({ name: '', phone: '' }) }} className="p-2 rounded-lg hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!newCustomerForm.name.trim()) return
                createCustomerMut.mutate({ name: newCustomerForm.name.trim(), phone: newCustomerForm.phone.trim() || undefined })
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">الاسم *</label>
                <input
                  type="text"
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="اسم العميل"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">التليفون</label>
                <input
                  type="text"
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="رقم التليفون"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={!newCustomerForm.name.trim() || createCustomerMut.isPending}
                  className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-500 disabled:opacity-50"
                >
                  {createCustomerMut.isPending ? t.saving : 'إضافة'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddCustomerModal(false); setNewCustomerForm({ name: '', phone: '' }) }}
                  className="px-4 py-2.5 border border-slate-300 rounded-lg"
                >
                  {t.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة إضافة صنف جديد — Modal Large + تبويبات */}
      {showAddItemModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-[80%] max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
              <h3 className="text-lg font-semibold text-slate-900">{lang === 'ar' ? 'إضافة صنف جديد' : 'Add new item'}</h3>
              <button
                type="button"
                onClick={() => { setShowAddItemModal(false); setNewItemForm(newItemFormInitial); setNewItemImageFile(null); setPosAddItemTab('basic') }}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="border-b border-slate-200 shrink-0">
              <div className="flex gap-1 px-4">
                <button
                  type="button"
                  onClick={() => setPosAddItemTab('basic')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${posAddItemTab === 'basic' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  {lang === 'ar' ? 'البيانات الأساسية' : 'Basic data'}
                </button>
                <button
                  type="button"
                  onClick={() => setPosAddItemTab('pricing')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${posAddItemTab === 'pricing' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  {lang === 'ar' ? 'الأسعار والمخزون' : 'Pricing & stock'}
                </button>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!newItemForm.code.trim() || !newItemForm.name.trim()) return
                setShowAddItemConfirm(true)
              }}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="p-4 overflow-y-auto flex-1">
                {posAddItemTab === 'basic' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'الفئة' : 'Category'}</label>
                        <select
                          value={newItemForm.category_id}
                          onChange={(e) => setNewItemForm((f) => ({ ...f, category_id: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                        >
                          <option value="">—</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{lang === 'ar' ? c.name : (c.name_en || c.name)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'كود الصنف' : 'Item code'} *</label>
                        <input
                          type="text"
                          value={newItemForm.code}
                          onChange={(e) => setNewItemForm((f) => ({ ...f, code: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                          placeholder={lang === 'ar' ? 'يُولّد تلقائياً عند اختيار الفئة' : 'Auto when category selected'}
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'اسم الصنف' : 'Item name'} *</label>
                        <input
                          type="text"
                          value={newItemForm.name}
                          onChange={(e) => setNewItemForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'الاسم بالإنجليزية' : 'Name (EN)'}</label>
                        <input
                          type="text"
                          value={newItemForm.name_en}
                          onChange={(e) => setNewItemForm((f) => ({ ...f, name_en: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                          dir="ltr"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'نوع الصنف' : 'Item type'}</label>
                        <select
                          value={newItemForm.type}
                          onChange={(e) => setNewItemForm((f) => ({ ...f, type: e.target.value as 'inventory' | 'service' }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                        >
                          <option value="inventory">{t.items?.inventory ?? (lang === 'ar' ? 'مخزون' : 'Inventory')}</option>
                          <option value="service">{t.items?.service ?? (lang === 'ar' ? 'خدمة' : 'Service')}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'الوحدة' : 'Unit'}</label>
                        <select
                          value={newItemForm.unit_id}
                          onChange={(e) => setNewItemForm((f) => ({ ...f, unit_id: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                        >
                          <option value="">—</option>
                          {itemUnits.filter((u) => u.is_active).map((u) => (
                            <option key={u.id} value={u.id}>{u.name} {u.symbol ? `(${u.symbol})` : ''}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t.items?.brand ?? (lang === 'ar' ? 'العلامة التجارية' : 'Brand')}</label>
                        <select
                          value={newItemForm.brand_id}
                          onChange={(e) => setNewItemForm((f) => ({ ...f, brand_id: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                        >
                          <option value="">—</option>
                          {itemBrands.filter((b) => b.is_active).map((b) => (
                            <option key={b.id} value={b.id}>{lang === 'ar' ? b.name : (b.name_en || b.name)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'الباركود' : 'Barcode'}</label>
                        <input
                          type="text"
                          value={newItemForm.barcode}
                          onChange={(e) => setNewItemForm((f) => ({ ...f, barcode: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewItemForm((f) => ({ ...f, barcode: `${Date.now()}${Math.floor(1000 + Math.random() * 9000)}` }))}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
                      >
                        {lang === 'ar' ? 'توليد آلي' : 'Generate'}
                      </button>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'صورة المنتج' : 'Product image'}</label>
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                          {newItemImageFile ? (
                            <img src={URL.createObjectURL(newItemImageFile)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-slate-400 text-xs">{lang === 'ar' ? 'لا صورة' : 'No image'}</span>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={(e) => setNewItemImageFile(e.target.files?.[0] ?? null)}
                          className="text-sm text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'الوصف' : 'Description'}</label>
                      <textarea
                        value={newItemForm.description}
                        onChange={(e) => setNewItemForm((f) => ({ ...f, description: e.target.value }))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                        rows={2}
                      />
                    </div>
                  </div>
                )}
                {posAddItemTab === 'pricing' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'سعر التكلفة' : 'Cost price'}</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newItemForm.cost_price || ''}
                          onChange={(e) => setNewItemForm((f) => ({ ...f, cost_price: Number(e.target.value) || 0 }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'سعر البيع' : 'Selling price'}</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newItemForm.selling_price || ''}
                          onChange={(e) => setNewItemForm((f) => ({ ...f, selling_price: Number(e.target.value) || 0 }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'أقل سعر' : 'Min. selling price'}</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newItemForm.min_selling_price || ''}
                          onChange={(e) => setNewItemForm((f) => ({ ...f, min_selling_price: Number(e.target.value) || 0 }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'السعر الأعلى' : 'Max. selling price'}</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newItemForm.max_selling_price || ''}
                          onChange={(e) => setNewItemForm((f) => ({ ...f, max_selling_price: Number(e.target.value) || 0 }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'حد إعادة الطلب' : 'Reorder level'}</label>
                        <input
                          type="number"
                          min="0"
                          value={newItemForm.min_quantity || ''}
                          onChange={(e) => setNewItemForm((f) => ({ ...f, min_quantity: Number(e.target.value) || 0 }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'الكمية الافتتاحية' : 'Initial stock'}</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newItemForm.initial_stock || ''}
                          onChange={(e) => setNewItemForm((f) => ({ ...f, initial_stock: Number(e.target.value) || 0 }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 p-4 border-t border-slate-200 shrink-0">
                <button
                  type="submit"
                  disabled={!newItemForm.code.trim() || !newItemForm.name.trim() || createItemMut.isPending}
                  className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-500 disabled:opacity-50"
                >
                  {createItemMut.isPending ? t.saving : (lang === 'ar' ? 'إضافة الصنف' : 'Add item')}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddItemModal(false); setNewItemForm(newItemFormInitial); setNewItemImageFile(null); setPosAddItemTab('basic') }}
                  className="px-4 py-2.5 border border-slate-300 rounded-lg"
                >
                  {t.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddItemConfirm && (
        <ConfirmDialog
          title={lang === 'ar' ? 'تأكيد الحفظ' : 'Confirm save'}
          message={lang === 'ar' ? 'هل تريد حفظ الصنف؟' : 'Do you want to save this item?'}
          confirmLabel={lang === 'ar' ? 'نعم، احفظ' : 'Yes, save'}
          variant="warning"
          isLoading={createItemMut.isPending}
          onConfirm={() => {
            const selectedUnit = itemUnits.find((u) => u.id === +(newItemForm.unit_id || 0))
            createItemMut.mutate({
              data: {
                code: newItemForm.code.trim(),
                name: newItemForm.name.trim(),
                name_en: newItemForm.name_en?.trim() || null,
                description: newItemForm.description?.trim() || null,
                selling_price: Number(newItemForm.selling_price) || 0,
                cost_price: Number(newItemForm.cost_price) || 0,
                min_selling_price: Number(newItemForm.min_selling_price) || null,
                max_selling_price: Number(newItemForm.max_selling_price) || null,
                barcode: newItemForm.barcode.trim() || null,
                category_id: newItemForm.category_id ? +newItemForm.category_id : null,
                brand_id: newItemForm.brand_id ? +newItemForm.brand_id : null,
                unit_id: newItemForm.unit_id ? +newItemForm.unit_id : null,
                unit: selectedUnit?.name ?? (lang === 'ar' ? 'قطعة' : 'Piece'),
                type: newItemForm.type,
                min_quantity: Number(newItemForm.min_quantity) || 0,
                initial_stock: Number(newItemForm.initial_stock) || 0,
              },
              image: newItemImageFile,
            })
          }}
          onCancel={() => setShowAddItemConfirm(false)}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
