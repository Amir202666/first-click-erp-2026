import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchBranches, fetchWarehouses, fetchPosItems, fetchRestaurantTables, fetchRestaurantSections, fetchCustomers, createCustomer, fetchAccounts, fetchCustomerGroups, createItem, fetchItemCategories, fetchItemUnits, fetchItemBrands, fetchNextItemCode, fetchSettings, sendRestaurantOrder, cancelRestaurantOrderByOrderId, fetchPaymentMethods, saveRestaurantTable, fetchRestaurantOpenOrders, fetchRestaurantOpenOrderByTable, checkoutRestaurantOrder, fetchPosShift, openPosShift, fetchPosXReport, closePosShift, fetchDeliveryDrivers, holdPosCart, type RestaurantOrder } from '../../api/tenant'
import { loyaltyApi } from '../../api/loyalty'
import type { Account, Branch, Customer, CustomerGroup, Item, ItemCategory, ItemUnit, ItemBrand, PosItem, TenantSettings, Warehouse, Invoice, InvoiceLine, PaymentMethod, RestaurantTable, RestaurantSection, PosShiftInfo, PosXReport, PosZReport, DeliveryDriver, PaginatedResponse } from '../../types'
import { cn } from '../../lib/cn'
import { getLocalizedName } from '../../utils/localizedName'
import { formatAmount } from '../../utils/currency'
import { ShoppingCart, Utensils, Truck, Send, Minus, Plus, LayoutGrid, Folder, X, UserPlus, Square, ClipboardList, Play, Lock, FileText, Receipt } from 'lucide-react'
import PaymentMethodBrandIcon from '../../components/PaymentMethodBrandIcon'
import { RestaurantSplitPaymentForm, newLineId } from '../../components/restaurant/RestaurantSplitPaymentForm'
import { LoyaltyPOSSection } from '../../components/loyalty/LoyaltyPOSSection'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { openInvoiceViewForPrint, posPrintOptionsFromSettings } from '../../utils/openInvoicePrintDialog'
import WhatsAppButton from '../../components/WhatsAppButton'
import { messageTemplateInvoice } from '../../utils/whatsapp'

interface CartLine {
  item: PosItem
  quantity: number
  unit_price: number
  discount_type: 'amount' | 'percent'
  discount_value: number
  tax_percent: number
  /** ملاحظة للمطبخ (تُرسل مع F8) */
  kitchen_note?: string
}

type SelectedCustomerRow = {
  id: number
  name: string
  phone: string | null
  loyaltyPoints?: number
}

function getCategoryEmoji(category: string | null | undefined): string {
  const map: Record<string, string> = {
    'مواد غذائية': '🥗',
    'مشروبات': '☕',
    'إلكترونيات': '📱',
    'الملابس': '👕',
  }
  const key = (category ?? '').trim()
  return map[key] ?? '📦'
}

function getPosItemStock(item: PosItem): number {
  if (item.type === 'service' || item.track_quantity === false) return 999
  const n = Number(item.current_stock)
  return Number.isFinite(n) ? n : 0
}

function pickPaymentMethodId(methods: PaymentMethod[], type: PaymentMethod['type']): number | null {
  const active = methods.filter((m) => m.is_active)
  const m = active.find((x) => x.type === type)
  return m?.id ?? null
}

export default function RestaurantPosPage() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const emptyCustomerForm = { name: '', name_en: '', code: '', email: '', phone: '', tax_number: '', address: '', account_id: '' as string, customer_group_id: '' as string, auto_create_account: true }

  const [branchId, setBranchId] = useState<number | null>(null)
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null)
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in')
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomerRow | null>(null)
  const customerDropdownRef = useRef<HTMLDivElement>(null)
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState(emptyCustomerForm)
  const [showAddItemModal, setShowAddItemModal] = useState(false)
  const [addItemTab, setAddItemTab] = useState<'basic' | 'pricing'>('basic')
  const [newItemImageFile, setNewItemImageFile] = useState<File | null>(null)
  const [showAddItemConfirm, setShowAddItemConfirm] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const newItemFormInitial = {
    code: '', name: '', name_en: '', description: '',
    selling_price: 0, cost_price: 0, barcode: '', category_id: '' as string, unit_id: '' as string, brand_id: '' as string,
    min_quantity: 0, initial_stock: 0, min_selling_price: 0, max_selling_price: 0,
    type: 'inventory' as 'inventory' | 'service',
  }
  const [newItemForm, setNewItemForm] = useState(newItemFormInitial)
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all')
  const [orderToPay, setOrderToPay] = useState<RestaurantOrder | null>(null)
  const [showPayModal, setShowPayModal] = useState(false)
  const [showTableModal, setShowTableModal] = useState(false)
  const [tableModalTab, setTableModalTab] = useState<string>('all')
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null)
  const [tableActionTarget, setTableActionTarget] = useState<{ tableId: number; tableName: string } | null>(null)
  const [showOpenOrdersPanel, setShowOpenOrdersPanel] = useState(false)
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null)
  /** طريقة دفع مفضّلة قبل فتح نافذة التحصيل (F5/F6/F9) */
  const [preferredPaymentMethodId, setPreferredPaymentMethodId] = useState<number | null>(null)
  const [kitchenNoteOpenItemId, setKitchenNoteOpenItemId] = useState<number | null>(null)
  const [payModalAmount, setPayModalAmount] = useState(0)
  /** تقسيم الدفع: عدة طرق على نفس الفاتورة */
  const [splitPayMode, setSplitPayMode] = useState(false)
  const [splitLines, setSplitLines] = useState<{ id: string; method: PaymentMethod; amount: number }[]>([])
  const [splitMethodId, setSplitMethodId] = useState<number | null>(null)
  const [splitCurrentAmount, setSplitCurrentAmount] = useState(0)
  const [checkoutDriverId, setCheckoutDriverId] = useState<number | null>(null)
  const [loyaltyProgram, setLoyaltyProgram] = useState<any>(null)
  const [loyaltyRedeemPoints, setLoyaltyRedeemPoints] = useState(0)
  const [loyaltyRedeemDiscount, setLoyaltyRedeemDiscount] = useState(0)
  const [loyaltyProgramId, setLoyaltyProgramId] = useState<number | null>(null)
  const payModalInputRef = useRef<HTMLInputElement>(null)
  const [showCancelOrderConfirm, setShowCancelOrderConfirm] = useState(false)
  const [pendingCancelOrderId, setPendingCancelOrderId] = useState<number | null>(null)
  const [showOpenShift, setShowOpenShift] = useState(false)
  const [openingCash, setOpeningCash] = useState('0')
  const [showCloseShift, setShowCloseShift] = useState(false)
  const [closingCash, setClosingCash] = useState('')
  const [showXReport, setShowXReport] = useState(false)
  const [xReportData, setXReportData] = useState<PosXReport | null>(null)
  const [showZReportPrint, setShowZReportPrint] = useState(false)
  const [lastZReport, setLastZReport] = useState<PosZReport | null>(null)
  const [lastShiftInfo, setLastShiftInfo] = useState<{ branchName?: string; userName?: string }>({})
  /** بعد إتمام التحصيل: عرض نافذة طباعة / إرسال واتساب */
  const [lastCheckoutInfo, setLastCheckoutInfo] = useState<{
    invoiceId: number
    invoiceNumber: string
    total: number
    customerName: string
    customerPhone: string | null
    changeDue?: number
  } | null>(null)

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches: Branch[] = Array.isArray(branchesData)
    ? (branchesData as Branch[])
    : ((branchesData as unknown as { data?: Branch[] })?.data ?? [])

  useEffect(() => {
    if (!tenantId) return
    loyaltyApi
      .getProgram(tenantId)
      .then((r) => setLoyaltyProgram(r.data?.data ?? null))
      .catch(() => setLoyaltyProgram(null))
  }, [tenantId])

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: !!tenantId,
  })
  const warehouses: Warehouse[] = warehousesData?.data ?? []

  const { data: tables } = useQuery({
    queryKey: ['restaurantTables', tenantId, branchId],
    queryFn: () => fetchRestaurantTables(tenantId, branchId ? { branch_id: branchId } : {}),
    enabled: !!tenantId,
  })

  const { data: sections } = useQuery({
    queryKey: ['restaurantSections', tenantId],
    queryFn: () => fetchRestaurantSections(tenantId),
    enabled: !!tenantId && showTableModal,
  })
  const sectionsList: RestaurantSection[] = sections ?? []

  const { data: shiftData, refetch: refetchShift } = useQuery({
    queryKey: ['pos-shift', tenantId, branchId],
    queryFn: () => fetchPosShift(tenantId, branchId!),
    enabled: !!tenantId && !!branchId,
  })
  const currentShift = shiftData?.shift ?? null

  const { data: openOrders = [], refetch: refetchOpenOrders } = useQuery({
    queryKey: ['restaurantOpenOrders', tenantId, branchId],
    queryFn: () => fetchRestaurantOpenOrders(tenantId, branchId ? { branch_id: branchId } : undefined),
    enabled: !!tenantId,
  })

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const amountDecimals = (() => {
    const n = Number(settings?.doc_amount_decimals)
    return Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 2
  })()
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const roundMoney = (n: number) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0)

  const { data: restaurantDriversRes } = useQuery({
    queryKey: ['delivery-drivers', tenantId, 'restaurant-checkout'],
    queryFn: () => fetchDeliveryDrivers(tenantId, { per_page: '200', is_active: '1' }),
    enabled: !!tenantId && showPayModal && orderToPay?.order_type === 'delivery',
  })
  const restaurantDrivers: DeliveryDriver[] = (restaurantDriversRes as PaginatedResponse<DeliveryDriver> | undefined)?.data ?? []

  const { data: paymentMethodsData } = useQuery({
    queryKey: ['payment-methods', tenantId],
    queryFn: () => fetchPaymentMethods(tenantId),
    enabled: !!tenantId,
  })
  const paymentMethods: PaymentMethod[] = Array.isArray(paymentMethodsData)
    ? paymentMethodsData
    : (paymentMethodsData && typeof paymentMethodsData === 'object' && 'data' in paymentMethodsData
      ? (paymentMethodsData as { data?: PaymentMethod[] }).data
      : undefined) ?? []

  const applyQuickPayment = useCallback(
    (type: PaymentMethod['type']) => {
      const id = pickPaymentMethodId(paymentMethods, type)
      if (id == null) {
        setToast({
          message: lang === 'ar' ? 'لا توجد طريقة دفع من هذا النوع في الإعدادات' : 'No active payment method of this type in settings',
          type: 'info',
        })
        return
      }
      setPreferredPaymentMethodId(id)
      if (type === 'cash' && orderToPay) {
        const total = roundMoney(Number(orderToPay.total) || 0)
        setCheckoutDriverId(null)
        setSplitPayMode(true)
        setSplitLines([])
        setSplitMethodId(id)
        setSplitCurrentAmount(total)
        setPaymentMethodId(id)
        setPayModalAmount(total)
        setShowPayModal(true)
        return
      }
      if (showPayModal && orderToPay) setPaymentMethodId(id)
    },
    [paymentMethods, orderToPay, lang, roundMoney],
  )

  const { data: customersData } = useQuery({
    queryKey: ['customers', tenantId, 'restaurant-pos', branchId],
    queryFn: () =>
      fetchCustomers(tenantId, {
        per_page: '500',
        ...(branchId != null ? { branch_id: String(branchId) } : {}),
      }),
    enabled: !!tenantId,
  })
  const customersList: Customer[] = customersData?.data ?? []

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts-flat', tenantId],
    queryFn: () => fetchAccounts(tenantId, { active_only: '1' }),
    enabled: !!tenantId && showAddCustomerModal,
  })

  const { data: customerGroups = [] } = useQuery<CustomerGroup[]>({
    queryKey: ['customer-groups', tenantId],
    queryFn: () => fetchCustomerGroups(tenantId),
    enabled: !!tenantId && showAddCustomerModal,
  })

  const { data: itemCategoriesData } = useQuery({
    queryKey: ['item-categories', tenantId],
    queryFn: () => fetchItemCategories(tenantId),
    enabled: !!tenantId,
  })
  const itemCategories: ItemCategory[] = Array.isArray(itemCategoriesData)
    ? itemCategoriesData
    : ((itemCategoriesData as unknown as { data?: ItemCategory[] })?.data ?? [])

  const { data: itemUnitsData } = useQuery({
    queryKey: ['item-units', tenantId],
    queryFn: () => fetchItemUnits(tenantId),
    enabled: !!tenantId && showAddItemModal,
  })
  const itemUnits: ItemUnit[] = Array.isArray(itemUnitsData) ? itemUnitsData : []

  const { data: itemBrandsData } = useQuery({
    queryKey: ['item-brands', tenantId],
    queryFn: () => fetchItemBrands(tenantId),
    enabled: !!tenantId && showAddItemModal,
  })
  const itemBrands: ItemBrand[] = Array.isArray(itemBrandsData)
    ? itemBrandsData
    : ((itemBrandsData as unknown as { data?: ItemBrand[] })?.data ?? [])

  useEffect(() => {
    if (!showAddItemModal || !newItemForm.category_id || !tenantId) return
    const catId = parseInt(newItemForm.category_id, 10)
    if (!catId) return
    fetchNextItemCode(tenantId, catId)
      .then((code) => setNewItemForm((f) => ({ ...f, code })))
      .catch(() => {})
  }, [showAddItemModal, tenantId, newItemForm.category_id])

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customersList.slice(0, 50)
    return customersList.filter((c) => {
      const name = (c.name ?? '').toLowerCase()
      const phone = String(c.phone ?? '')
      return name.includes(q) || phone.includes(customerSearch.trim())
    }).slice(0, 50)
  }, [customersList, customerSearch])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const { data: itemsData } = useQuery({
    queryKey: ['posItems', tenantId, search],
    queryFn: () => fetchPosItems(tenantId, { q: search, per_page: 200, pos_kind: 'restaurant' }),
    enabled: !!tenantId,
  })
  const allPosItems: PosItem[] = itemsData?.data ?? []

  const categories = useMemo(
    () => itemCategories.filter((c) => (c.show_in_restaurant_pos ?? true) && c.is_active !== false),
    [itemCategories],
  )

  const selectedTable = useMemo(() => tables?.find((t) => t.id === selectedTableId) ?? null, [tables, selectedTableId])

  const tableStripItems = useMemo(() => {
    const list = tables ?? []
    return [...list]
      .sort(
        (a, b) =>
          (a.sort_order ?? 999) - (b.sort_order ?? 999) || (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }),
      )
      .map((tbl) => {
        const openOrder = openOrders.find((o) => o.table_id === tbl.id)
        const isCurrent = selectedTableId === tbl.id
        let status: 'free' | 'occupied' | 'current' = 'free'
        if (isCurrent) status = 'current'
        else if (tbl.status === 'occupied' || openOrder) status = 'occupied'
        return {
          id: tbl.id,
          label: tbl.name,
          status,
          orderTotal: openOrder ? roundMoney(Number(openOrder.total) || 0) : undefined,
        }
      })
  }, [tables, openOrders, selectedTableId])

  const tablesBySection = useMemo(() => {
    let list = tables ?? []
    if (tableModalTab !== 'all') {
      const sec = sectionsList.find((s) => String(s.id) === tableModalTab)
      if (sec) {
        const sectionName = getLocalizedName(sec, lang).trim()
        const sectionNameAr = (sec.name ?? '').trim()
        const sectionNameEn = ((sec.name_en || sec.name) ?? '').trim()
        list = list.filter((t) => {
          const tSec = (t.section ?? '').trim()
          return tSec === sectionName || tSec === sectionNameAr || tSec === sectionNameEn
        })
      }
    }
    return [...list].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }))
  }, [tables, tableModalTab, sectionsList, lang])

  const posItems = useMemo(
    () =>
      allPosItems.filter((item) =>
        selectedCategoryId === 'all' || !item.category_id
          ? true
          : item.category_id === selectedCategoryId,
      ),
    [allPosItems, selectedCategoryId],
  )

  const getItemPrice = (i: PosItem) => {
    const raw = (i as any).sellingPrice ?? i.selling_price ?? (i as any).price ?? 0
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? roundMoney(n) : 0
  }

  const addItemToCart = (item: PosItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id)
      if (existing) {
        return prev.map((l) =>
          l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l,
        )
      }
      const unitPrice = getItemPrice(item)
      return [
        ...prev,
        {
          item,
          quantity: 1,
          unit_price: unitPrice,
          discount_type: 'amount' as const,
          discount_value: 0,
          tax_percent: item.type === 'service' ? 0 : (item as any).default_tax_percent ?? 0,
          kitchen_note: '',
        },
      ]
    })
  }

  const updateLine = (itemId: number, patch: Partial<CartLine>) => {
    setCart((prev) =>
      prev.map((l) =>
        l.item.id === itemId ? { ...l, ...patch } : l,
      ),
    )
  }

  useEffect(() => {
    setCart((prev) => {
      const needsFix = prev.some((l) => l.unit_price === 0 && getItemPrice(l.item) > 0)
      if (!needsFix) return prev
      return prev.map((l) => {
        if (l.unit_price === 0) {
          const fromItem = getItemPrice(l.item)
          if (fromItem > 0) return { ...l, unit_price: fromItem }
        }
        return l
      })
    })
  }, [cart])

  const updateQuantity = (itemId: number, qty: number) => {
    updateLine(itemId, { quantity: qty > 0 ? qty : 1 })
  }

  const removeLine = (itemId: number) => {
    setCart((prev) => prev.filter((l) => l.item.id !== itemId))
  }

  const totals = useMemo(() => {
    let subtotal = 0
    let tax = 0
    cart.forEach((l) => {
      const lineTotalBeforeDiscount = l.quantity * l.unit_price
      const discountAmount =
        l.discount_type === 'amount'
          ? Math.min(l.discount_value, lineTotalBeforeDiscount)
          : lineTotalBeforeDiscount * (Math.min(100, Math.max(0, l.discount_value)) / 100)
      const base = Math.max(0, lineTotalBeforeDiscount - discountAmount)
      const lineTax = base * (l.tax_percent / 100)
      subtotal += base
      tax += lineTax
    })
    return { subtotal, tax, total: subtotal + tax }
  }, [cart])

  const sendOrderMut = useMutation({
    mutationFn: async () => {
      if (!branchId || !warehouseId || cart.length === 0) return
      const payload = {
        branch_id: branchId,
        warehouse_id: warehouseId,
        customer_id: selectedCustomer?.id ?? null,
        table_id: orderType === 'dine_in' ? selectedTableId : null,
        order_type: orderType,
        date: new Date().toISOString().slice(0, 10),
        lines: cart.map((l) => {
          const lineTotalBeforeDiscount = l.quantity * l.unit_price
          const discountPercent =
            lineTotalBeforeDiscount <= 0
              ? 0
              : l.discount_type === 'percent'
                ? Math.min(100, Math.max(0, l.discount_value))
                : (Math.min(l.discount_value, lineTotalBeforeDiscount) / lineTotalBeforeDiscount) * 100
          return {
            item_id: l.item.id,
            quantity: l.quantity,
            unit_price: l.unit_price,
            discount_percent: roundMoney(discountPercent),
            tax_percent: l.tax_percent,
            description: getLocalizedName(l.item, lang),
            kitchen_note: (l.kitchen_note ?? '').trim() || null,
          }
        }),
      }
      const res = await sendRestaurantOrder(tenantId, payload as any)
      queryClient.invalidateQueries({ queryKey: ['kitchenTickets', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['restaurantTables', tenantId, branchId] })
      return res
    },
  })

  const holdRestaurantMut = useMutation({
    mutationFn: async () => {
      if (!branchId || cart.length === 0) throw new Error('skip')
      const payload = {
        restaurant_pos: true,
        warehouse_id: warehouseId,
        table_id: selectedTableId,
        order_type: orderType,
        customer: selectedCustomer,
        lines: cart.map((l) => ({
          item_id: l.item.id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_type: l.discount_type,
          discount_value: l.discount_value,
          tax_percent: l.tax_percent,
          kitchen_note: (l.kitchen_note ?? '').trim(),
        })),
      }
      return holdPosCart(tenantId, { branch_id: branchId, payload })
    },
    onSuccess: () => {
      setCart([])
      setKitchenNoteOpenItemId(null)
      setToast({ message: lang === 'ar' ? 'تم تعليق السلة' : 'Cart held', type: 'success' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setToast({
        message: typeof msg === 'string' ? msg : lang === 'ar' ? 'تعذّر تعليق السلة' : 'Could not hold cart',
        type: 'error',
      })
    },
  })

  const switchRestaurantTable = async (tableId: number) => {
    if (tableId === selectedTableId) return
    if (cart.length > 0 && branchId) {
      try {
        await holdRestaurantMut.mutateAsync()
      } catch {
        return
      }
    }
    setSelectedTableId(tableId)
  }

  const openShiftMut = useMutation({
    mutationFn: (cash: number) => openPosShift(tenantId, { branch_id: branchId!, opening_cash: cash }),
    onSuccess: () => {
      refetchShift()
      queryClient.invalidateQueries({ queryKey: ['pos-shifts-report'] })
      queryClient.invalidateQueries({ queryKey: ['pos-shifts-report-cashiers'] })
      setShowOpenShift(false)
      setOpeningCash('0')
      setToast({ message: lang === 'ar' ? 'تم فتح الوردية' : 'Shift opened', type: 'success' })
    },
    onError: (err: any) => {
      setToast({ message: err?.response?.data?.message ?? (lang === 'ar' ? 'فشل فتح الوردية' : 'Failed to open shift'), type: 'error' })
    },
  })

  const closeShiftMut = useMutation({
    mutationFn: (cash: number) => closePosShift(tenantId, { branch_id: branchId!, closing_cash: cash }),
    onSuccess: (data) => {
      setShowCloseShift(false)
      setClosingCash('')
      setLastZReport(data.z_report)
      setLastShiftInfo({ branchName: (data.shift as PosShiftInfo & { branch?: { name?: string } })?.branch?.name, userName: (data.shift as PosShiftInfo & { user?: { name?: string } })?.user?.name })
      setShowZReportPrint(true)
      refetchShift()
      queryClient.invalidateQueries({ queryKey: ['pos-shifts-report'] })
      queryClient.invalidateQueries({ queryKey: ['pos-shifts-report-cashiers'] })
      const diff = Number((data.z_report as PosZReport).difference ?? 0)
      setToast({ message: lang === 'ar' ? `تم إغلاق الوردية. الفرق: ${formatAmount(diff, { decimal_places: amountDecimals }, locale)}` : `Shift closed. Difference: ${formatAmount(diff, { decimal_places: amountDecimals }, locale)}`, type: 'success' })
    },
    onError: (err: any) => {
      setToast({ message: err?.response?.data?.message ?? (lang === 'ar' ? 'فشل إغلاق الوردية' : 'Failed to close shift'), type: 'error' })
    },
  })

  const cancelOrderMut = useMutation({
    mutationFn: async (orderId: number) => {
      await cancelRestaurantOrderByOrderId(tenantId, orderId)
      queryClient.invalidateQueries({ queryKey: ['restaurantOpenOrders', tenantId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['kitchenTickets', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['restaurantTables', tenantId, branchId] })
    },
    onSuccess: () => {
      setShowCancelOrderConfirm(false)
      setShowPayModal(false)
      setPendingCancelOrderId(null)
      setCart([])
      setOrderToPay(null)
      setToast({ message: lang === 'ar' ? 'تم إلغاء الطلب وإزالته من المطبخ والطلبات المفتوحة' : 'Order cancelled and removed from kitchen and open orders', type: 'success' })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? err?.message ?? (lang === 'ar' ? 'فشل إلغاء الطلب' : 'Failed to cancel order')
      setToast({ message: typeof msg === 'string' ? msg : (lang === 'ar' ? 'حدث خطأ' : 'An error occurred'), type: 'error' })
    },
  })

  const checkoutMut = useMutation({
    mutationFn: async (
      args:
        | { orderId: number; amount: number; paymentMethodId: number | null; delivery_driver_id?: number | null }
        | { orderId: number; payments: { payment_method_id: number; amount: number }[]; delivery_driver_id?: number | null },
    ) => {
      const date = new Date().toISOString().slice(0, 10)
      const notes = lang === 'ar' ? 'دفع من نقطة بيع المطعم' : 'Restaurant POS payment'
      const base = {
        date,
        notes,
        shift_id: currentShift?.id ?? undefined,
        ...(loyaltyProgramId != null ? { loyalty_program_id: loyaltyProgramId } : {}),
        ...(loyaltyRedeemPoints > 0 ? { redeem_points: loyaltyRedeemPoints } : {}),
        ...('delivery_driver_id' in args && args.delivery_driver_id ? { delivery_driver_id: args.delivery_driver_id } : {}),
      }
      let res: Awaited<ReturnType<typeof checkoutRestaurantOrder>>
      if ('payments' in args && args.payments.length > 0) {
        const payments = args.payments.map((p) => ({
          payment_method_id: p.payment_method_id,
          amount: roundMoney(p.amount),
        }))
        const sum = roundMoney(payments.reduce((s, p) => s + p.amount, 0))
        if (sum <= 0) throw new Error(lang === 'ar' ? 'أدخل مبالغ الدفع' : 'Enter payment amounts')
        res = await checkoutRestaurantOrder(tenantId, args.orderId, { ...base, payments })
      } else {
        const { orderId, amount, paymentMethodId: methodId } = args as {
          orderId: number
          amount: number
          paymentMethodId: number | null
          delivery_driver_id?: number | null
        }
        const paid = roundMoney(amount)
        if (paid <= 0) throw new Error(lang === 'ar' ? 'أدخل مبلغ الدفع' : 'Enter payment amount')
        res = await checkoutRestaurantOrder(tenantId, orderId, {
          ...base,
          amount: paid,
          payment_method_id: methodId ?? undefined,
        })
      }
      queryClient.invalidateQueries({ queryKey: ['invoices', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['restaurantTables', tenantId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['restaurantOpenOrders', tenantId, branchId] })
      return res
    },
    onSuccess: (data) => {
      setShowPayModal(false)
      setOrderToPay(null)
      setCheckoutDriverId(null)
      setPaymentMethodId(null)
      setPayModalAmount(0)
      setSplitPayMode(false)
      setSplitLines([])
      setSplitMethodId(null)
      setSplitCurrentAmount(0)
      setLoyaltyRedeemPoints(0)
      setLoyaltyRedeemDiscount(0)
      setLoyaltyProgramId(null)
      setToast({
        message: lang === 'ar' ? 'تم التحصيل وترحيل الفاتورة' : 'Payment completed and invoice posted',
        type: 'success',
      })
      if (data?.invoice) {
        const inv = data.invoice as {
          id: number
          number?: string
          total?: number
          amount_paid?: number
          customer?: { name?: string; phone?: string | null }
        }
        const tot = Number(inv.total ?? 0)
        const ap = Number(inv.amount_paid ?? 0)
        setLastCheckoutInfo({
          invoiceId: inv.id,
          invoiceNumber: String(inv.number ?? inv.id),
          total: tot,
          customerName: inv.customer?.name ?? selectedCustomer?.name ?? '',
          customerPhone: inv.customer?.phone ?? selectedCustomer?.phone ?? null,
          changeDue: Math.max(0, roundMoney(ap - tot)),
        })
      }
      setTimeout(() => {
        if (data.invoice?.id) {
          openInvoiceViewForPrint(
            data.invoice.id,
            posPrintOptionsFromSettings(settings as Record<string, unknown>),
          )
        }
      }, 300)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? err?.message ?? (lang === 'ar' ? 'فشل إتمام الدفع' : 'Payment failed')
      setToast({ message: typeof msg === 'string' ? msg : (lang === 'ar' ? 'حدث خطأ' : 'An error occurred'), type: 'error' })
    },
  })

  const createCustomerMut = useMutation({
    mutationFn: (d: Partial<Customer>) => createCustomer(tenantId, d),
    onSuccess: (newCustomer) => {
      setSelectedCustomer({
        id: newCustomer.id,
        name: newCustomer.name,
        phone: newCustomer.phone ?? null,
        loyaltyPoints: (newCustomer as { loyalty_points?: number }).loyalty_points,
      })
      setCustomerSearch('')
      setCustomerDropdownOpen(false)
      setShowAddCustomerModal(false)
      setNewCustomerForm(emptyCustomerForm)
      queryClient.invalidateQueries({ queryKey: ['customers', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })

  function closeAddCustomerModal() {
    setShowAddCustomerModal(false)
    setNewCustomerForm(emptyCustomerForm)
  }

  function handleAddCustomerSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: Record<string, unknown> = {
      name: newCustomerForm.name,
      name_en: newCustomerForm.name_en || null,
      code: newCustomerForm.code || null,
      email: newCustomerForm.email || null,
      phone: newCustomerForm.phone || null,
      tax_number: newCustomerForm.tax_number || null,
      address: newCustomerForm.address || null,
      customer_group_id: newCustomerForm.customer_group_id ? Number(newCustomerForm.customer_group_id) : null,
    }
    if (newCustomerForm.auto_create_account) {
      (payload as Record<string, unknown>).auto_create_account = true
    } else {
      const rawId = newCustomerForm.account_id
      ;(payload as Record<string, unknown>).account_id = rawId ? (parseInt as (s: string, radix: number) => number)(rawId, 10) : null
      ;(payload as Record<string, unknown>).auto_create_account = false
    }
    createCustomerMut.mutate(payload as Partial<Customer>)
  }

  const createItemMut = useMutation({
    mutationFn: ({ data: d, image: img }: { data: Record<string, unknown>; image?: File | null }) =>
      createItem(tenantId, d as Partial<Item>, img),
    onSuccess: () => {
      setShowAddItemConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['posItems', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['items', tenantId] })
      setShowAddItemModal(false)
      setNewItemForm(newItemFormInitial)
      setNewItemImageFile(null)
      setAddItemTab('basic')
    },
  })

  function closeAddItemModal() {
    setShowAddItemModal(false)
    setNewItemForm(newItemFormInitial)
    setNewItemImageFile(null)
    setAddItemTab('basic')
    setShowAddItemConfirm(false)
  }

  const handleSaveAndSend = async () => {
    if (!branchId || !warehouseId) {
      setToast({ message: lang === 'ar' ? 'يرجى اختيار الفرع والمخزن أولاً' : 'Please select Branch and Warehouse first', type: 'error' })
      return
    }
    if (cart.length === 0) {
      setToast({ message: lang === 'ar' ? 'السلة فارغة' : 'Cart is empty', type: 'error' })
      return
    }
    if (orderType === 'dine_in' && !selectedTableId) {
      setToast({ message: lang === 'ar' ? 'اختر طاولة أولاً' : 'Select a table first', type: 'error' })
      return
    }
    try {
      await sendOrderMut.mutateAsync()
      setCart([])
      setEditingInvoiceId(null)
      setOrderToPay(null)
      setToast({ message: lang === 'ar' ? 'تم إرسال الطلب للمطبخ. سيظهر في الطلبات المفتوحة بعد «تم التجهيز» من شاشة المطبخ.' : 'Order sent to kitchen. It will appear in Open orders after «Ready» from kitchen.', type: 'success' })
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? (lang === 'ar' ? 'حدث خطأ' : 'An error occurred')
      setToast({ message: typeof msg === 'string' ? msg : (lang === 'ar' ? 'حدث خطأ' : 'An error occurred'), type: 'error' })
    }
  }

  function invoiceLinesToCart(invoice: Invoice): CartLine[] {
    const lines = invoice.lines ?? []
    return lines.map((line: InvoiceLine) => {
      const itemFromPos = allPosItems.find((i) => i.id === line.item_id)
      const item = itemFromPos ?? (line.item ? { id: line.item_id!, name: (line as any).item?.name ?? line.description, name_en: (line as any).item?.name_en ?? null, selling_price: line.unit_price, code: '', category_id: null } as PosItem : null)
      if (!item) return null
      return {
        item: item as PosItem,
        quantity: line.quantity,
        unit_price: line.unit_price,
        discount_type: 'percent' as const,
        discount_value: line.discount_percent ?? 0,
        tax_percent: line.tax_percent ?? 0,
        kitchen_note: (line as { kitchen_note?: string | null }).kitchen_note ?? '',
      }
    }).filter(Boolean) as CartLine[]
  }

  const handleTableActionCollect = async () => {
    if (!tableActionTarget) return
    if (branchId && !currentShift) {
      setToast({ message: lang === 'ar' ? 'يجب فتح وردية قبل التحصيل' : 'Open a shift before collecting', type: 'error' })
      return
    }
    const tableId = tableActionTarget.tableId
    try {
      const order = await fetchRestaurantOpenOrderByTable(tenantId, tableId, branchId ? { branch_id: branchId } : undefined)
      if (!order || typeof order.id === 'undefined') {
        setToast({ message: lang === 'ar' ? 'لا يوجد طلب جاهز لهذه الطاولة' : 'No ready order for this table', type: 'error' })
        setTableActionTarget(null)
        return
      }
      setOrderToPay(order)
      setCheckoutDriverId(null)
      primeRestaurantPayModal(order)
      setShowTableModal(false)
      setTableActionTarget(null)
      setTimeout(() => {
        setShowPayModal(true)
        setTimeout(() => payModalInputRef.current?.focus(), 100)
      }, 0)
    } catch {
      setToast({ message: lang === 'ar' ? 'فشل تحميل الطلب. تحقق من وجود طلب جاهز للطاولة.' : 'Failed to load order. Check that the table has a ready order.', type: 'error' })
      setTableActionTarget(null)
      const tbl = tables?.find((t) => t.id === tableId)
      if (tbl) {
        try {
          await saveRestaurantTable(tenantId, { ...tbl, status: 'available' })
          queryClient.invalidateQueries({ queryKey: ['restaurantTables', tenantId, branchId] })
          queryClient.invalidateQueries({ queryKey: ['restaurantOpenOrders', tenantId, branchId] })
        } catch {
          // ignore
        }
      }
    }
  }

  const handleTableActionAddItems = async () => {
    if (!tableActionTarget) return
    try {
      const order = await fetchRestaurantOpenOrderByTable(tenantId, tableActionTarget.tableId, branchId ? { branch_id: branchId } : undefined)
      if (!order || typeof order.id === 'undefined') {
        setToast({ message: lang === 'ar' ? 'لا يوجد طلب جاهز لهذه الطاولة' : 'No ready order for this table', type: 'error' })
        setTableActionTarget(null)
        return
      }
      const newCart = orderLinesToCart(order)
      setCart(newCart)
      setSelectedTableId(tableActionTarget.tableId)
      setOrderType('dine_in')
      setShowTableModal(false)
      setTableActionTarget(null)
      setShowOpenOrdersPanel(false)
      setToast({ message: lang === 'ar' ? 'تم تحميل الطلب. للدفع اختر «تحصيل» من الطاولة أو من الطلبات المفتوحة.' : 'Order loaded. To pay, choose Collect from table or Open orders.', type: 'success' })
    } catch {
      const tbl = tables?.find((t) => t.id === tableActionTarget.tableId)
      if (tbl) {
        try {
          await saveRestaurantTable(tenantId, { ...tbl, status: 'available' })
          queryClient.invalidateQueries({ queryKey: ['restaurantTables', tenantId, branchId] })
          queryClient.invalidateQueries({ queryKey: ['restaurantOpenOrders', tenantId, branchId] })
          setToast({ message: lang === 'ar' ? 'لا يوجد طلب. تم تحرير الطاولة.' : 'No order. Table freed.', type: 'success' })
        } catch {
          setToast({ message: lang === 'ar' ? 'لا يوجد طلب جاهز لهذه الطاولة' : 'No ready order for this table', type: 'error' })
        }
      } else {
        setToast({ message: lang === 'ar' ? 'لا يوجد طلب جاهز لهذه الطاولة' : 'No ready order for this table', type: 'error' })
      }
      setTableActionTarget(null)
    }
  }

  const orderLinesToCart = (order: RestaurantOrder): CartLine[] => {
    const orderLines = order.lines ?? []
    return orderLines.map((line) => {
      const itemFromPos = allPosItems.find((i) => i.id === line.item_id)
      const item = itemFromPos ?? (line.item ? { id: line.item_id, name: line.item?.name ?? line.description ?? '', name_en: line.item?.name_en ?? null, selling_price: line.unit_price, code: '', category_id: null } as PosItem : null)
      if (!item) return null
      return {
        item: item as PosItem,
        quantity: line.quantity,
        unit_price: line.unit_price,
        discount_type: 'percent' as const,
        discount_value: 0,
        tax_percent: 0,
        kitchen_note: (line as { kitchen_note?: string | null }).kitchen_note ?? '',
      }
    }).filter(Boolean) as CartLine[]
  }

  const handleOpenOrderLoad = (order: RestaurantOrder) => {
    setCart(orderLinesToCart(order))
    setSelectedTableId(order.table_id ?? null)
    setOrderType(order.order_type === 'takeaway' ? 'takeaway' : order.order_type === 'delivery' ? 'delivery' : 'dine_in')
    setShowOpenOrdersPanel(false)
    setToast({ message: lang === 'ar' ? 'تم تحميل الطلب' : 'Order loaded', type: 'success' })
  }

  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)

  const lineBaseTotal = (l: CartLine) => {
    const before = l.quantity * l.unit_price
    const discount =
      l.discount_type === 'amount'
        ? Math.min(l.discount_value, before)
        : before * (Math.min(100, Math.max(0, l.discount_value)) / 100)
    return Math.max(0, before - discount)
  }

  const payTotalBase = orderToPay ? roundMoney(Number(orderToPay.total) || 0) : 0
  const payTotal = roundMoney(Math.max(0, payTotalBase - (loyaltyRedeemDiscount || 0)))
  const payRemaining = roundMoney(Math.max(0, payTotal - payModalAmount))
  const deliveryDriverBlocksSplit =
    orderToPay?.order_type === 'delivery' && checkoutDriverId != null && checkoutDriverId > 0
  const splitPaySum = useMemo(
    () => roundMoney(splitLines.reduce((s, p) => s + p.amount, 0)),
    [splitLines],
  )
  const splitChangeDue = useMemo(() => Math.max(0, roundMoney(splitPaySum - payTotal)), [splitPaySum, payTotal])
  const splitPayReady = splitLines.length > 0 && splitPaySum + 0.0005 >= payTotal

  const primeRestaurantPayModal = useCallback(
    (order: RestaurantOrder) => {
      const total = roundMoney(Math.max(0, (Number(order.total) || 0) - (loyaltyRedeemDiscount || 0)))
      setPayModalAmount(total)
      setSplitLines([])
      setSplitPayMode(true)
      const cashId = pickPaymentMethodId(paymentMethods, 'cash')
      const mid = preferredPaymentMethodId ?? cashId ?? paymentMethods.find((m) => m.is_active)?.id ?? null
      setSplitMethodId(mid)
      setPaymentMethodId(mid)
      setSplitCurrentAmount(total)
    },
    [paymentMethods, preferredPaymentMethodId, loyaltyRedeemDiscount],
  )

  const handleOpenOrderCollect = (order: RestaurantOrder) => {
    if (!currentShift) {
      setToast({ message: lang === 'ar' ? 'يجب فتح وردية قبل التحصيل' : 'Open a shift before collecting', type: 'error' })
      return
    }
    setOrderToPay(order)
    setCheckoutDriverId(null)
    setLoyaltyRedeemPoints(0)
    setLoyaltyRedeemDiscount(0)
    setLoyaltyProgramId(null)
    primeRestaurantPayModal(order)
    setShowOpenOrdersPanel(false)
    setTimeout(() => setShowPayModal(true), 0)
  }

  const payModalDriverBlockRef = useRef(false)
  useEffect(() => {
    if (!showPayModal) {
      payModalDriverBlockRef.current = false
      return
    }
    if (!orderToPay || orderToPay.order_type !== 'delivery') return
    const block = checkoutDriverId != null && checkoutDriverId > 0
    if (block) {
      setSplitPayMode(false)
      setSplitLines([])
      setSplitCurrentAmount(0)
        setPayModalAmount(roundMoney(Math.max(0, (Number(orderToPay.total) || 0) - (loyaltyRedeemDiscount || 0))))
      payModalDriverBlockRef.current = true
      return
    }
    if (payModalDriverBlockRef.current) {
      setSplitPayMode(true)
      setSplitLines([])
        const total = roundMoney(Math.max(0, (Number(orderToPay.total) || 0) - (loyaltyRedeemDiscount || 0)))
      setSplitCurrentAmount(total)
      const cashId = pickPaymentMethodId(paymentMethods, 'cash')
      const mid = preferredPaymentMethodId ?? cashId ?? paymentMethods.find((m) => m.is_active)?.id ?? null
      setSplitMethodId(mid)
      setPaymentMethodId(mid)
      payModalDriverBlockRef.current = false
    }
    }, [checkoutDriverId, showPayModal, orderToPay, paymentMethods, preferredPaymentMethodId, loyaltyRedeemDiscount])

  const handleOpenPayModal = () => {
    if (!orderToPay) return
    setCheckoutDriverId(null)
    setLoyaltyRedeemPoints(0)
    setLoyaltyRedeemDiscount(0)
    setLoyaltyProgramId(null)
    primeRestaurantPayModal(orderToPay)
    setShowPayModal(true)
    setTimeout(() => payModalInputRef.current?.focus(), 100)
  }

  const handleConfirmPay = () => {
    if (!orderToPay) return
    const driverExtra =
      orderToPay.order_type === 'delivery' && checkoutDriverId ? { delivery_driver_id: checkoutDriverId } : {}
    if (splitPayMode && !deliveryDriverBlocksSplit) {
      if (splitLines.length === 0) {
        setToast({
          message: lang === 'ar' ? 'أضف دفعة واحدة على الأقل' : 'Add at least one payment line',
          type: 'error',
        })
        return
      }
      if (splitPaySum + 0.0005 < payTotal) {
        setToast({
          message: lang === 'ar' ? 'مجموع الدفعات أقل من إجمالي الطلب' : 'Total payments are less than the order total',
          type: 'error',
        })
        return
      }
      checkoutMut.mutate({
        orderId: orderToPay.id,
        payments: splitLines.map((l) => ({ payment_method_id: l.method.id, amount: roundMoney(l.amount) })),
        ...(loyaltyRedeemPoints > 0 ? { redeem_points: loyaltyRedeemPoints } : {}),
        ...driverExtra,
      })
      return
    }
    if (payModalAmount < payTotal) {
      setToast({ message: lang === 'ar' ? 'المبلغ المدفوع أقل من الإجمالي' : 'Amount paid is less than total', type: 'error' })
      return
    }
    if (!paymentMethodId && paymentMethods.length > 0) {
      setToast({ message: lang === 'ar' ? 'اختر طريقة الدفع' : 'Select a payment method', type: 'error' })
      return
    }
    checkoutMut.mutate({
      orderId: orderToPay.id,
      amount: payModalAmount,
      paymentMethodId,
      ...(loyaltyRedeemPoints > 0 ? { redeem_points: loyaltyRedeemPoints } : {}),
      ...driverExtra,
    })
  }

  useEffect(() => {
    if (!showPayModal) return
    if (splitPayMode && !deliveryDriverBlocksSplit) return
    payModalInputRef.current?.focus()
  }, [showPayModal, splitPayMode, deliveryDriverBlocksSplit])

  const handleConfirmPayRef = useRef(handleConfirmPay)
  handleConfirmPayRef.current = handleConfirmPay
  const handleOpenPayModalRef = useRef(handleOpenPayModal)
  handleOpenPayModalRef.current = handleOpenPayModal
  const handleSaveAndSendRef = useRef(handleSaveAndSend)
  handleSaveAndSendRef.current = handleSaveAndSend
  const applyQuickPaymentRef = useRef(applyQuickPayment)
  applyQuickPaymentRef.current = applyQuickPayment

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement).closest('input, select, textarea')

      if (e.key === 'F8') {
        if (inField) return
        e.preventDefault()
        if (showPayModal) {
          handleConfirmPayRef.current()
          return
        }
        if (orderToPay) {
          handleOpenPayModalRef.current()
          return
        }
        if (cart.length > 0 && branchId && warehouseId) {
          void handleSaveAndSendRef.current()
        }
        return
      }

      if (inField) return

      if (e.key === 'F4') {
        e.preventDefault()
        if (orderToPay) setShowCancelOrderConfirm(true)
        else {
          setCart([])
          setOrderToPay(null)
        }
        return
      }
      if (e.key === 'F7') {
        e.preventDefault()
        if (cart.length > 0 && branchId && !holdRestaurantMut.isPending) {
          holdRestaurantMut.mutate()
        }
        return
      }
      if (e.key === 'F5') {
        e.preventDefault()
        applyQuickPaymentRef.current('cash')
        return
      }
      if (e.key === 'F6') {
        e.preventDefault()
        applyQuickPaymentRef.current('bank')
        return
      }
      if (e.key === 'F9') {
        e.preventDefault()
        applyQuickPaymentRef.current('credit')
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showPayModal, orderToPay, cart.length, branchId, warehouseId, holdRestaurantMut])

  if (!tenantId) {
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <div className="p-6 text-amber-600">{lang === 'ar' ? 'يرجى اختيار الشركة أولاً' : 'Please select a company first'}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {/* Header: الفرع/المخزن/الطاولة/الوردية/تقرير X/إغلاق */}
      <div
        className="no-print bg-primary-600 text-white shadow-sm min-h-[64px] py-3 w-full flex items-center"
        dir="ltr"
        style={{ paddingLeft: 20, paddingRight: 20, justifyContent: 'space-between' }}
      >
        <button
          type="button"
          onClick={() => setShowOpenOrdersPanel((v) => !v)}
          className={`flex items-center gap-2 h-8 px-3 rounded-lg text-[13px] font-medium transition-colors ${showOpenOrdersPanel ? 'bg-white/20 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
          title={lang === 'ar' ? 'الطلبات المفتوحة' : 'Open orders'}
        >
          <ClipboardList size={18} />
          <span className="hidden sm:inline">{lang === 'ar' ? 'الطلبات المفتوحة' : 'Open orders'}</span>
          {openOrders.length > 0 && <span className="bg-white/30 rounded-full px-1.5 text-xs font-bold">{openOrders.length}</span>}
        </button>
        {branchId && (
          currentShift ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-200 whitespace-nowrap">{lang === 'ar' ? 'وردية مفتوحة' : 'Shift open'}</span>
              <button type="button" onClick={async () => { const res = await fetchPosXReport(tenantId, branchId!); setXReportData(res.report ?? null); setShowXReport(true) }} className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-white/40 bg-white/15 text-[11px] font-medium text-white hover:bg-white/25">
                <FileText size={14} />
                {lang === 'ar' ? 'تقرير X' : 'X Report'}
              </button>
              <button type="button" onClick={() => { setClosingCash(''); setShowCloseShift(true) }} className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-red-500 bg-red-500/85 text-[11px] font-medium text-white hover:bg-red-500">
                <Lock size={14} />
                {lang === 'ar' ? 'إغلاق الوردية' : 'Close shift'}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setShowOpenShift(true)} className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-amber-400 bg-amber-300 text-[11px] font-medium text-amber-900 hover:bg-amber-400 hover:text-white">
              <Play size={14} />
              {lang === 'ar' ? 'فتح وردية' : 'Open shift'}
            </button>
          )
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[13px] opacity-90 whitespace-nowrap">{t.invoices?.branch ?? (lang === 'ar' ? 'الفرع' : 'Branch')}</span>
            <select
              value={branchId ?? ''}
              onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : null)}
              className="h-7 min-w-[100px] max-w-[120px] rounded border border-white/60 bg-white text-[13px] text-slate-800 px-1.5"
            >
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[13px] opacity-90 whitespace-nowrap">{t.invoices?.warehouse ?? (lang === 'ar' ? 'المخزن' : 'Warehouse')}</span>
            <select
              value={warehouseId ?? ''}
              onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : null)}
              className="h-7 min-w-[90px] max-w-[110px] rounded border border-white/60 bg-white text-[13px] text-slate-800 px-1.5"
            >
              <option value="">—</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => { setShowTableModal(true); setTableModalTab('all'); queryClient.invalidateQueries({ queryKey: ['restaurantTables', tenantId, branchId] }) }}
            className="flex items-center gap-2 h-8 min-w-[120px] max-w-[180px] rounded-lg border border-white/60 bg-white/95 hover:bg-white text-[13px] text-slate-800 px-2.5 font-medium transition-colors"
            title={lang === 'ar' ? 'اختيار طاولة' : 'Select table'}
          >
            <Square size={16} className="flex-shrink-0 text-primary-600" />
            <span className="truncate">{selectedTable ? selectedTable.name : (lang === 'ar' ? 'اختيار طاولة' : 'Select table')}</span>
          </button>
          <div className="flex items-center gap-0.5 rounded-full bg-primary-700/60 px-1 py-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setOrderType('dine_in')}
              className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-medium transition-colors ${
                orderType === 'dine_in' ? 'bg-white text-primary-700 shadow-sm' : 'text-primary-100'
              }`}
            >
              <Utensils size={12} />
              {t.restaurant?.dineIn ?? (lang === 'ar' ? 'محلي' : 'Dine in')}
            </button>
            <button
              type="button"
              onClick={() => setOrderType('takeaway')}
              className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-medium transition-colors ${
                orderType === 'takeaway' ? 'bg-white text-primary-700 shadow-sm' : 'text-primary-100'
              }`}
            >
              <ShoppingCart size={12} />
              {t.restaurant?.takeaway ?? (lang === 'ar' ? 'سفري' : 'Takeaway')}
            </button>
            <button
              type="button"
              onClick={() => setOrderType('delivery')}
              className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-medium transition-colors ${
                orderType === 'delivery' ? 'bg-white text-primary-700 shadow-sm' : 'text-primary-100'
              }`}
            >
              <Truck size={12} />
              {t.restaurant?.delivery ?? (lang === 'ar' ? 'توصيل' : 'Delivery')}
            </button>
          </div>
          </div>
        </div>

      {/* لوحة الطلبات المفتوحة — قائمة جانبية */}
      {showOpenOrdersPanel && (
        <div className={`fixed top-0 bottom-0 z-40 w-[320px] max-w-[90vw] bg-white shadow-xl border-slate-200 flex flex-col ${isRtl ? 'right-0 border-r' : 'left-0 border-l'}`} dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="flex items-center justify-between p-3 border-b border-slate-200">
            <h3 className="font-bold text-slate-800">{lang === 'ar' ? 'الطلبات المفتوحة' : 'Open orders'}</h3>
            <button type="button" onClick={() => setShowOpenOrdersPanel(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {openOrders.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-6">{lang === 'ar' ? 'لا توجد فواتير مفتوحة' : 'No open orders'}</p>
            ) : (
              <ul className="space-y-2">
                {openOrders.map((order) => {
                  const tableName = order.table?.name ?? (order.order_type === 'takeaway' ? (lang === 'ar' ? 'سفري' : 'Takeaway') : order.order_type === 'delivery' ? (lang === 'ar' ? 'توصيل' : 'Delivery') : (lang === 'ar' ? 'بدون طاولة' : 'No table'))
                  return (
                    <li key={order.id} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold text-slate-800">{tableName}</span>
                        <span className="text-sm font-medium text-primary-600" dir="ltr">{formatAmount(Number(order.total) || 0, { decimal_places: amountDecimals }, locale)}</span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button type="button" onClick={() => handleOpenOrderLoad(order)} className="flex-1 min-w-[70px] py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-500">
                          {lang === 'ar' ? 'فتح' : 'Open'}
                        </button>
                        <button type="button" onClick={() => handleOpenOrderCollect(order)} className="flex-1 min-w-[70px] py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500">
                          {lang === 'ar' ? 'تحصيل' : 'Collect'}
                        </button>
                        <button type="button" onClick={() => { setPendingCancelOrderId(order.id); setShowCancelOrderConfirm(true) }} className="py-2 px-3 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600">
                          {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
      {showOpenOrdersPanel && <div className="fixed inset-0 bg-black/30 z-30" onClick={() => setShowOpenOrdersPanel(false)} aria-hidden />}

      {/* نافذة اختيار الطاولة — عرض كامل، تبويبات أقسام، شبكة طاولات بحالات لونية */}
      {showTableModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4" onClick={() => setShowTableModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">{lang === 'ar' ? 'اختيار الطاولة' : 'Select table'}</h2>
              <button type="button" onClick={() => setShowTableModal(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="flex-shrink-0 flex gap-2 p-2 border-b border-slate-200 overflow-x-auto">
              <button
                type="button"
                onClick={() => setTableModalTab('all')}
                className={`px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all duration-200 ${tableModalTab === 'all' ? 'bg-primary-600 text-white shadow-md ring-2 ring-primary-700 ring-offset-2 ring-offset-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {lang === 'ar' ? 'الكل' : 'All'}
              </button>
              {sectionsList.map((sec) => {
                const sid = String(sec.id)
                const label = getLocalizedName(sec, lang)
                const isActive = tableModalTab === sid
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setTableModalTab(sid)}
                    className={`px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all duration-200 ${isActive ? 'bg-primary-600 text-white shadow-md ring-2 ring-primary-700 ring-offset-2 ring-offset-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <div className="flex-1 overflow-y-auto p-4 relative">
              <div key={tableModalTab} className="table-modal-content">
                <div className="grid gap-3 transition-all duration-200" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
                  <button
                    type="button"
                    onClick={() => { setSelectedTableId(null); setShowTableModal(false) }}
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed min-h-[90px] p-3 font-semibold text-sm transition-all bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200 hover:border-slate-400"
                  >
                    <Square size={28} className="mb-1 opacity-70" />
                    <span>{lang === 'ar' ? 'بدون طاولة' : 'No table'}</span>
                  </button>
                  {tablesBySection.map((tbl) => {
                    const status = tbl.status ?? 'available'
                    const isAvailable = status === 'available'
                    const isOccupied = status === 'occupied'
                    const isCleaning = status === 'cleaning'
                    const isSelected = selectedTableId === tbl.id
                    const bg = isAvailable ? 'bg-emerald-500' : isOccupied ? 'bg-red-500' : 'bg-amber-500'
                    const hover = isAvailable ? 'hover:ring-2 hover:ring-emerald-400 hover:brightness-110' : 'cursor-default opacity-95'
                    const selectedStyle = isSelected ? 'ring-4 ring-primary-700 ring-offset-2 ring-offset-white shadow-lg scale-105' : ''
                    return (
                      <button
                        key={tbl.id}
                        type="button"
                        onClick={() => {
                          if (isAvailable) {
                            setSelectedTableId(tbl.id)
                            setShowTableModal(false)
                          } else if (isOccupied) {
                            setTableActionTarget({ tableId: tbl.id, tableName: tbl.name })
                          } else {
                            setToast({ message: lang === 'ar' ? 'الطاولة قيد التنظيف' : 'Table is being cleaned', type: 'info' })
                          }
                        }}
                        className={`flex flex-col items-center justify-center rounded-xl border-2 min-h-[90px] p-3 text-white font-semibold text-sm transition-all ${isSelected ? 'border-primary-700 border-[3px]' : 'border-white'} shadow-md ${bg} ${hover} ${selectedStyle}`}
                      >
                        <Square size={28} className="mb-1 opacity-90" />
                        <span className="truncate w-full text-center">{tbl.name}</span>
                        {isSelected && <span className="text-[10px] opacity-95 mt-0.5 font-medium">{lang === 'ar' ? '✓ مختارة' : '✓ Selected'}</span>}
                        {!isAvailable && !isSelected && <span className="text-[10px] opacity-90 mt-0.5">{lang === 'ar' ? (isOccupied ? 'مشغولة' : 'تنظيف') : (isOccupied ? 'Occupied' : 'Cleaning')}</span>}
                      </button>
                    )
                  })}
                </div>
                {tablesBySection.length === 0 && (
                  <p className="text-center text-slate-500 py-8 mt-2">{lang === 'ar' ? 'لا توجد طاولات في هذا القسم' : 'No tables in this section'}</p>
                )}
              </div>
            </div>

            {/* نافذة خيارات الطاولة المشغولة: إضافة أصناف أو تحصيل */}
            {tableActionTarget && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-4 rounded-2xl" onClick={() => setTableActionTarget(null)}>
                <div className="bg-white rounded-xl shadow-xl p-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                  <p className="text-slate-700 font-semibold mb-3">{tableActionTarget.tableName} — {lang === 'ar' ? 'اختر إجراء' : 'Choose action'}</p>
                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={handleTableActionAddItems} className="w-full py-3 px-4 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-500">
                      {lang === 'ar' ? 'إضافة أصناف جديدة' : 'Add more items'}
                    </button>
                    <button type="button" onClick={handleTableActionCollect} className="w-full py-3 px-4 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500">
                      {lang === 'ar' ? 'تحصيل وإصدار فاتورة' : 'Collect & issue invoice'}
                    </button>
                    <button type="button" onClick={() => setTableActionTarget(null)} className="w-full py-2 text-slate-500 text-sm">
                      {t.cancel}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2-column: products (with categories below) | cart */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_40%] gap-0 overflow-hidden bg-slate-100" dir={isRtl ? 'rtl' : 'ltr'}>
        {/* Column 1: Products grid above, categories bar below (horizontal) */}
        <div className="flex flex-col min-h-0 overflow-hidden bg-slate-50/80 border-e border-slate-200">
          <div
            className="flex-1 overflow-y-auto p-1 grid gap-1 content-start min-h-0"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}
          >
            {posItems.map((item) => {
              const imgUrl = item.image_url || item.image || null
              const stock = getPosItemStock(item)
              const unitPrice = getItemPrice(item)
              const outOfStock = stock === 0 || unitPrice === 0
              const catName = item.category_name ?? ''
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => {
                    if (!outOfStock) addItemToCart(item)
                  }}
                  className={cn(
                    'relative flex flex-col rounded-lg border bg-white overflow-hidden transition-all aspect-square text-start',
                    outOfStock
                      ? 'cursor-not-allowed border-slate-200 opacity-60'
                      : 'border-slate-200 hover:border-primary-400 hover:shadow active:scale-95',
                  )}
                >
                  <span
                    className={cn(
                      'absolute end-1 top-1 z-[2] rounded px-1.5 py-0.5 text-[9px] font-bold shadow-sm',
                      outOfStock ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800',
                    )}
                  >
                    {outOfStock ? (lang === 'ar' ? 'نفد' : 'Out') : lang === 'ar' ? 'متاح' : 'OK'}
                  </span>
                  <div className="relative h-[72px] w-full shrink-0 bg-slate-50 flex items-center justify-center overflow-hidden border-b border-slate-100">
                    <span className="absolute inset-0 flex items-center justify-center text-3xl select-none" aria-hidden>
                      {getCategoryEmoji(catName)}
                    </span>
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt=""
                        className="relative z-[1] max-h-[72px] max-w-full object-contain"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.visibility = 'hidden'
                        }}
                      />
                    ) : null}
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center p-1 min-w-0">
                    <div className="text-[12px] font-semibold text-slate-800 line-clamp-2 leading-tight px-0.5 text-center">
                      {getLocalizedName(item, lang)}
                    </div>
                  </div>
                  <div className="bg-primary-600 text-white text-[12px] font-semibold py-1 px-1 text-center rounded-b-[7px]" dir="ltr">
                    {fmt(unitPrice)}
                  </div>
                </button>
              )
            })}
          </div>
          {/* فئات أصناف المطعم — أسفل الأصناف بالعرض (أيقونات وشريط أكبر + صورة الفئة) */}
          <div className="flex-shrink-0 flex flex-wrap items-center gap-3 p-3 border-t-2 border-slate-200 bg-white min-h-[88px]">
            <button
              type="button"
              onClick={() => setSelectedCategoryId('all')}
              className={`flex flex-col rounded-xl border-2 overflow-hidden transition-all active:scale-95 items-center justify-center gap-1 p-3 min-h-[72px] min-w-[100px] ${
                selectedCategoryId === 'all'
                  ? 'bg-primary-600 text-white border-primary-600 shadow-md'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-primary-400 hover:bg-slate-50'
              }`}
              title={lang === 'ar' ? 'الكل' : 'All'}
            >
              <LayoutGrid size={36} className="flex-shrink-0" />
              <span className="text-[13px] font-semibold truncate w-full text-center leading-tight">
                {lang === 'ar' ? 'الكل' : 'All'}
              </span>
            </button>
            {categories.map((cat) => {
              const catImageUrl = cat.image_url
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`flex flex-col rounded-xl border-2 overflow-hidden transition-all active:scale-95 items-center justify-center gap-1 p-3 min-h-[72px] min-w-[100px] ${
                    selectedCategoryId === cat.id
                      ? 'bg-primary-600 text-white border-primary-600 shadow-md'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-primary-400 hover:bg-slate-50'
                  }`}
                  title={cat.name || (lang === 'ar' ? 'تصنيف' : 'Category')}
                >
                  {catImageUrl ? (
                    <div className="relative w-12 h-12 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0">
                      <img src={catImageUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }} />
                      <div className="hidden absolute inset-0 flex items-center justify-center bg-slate-100"><Folder size={28} className="text-slate-400" /></div>
                    </div>
                  ) : (
                    <Folder size={36} className="flex-shrink-0" />
                  )}
                  <span className="text-[13px] font-semibold truncate w-full text-center leading-tight">
                    {cat.name || (lang === 'ar' ? 'تصنيف' : 'Category')}
                  </span>
                </button>
              )
            })}
          </div>
          {tableStripItems.length > 0 && (
            <div className="flex-shrink-0 border-t-2 border-slate-200 bg-white px-2 py-2">
              <p className="text-[10px] font-semibold text-slate-500 mb-1.5">{lang === 'ar' ? 'الطاولات' : 'Tables'}</p>
              <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5" dir={isRtl ? 'rtl' : 'ltr'}>
                {tableStripItems.map((tbl) => (
                  <button
                    key={tbl.id}
                    type="button"
                    onClick={() => void switchRestaurantTable(tbl.id)}
                    className={cn(
                      'min-w-[56px] shrink-0 rounded-lg border px-2 py-1.5 text-center transition-colors',
                      tbl.status === 'current' && 'border-primary-600 bg-primary-600 text-white shadow-sm',
                      tbl.status === 'occupied' && 'border-red-300 bg-red-50 text-red-800',
                      tbl.status === 'free' && 'border-emerald-300 bg-emerald-50 text-emerald-800',
                    )}
                  >
                    <span className="block text-[11px] font-bold leading-tight truncate max-w-[72px]">{tbl.label}</span>
                    <span className="mt-0.5 block text-[9px] font-medium tabular-nums" dir="ltr">
                      {tbl.status === 'free'
                        ? lang === 'ar'
                          ? 'فارغة'
                          : 'Free'
                        : tbl.orderTotal != null
                          ? fmt(tbl.orderTotal)
                          : lang === 'ar'
                            ? 'نشطة'
                            : 'Busy'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Column 2 (40%): Cart — search above, fixed actions at bottom */}
        <div className="flex flex-col bg-white border-slate-200 min-h-0 overflow-hidden">
          <div className="flex-shrink-0 px-2 pt-1.5 pb-1.5 border-b border-slate-100 space-y-1.5">
            <div className="flex gap-1.5 items-stretch" ref={customerDropdownRef}>
              <div className="relative flex-1 min-w-0">
              {selectedCustomer && !customerDropdownOpen ? (
                <div className="flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-gradient-to-r from-white to-slate-50 px-2 shadow-sm">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-[10px] font-bold text-white">
                    {[...(selectedCustomer.name || '?').trim()].slice(0, 2).join('') || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-slate-800">{selectedCustomer.name}</div>
                    {selectedCustomer.phone ? (
                      <div className="truncate text-[11px] text-slate-500 tabular-nums" dir="ltr">
                        {selectedCustomer.phone}
                      </div>
                    ) : null}
                  </div>
                  {selectedCustomer.loyaltyPoints != null && selectedCustomer.loyaltyPoints > 0 ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900" dir="ltr">
                      {selectedCustomer.loyaltyPoints} {lang === 'ar' ? 'نقطة' : 'pts'}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerDropdownOpen(true)
                      setCustomerSearch(selectedCustomer.name)
                    }}
                    className="shrink-0 text-[11px] font-medium text-primary-600 hover:underline"
                  >
                    {lang === 'ar' ? 'تغيير' : 'Change'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(null)
                      setCustomerSearch('')
                      setCustomerDropdownOpen(true)
                    }}
                    className="shrink-0 p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800"
                    title={lang === 'ar' ? 'مسح' : 'Clear'}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
              <input
                type="text"
                value={customerDropdownOpen ? customerSearch : (selectedCustomer ? `${selectedCustomer.name}${selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ''}` : '')}
                onChange={(e) => {
                  setCustomerSearch(e.target.value)
                  setCustomerDropdownOpen(true)
                }}
                onFocus={() => {
                  setCustomerDropdownOpen(true)
                  if (selectedCustomer && !customerSearch.trim()) setCustomerSearch(selectedCustomer.name)
                }}
                onKeyDown={(e) => e.key === 'Escape' && setCustomerDropdownOpen(false)}
                placeholder={lang === 'ar' ? 'بحث بالاسم أو رقم التليفون...' : 'Search by name or phone...'}
                className="w-full h-8 rounded border border-slate-200 px-2 text-[13px]"
              />
              {customerDropdownOpen && (
                <div className={`absolute z-20 w-full mt-0.5 rounded-lg border border-slate-200 bg-white shadow-lg max-h-44 overflow-y-auto ${isRtl ? 'right-0' : 'left-0'}`}>
                  {filteredCustomers.length === 0 ? (
                    <p className="px-3 py-2 text-slate-500 text-[13px]">{lang === 'ar' ? 'لا نتائج' : 'No results'}</p>
                  ) : (
                    <ul className="py-1">
                      {filteredCustomers.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              const pts = Number((c as { loyalty_points?: number }).loyalty_points)
                              setSelectedCustomer({
                                id: c.id,
                                name: c.name,
                                phone: c.phone ?? null,
                                loyaltyPoints: Number.isFinite(pts) && pts > 0 ? pts : undefined,
                              })
                              setCustomerSearch('')
                              setCustomerDropdownOpen(false)
                            }}
                            className={`w-full px-3 py-2 text-[13px] hover:bg-primary-50 text-start ${isRtl ? 'text-right' : 'text-left'} ${selectedCustomer?.id === c.id ? 'bg-primary-50 font-medium' : ''}`}
                          >
                            {c.name}{c.phone ? ` · ${c.phone}` : ''}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
                </>
              )}
              </div>
              <button
                type="button"
                onClick={() => { setCustomerDropdownOpen(false); setShowAddCustomerModal(true) }}
                className="shrink-0 p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-primary-600 h-8 flex items-center justify-center"
                title={lang === 'ar' ? 'إضافة عميل' : 'Add customer'}
              >
                <UserPlus size={18} />
              </button>
            </div>
            <div className="flex gap-1.5 items-center">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.restaurant?.searchItemPlaceholder ?? (lang === 'ar' ? 'بحث عن صنف...' : 'Search item...')}
                className="flex-1 min-w-0 h-8 rounded border border-slate-200 px-2 text-[13px]"
              />
              <button
                type="button"
                onClick={() => setShowAddItemModal(true)}
                className="shrink-0 p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-primary-600 h-8 flex items-center justify-center"
                title={lang === 'ar' ? 'إضافة صنف' : 'Add item'}
              >
                <Plus size={18} />
              </button>
            </div>
            {selectedTableId && (
              <span className="text-[11px] text-slate-500 block text-end">#{selectedTableId}</span>
            )}
          </div>
          <div className="px-2 pt-1 pb-0.5 border-b border-slate-100 grid gap-1 text-[13px] font-medium text-slate-600" style={{ gridTemplateColumns: 'minmax(180px, 2fr) auto 100px 100px minmax(95px, 1fr) 44px' }}>
            <span>{t.restaurant?.cartHeaderItem ?? (lang === 'ar' ? 'الصنف' : 'Item')}</span>
            <span className="text-center">{t.restaurant?.cartHeaderQty ?? (lang === 'ar' ? 'الكمية' : 'Qty')}</span>
            <span className="text-end">{t.restaurant?.cartHeaderPrice ?? (lang === 'ar' ? 'السعر' : 'Price')}</span>
            <span className="text-center">{t.restaurant?.cartHeaderDiscount ?? (lang === 'ar' ? 'الخصم' : 'Disc')}</span>
            <span className="text-end">{t.restaurant?.cartHeaderTotal ?? (lang === 'ar' ? 'الإجمالي' : 'Total')}</span>
            <span className="text-center" />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {cart.map((line) => (
              <div key={line.item.id} className="border-b border-slate-50">
                <div
                  className="grid gap-1 px-2 py-2.5 text-[13px] items-center min-h-[52px]"
                  style={{ gridTemplateColumns: 'minmax(180px, 2fr) auto 100px 100px minmax(95px, 1fr) 44px' }}
                >
                <div className="min-w-0 min-h-[40px] flex flex-col justify-center gap-0.5">
                  <div className="font-medium truncate text-[13px] py-0.5">{getLocalizedName(line.item, lang)}</div>
                  <button
                    type="button"
                    onClick={() =>
                      setKitchenNoteOpenItemId((openId) => (openId === line.item.id ? null : line.item.id))
                    }
                    className="w-fit text-[10px] text-slate-400 hover:text-primary-600 px-0.5"
                    title={lang === 'ar' ? 'ملاحظة للمطبخ' : 'Kitchen note'}
                  >
                    {(line.kitchen_note ?? '').trim() ? '📝' : lang === 'ar' ? '+ ملاحظة' : '+ Note'}
                  </button>
                </div>
                <div className="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateQuantity(line.item.id, line.quantity - 1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 bg-white hover:bg-slate-100"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="min-w-[28px] min-h-[40px] flex items-center justify-center text-[13px] font-semibold tabular-nums">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(line.item.id, line.quantity + 1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 bg-white hover:bg-slate-100"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <div className="flex justify-center items-center min-h-[40px]">
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    value={line.unit_price}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      const safe = Number.isFinite(v) && v >= 0 ? roundMoney(v) : 0
                      updateLine(line.item.id, { unit_price: safe })
                    }}
                    className="w-full min-w-[72px] max-w-[100px] h-10 rounded border border-slate-200 px-2 py-2 text-[13px] text-end tabular-nums"
                    dir="ltr"
                  />
                </div>
                <div className="flex justify-center items-center gap-1 min-h-[40px]">
                  <input
                    type="number"
                    min={0}
                    max={line.discount_type === 'percent' ? 100 : undefined}
                    step={line.discount_type === 'percent' ? 0.01 : 0.001}
                    value={line.discount_value}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      const safe = Number.isFinite(v) && v >= 0 ? (line.discount_type === 'percent' ? Math.min(100, v) : roundMoney(v)) : 0
                      updateLine(line.item.id, { discount_value: safe })
                    }}
                    className="w-full min-w-[56px] max-w-[96px] h-10 rounded border border-slate-200 px-2 py-2 text-[13px] text-center tabular-nums"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateLine(line.item.id, {
                        discount_type: line.discount_type === 'amount' ? 'percent' : 'amount',
                        discount_value: 0,
                      })
                    }
                    className="flex-shrink-0 h-10 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600 hover:bg-slate-100 flex items-center justify-center"
                    title={line.discount_type === 'amount' ? (lang === 'ar' ? 'تبديل إلى نسبة مئوية' : 'Switch to %') : (lang === 'ar' ? 'تبديل إلى مبلغ' : 'Switch to amount')}
                  >
                    {line.discount_type === 'amount' ? (lang === 'ar' ? 'مبلغ' : 'Amt') : '%'}
                  </button>
                </div>
                <div className="text-end min-h-[40px] flex items-center justify-end pr-1">
                  <span className="text-[13px] font-semibold tabular-nums">{fmt(lineBaseTotal(line))}</span>
                </div>
                <div className="flex items-center justify-center min-h-[40px] w-[44px] shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      removeLine(line.item.id)
                      setKitchenNoteOpenItemId((openId) => (openId === line.item.id ? null : openId))
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 border border-slate-200 hover:border-red-200 shrink-0"
                    title={lang === 'ar' ? 'حذف' : 'Remove'}
                  >
                    <X size={18} />
                  </button>
                </div>
                </div>
                {kitchenNoteOpenItemId === line.item.id && (
                  <div className="px-2 pb-2" style={{ paddingInlineStart: 8 }}>
                    <input
                      type="text"
                      value={line.kitchen_note ?? ''}
                      onChange={(e) => updateLine(line.item.id, { kitchen_note: e.target.value })}
                      onBlur={(e) => {
                        if (!e.target.value.trim()) setKitchenNoteOpenItemId(null)
                      }}
                      placeholder={lang === 'ar' ? 'مثال: بدون بصل، إضافة جبن...' : 'e.g. no onion, extra cheese...'}
                      className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-400"
                      dir={isRtl ? 'rtl' : 'ltr'}
                    />
                  </div>
                )}
              </div>
            ))}
            {cart.length === 0 && (
              <div className="px-2 py-6 text-[13px] text-slate-500 text-center">
                {t.restaurant?.noCartItems ?? (lang === 'ar' ? 'اضف أصنافاً من القائمة.' : 'Add items from the list.')}
              </div>
            )}
          </div>
          <div className="flex-shrink-0 px-2 py-1.5 border-t border-slate-100 space-y-0.5 text-[13px]">
            <div className="flex justify-between">
              <span className="text-slate-500">{t.restaurant?.subtotal ?? (lang === 'ar' ? 'المجموع' : 'Subtotal')}</span>
              <span className="font-medium tabular-nums">{fmt(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{t.restaurant?.vat ?? (lang === 'ar' ? 'الضريبة' : 'VAT')}</span>
              <span className="font-medium tabular-nums">{fmt(totals.tax)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-100">
              <span className="font-semibold text-slate-700">{t.restaurant?.total ?? (lang === 'ar' ? 'الإجمالي' : 'Total')}</span>
              <span className="font-extrabold text-primary-700 text-lg tabular-nums">{fmt(totals.total)}</span>
            </div>
          </div>
          {/* طرق الدفع (أساسي) + إجراءات الطلب (ثانوي) */}
          <div className="flex-shrink-0 space-y-2 border-t border-slate-200 bg-slate-50 p-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => applyQuickPayment('cash')}
                className={cn(
                  'rounded-xl border-2 py-3 text-[13px] font-bold shadow-sm transition-colors',
                  preferredPaymentMethodId != null &&
                    pickPaymentMethodId(paymentMethods, 'cash') === preferredPaymentMethodId
                    ? 'border-primary-500 bg-primary-50 text-primary-800'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-primary-300',
                )}
                title="F5"
              >
                {lang === 'ar' ? 'نقدي — F5' : 'Cash — F5'}
              </button>
              <button
                type="button"
                onClick={() => applyQuickPayment('bank')}
                className={cn(
                  'rounded-xl border-2 py-3 text-[13px] font-bold shadow-sm transition-colors',
                  preferredPaymentMethodId != null &&
                    pickPaymentMethodId(paymentMethods, 'bank') === preferredPaymentMethodId
                    ? 'border-primary-500 bg-primary-50 text-primary-800'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-primary-300',
                )}
                title="F6"
              >
                {lang === 'ar' ? 'بطاقة — F6' : 'Card — F6'}
              </button>
              <button
                type="button"
                onClick={() => applyQuickPayment('credit')}
                className={cn(
                  'rounded-xl border-2 py-3 text-[13px] font-bold shadow-sm transition-colors',
                  preferredPaymentMethodId != null &&
                    pickPaymentMethodId(paymentMethods, 'credit') === preferredPaymentMethodId
                    ? 'border-primary-500 bg-primary-50 text-primary-800'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-primary-300',
                )}
                title="F9"
              >
                {lang === 'ar' ? 'آجل — F9' : 'Credit — F9'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!orderToPay) {
                    setToast({
                      message: lang === 'ar' ? 'يتوفر التقسيم عند وجود طلب للتحصيل' : 'Split is available when collecting an order',
                      type: 'info',
                    })
                    return
                  }
                  if (!currentShift) {
                    setToast({ message: lang === 'ar' ? 'يجب فتح وردية قبل التحصيل' : 'Open a shift before collecting', type: 'error' })
                    return
                  }
                  if (!showPayModal) {
                    handleOpenPayModal()
                    return
                  }
                  if (deliveryDriverBlocksSplit) {
                    setToast({
                      message:
                        lang === 'ar'
                          ? 'لا يمكن تقسيم الدفع عند تعيين سائق للتحصيل لاحقاً'
                          : 'Split payment is not available when a driver is assigned for deferred collection',
                      type: 'info',
                    })
                    return
                  }
                  primeRestaurantPayModal(orderToPay)
                }}
                className="rounded-xl border-2 border-dashed border-slate-300 bg-white py-3 text-[12px] font-semibold text-slate-600 hover:border-primary-400 hover:bg-slate-50"
              >
                {lang === 'ar' ? 'تقسيم الدفع' : 'Split pay'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => cart.length > 0 && branchId && !holdRestaurantMut.isPending && holdRestaurantMut.mutate()}
                disabled={cart.length === 0 || !branchId || holdRestaurantMut.isPending}
                className="min-w-0 rounded-lg bg-amber-500 py-2 text-[11px] font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                title="F7"
              >
                {lang === 'ar' ? 'وقف F7' : 'Hold F7'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (orderToPay) {
                    setShowCancelOrderConfirm(true)
                  } else {
                    setCart([])
                    setOrderToPay(null)
                  }
                }}
                disabled={cart.length === 0 && !orderToPay}
                className="min-w-0 rounded-lg bg-red-500 py-2 text-[11px] font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                title="F4"
              >
                {lang === 'ar' ? 'إلغاء F4' : 'Cancel F4'}
              </button>
              {orderToPay ? (
                <button
                  type="button"
                  onClick={handleOpenPayModal}
                  className="min-w-0 rounded-lg bg-emerald-600 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-500"
                  title="F8"
                >
                  {lang === 'ar' ? 'دفع F8' : 'Pay F8'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!branchId || !warehouseId || cart.length === 0 || sendOrderMut.isPending}
                  onClick={handleSaveAndSend}
                  className="inline-flex min-w-0 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  title={lang === 'ar' ? 'إرسال للمطبخ F8' : 'Send to kitchen F8'}
                >
                  <Send size={14} className="shrink-0" />
                  {sendOrderMut.isPending
                    ? (t.restaurant?.saving ?? (lang === 'ar' ? '…' : '…'))
                    : lang === 'ar'
                      ? 'طبخ F8'
                      : 'Send F8'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* نافذة الدفع السريع (Quick Pay) — إجمالي الفاتورة، طرق الدفع، المبلغ المدفوع، المتبقي */}
      {showPayModal && orderToPay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <h3 className="text-lg font-semibold text-slate-900">
                {lang === 'ar' ? 'إتمام الدفع' : 'Complete Payment'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setCheckoutDriverId(null)
                  setLoyaltyRedeemPoints(0)
                  setLoyaltyRedeemDiscount(0)
                  setLoyaltyProgramId(null)
                  setShowPayModal(false)
                }}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5 flex-1 min-h-0 overflow-y-auto max-h-[min(72vh,640px)]">
              <div className="rounded-xl bg-primary-50 border border-primary-200 p-4">
                <div className="flex flex-wrap gap-4 justify-between items-start">
                  <div>
                    <div className="text-sm font-medium text-slate-600 mb-0.5">{lang === 'ar' ? 'إجمالي الفاتورة' : 'Invoice Total'}</div>
                    <div className="text-2xl font-bold text-primary-700 tabular-nums" dir="ltr">{fmt(payTotal)}</div>
                    {loyaltyRedeemDiscount > 0.0005 && (
                      <div className="text-[11px] text-slate-600 mt-1" dir="ltr">
                        {lang === 'ar' ? 'خصم نقاط:' : 'Loyalty discount:'} <span className="font-semibold text-rose-600">- {fmt(loyaltyRedeemDiscount)}</span>
                      </div>
                    )}
                  </div>
                  <div className={cn(isRtl ? 'text-left' : 'text-right')}>
                    <div className="text-sm font-medium text-slate-600 mb-0.5">{lang === 'ar' ? 'رقم الطلب' : 'Order #'}</div>
                    <div className="text-lg font-semibold text-slate-800 font-mono" dir="ltr">#{orderToPay.id}</div>
                  </div>
                </div>
              </div>

              {loyaltyProgram?.is_active && (loyaltyProgram?.apply_on_pos || (orderToPay.order_type === 'delivery' && loyaltyProgram?.apply_on_delivery)) && (orderToPay.customer_id ?? selectedCustomer?.id) ? (
                <LoyaltyPOSSection
                  tenantId={tenantId}
                  customerId={(orderToPay.customer_id ?? selectedCustomer?.id) ?? null}
                  orderTotal={payTotalBase}
                  onRedeemChange={(_programId, points, discount) => {
                    setLoyaltyRedeemPoints(points)
                    setLoyaltyRedeemDiscount(discount)
                    // If user had "full amount" prefilled, keep it aligned with new net total.
                    if (payModalAmount > payTotalBase - discount + 0.0005) {
                      setPayModalAmount(roundMoney(Math.max(0, payTotalBase - discount)))
                    }
                  }}
                  onProgramChange={(pid) => setLoyaltyProgramId(pid)}
                  module="restaurant"
                />
              ) : null}

              {orderToPay.order_type === 'delivery' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {(t as { delivery?: { driverField?: string } }).delivery?.driverField ?? (lang === 'ar' ? 'السائق' : 'Driver')}
                  </label>
                  <select
                    value={checkoutDriverId ?? ''}
                    onChange={(e) => setCheckoutDriverId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">—</option>
                    {restaurantDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {(t as { delivery?: { fulfillmentHint?: string } }).delivery?.fulfillmentHint ??
                      (lang === 'ar'
                        ? 'الدفع الكامل بالمحل: الإسناد التلقائي يعمل عند وجود رصيد آجل على الفاتورة.'
                        : 'Paid in full at checkout: auto-assignment applies when the invoice has an outstanding balance.')}
                  </p>
                </div>
              )}

              {deliveryDriverBlocksSplit && (
                <p className="text-sm text-amber-800 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  {lang === 'ar'
                    ? 'عند تعيين سائق للتحصيل لاحقاً لا يمكن تسجيل أكثر من طريقة دفع في الصندوق. أدخل مبلغاً واحداً وطريقة واحدة.'
                    : 'With a driver assigned for deferred collection, use a single payment line and one method.'}
                </p>
              )}

              {splitPayMode && !deliveryDriverBlocksSplit ? (
                <RestaurantSplitPaymentForm
                  lang={lang === 'ar' ? 'ar' : 'en'}
                  isRtl={isRtl}
                  invoiceTotal={payTotal}
                  paymentMethods={paymentMethods}
                  lines={splitLines}
                  selectedMethodId={splitMethodId}
                  currentAmount={splitCurrentAmount}
                  fmt={fmt}
                  onSelectMethod={(id) => {
                    setSplitMethodId(id)
                    setPaymentMethodId(id)
                    const paid = roundMoney(splitLines.reduce((s, p) => s + p.amount, 0))
                    setSplitCurrentAmount(Math.max(0, roundMoney(payTotal - paid)))
                  }}
                  onCurrentAmountChange={setSplitCurrentAmount}
                  onAddLine={() => {
                    if (splitMethodId == null || splitCurrentAmount <= 0) return
                    const m = paymentMethods.find((x) => x.id === splitMethodId)
                    if (!m) return
                    setSplitLines((prev) => [...prev, { id: newLineId(), method: m, amount: roundMoney(splitCurrentAmount) }])
                    setSplitCurrentAmount(0)
                  }}
                  onRemoveLine={(id) => setSplitLines((prev) => prev.filter((p) => p.id !== id))}
                  onFillRemaining={() => {
                    const paid = roundMoney(splitLines.reduce((s, p) => s + p.amount, 0))
                    setSplitCurrentAmount(Math.max(0, roundMoney(payTotal - paid)))
                  }}
                  onFillFull={() => setSplitCurrentAmount(payTotal)}
                />
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">{lang === 'ar' ? 'طرق الدفع' : 'Payment methods'}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {paymentMethods.filter((m) => m.is_active).slice(0, 6).map((m) => {
                        const selected = paymentMethodId === m.id
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setPaymentMethodId(m.id)}
                            className={`flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl border-2 text-sm font-semibold transition-all min-h-[5.5rem] ${
                              selected ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 bg-white text-slate-700 hover:border-primary-300 hover:bg-slate-50'
                            }`}
                          >
                            <PaymentMethodBrandIcon method={m} size={40} className="min-h-[40px]" />
                            <span className="truncate w-full text-center leading-tight">{lang === 'ar' ? m.name : (m.name_en || m.name)}</span>
                          </button>
                        )
                      })}
                    </div>
                    {paymentMethods.length === 0 && (
                      <p className="text-sm text-amber-600">{lang === 'ar' ? 'أضف طرق الدفع من الإعدادات' : 'Add payment methods in settings'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'المبلغ المدفوع' : 'Amount paid'}</label>
                    <input
                      ref={payModalInputRef}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.001}
                      value={payModalAmount > 0 ? payModalAmount : ''}
                      onChange={(e) => setPayModalAmount(parseFloat(e.target.value) || 0)}
                      className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-lg font-semibold text-right tabular-nums focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex justify-between items-center rounded-xl bg-slate-100 px-4 py-3">
                    <span className="text-sm font-medium text-slate-600">{lang === 'ar' ? 'المتبقي' : 'Remaining'}</span>
                    <span className={`text-lg font-bold tabular-nums ${payRemaining <= 0 ? 'text-emerald-600' : 'text-slate-800'}`} dir="ltr">
                      {fmt(payRemaining)}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 flex flex-col gap-2 flex-shrink-0">
              {splitPayMode && !deliveryDriverBlocksSplit && splitChangeDue > 0.001 && (
                <div className="flex justify-between text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <span>{lang === 'ar' ? 'الباقي للعميل' : 'Change due'}</span>
                  <span className="font-bold tabular-nums" dir="ltr">{fmt(splitChangeDue)}</span>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmPay}
                  disabled={
                    checkoutMut.isPending ||
                    (splitPayMode && !deliveryDriverBlocksSplit
                      ? !splitPayReady
                      : payModalAmount < payTotal || (paymentMethods.length > 0 && !paymentMethodId))
                  }
                  className="flex-1 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {checkoutMut.isPending
                    ? (t.saving ?? (lang === 'ar' ? 'جارٍ...' : 'Saving...'))
                    : lang === 'ar'
                      ? `تأكيد الدفع — ${fmt(payTotal)}`
                      : `Confirm — ${fmt(payTotal)}`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCheckoutDriverId(null)
                    setShowPayModal(false)
                  }}
                  className="px-4 py-3 border border-slate-300 rounded-xl font-medium text-slate-700"
                >
                  {t.cancel ?? (lang === 'ar' ? 'إلغاء' : 'Cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة نجاح التحصيل — طباعة / إرسال واتساب */}
      {lastCheckoutInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setLastCheckoutInfo(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">{lang === 'ar' ? 'تم التحصيل وترحيل الفاتورة' : 'Payment completed'}</h3>
            <p className="text-slate-600 text-sm mb-1">
              {lang === 'ar' ? 'رقم الفاتورة:' : 'Invoice:'} <span className="font-mono font-semibold">{lastCheckoutInfo.invoiceNumber}</span>
            </p>
            <p className="text-slate-600 text-sm mb-1">
              {lang === 'ar' ? 'الإجمالي:' : 'Total:'} <span className="font-semibold" dir="ltr">{fmt(lastCheckoutInfo.total)}</span>
            </p>
            {lastCheckoutInfo.changeDue != null && lastCheckoutInfo.changeDue > 0.001 && (
              <p className="text-amber-800 text-sm font-semibold mb-3" dir="ltr">
                {lang === 'ar' ? 'الباقي للعميل:' : 'Change due:'}{' '}
                <span>{fmt(lastCheckoutInfo.changeDue)}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-1">
              <button
                type="button"
                onClick={() => {
                  openInvoiceViewForPrint(
                    lastCheckoutInfo.invoiceId,
                    posPrintOptionsFromSettings(settings as Record<string, unknown>),
                  )
                  setLastCheckoutInfo(null)
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-500"
              >
                <Receipt size={18} />
                {lang === 'ar' ? 'عرض وطباعة' : 'View & Print'}
              </button>
              <WhatsAppButton
                phone={lastCheckoutInfo.customerPhone}
                message={messageTemplateInvoice(
                  {
                    customerName: lastCheckoutInfo.customerName,
                    invoiceNumber: lastCheckoutInfo.invoiceNumber,
                    total: fmt(lastCheckoutInfo.total),
                    pdfOrViewUrl: typeof window !== 'undefined' ? `${window.location.origin}/invoices/view/${lastCheckoutInfo.invoiceId}` : '',
                    lang: lang === 'ar' ? 'ar' : 'en',
                  },
                  (settings as Record<string, unknown>)?.whatsapp_invoice_message_ar as string | undefined,
                  (settings as Record<string, unknown>)?.whatsapp_invoice_message_en as string | undefined
                )}
                defaultCountryCode={(settings as Record<string, unknown>)?.whatsapp_default_country_code as string | undefined}
                label={lang === 'ar' ? 'واتساب' : 'WhatsApp'}
                iconSize={20}
              />
              <button type="button" onClick={() => setLastCheckoutInfo(null)} className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
                {lang === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تسجيل عميل كاملة */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeAddCustomerModal}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
              <h3 className="text-lg font-semibold text-slate-900">{t.customers?.addCustomer ?? (lang === 'ar' ? 'إضافة عميل' : 'Add customer')}</h3>
              <button type="button" onClick={closeAddCustomerModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddCustomerSubmit} className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.customers?.customerName ?? (lang === 'ar' ? 'اسم العميل' : 'Customer name')} *</label>
                  <input type="text" value={newCustomerForm.name} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.code ?? (lang === 'ar' ? 'الكود' : 'Code')}</label>
                  <input type="text" value={newCustomerForm.code} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, code: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.nameEn ?? (lang === 'ar' ? 'الاسم بالإنجليزي' : 'Name (EN)')}</label>
                <input type="text" value={newCustomerForm.name_en} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name_en: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" dir="ltr" placeholder="English name (optional)" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.email ?? (lang === 'ar' ? 'البريد' : 'Email')}</label>
                  <input type="email" value={newCustomerForm.email} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.customers?.phone ?? (lang === 'ar' ? 'التليفون' : 'Phone')}</label>
                  <input type="text" value={newCustomerForm.phone} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.customers?.taxNumber ?? (lang === 'ar' ? 'الرقم الضريبي' : 'Tax number')}</label>
                <input type="text" value={newCustomerForm.tax_number} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, tax_number: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.customers?.address ?? (lang === 'ar' ? 'العنوان' : 'Address')}</label>
                <textarea value={newCustomerForm.address} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, address: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.customers?.group ?? (lang === 'ar' ? 'المجموعة' : 'Group')}</label>
                <select value={newCustomerForm.customer_group_id} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, customer_group_id: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none">
                  <option value="">{t.customers?.selectGroup ?? (lang === 'ar' ? 'اختر مجموعة' : 'Select group')}</option>
                  {customerGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name} ({g.discount_type === 'percent' ? g.discount_value + '%' : g.discount_value})</option>
                  ))}
                </select>
              </div>
              <div className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50/50">
                <label className="block text-sm font-semibold text-slate-700">{t.customers?.linkedAccount ?? (lang === 'ar' ? 'الحساب المحاسبي' : 'Linked account')}</label>
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" checked={newCustomerForm.auto_create_account} onChange={() => setNewCustomerForm({ ...newCustomerForm, auto_create_account: true, account_id: '' })} className="text-primary-600 focus:ring-primary-500" />
                    {t.customers?.autoCreateAccount ?? (lang === 'ar' ? 'إنشاء حساب تلقائياً' : 'Auto-create account')}
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" checked={!newCustomerForm.auto_create_account} onChange={() => setNewCustomerForm({ ...newCustomerForm, auto_create_account: false })} className="text-primary-600 focus:ring-primary-500" />
                    {t.customers?.selectExistingAccount ?? (lang === 'ar' ? 'ربط بحساب موجود' : 'Link existing account')}
                  </label>
                </div>
                {newCustomerForm.auto_create_account ? (
                  <p className="text-xs text-emerald-600 bg-emerald-50 rounded-md px-3 py-2">{t.customers?.accountAutoCreated ?? (lang === 'ar' ? 'سيتم إنشاء الحساب تلقائياً' : 'Account will be created automatically')}</p>
                ) : (
                  <select value={newCustomerForm.account_id} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, account_id: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none">
                    <option value="">{t.customers?.selectAccount ?? (lang === 'ar' ? 'اختر الحساب' : 'Select account')}</option>
                    {(accounts ?? []).map((a) => (
                      <option key={a.id} value={a.id}>{a.code} - {getDisplayName ? getDisplayName(a) : (lang === 'ar' ? a.name : (a.name_en || a.name))}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
                <button type="button" onClick={closeAddCustomerModal} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-lg border border-slate-300">
                  {t.cancel ?? (lang === 'ar' ? 'إلغاء' : 'Cancel')}
                </button>
                <button type="submit" disabled={createCustomerMut.isPending} className="bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                  {createCustomerMut.isPending ? (t.saving ?? (lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...')) : (t.save ?? (lang === 'ar' ? 'حفظ' : 'Save'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة إضافة صنف جديد — تبويبان: أساسي + أسعار */}
      {showAddItemModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeAddItemModal}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[85%] max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
              <h3 className="text-lg font-semibold text-slate-900">{lang === 'ar' ? 'إضافة صنف جديد' : 'Add new item'}</h3>
              <button type="button" onClick={closeAddItemModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                <X size={20} />
              </button>
            </div>
            <div className="border-b border-slate-200 shrink-0 flex gap-1 px-4">
              <button type="button" onClick={() => setAddItemTab('basic')} className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${addItemTab === 'basic' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500'}`}>
                {lang === 'ar' ? 'البيانات الأساسية' : 'Basic data'}
              </button>
              <button type="button" onClick={() => setAddItemTab('pricing')} className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${addItemTab === 'pricing' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500'}`}>
                {lang === 'ar' ? 'الأسعار والمخزون' : 'Pricing & stock'}
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (newItemForm.code.trim() && newItemForm.name.trim()) setShowAddItemConfirm(true) }} className="flex flex-col flex-1 min-h-0">
              <div className="p-4 overflow-y-auto flex-1">
                {addItemTab === 'basic' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'الفئة' : 'Category'}</label>
                        <select value={newItemForm.category_id} onChange={(e) => setNewItemForm((f) => ({ ...f, category_id: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                          <option value="">—</option>
                          {itemCategories.map((c) => (
                            <option key={c.id} value={c.id}>{getLocalizedName(c, lang)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'كود الصنف' : 'Item code'} *</label>
                        <input type="text" value={newItemForm.code} onChange={(e) => setNewItemForm((f) => ({ ...f, code: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" required />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'اسم الصنف' : 'Item name'} *</label>
                        <input type="text" value={newItemForm.name} onChange={(e) => setNewItemForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'الاسم بالإنجليزية' : 'Name (EN)'}</label>
                        <input type="text" value={newItemForm.name_en} onChange={(e) => setNewItemForm((f) => ({ ...f, name_en: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" dir="ltr" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'نوع الصنف' : 'Type'}</label>
                        <select value={newItemForm.type} onChange={(e) => setNewItemForm((f) => ({ ...f, type: e.target.value as 'inventory' | 'service' }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                          <option value="inventory">{lang === 'ar' ? 'مخزون' : 'Inventory'}</option>
                          <option value="service">{lang === 'ar' ? 'خدمة' : 'Service'}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'الوحدة' : 'Unit'}</label>
                        <select value={newItemForm.unit_id} onChange={(e) => setNewItemForm((f) => ({ ...f, unit_id: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                          <option value="">—</option>
                          {itemUnits.filter((u) => u.is_active).map((u) => (
                            <option key={u.id} value={u.id}>{u.name} {u.symbol ? `(${u.symbol})` : ''}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'العلامة التجارية' : 'Brand'}</label>
                        <select value={newItemForm.brand_id} onChange={(e) => setNewItemForm((f) => ({ ...f, brand_id: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                          <option value="">—</option>
                          {itemBrands.filter((b) => b.is_active).map((b) => (
                            <option key={b.id} value={b.id}>{getLocalizedName(b, lang)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'الباركود' : 'Barcode'}</label>
                        <input type="text" value={newItemForm.barcode} onChange={(e) => setNewItemForm((f) => ({ ...f, barcode: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <button type="button" onClick={() => setNewItemForm((f) => ({ ...f, barcode: `${Date.now()}${Math.floor(1000 + Math.random() * 9000)}` }))} className="px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">
                        {lang === 'ar' ? 'توليد آلي' : 'Generate'}
                      </button>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'صورة المنتج' : 'Image'}</label>
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                          {newItemImageFile ? <img src={URL.createObjectURL(newItemImageFile)} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-400 text-xs">{lang === 'ar' ? 'لا صورة' : 'No image'}</span>}
                        </div>
                        <input type="file" accept="image/*" onChange={(e) => setNewItemImageFile(e.target.files?.[0] ?? null)} className="text-sm file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'الوصف' : 'Description'}</label>
                      <textarea value={newItemForm.description} onChange={(e) => setNewItemForm((f) => ({ ...f, description: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" rows={2} />
                    </div>
                  </div>
                )}
                {addItemTab === 'pricing' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'سعر التكلفة' : 'Cost price'}</label>
                        <input type="number" min="0" step="0.01" value={newItemForm.cost_price || ''} onChange={(e) => setNewItemForm((f) => ({ ...f, cost_price: Number(e.target.value) || 0 }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'سعر البيع' : 'Selling price'}</label>
                        <input type="number" min="0" step="0.01" value={newItemForm.selling_price || ''} onChange={(e) => setNewItemForm((f) => ({ ...f, selling_price: Number(e.target.value) || 0 }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'أقل سعر' : 'Min. price'}</label>
                        <input type="number" min="0" step="0.01" value={newItemForm.min_selling_price || ''} onChange={(e) => setNewItemForm((f) => ({ ...f, min_selling_price: Number(e.target.value) || 0 }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'أعلى سعر' : 'Max. price'}</label>
                        <input type="number" min="0" step="0.01" value={newItemForm.max_selling_price || ''} onChange={(e) => setNewItemForm((f) => ({ ...f, max_selling_price: Number(e.target.value) || 0 }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'حد إعادة الطلب' : 'Reorder level'}</label>
                        <input type="number" min="0" value={newItemForm.min_quantity || ''} onChange={(e) => setNewItemForm((f) => ({ ...f, min_quantity: Number(e.target.value) || 0 }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'الكمية الافتتاحية' : 'Initial stock'}</label>
                        <input type="number" min="0" step="0.01" value={newItemForm.initial_stock || ''} onChange={(e) => setNewItemForm((f) => ({ ...f, initial_stock: Number(e.target.value) || 0 }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 p-4 border-t border-slate-200 shrink-0">
                <button type="submit" disabled={!newItemForm.code.trim() || !newItemForm.name.trim() || createItemMut.isPending} className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-500 disabled:opacity-50">
                  {createItemMut.isPending ? (t.saving ?? (lang === 'ar' ? 'جارٍ...' : 'Saving...')) : (lang === 'ar' ? 'إضافة الصنف' : 'Add item')}
                </button>
                <button type="button" onClick={closeAddItemModal} className="px-4 py-2.5 border border-slate-300 rounded-lg">
                  {t.cancel ?? (lang === 'ar' ? 'إلغاء' : 'Cancel')}
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

      {showCancelOrderConfirm && (orderToPay || pendingCancelOrderId !== null) && (
        <ConfirmDialog
          title={lang === 'ar' ? 'إلغاء الطلب' : 'Cancel order'}
          message={lang === 'ar' ? 'هل تريد إلغاء هذا الطلب؟ سيتم إزالته من شاشة المطبخ والطلبات المفتوحة.' : 'Cancel this order? It will be removed from the kitchen screen and open orders.'}
          confirmLabel={lang === 'ar' ? 'نعم، إلغاء الطلب' : 'Yes, cancel order'}
          variant="danger"
          isLoading={cancelOrderMut.isPending}
          onConfirm={() => {
            const id = orderToPay?.id ?? pendingCancelOrderId!
            cancelOrderMut.mutate(id)
            setOrderToPay(null)
            setPendingCancelOrderId(null)
            setShowCancelOrderConfirm(false)
          }}
          onCancel={() => { setShowCancelOrderConfirm(false); setPendingCancelOrderId(null) }}
        />
      )}

      {/* نافذة فتح الوردية */}
      {showOpenShift && branchId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-2">{lang === 'ar' ? 'فتح وردية' : 'Open shift'}</h3>
            <p className="text-slate-600 text-sm mb-4">{lang === 'ar' ? 'أدخل المبلغ الافتتاحي في الصندوق ثم اضغط فتح.' : 'Enter the opening cash amount in the drawer, then click Open.'}</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'المبلغ الافتتاحي' : 'Opening balance'}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => openShiftMut.mutate(parseFloat(openingCash) || 0)} disabled={openShiftMut.isPending} className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg font-medium disabled:opacity-50">
                {openShiftMut.isPending ? (lang === 'ar' ? 'جاري...' : 'Opening...') : (lang === 'ar' ? 'فتح' : 'Open')}
              </button>
              <button type="button" onClick={() => setShowOpenShift(false)} className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700">{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
            </div>
          </div>
        </div>
      )}

      {/* تقرير X */}
      {showXReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-lg font-semibold">{lang === 'ar' ? 'تقرير X (لحظة الحالية)' : 'X Report (current)'}</h3>
              <button type="button" onClick={() => setShowXReport(false)} className="p-2 rounded-lg hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {xReportData ? (
                <>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-600">{lang === 'ar' ? 'عدد الفواتير' : 'Invoices count'}</span>
                    <span className="font-mono text-right">{xReportData.invoices_count}</span>
                    <span className="text-slate-600">{lang === 'ar' ? 'إجمالي المبيعات' : 'Total sales'}</span>
                    <span className="font-mono text-right font-semibold" dir="ltr">{formatAmount(xReportData.total_sales ?? 0, { decimal_places: amountDecimals }, locale)}</span>
                    <span className="text-slate-600">{lang === 'ar' ? 'رصيد افتتاحي' : 'Opening cash'}</span>
                    <span className="font-mono text-right" dir="ltr">{formatAmount(xReportData.opening_cash ?? 0, { decimal_places: amountDecimals }, locale)}</span>
                    <span className="text-slate-600">{lang === 'ar' ? 'نقداً مستلم' : 'Cash received'}</span>
                    <span className="font-mono text-right" dir="ltr">{formatAmount(xReportData.cash_received ?? 0, { decimal_places: amountDecimals }, locale)}</span>
                    <span className="text-slate-600">{lang === 'ar' ? 'المتوقع في الصندوق' : 'Expected cash'}</span>
                    <span className="font-mono text-right font-semibold" dir="ltr">{formatAmount(xReportData.expected_cash ?? 0, { decimal_places: amountDecimals }, locale)}</span>
                  </div>
                  {xReportData.by_payment_method?.length > 0 && (
                    <div className="pt-2 border-t border-slate-200">
                      <h4 className="text-sm font-medium text-slate-700 mb-2">{lang === 'ar' ? 'حسب طريقة الدفع' : 'By payment method'}</h4>
                      <ul className="space-y-1 text-sm">
                        {xReportData.by_payment_method.map((pm) => (
                          <li key={pm.payment_method_id} className="flex justify-between">
                            <span>{lang === 'ar' ? pm.name : pm.name}</span>
                            <span dir="ltr">{formatAmount(pm.amount ?? 0, { decimal_places: amountDecimals }, locale)} ({pm.count})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-500 text-sm">{lang === 'ar' ? 'لا توجد وردية مفتوحة أو لا توجد بيانات.' : 'No open shift or no data.'}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* إغلاق الوردية — إدخال المبلغ النقدي الفعلي */}
      {showCloseShift && currentShift && branchId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-semibold text-slate-900 mb-2">{lang === 'ar' ? 'إغلاق الوردية' : 'Close shift'}</h3>
            <p className="text-slate-600 text-sm mb-4">{lang === 'ar' ? 'أدخل المبلغ النقدي الفعلي الموجود في الدرج. سيتم مقارنته مع المتوقع وإظهار العجز أو الزيادة.' : 'Enter the actual cash in the drawer. It will be compared with expected and show shortage/surplus.'}</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'المبلغ النقدي الفعلي' : 'Actual cash in drawer'}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg"
                placeholder="0.00"
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => closeShiftMut.mutate(parseFloat(closingCash) || 0)} disabled={closeShiftMut.isPending} className="flex-1 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-500 disabled:opacity-50">
                {closeShiftMut.isPending ? (lang === 'ar' ? 'جاري الإغلاق...' : 'Closing...') : (lang === 'ar' ? 'إغلاق الوردية' : 'Close shift')}
              </button>
              <button type="button" onClick={() => setShowCloseShift(false)} className="px-4 py-3 border border-slate-300 rounded-lg text-slate-700">{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
            </div>
          </div>
        </div>
      )}

      {/* طباعة تقرير Z بعد الإغلاق */}
      {showZReportPrint && lastZReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{lang === 'ar' ? 'تقرير إغلاق الوردية (Z)' : 'Shift closing report (Z)'}</h3>
              <button type="button" onClick={() => { setShowZReportPrint(false); setLastZReport(null) }} className="p-2 rounded-lg hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-600">{lang === 'ar' ? 'إجمالي المبيعات' : 'Total sales'}</span><span dir="ltr">{formatAmount(lastZReport.total_sales ?? 0, { decimal_places: amountDecimals }, locale)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">{lang === 'ar' ? 'رصيد افتتاحي' : 'Opening cash'}</span><span dir="ltr">{formatAmount(lastZReport.opening_cash ?? 0, { decimal_places: amountDecimals }, locale)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">{lang === 'ar' ? 'المبلغ الفعلي المدخل' : 'Entered closing cash'}</span><span dir="ltr">{formatAmount(lastZReport.closing_cash ?? 0, { decimal_places: amountDecimals }, locale)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">{lang === 'ar' ? 'المتوقع في الصندوق' : 'Expected cash'}</span><span dir="ltr">{formatAmount(lastZReport.expected_cash ?? 0, { decimal_places: amountDecimals }, locale)}</span></div>
              <div className="flex justify-between font-semibold pt-2 border-t border-slate-200">
                <span>{lang === 'ar' ? 'الفرق (عجز/زيادة)' : 'Difference (shortage/surplus)'}</span>
                <span dir="ltr" className={Number(lastZReport.difference ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatAmount(Number(lastZReport.difference ?? 0), { decimal_places: amountDecimals }, locale)}</span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => window.print()} className="flex-1 py-2 rounded-lg bg-primary-600 text-white font-medium">{lang === 'ar' ? 'طباعة' : 'Print'}</button>
              <button type="button" onClick={() => { setShowZReportPrint(false); setLastZReport(null) }} className="px-4 py-2 border border-slate-300 rounded-lg">{lang === 'ar' ? 'إغلاق' : 'Close'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

