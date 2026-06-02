import { useState, useMemo, useCallback, useRef, useLayoutEffect, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import {
  fetchCustomers, fetchVendors, fetchItems, fetchInvoices, fetchInvoice,
  fetchBranches, fetchWarehouses, fetchCostCenters, fetchPaymentMethods,
  fetchCurrencies, fetchSettings, fetchAccountDefaults, fetchPricingGroups,
  createInvoice, updateInvoice, postInvoice, cancelInvoice, uploadInvoiceAttachment,
  createInstallmentScheduleFromInvoice,
  fetchSalesReps,
  fetchAccounts,
  fetchItem,
  fetchDeliveryDrivers,
} from '../../api/tenant'
import type { CreateInstallmentFromInvoicePayload } from '../../api/tenant'
import type {
  Customer,
  Vendor,
  Item,
  Branch,
  Warehouse,
  CostCenter,
  PaymentMethod,
  PaginatedResponse,
  Currency,
  QuotationToInvoicePayload,
  PurchaseRequestToInvoicePayload,
  ItemUnitOption,
  Invoice,
  PricingGroup,
  Account,
  InvoiceAdditionalExpense,
  InvoiceLine,
  ItemVariant,
  DeliveryDriver,
} from '../../types'
import InvoiceVariantBulkModal from '../../components/invoices/InvoiceVariantBulkModal'
import { invoiceHasAutoManufacturingDoc } from '../../utils/manufacturingFromInvoice'
import { paymentMethodRequiresInstallmentPlan } from '../../utils/paymentMethodInstallments'
import { parseMaxInstallmentsCount, parseMinInstallmentAmount } from '../../utils/installmentBusinessRules'
import { formatAmount, formatAmountWithSymbol } from '../../utils/currency'
import { invoiceLineDiscountAmountFromApi, invoiceLineNetBeforeTax } from '../../utils/invoiceLineAmounts'
import { computePaymentMethodMenuRect, type PaymentMethodMenuRect } from '../../utils/paymentMethodMenuPosition'
import { toLocalDateString } from '../../utils/date'
import {
  isInvoiceExpiryDatesEnabled,
  isInvoiceVariantsPurchasesEnabled,
  isInvoiceVariantsSalesEnabled,
  parseDefaultVatRate,
} from '../../utils/tenantSettings'
import { Plus, Trash2, Search, GripVertical, Paperclip, FolderOpen, ChevronDown } from 'lucide-react'
import SerialNumberSelect from '../../components/SerialNumberSelect'
import AddCustomerModal from '../../components/AddCustomerModal'
import AddVendorModal from '../../components/AddVendorModal'
import AccountSearchSelect from '../../components/AccountSearchSelect'
import { DeliveryFeesSection, type DeliveryFeeLine } from '../../components/invoice/DeliveryFeesSection'
import { PartialPaymentSection, type PartialPaymentState } from '../../components/invoice/PartialPaymentSection'
import { LoyaltyInvoiceSection } from '../../components/loyalty/LoyaltyInvoiceSection'
import { promotionsApi } from '../../api/promotions'
import type { PromotionCalculateResult } from '../../types/promotions'
import { loyaltyApi } from '../../api/loyalty'
import type { CreateInvoiceResponse } from '../../api/tenant'

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

interface LineForm {
  item_id: number | null
  item_variant_id: number | null
  unit_id: number | null
  description: string
  quantity: number
  /** null = لم يُدخل سعر الوحدة (لا يُحسب مبلغ السطر)؛ رقم = بما فيه الصفر الصريح */
  unit_price: number | null
  /** خصم السطر كمبلغ ثابت (لا يتجاوز كمية×سعر) */
  discount_amount: number
  tax_percent: number
  serial_numbers: string[]
  use_serial_number?: boolean
  /** تاريخ الصلاحية (YYYY-MM-DD) */
  expiry_date: string
  batch_number: string
}

/** يطابق حقل السعر الفارغ في الواجهة؛ عند الحفظ يُرسل كرقم للـ API */
function coerceInvoiceLineUnitPrice(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : null
}

function lineHasValidUnitPrice(line: LineForm): boolean {
  const p = line.unit_price
  return p != null && typeof p === 'number' && Number.isFinite(p)
}

function lineGrossBeforeDiscount(line: LineForm): number {
  if (!lineHasValidUnitPrice(line)) return 0
  return line.quantity * (line.unit_price as number)
}

/**
 * عكس حساب إجمالي السطر (شامل ضريبة السطر): إجمالي = (كمية×سعر − خصم مبلغ)×(1+ضريبة٪)
 */
type SalesPaymentTab = 'cash' | 'bank' | 'deferred' | 'installment' | 'mixed'

function deriveUnitPriceFromLineTotal(
  lineTotalInclTax: number,
  qty: number,
  discountAmount: number,
  taxPercent: number,
): number | null {
  if (!Number.isFinite(lineTotalInclTax) || lineTotalInclTax < 0) return null
  const Q = Number(qty)
  if (!Number.isFinite(Q) || Q <= 0) return null
  const t = Math.max(0, Number(taxPercent) || 0) / 100
  const afterDisc = lineTotalInclTax / (1 + t)
  const d = Math.max(0, Number(discountAmount) || 0)
  const gross = afterDisc + d
  const p = gross / Q
  return Number.isFinite(p) ? p : null
}

interface AdditionalExpenseForm {
  description: string
  expense_account_id: number | null
  creditor_account_id: number | null
  amount_net: number
  tax_amount: number
  total_amount: number
}

function InvoiceLineVariantPrefetch({
  itemId,
  load,
}: {
  itemId: number
  load: (id: number) => Promise<ItemVariant[]>
}) {
  useEffect(() => {
    void load(itemId)
  }, [itemId, load])
  return null
}

const emptyLine: LineForm = {
  item_id: null,
  item_variant_id: null,
  unit_id: null,
  description: '',
  quantity: 1,
  unit_price: null,
  discount_amount: 0,
  tax_percent: 0,
  serial_numbers: [],
  use_serial_number: false,
  expiry_date: '',
  batch_number: '',
}

export default function CreateInvoice() {
  const { currentTenant, canAccessFeature, can, meData } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tInstallments = ((t as { installments?: Record<string, string> }).installments ?? {}) as Record<string, string>
  const queryClient = useQueryClient()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const type = (searchParams.get('type') as 'sales' | 'purchase') || 'sales'
  const isReturn = searchParams.get('is_return') === '1' || searchParams.get('is_return') === 'true'
  const editInvoiceIdRaw = searchParams.get('id')
  const editInvoiceId = editInvoiceIdRaw && /^\d+$/.test(editInvoiceIdRaw) ? Number(editInvoiceIdRaw) : null
  const isEditingInvoice = Boolean(editInvoiceId != null && editInvoiceId > 0 && !isReturn)
  const fromQuotation = (location.state as { fromQuotation?: QuotationToInvoicePayload } | null)?.fromQuotation
  const fromPurchaseRequest = (location.state as { fromPurchaseRequest?: PurchaseRequestToInvoicePayload } | null)?.fromPurchaseRequest
  const [quotationId, setQuotationId] = useState<number | null>(null)
  const [parentInvoiceId, setParentInvoiceId] = useState<number | null>(null)
  const [refInvoiceNumber, setRefInvoiceNumber] = useState('')
  const [barcodeSearch, setBarcodeSearch] = useState('')
  const [barcodeError, setBarcodeError] = useState<string | null>(null)
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'

  const [date, setDate] = useState(() => toLocalDateString(new Date()))
  const [dueDate, setDueDate] = useState('')
  const [partnerId, setPartnerId] = useState<number | null>(null)
  const [pricingGroupId, setPricingGroupId] = useState<number | null>(null)
  const [branchId, setBranchId] = useState<number | null>(null)
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [costCenterId, setCostCenterId] = useState<number | null>(null)
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null)
  const [isOnCredit, setIsOnCredit] = useState<boolean>(true)
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [amountPaidStr, setAmountPaidStr] = useState<string>('')
  const [currencyCode, setCurrencyCode] = useState<string>('')
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [receiptStatus, setReceiptStatus] = useState<string>('')
  const [salesRepId, setSalesRepId] = useState<number | null>(null)
  /** فاتورة مبيعات: عادي أو توصيل (لوحة الشحن / إسناد سائق) */
  const [salesOrderFulfillment, setSalesOrderFulfillment] = useState<'' | 'delivery'>('')
  const [deliveryDriverId, setDeliveryDriverId] = useState<number | null>(null)
  const [postSaveOpen, setPostSaveOpen] = useState(false)
  const [savedInvoiceId, setSavedInvoiceId] = useState<number | null>(null)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)
  const [showAddVendorModal, setShowAddVendorModal] = useState(false)
  const [addedCustomer, setAddedCustomer] = useState<Customer | null>(null)
  const [addedVendor, setAddedVendor] = useState<Vendor | null>(null)
  const [paymentTiming, setPaymentTiming] = useState<string>('')
  const [editFormLoaded, setEditFormLoaded] = useState(false)
  const [pendingInstallmentSchedule, setPendingInstallmentSchedule] = useState<CreateInstallmentFromInvoicePayload | null>(null)
  /** تبويبات نوع السداد — فاتورة مبيعات عادية فقط */
  const [salesPaymentTab, setSalesPaymentTab] = useState<SalesPaymentTab>('deferred')
  const [instCount, setInstCount] = useState(6)
  const [instPeriod, setInstPeriod] = useState<'monthly' | 'quarterly' | 'semi_annual' | 'annual'>('monthly')
  const [instDownPayment, setInstDownPayment] = useState(0)
  const [instDownType, setInstDownType] = useState<'fixed' | 'percent'>('fixed')
  const [instInterest, setInstInterest] = useState(0)
  /** طريقة دفع الدفعة الأولى فقط (تبويب تقسيط + مبلغ دفعة أولى) — مطلوبة للترحيل المحاسبي */
  const [installmentDownPaymentMethodId, setInstallmentDownPaymentMethodId] = useState<number | null>(null)
  const [paymentMethodMenuOpen, setPaymentMethodMenuOpen] = useState(false)
  const [paymentMethodMenuRect, setPaymentMethodMenuRect] = useState<PaymentMethodMenuRect | null>(null)
  const [paymentMethodHighlightIdx, setPaymentMethodHighlightIdx] = useState<number>(-1)
  const paymentMethodTriggerRef = useRef<HTMLButtonElement | null>(null)
  const paymentMethodMenuId = 'invoice-payment-method-menu'

  const [deliveryFees, setDeliveryFees] = useState<DeliveryFeeLine[]>([])
  const [partialPayment, setPartialPayment] = useState<PartialPaymentState>({
    enabled: false,
    amount: 0,
    method_id: null,
    date: toLocalDateString(new Date()),
  })
  type MixedPayRow = { id: string; method_id: number | null; amount: string }
  const [mixedPaymentLines, setMixedPaymentLines] = useState<MixedPayRow[]>([
    { id: 'm1', method_id: null, amount: '' },
  ])
  const [savedReceiptHint, setSavedReceiptHint] = useState<string | null>(null)

  const [loyaltyProgram, setLoyaltyProgram] = useState<any>(null)
  const [loyaltyRedeemPoints, setLoyaltyRedeemPoints] = useState(0)
  const [loyaltyRedeemDiscount, setLoyaltyRedeemDiscount] = useState(0)
  const [loyaltyProgramId, setLoyaltyProgramId] = useState<number | null>(null)

  const [availablePromos, setAvailablePromos] = useState<PromotionCalculateResult[]>([])
  const [appliedPromo, setAppliedPromo] = useState<PromotionCalculateResult | null>(null)
  const [promoDiscount, setPromoDiscount] = useState(0)

  useEffect(() => {
    if (!tenantId) return
    loyaltyApi.getProgram(tenantId).then((r) => setLoyaltyProgram(r.data.data ?? null)).catch(() => {})
  }, [tenantId])

  useEffect(() => {
    if (salesPaymentTab !== 'installment') return
    setPartialPayment((p) =>
      p.enabled ? { ...p, enabled: false, amount: 0, method_id: null } : p,
    )
  }, [salesPaymentTab])

  const { data: existingInvoice, isLoading: existingInvoiceLoading } = useQuery<Invoice>({
    queryKey: ['invoice', tenantId, editInvoiceId],
    queryFn: () => fetchInvoice(tenantId, editInvoiceId!),
    enabled: !!tenantId && isEditingInvoice && editInvoiceId != null,
  })

  const { data: deliveryDriversPage } = useQuery({
    queryKey: ['delivery-drivers', tenantId, 'invoice-create'],
    queryFn: () => fetchDeliveryDrivers(tenantId, { per_page: '200', is_active: '1' }),
    enabled: !!tenantId && type === 'sales' && !isReturn && salesOrderFulfillment === 'delivery',
  })
  const deliveryDrivers: DeliveryDriver[] = deliveryDriversPage?.data ?? []

  const { data: currencies = [] } = useQuery<Currency[]>({
    queryKey: ['currencies', tenantId],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId,
  })
  const defaultCurrency = currencies.find((c) => c.is_default) ?? currencies[0]
  const defaultCurrencyCode = defaultCurrency?.code ?? ''
  const invoiceCurrency = useMemo(() => {
    const list = currencies as Currency[]
    return (currencyCode ? list.find((c) => c.code === currencyCode) : defaultCurrency) ?? list[0]
  }, [currencies, currencyCode, defaultCurrency])
  const fmt = (n: number) => formatAmount(n, invoiceCurrency ?? undefined, locale)
  const fmtWithSymbol = (n: number) => formatAmountWithSymbol(n, invoiceCurrency ?? undefined, locale)
  const [lines, setLines] = useState<LineForm[]>([{ ...emptyLine }])
  const [additionalExpenses, setAdditionalExpenses] = useState<AdditionalExpenseForm[]>([])
  const [discountInputStr, setDiscountInputStr] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('amount')
  const [itemSearchByLine, setItemSearchByLine] = useState<Record<number, string>>({})
  const [openItemLineIdx, setOpenItemLineIdx] = useState<number | null>(null)
  const itemInputRef = useRef<HTMLInputElement | null>(null)
  const [itemDropdownRect, setItemDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [itemVariantsByItemId, setItemVariantsByItemId] = useState<Record<number, ItemVariant[] | undefined>>({})
  const [variantBulkModal, setVariantBulkModal] = useState<{ lineIdx: number; itemId: number } | null>(null)

  useEffect(() => {
    const t = setTimeout(() => barcodeInputRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (barcodeError) {
      const id = setTimeout(() => setBarcodeError(null), 2500)
      return () => clearTimeout(id)
    }
  }, [barcodeError])

  useEffect(() => {
    if (!isEditingInvoice || !existingInvoice) return
    if (existingInvoice.type !== type) {
      navigate(`/invoices/create?type=${existingInvoice.type}&id=${editInvoiceId}`, { replace: true })
    }
  }, [isEditingInvoice, existingInvoice, type, editInvoiceId, navigate])

  useEffect(() => {
    if (isEditingInvoice && existingInvoice?.installment_id) {
      setPendingInstallmentSchedule(null)
    }
  }, [isEditingInvoice, existingInvoice?.installment_id])

  useEffect(() => {
    setEditFormLoaded(false)
  }, [editInvoiceId])

  useEffect(() => {
    if (isEditingInvoice) return
    if (!fromQuotation) return
    setDate(fromQuotation.date)
    setDueDate(fromQuotation.due_date ?? '')
    setPartnerId(type === 'sales' ? (fromQuotation.customer_id ?? null) : (fromQuotation.vendor_id ?? null))
    setBranchId(fromQuotation.branch_id ?? null)
    setWarehouseId((fromQuotation as { warehouse_id?: number | null }).warehouse_id ?? null)
    setCostCenterId(fromQuotation.cost_center_id ?? null)
    setReferenceNumber(fromQuotation.reference_number ?? '')
    setNotes(fromQuotation.notes ?? '')
    if (fromQuotation.currency) setCurrencyCode(fromQuotation.currency)
    if (fromQuotation.exchange_rate != null) setExchangeRate(fromQuotation.exchange_rate)
    setQuotationId(fromQuotation.quotation_id)
    const lineForms: LineForm[] = fromQuotation.lines.map((l) => ({
      item_id: l.item_id,
      item_variant_id: (l as { item_variant_id?: number | null }).item_variant_id ?? null,
      unit_id: l.unit_id ?? null,
      description: l.description,
      quantity: l.quantity,
      unit_price: coerceInvoiceLineUnitPrice(l.unit_price),
      discount_amount: invoiceLineDiscountAmountFromApi({
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_percent: l.discount_percent,
        discount_amount: (l as { discount_amount?: number }).discount_amount,
      }),
      tax_percent: l.tax_percent ?? 0,
      serial_numbers: [],
      use_serial_number: false,
      expiry_date: '',
      batch_number: '',
    }))
    setLines(lineForms.length ? lineForms : [{ ...emptyLine }])
  }, [fromQuotation, type, isEditingInvoice])

  useEffect(() => {
    if (isEditingInvoice) return
    if (!fromPurchaseRequest || type !== 'purchase') return
    setDate(fromPurchaseRequest.date)
    setDueDate(fromPurchaseRequest.due_date ?? '')
    setPartnerId(fromPurchaseRequest.vendor_id ?? null)
    setBranchId(fromPurchaseRequest.branch_id ?? null)
    setWarehouseId(fromPurchaseRequest.warehouse_id ?? null)
    setReferenceNumber(fromPurchaseRequest.reference_number ?? '')
    setNotes(fromPurchaseRequest.notes ?? '')
    const discountAmt = fromPurchaseRequest.discount_amount ?? 0
    if (discountAmt > 0) setDiscountInputStr(String(discountAmt))
    const lineForms: LineForm[] = fromPurchaseRequest.lines.map((l) => ({
      item_id: l.item_id,
      item_variant_id: (l as { item_variant_id?: number | null }).item_variant_id ?? null,
      unit_id: l.unit_id ?? null,
      description: l.description,
      quantity: l.quantity,
      unit_price: coerceInvoiceLineUnitPrice(l.unit_price),
      discount_amount: invoiceLineDiscountAmountFromApi({
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_percent: l.discount_percent,
        discount_amount: (l as { discount_amount?: number }).discount_amount,
      }),
      tax_percent: l.tax_percent ?? 0,
      serial_numbers: [],
      use_serial_number: false,
      expiry_date: '',
      batch_number: '',
    }))
    setLines(lineForms.length ? lineForms : [{ ...emptyLine }])
  }, [fromPurchaseRequest, type, isEditingInvoice])

  useLayoutEffect(() => {
    if (openItemLineIdx === null) {
      setItemDropdownRect(null)
      return
    }
    const el = itemInputRef.current
    if (!el) {
      setItemDropdownRect(null)
      return
    }
    const update = () => {
      const r = el.getBoundingClientRect()
      setItemDropdownRect({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [openItemLineIdx, itemSearchByLine[openItemLineIdx ?? -1]])

  function findItemByCodeOrBarcode(q: string): Item | null {
    const s = q.trim()
    if (!s) return null
    const lower = s.toLowerCase()
    return items.find(
      (i) =>
        (i.code && i.code.toLowerCase() === lower) ||
        (i.barcode && i.barcode.toLowerCase() === lower) ||
        (i.sku && i.sku.toLowerCase() === lower)
    ) ?? null
  }

  /** يبحث عن صنف ووحدة حسب الباركود (يدعم باركود الوحدات المتعددة مثل الكرتون) */
  function findItemAndUnitByBarcode(q: string): { item: Item & { unit_options?: ItemUnitOption[] }; unit_id: number | null; unit_price: number | null } | null {
    const s = q.trim()
    if (!s) return null
    const lower = s.toLowerCase()
    for (const item of items as (Item & { unit_options?: ItemUnitOption[] })[]) {
      const opts = item.unit_options ?? []
      const unitMatch = opts.find((o) => o.barcode && o.barcode.trim().toLowerCase() === lower)
      if (unitMatch) {
        const unitPrice =
          type === 'sales'
            ? (unitMatch.selling_price ?? item.selling_price)
            : (unitMatch.cost_price ?? unitMatch.selling_price ?? item.cost_price)
        return {
          item,
          unit_id: unitMatch.unit_id,
          unit_price: coerceInvoiceLineUnitPrice(Number(unitPrice)) ??
            coerceInvoiceLineUnitPrice(type === 'sales' ? item.selling_price : item.cost_price),
        }
      }
    }
    const item = findItemByCodeOrBarcode(q) as (Item & { unit_options?: ItemUnitOption[] }) | null
    if (!item) return null
    const unitId = item.unit_id ?? (item.unit_options?.[0]?.unit_id) ?? null
    const unitPrice = getPriceForUnit(item, unitId)
    return { item, unit_id: unitId, unit_price: coerceInvoiceLineUnitPrice(unitPrice) }
  }

  function filterItemsBySearch(query: string): (Item & { variant_id?: number | null; variant_label?: string | null })[] {
    if (!query.trim()) return items as (Item & { variant_id?: number | null; variant_label?: string | null })[]
    const q = query.trim().toLowerCase()

    const flat: (Item & { variant_id?: number | null; variant_label?: string | null })[] = []

    for (const item of items as (Item & { has_variants?: boolean; variants?: { id: number; name: string; barcode?: string | null; options?: Record<string, string> | null }[] })[]) {
      const hasVariants = item.has_variants && (item.variants?.length ?? 0) > 0
      if (!hasVariants) {
        if (
          item.name.toLowerCase().includes(q) ||
          (item.name_en?.toLowerCase().includes(q)) ||
          item.code.toLowerCase().includes(q) ||
          (item.barcode?.toLowerCase().includes(q)) ||
          (item.sku?.toLowerCase().includes(q))
        ) {
          flat.push(item)
        }
        continue
      }

      for (const v of item.variants || []) {
        const label = v.name || `${item.name} - ${Object.values(v.options || {}).join(' - ')}`
        const barcode = v.barcode || item.barcode
        const searchable = [
          item.name,
          item.name_en ?? '',
          item.code ?? '',
          barcode ?? '',
          label,
        ]
        if (searchable.some((s) => s.toLowerCase().includes(q))) {
          flat.push({
            ...item,
            barcode,
            variant_id: v.id,
            variant_label: label,
          })
        }
      }
    }

    return flat
  }
  const { data: customersData } = useQuery<PaginatedResponse<Customer>>({
    queryKey: ['customers', tenantId, branchId, type],
    queryFn: () =>
      fetchCustomers(tenantId, {
        per_page: '500',
        ...(branchId != null ? { branch_id: String(branchId) } : {}),
      }),
    enabled: !!tenantId && type === 'sales',
  })

  const { data: vendorsData } = useQuery<PaginatedResponse<Vendor>>({
    queryKey: ['vendors', tenantId, branchId, type],
    queryFn: () =>
      fetchVendors(tenantId, {
        per_page: '500',
        ...(branchId != null ? { branch_id: String(branchId) } : {}),
      }),
    enabled: !!tenantId && type === 'purchase',
  })

  const { data: itemsData } = useQuery<PaginatedResponse<Item>>({
    queryKey: ['items', tenantId],
    queryFn: () => fetchItems(tenantId),
    enabled: !!tenantId,
  })

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: async () => {
      const res = await fetchBranches(tenantId, { status: 'active' })
      if (Array.isArray(res)) return res
      if (res && typeof res === 'object' && 'data' in res) return (res as { data?: Branch[] }).data ?? []
      return []
    },
    enabled: !!tenantId,
  })
  const { data: warehousesResp } = useQuery<{ data: Warehouse[] }>({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: !!tenantId,
  })
  const warehouses = warehousesResp?.data ?? []

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

  const selectedPaymentMethod = useMemo(
    () => paymentMethods.find((pm) => pm.id === paymentMethodId),
    [paymentMethods, paymentMethodId],
  )

  const isInstallmentSalesTab =
    type === 'sales' &&
    !isReturn &&
    salesPaymentTab === 'installment' &&
    !(isEditingInvoice && Boolean(existingInvoice?.installment_id))

  const requiresInstallmentDraftBeforeSave =
    (!isOnCredit && paymentMethodId != null && paymentMethodRequiresInstallmentPlan(selectedPaymentMethod)) ||
    isInstallmentSalesTab

  const { data: pricingGroups = [] } = useQuery<PricingGroup[]>({
    queryKey: ['pricing-groups', tenantId],
    queryFn: () => fetchPricingGroups(tenantId),
    enabled: !!tenantId && type === 'sales',
  })

  const { data: postableAccounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts-postable', tenantId],
    queryFn: () => fetchAccounts(tenantId, { active_only: '1', postable_only: '1' }),
    enabled: !!tenantId && type === 'purchase' && !isReturn,
  })

  const { data: settings, isSuccess: settingsLoaded } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
  const { data: accountDefaults } = useQuery({
    queryKey: ['account-defaults', tenantId],
    queryFn: () => fetchAccountDefaults(tenantId),
    enabled: !!tenantId && type === 'purchase' && !isReturn,
  })
  const defaultPurchaseExpenseAccountId = useMemo(() => {
    const id = accountDefaults?.inventory_account_id
    if (id == null || id === 0) return null
    const n = Number(id)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [accountDefaults])
  const emptyAdditionalExpense = useCallback((): AdditionalExpenseForm => ({
    description: '',
    expense_account_id: type === 'purchase' && !isReturn ? defaultPurchaseExpenseAccountId : null,
    creditor_account_id: null,
    amount_net: 0,
    tax_amount: 0,
    total_amount: 0,
  }), [type, isReturn, defaultPurchaseExpenseAccountId])
  const settingsRecord = settings as Record<string, unknown> | undefined
  const defaultVatRate = parseDefaultVatRate(settingsRecord)
  const invoiceUseSerialNumbers = Boolean(settingsRecord?.invoice_use_serial_numbers)
  const invoiceExpiryDatesEnabled = isInvoiceExpiryDatesEnabled(settingsRecord)
  const salesRepEnabledInSettings = settingsRecord?.sales_rep_enabled === true
  const salesRepRequiredInSettings = settingsRecord?.sales_rep_required === true
  const invoiceVariantsSalesEnabled = isInvoiceVariantsSalesEnabled(settingsRecord)
  const invoiceVariantsPurchasesEnabled = isInvoiceVariantsPurchasesEnabled(settingsRecord)
  const variantsEnabledForInvoice =
    type === 'sales' ? invoiceVariantsSalesEnabled : type === 'purchase' ? invoiceVariantsPurchasesEnabled : false

  /** بعد تحميل الإعدادات: تطبيق نسبة الضريبة الافتراضية على أسطر فاتورة جديدة */
  useEffect(() => {
    if (isEditingInvoice || settings == null) return
    setLines((prev) => prev.map((line) => ({ ...line, tax_percent: defaultVatRate })))
  }, [defaultVatRate, settings, isEditingInvoice])

  const ensureItemVariantsInMap = useCallback(
    async (itemId: number): Promise<ItemVariant[]> => {
      try {
        const full = await fetchItem(tenantId, itemId)
        const raw =
          (full as Item & { item_variants?: ItemVariant[] }).item_variants ??
          (full as Item & { variants?: ItemVariant[] }).variants ??
          []
        const list = Array.isArray(raw) ? raw : []
        setItemVariantsByItemId((m) => ({ ...m, [itemId]: list }))
        return list
      } catch {
        setItemVariantsByItemId((m) => ({ ...m, [itemId]: [] }))
        return []
      }
    },
    [tenantId],
  )

  useEffect(() => {
    if (!variantBulkModal) return
    void ensureItemVariantsInMap(variantBulkModal.itemId)
  }, [variantBulkModal, ensureItemVariantsInMap])

  function addItemByBarcodeOrCode() {
    const q = barcodeSearch.trim()
    if (!q) return
    const resolved = findItemAndUnitByBarcode(q)
    if (!resolved) {
      setBarcodeError(lang === 'ar' ? 'الصنف غير موجود' : 'Item not found')
      beepNotFound()
      return
    }
    const { item, unit_id, unit_price } = resolved
    setBarcodeError(null)
    const existingIdx = lines.findIndex((l) => l.item_id === item.id && l.unit_id === unit_id)
    if (existingIdx >= 0) {
      updateLine(existingIdx, 'quantity', lines[existingIdx].quantity + 1)
    } else {
      const taxPercent = defaultVatRate
      const newLine: LineForm = {
        item_id: item.id,
        item_variant_id: null,
        unit_id,
        description: item.name,
        quantity: 1,
        unit_price,
        discount_amount: 0,
        tax_percent: taxPercent,
        serial_numbers: [],
        use_serial_number: (item as Item & { use_serial_number?: boolean }).use_serial_number === true,
        expiry_date: '',
        batch_number: '',
      }
      const newLineIndex = lines.length
      setLines((prev) => [...prev, newLine])
      void (async () => {
        const vars = await ensureItemVariantsInMap(item.id)
        if (variantsEnabledForInvoice && vars.length > 0) {
          setVariantBulkModal({ lineIdx: newLineIndex, itemId: item.id })
        }
      })()
    }
    setBarcodeSearch('')
    barcodeInputRef.current?.focus()
  }

  const { data: salesRepsData } = useQuery({
    queryKey: ['sales-reps', tenantId],
    queryFn: () => fetchSalesReps(tenantId, { per_page: '200' }),
    enabled: !!tenantId && type === 'sales' && canAccessFeature('sales_reps') && salesRepEnabledInSettings,
  })

  const [loadingRefInvoice, setLoadingRefInvoice] = useState(false)
  const [refInvoiceError, setRefInvoiceError] = useState<string | null>(null)

  async function loadReturnFromRefNumber() {
    const num = refInvoiceNumber.trim()
    if (!num) return
    setLoadingRefInvoice(true)
    setRefInvoiceError(null)
    try {
      const res = await fetchInvoices(tenantId, { number: num, type })
      const list = res?.data ?? []
      const first = list[0]
      if (!first?.id) {
        setRefInvoiceError(lang === 'ar' ? 'لم يتم العثور على فاتورة بهذا الرقم' : 'No invoice found with this number')
        return
      }
      const inv = await fetchInvoice(tenantId, first.id)
      setParentInvoiceId(inv.id)
      setPartnerId(type === 'sales' ? (inv.customer_id ?? null) : (inv.vendor_id ?? null))
      setDate(inv.date ? String(inv.date).slice(0, 10) : date)
      setBranchId(inv.branch_id ?? branchId)
      setWarehouseId(inv.warehouse_id ?? warehouseId)
      const lineForms: LineForm[] = (inv.lines ?? []).map((l) => ({
        item_id: l.item_id ?? null,
        item_variant_id: (l as InvoiceLine).item_variant_id ?? null,
        unit_id: l.unit_id ?? null,
        description: l.description ?? '',
        quantity: l.quantity ?? 1,
        unit_price: coerceInvoiceLineUnitPrice(l.unit_price),
        discount_amount: invoiceLineDiscountAmountFromApi(l as InvoiceLine),
        tax_percent: l.tax_percent ?? defaultVatRate,
        serial_numbers: [],
        use_serial_number: false,
        expiry_date: (l as InvoiceLine).expiry_date ? String((l as InvoiceLine).expiry_date).slice(0, 10) : '',
        batch_number: (l as InvoiceLine).batch_number ? String((l as InvoiceLine).batch_number) : '',
      }))
      setLines(lineForms.length ? lineForms : [{ ...emptyLine }])
      setRefInvoiceNumber('')
    } catch {
      setRefInvoiceError(lang === 'ar' ? 'خطأ في تحميل الفاتورة' : 'Error loading invoice')
    } finally {
      setLoadingRefInvoice(false)
    }
  }

  const partners = type === 'sales'
    ? (() => {
        const base = customersData?.data ?? []
        if (!addedCustomer) return base
        if (base.some((c) => c.id === addedCustomer.id)) return base
        return [...base, addedCustomer]
      })()
    : (() => {
        const base = vendorsData?.data ?? []
        if (!addedVendor) return base
        if (base.some((v) => v.id === addedVendor.id)) return base
        return [...base, addedVendor]
      })()
  const items = itemsData?.data ?? []

  useEffect(() => {
    if (salesOrderFulfillment !== 'delivery') setDeliveryDriverId(null)
  }, [salesOrderFulfillment])

  useEffect(() => {
    if (!isEditingInvoice || !existingInvoice || editFormLoaded) return
    if (existingInvoice.id !== editInvoiceId) return
    const inv = existingInvoice
    setDate(inv.date ? String(inv.date).slice(0, 10) : '')
    setDueDate(inv.due_date ? String(inv.due_date).slice(0, 10) : '')
    setPartnerId(inv.type === 'sales' ? inv.customer_id : inv.vendor_id)
    setBranchId(inv.branch_id ?? null)
    setWarehouseId(inv.warehouse_id ?? null)
    setCostCenterId(inv.cost_center_id ?? null)
    setSalesRepId((inv as Invoice & { sales_rep_id?: number | null }).sales_rep_id ?? null)
    setSalesOrderFulfillment(inv.order_type === 'delivery' ? 'delivery' : '')
    setDeliveryDriverId(null)
    const pmId = inv.payment_method_id ?? inv.paymentMethod?.id ?? null
    setPaymentMethodId(pmId != null ? Number(pmId) : null)
    setReceiptStatus(inv.receipt_status ?? '')
    const pt = inv.payment_timing ?? (pmId != null ? 'paid' : 'deferred')
    setPaymentTiming(pt)
    const deferred = pt === 'deferred' || (pt !== 'paid' && pmId == null)
    setIsOnCredit(deferred)
    setAmountPaidStr(deferred ? '' : String(inv.amount_paid ?? ''))
    setReferenceNumber(inv.reference_number ?? '')
    setNotes(inv.notes ?? '')
    if (inv.currency) {
      setCurrencyCode(inv.currency)
      const cur = (currencies as { code: string; exchange_rate?: number }[]).find((c) => c.code === inv.currency)
      const invEr = (inv as Invoice & { exchange_rate?: number }).exchange_rate
      setExchangeRate(
        cur && typeof cur.exchange_rate === 'number'
          ? cur.exchange_rate
          : (typeof invEr === 'number' ? invEr : 1)
      )
    }
    const loyaltyPts = Number(
      (inv as Invoice & { loyalty_redeem_points?: number }).loyalty_redeem_points ?? 0,
    )
    const loyaltyVal = Number(
      (inv as Invoice & { loyalty_redeem_value?: number }).loyalty_redeem_value ?? 0,
    )
    const loyaltyProg =
      (inv as Invoice & { loyalty_program_id?: number | null }).loyalty_program_id ?? null

    let headerDiscountDa = Number(inv.discount_amount ?? 0)
    if (loyaltyPts > 0.0005 && loyaltyVal > 0.0005) {
      setLoyaltyRedeemPoints(Math.round(loyaltyPts * 1000) / 1000)
      setLoyaltyRedeemDiscount(Math.round(loyaltyVal * 1000) / 1000)
      setLoyaltyProgramId(loyaltyProg != null ? Number(loyaltyProg) : null)
      headerDiscountDa = Math.max(0, headerDiscountDa - loyaltyVal)
    } else {
      setLoyaltyRedeemPoints(0)
      setLoyaltyRedeemDiscount(0)
      setLoyaltyProgramId(null)
    }

    if (headerDiscountDa > 0) {
      setDiscountInputStr(String(Math.round(headerDiscountDa * 1000) / 1000))
      setDiscountType('amount')
    } else {
      setDiscountInputStr('')
    }
    setLines(
      (inv.lines?.length ? inv.lines : [{ ...emptyLine }]).map((l) => {
        const itemData = items.find((i) => i.id === l.item_id) as (Item & { use_serial_number?: boolean }) | undefined
        return {
          item_id: l.item_id ?? null,
          item_variant_id: (l as InvoiceLine).item_variant_id ?? null,
          unit_id: l.unit_id ?? null,
          description: l.description ?? '',
          quantity: Number(l.quantity),
          unit_price: coerceInvoiceLineUnitPrice(l.unit_price),
          discount_amount: invoiceLineDiscountAmountFromApi(l as InvoiceLine),
          tax_percent: Number(l.tax_percent ?? 0),
          serial_numbers: Array.isArray(l.serial_numbers) ? l.serial_numbers : [],
          use_serial_number: itemData?.use_serial_number ?? (l as { use_serial_number?: boolean }).use_serial_number ?? false,
          expiry_date: (l as InvoiceLine).expiry_date ? String((l as InvoiceLine).expiry_date).slice(0, 10) : '',
          batch_number: (l as InvoiceLine).batch_number ? String((l as InvoiceLine).batch_number) : '',
        }
      })
    )
    if (inv.type === 'purchase' && !inv.is_return) {
      const rawExp = (inv as Invoice & { additional_expenses?: InvoiceAdditionalExpense[] }).additional_expenses
        ?? (inv as Invoice & { additionalExpenses?: InvoiceAdditionalExpense[] }).additionalExpenses
      setAdditionalExpenses(
        Array.isArray(rawExp) && rawExp.length
          ? rawExp.map((e) => ({
              description: String(e.description ?? ''),
              expense_account_id: e.expense_account_id != null ? Number(e.expense_account_id) : null,
              creditor_account_id: e.creditor_account_id != null ? Number(e.creditor_account_id) : null,
              amount_net: Number(e.amount_net ?? 0),
              tax_amount: Number(e.tax_amount ?? 0),
              total_amount: Number(e.total_amount ?? Number(e.amount_net ?? 0) + Number(e.tax_amount ?? 0)),
            }))
          : []
      )
    } else {
      setAdditionalExpenses([])
    }
    if (inv.type === 'sales' && !inv.is_return) {
      if (inv.installment_id) {
        setSalesPaymentTab('installment')
        const paidInst = Number(inv.amount_paid ?? 0)
        const pmInst = inv.payment_method_id ?? inv.paymentMethod?.id ?? null
        if (paidInst > 0.0005 && pmInst != null) {
          setInstallmentDownPaymentMethodId(Number(pmInst))
        } else {
          setInstallmentDownPaymentMethodId(null)
        }
      } else {
        setInstallmentDownPaymentMethodId(null)
        const paidTot = Number(inv.amount_paid ?? 0)
        const invTotal = Number(inv.total ?? 0)
        if (deferred) {
          setSalesPaymentTab('deferred')
        } else if (paidTot > 0.0005 && paidTot < invTotal - 0.0005) {
          setSalesPaymentTab('mixed')
        } else {
          const pmTy = inv.paymentMethod?.type
          setSalesPaymentTab(pmTy === 'bank' ? 'bank' : 'cash')
        }
      }
    }
    setEditFormLoaded(true)
  }, [isEditingInvoice, existingInvoice, editInvoiceId, editFormLoaded, items, currencies])

  // إظهار عمود الأرقام التسلسلية فقط عندما:
  // - ميزة الأرقام التسلسلية مفعّلة في الإعدادات، و
  // - يوجد على الأقل سطر واحد لصنف مفعّل عليه خيار تتبع الأرقام التسلسلية
  const showSerialColumn = invoiceUseSerialNumbers && lines.some((line) => line.use_serial_number === true)
  /** لا نعرض أعمدة المتغير/الصلاحية حتى تُحمَّل الإعدادات من الـ API */
  const showVariantColumn = settingsLoaded && variantsEnabledForInvoice
  const showExpiryColumns = settingsLoaded && invoiceExpiryDatesEnabled && (type === 'sales' || type === 'purchase')
  const showPurchaseExpensesSection = type === 'purchase' && !isReturn
  const showStockColumn = type === 'sales' && !isReturn
  const activeCustomer = type === 'sales' && partnerId ? (partners as Customer[]).find((c) => c.id === partnerId) : null
  const customerGroup = activeCustomer?.customer_group ?? null

  // عند اختيار عميل في فاتورة مبيعات: تحميل مجموعة التسعير الافتراضية الخاصة به
  useEffect(() => {
    if (isEditingInvoice) return
    if (type !== 'sales') return
    const next = activeCustomer?.pricing_group_id ?? null
    if (next == null) {
      setPricingGroupId(null)
      return
    }

    const g = (pricingGroups as PricingGroup[]).find((x) => x.id === next) ?? null
    if (!g) {
      setPricingGroupId(null)
      return
    }

    // التقييد حسب قائمة الدور
    const allowedByRole = Array.isArray(meData?.pricing_group_ids) ? meData!.pricing_group_ids! : []
    if (allowedByRole.length && !allowedByRole.includes(g.id)) {
      setPricingGroupId(null)
      return
    }

    // التقييد حسب الفرع
    const branchIds = Array.isArray(g.branches) ? g.branches.map((b) => b.id) : []
    if (branchIds.length) {
      if (branchId == null || !branchIds.includes(branchId)) {
        setPricingGroupId(null)
        return
      }
    }

    // التقييد حسب المستخدم الحالي (tenant_users.id)
    const userScopeIds = Array.isArray((g as any).tenantUsers)
      ? ((g as any).tenantUsers as any[]).map((tu) => Number(tu?.id)).filter((n) => Number.isFinite(n))
      : Array.isArray((g as any).tenant_users)
        ? ((g as any).tenant_users as any[]).map((tu) => Number(tu?.id)).filter((n) => Number.isFinite(n))
        : []
    if (userScopeIds.length) {
      const meTenantUserId = meData?.tenant_user_id ?? null
      if (meTenantUserId == null || !userScopeIds.includes(meTenantUserId)) {
        setPricingGroupId(null)
        return
      }
    }

    setPricingGroupId(next)
  }, [
    type,
    activeCustomer?.id,
    activeCustomer?.pricing_group_id,
    isEditingInvoice,
    pricingGroups,
    meData?.pricing_group_ids,
    meData?.tenant_user_id,
    branchId,
  ])

  const activePricingGroup = useMemo(
    () => (type === 'sales' && pricingGroupId ? (pricingGroups as PricingGroup[]).find((g) => g.id === pricingGroupId) : null),
    [pricingGroups, pricingGroupId, type],
  )

  const priceDecimals = useMemo(() => {
    const doc = (settings as Record<string, unknown>)?.doc_amount_decimals
    const d = doc != null && doc !== '' ? Number(doc) : (invoiceCurrency as { decimal_places?: number } | undefined)?.decimal_places
    const n = Number.isFinite(Number(d)) ? Number(d) : 2
    return Math.min(6, Math.max(0, Math.floor(n)))
  }, [settings, invoiceCurrency])

  function roundPrice(n: number): number {
    const f = 10 ** priceDecimals
    return Math.round((Number(n) || 0) * f) / f
  }

  /** إدخال إجمالي السطر (بعد خصم وضريبة السطر) → اشتقاق سعر الوحدة — يقرأ آخر كمية/خصم/ضريبة من الحالة */
  function applyLineTotalInput(lineIndex: number, raw: string) {
    setLines((prev) => {
      const line = prev[lineIndex]
      if (!line) return prev
      const trimmed = raw.trim()
      if (trimmed === '' || trimmed === '.') {
        return prev.map((l, i) => (i === lineIndex ? { ...l, unit_price: null } : l))
      }
      const total = parseFloat(trimmed)
      if (!Number.isFinite(total) || total < 0) return prev
      const q = Number(line.quantity)
      if (!Number.isFinite(q) || q <= 0) return prev
      const u = deriveUnitPriceFromLineTotal(total, q, line.discount_amount ?? 0, line.tax_percent)
      if (u === null) return prev
      return prev.map((l, i) => (i === lineIndex ? { ...l, unit_price: roundPrice(u) } : l))
    })
  }

  function applyPricingGroupToPrice(base: number): number {
    if (type !== 'sales') return base
    const g = activePricingGroup
    if (!g) return base
    const v = Number(g.value) || 0
    const op = (g as PricingGroup & { operation_type?: string }).operation_type
      ?? (g.pricing_type === 'fixed' ? 'fixed_price' : 'discount_percent')
    const next =
      op === 'discount_percent'
        ? base * (1 - v / 100)
        : op === 'increase_percent'
          ? base * (1 + v / 100)
          : Number(v)
    return roundPrice(next)
  }

  // عند تغيير مجموعة التسعير (بسبب اختيار عميل/تبديل يدوي): تحديث أسعار الأسطر الحالية تلقائياً
  useEffect(() => {
    if (type !== 'sales') return
    if (isEditingInvoice) return
    setLines((prev) =>
      prev.map((l) => {
        if (!l.item_id) return l
        const it = items.find((i) => i.id === l.item_id) as (Item & { unit_options?: ItemUnitOption[] }) | undefined
        if (!it) return l
        const newPrice = getPriceForUnit(it, l.unit_id ?? null)
        return { ...l, unit_price: coerceInvoiceLineUnitPrice(newPrice) }
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingGroupId, activePricingGroup?.id])

  function setAttachmentFromFile(file: File | null) {
    if (!file) {
      setAttachmentFile(null)
      return
    }

    const isImage = file.type.startsWith('image/')
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

    if (!isImage && !isPdf) {
      setSubmitError(lang === 'ar' ? 'نوع الملف غير مدعوم. ارفع صورة (JPG/PNG) أو PDF.' : 'Unsupported file type. Upload JPG/PNG or PDF.')
      setAttachmentFile(null)
      return
    }

    setSubmitError(null)
    setAttachmentFile(file)
  }

  // عند اختيار عميل في فاتورة مبيعات، سحب عملته المفضلة تلقائياً؛ وعند إلغاء الاختيار العودة للعملة الافتراضية
  useEffect(() => {
    if (isEditingInvoice) return
    if (type !== 'sales' || !currencies.length) return
    if (partnerId && activeCustomer?.currency) {
      setCurrencyCode(activeCustomer.currency)
      const cur = (currencies as { code: string; exchange_rate?: number }[]).find((c) => c.code === activeCustomer.currency)
      setExchangeRate(cur && typeof cur.exchange_rate === 'number' ? cur.exchange_rate : 1)
    } else if (!partnerId && defaultCurrencyCode) {
      setCurrencyCode(defaultCurrencyCode)
      setExchangeRate(defaultCurrency?.exchange_rate ?? 1)
    }
  }, [type, partnerId, activeCustomer?.id, activeCustomer?.currency, currencies, defaultCurrencyCode, defaultCurrency?.exchange_rate, isEditingInvoice])

  function invalidateAfterInvoiceAccountingChange() {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    if (editInvoiceId != null) {
      queryClient.invalidateQueries({ queryKey: ['invoice', tenantId, editInvoiceId] })
    }
    queryClient.invalidateQueries({ queryKey: ['journalEntries', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
    queryClient.invalidateQueries({ queryKey: ['journalEntry-from-statement', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
    queryClient.invalidateQueries({ queryKey: ['trialBalance', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['trialBalance', 'accountStatementOverview', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['accounts', tenantId] })
  }

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => createInvoice(tenantId, data),
    onSuccess: () => {
      invalidateAfterInvoiceAccountingChange()
    },
    onError: (err: { response?: { data?: { message?: string }; status?: number }; message?: string }) => {
      const msg = err.response?.data?.message ?? err.message ?? (lang === 'ar' ? 'فشل حفظ الفاتورة. تحقق من الإعدادات (الحسابات الأساسية، ربط المورد/العميل بحساب، وحساب مخزون للأصناف).' : 'Failed to save invoice. Check settings (default accounts, vendor/customer account link, item inventory account).')
      setSubmitError(msg)
    },
  })

  const updateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => updateInvoice(tenantId, editInvoiceId!, data),
    onSuccess: invalidateAfterInvoiceAccountingChange,
    onError: (err: { response?: { data?: { message?: string }; status?: number }; message?: string }) => {
      const msg = err.response?.data?.message ?? err.message ?? (lang === 'ar' ? 'فشل تحديث الفاتورة.' : 'Failed to update invoice.')
      setSubmitError(msg)
    },
  })

  function updateLine(index: number, field: keyof LineForm, value: string | number | string[] | null | undefined) {
    setLines((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      // عند تغيير الكمية: ضبط عدد خانات الأرقام التسلسلية ليطابق الكمية الجديدة
      if (field === 'quantity') {
        const qty = Math.max(0, Math.round(Number(value)))
        const current = next[index].serial_numbers ?? []
        if (qty > current.length) {
          next[index].serial_numbers = [...current, ...Array(qty - current.length).fill('')]
        } else if (qty < current.length) {
          next[index].serial_numbers = current.slice(0, qty)
        }
      }
      if (field === 'discount_amount' || field === 'quantity' || field === 'unit_price') {
        const row = next[index]
        const g = lineGrossBeforeDiscount(row)
        const da = Math.max(0, Number(row.discount_amount) || 0)
        const capped = g <= 0 ? 0 : Math.min(da, Math.round(g * 1000) / 1000)
        next[index] = { ...next[index], discount_amount: capped }
      }
      return next
    })
  }

  function setLineSerialAt(lineIdx: number, serialIdx: number, value: string) {
    setLines((prev) => {
      const next = [...prev]
      const arr = [...(next[lineIdx].serial_numbers ?? [])]
      while (arr.length <= serialIdx) arr.push('')
      arr[serialIdx] = value
      next[lineIdx] = { ...next[lineIdx], serial_numbers: arr }
      return next
    })
  }

  function getPriceForUnit(it: Item & { unit_options?: ItemUnitOption[] }, uid: number | null): number {
    if (!uid) {
      const base = type === 'sales' ? it.selling_price : it.cost_price
      return type === 'sales' ? applyPricingGroupToPrice(base) : base
    }
    const opt = (it.unit_options || []).find((o) => o.unit_id === uid)
    if (opt) {
      const price =
        type === 'sales'
          ? (opt.selling_price ?? it.selling_price)
          : (opt.cost_price ?? opt.selling_price ?? it.cost_price)
      const base = Number(price) ?? (type === 'sales' ? it.selling_price : it.cost_price)
      return type === 'sales' ? applyPricingGroupToPrice(base) : base
    }
    const base = type === 'sales' ? it.selling_price : it.cost_price
    return type === 'sales' ? applyPricingGroupToPrice(base) : base
  }

  /** عند تغيير الوحدة: تحديث unit_id و unit_price في الحالة فوراً لظهور السعر في خانة السعر */
  function handleUnitChange(lineIndex: number, unitId: number | null, newPrice: number) {
    setLines((prev) => {
      const next = prev.map((l, i) =>
        i === lineIndex ? { ...l, unit_id: unitId, unit_price: coerceInvoiceLineUnitPrice(newPrice) } : l
      )
      const row = next[lineIndex]
      const g = lineGrossBeforeDiscount(row)
      const da = Math.max(0, Number(row.discount_amount) || 0)
      if (da > g + 1e-9) {
        next[lineIndex] = { ...next[lineIndex], discount_amount: Math.round(g * 1000) / 1000 }
      }
      return next
    })
  }

  /** ضريبة السطر الافتراضية = نسبة VAT من إعدادات الشركة (تبويب الضرائب) */
  function getDefaultTaxForItem(_it: Item & { default_tax_percent?: number | null }) {
    return defaultVatRate
  }

  async function selectItem(index: number, itemId: number, optVariantId?: number | null) {
    const item = items.find((i) => i.id === itemId) as
      | (Item & { unit_options?: ItemUnitOption[]; default_tax_percent?: number | null; use_serial_number?: boolean })
      | undefined
    if (!item) return
    const unitId = item.unit_id ?? (item.unit_options?.[0]?.unit_id) ?? null
    const unitPrice = coerceInvoiceLineUnitPrice(getPriceForUnit(item, unitId))
    const taxPercent = getDefaultTaxForItem(item)
    const vars = await ensureItemVariantsInMap(itemId)
    let vid: number | null = optVariantId != null && optVariantId > 0 ? optVariantId : null
    if (vid == null && variantsEnabledForInvoice && vars.length === 1) {
      vid = vars[0].id
    }
    setLines((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        item_id: item.id,
        item_variant_id: vid,
        unit_id: unitId,
        description: item.name,
        unit_price: unitPrice,
        discount_amount: 0,
        tax_percent: taxPercent,
        serial_numbers: next[index].serial_numbers ?? [],
        use_serial_number: item.use_serial_number === true,
        expiry_date: '',
        batch_number: '',
      }
      return next
    })
    if (variantsEnabledForInvoice && vars.length > 1 && (vid == null || vid <= 0)) {
      setVariantBulkModal({ lineIdx: index, itemId: item.id })
    }
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine, tax_percent: defaultVatRate, serial_numbers: [] }])
  }

  function moveLine(from: number, to: number) {
    if (from === to) return
    setLines((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function removeLine(index: number) {
    if (lines.length <= 1) return
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  // القيمة التي يكتبها المستخدم في خانة الخصم (مربوطة بالحقل في الشاشة)
  const discountValue = discountInputStr.trim() === '' ? 0 : parseFloat(discountInputStr) || 0
  // نوع الخصم للمعادلة: نسبة أو مبلغ
  const discountTypeForCalc = discountType === 'percent' ? 'percentage' as const : 'amount' as const

  // حساب الإجماليات باستخدام نسبة ضريبة كل سطر بدلاً من نسبة ثابتة
  const invoiceTotals = useMemo(() => {
    let rawSubtotal = 0
    let totalLineTax = 0
    for (const line of lines) {
      const lineBase = lineGrossBeforeDiscount(line)
      const afterLineDiscount = invoiceLineNetBeforeTax(lineBase, Number(line.discount_amount) || 0)
      const lineTax = afterLineDiscount * ((line.tax_percent || 0) / 100)
      rawSubtotal += afterLineDiscount
      totalLineTax += lineTax
    }
    // خصم الفاتورة الإجمالي
    const invoiceDiscount = discountTypeForCalc === 'percentage'
      ? rawSubtotal * (discountValue / 100)
      : Math.min(discountValue, rawSubtotal)
    const deliveryExtra =
      type === 'sales' && !isReturn
        ? Math.round(deliveryFees.reduce((s, f) => s + f.amount, 0) * 1000) / 1000
        : 0
    const baseBeforeDelivery = Math.max(0, rawSubtotal - invoiceDiscount)
    const taxableAmount = Math.max(0, baseBeforeDelivery + deliveryExtra)
    // تعديل الضريبة تناسبياً عند خصم الفاتورة أو إضافة رسوم إلى الوعاء الضريبي
    const ratio = rawSubtotal > 0 ? taxableAmount / rawSubtotal : 0
    const adjustedTax = totalLineTax * ratio
    const total = taxableAmount + adjustedTax
    return {
      subtotal: rawSubtotal.toFixed(3),
      discount: invoiceDiscount.toFixed(3),
      additionsTotal: deliveryExtra.toFixed(3),
      taxable: taxableAmount.toFixed(3),
      tax: adjustedTax.toFixed(3),
      total: total.toFixed(3),
    }
  }, [lines, discountValue, discountType, deliveryFees, type, isReturn])

  // شكل موحّد للعرض وبناء الـ payload (مأخوذ من processInvoiceTotals فقط)
  const totals = useMemo(
    () => ({
      subtotal: Number(invoiceTotals.subtotal),
      discountAmount: Number(invoiceTotals.discount),
      additionsTotal: Number(invoiceTotals.additionsTotal),
      taxBase: Number(invoiceTotals.taxable),
      totalTax: Number(invoiceTotals.tax),
      total: Number(invoiceTotals.total),
    }),
    [invoiceTotals]
  )

  const grandTotal = totals.total

  const rawOrderTotalForPromo = useMemo(
    () => lines.reduce((s, l) => s + lineGrossBeforeDiscount(l), 0),
    [lines],
  )

  useEffect(() => {
    if (type !== 'sales' || isReturn || !tenantId || rawOrderTotalForPromo <= 0) {
      setAvailablePromos([])
      setAppliedPromo(null)
      setPromoDiscount(0)
      return
    }
    const channel = salesOrderFulfillment === 'delivery' ? 'delivery' : 'invoice'
    promotionsApi
      .calculate(tenantId, {
        channel,
        order_total: Math.round(rawOrderTotalForPromo * 1000) / 1000,
        customer_id: type === 'sales' ? (partnerId ?? undefined) : undefined,
        item_ids: lines.map((l) => l.item_id).filter((id): id is number => id != null),
        items: lines
          .filter((l) => l.item_id != null)
          .map((l) => ({
            item_id: l.item_id as number,
            quantity: l.quantity,
            unit_price: Number(l.unit_price) || 0,
          })),
      })
      .then((r) => {
        const promos = r.data.data ?? []
        setAvailablePromos(promos)
        if (promos.length > 0) {
          setAppliedPromo(promos[0])
          setPromoDiscount(promos[0].discount_amount)
        } else {
          setAppliedPromo(null)
          setPromoDiscount(0)
        }
      })
      .catch(() => {})
  }, [type, isReturn, tenantId, rawOrderTotalForPromo, partnerId, lines, salesOrderFulfillment])

  const effectiveGrandTotal = Math.max(0, grandTotal - promoDiscount)

  const installmentDownPaymentKwd = useMemo(() => {
    if (type !== 'sales' || isReturn || salesPaymentTab !== 'installment') return 0
    const raw = instDownType === 'percent' ? (grandTotal * instDownPayment) / 100 : instDownPayment
    const r = Math.round(Math.max(0, raw) * 1000) / 1000
    return Math.min(r, grandTotal)
  }, [type, isReturn, salesPaymentTab, instDownType, instDownPayment, grandTotal])

  const balanceAfterDownForInstallments = useMemo(
    () => Math.max(0, grandTotal - installmentDownPaymentKwd),
    [grandTotal, installmentDownPaymentKwd],
  )

  const installmentAmountPreview = useMemo(() => {
    const n = Math.max(1, instCount)
    if (balanceAfterDownForInstallments <= 0) return 0
    const withInterest = balanceAfterDownForInstallments * (1 + instInterest / 100)
    return Math.round((withInterest / n) * 1000) / 1000
  }, [balanceAfterDownForInstallments, instCount, instInterest])

  const installmentPreviewSchedule = useMemo(() => {
    if (salesPaymentTab !== 'installment') return []
    const periodMonths = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }[instPeriod]
    const anchor = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toLocalDateString(new Date())
    const rows: { number: number; date: string; amount: number; isDown: boolean }[] = []
    const start = new Date(anchor + 'T12:00:00')
    if (installmentDownPaymentKwd > 0.0005) {
      rows.push({ number: 0, date: anchor, amount: installmentDownPaymentKwd, isDown: true })
    }
    for (let i = 1; i <= instCount; i++) {
      const d = new Date(start)
      d.setMonth(d.getMonth() + i * periodMonths)
      rows.push({
        number: i,
        date: toLocalDateString(d),
        amount: installmentAmountPreview,
        isDown: false,
      })
    }
    return rows
  }, [salesPaymentTab, instPeriod, date, installmentDownPaymentKwd, instCount, installmentAmountPreview])

  useEffect(() => {
    if (installmentDownPaymentKwd <= 0.0005) {
      setInstallmentDownPaymentMethodId(null)
    }
  }, [installmentDownPaymentKwd])

  function buildPayload() {
    const payload: Record<string, unknown> = {
      type,
      is_return: isReturn || undefined,
      quotation_id: quotationId ?? undefined,
      parent_invoice_id: isReturn && parentInvoiceId ? parentInvoiceId : undefined,
      date,
      due_date: dueDate || null,
      customer_id: type === 'sales' ? partnerId : null,
      vendor_id: type === 'purchase' ? partnerId : null,
      sales_rep_id: type === 'sales' ? (salesRepId ?? null) : null,
      branch_id: branchId,
      warehouse_id: warehouseId,
      cost_center_id: costCenterId,
      payment_method_id: (() => {
        const instDown =
          type === 'sales' && !isReturn && salesPaymentTab === 'installment' && installmentDownPaymentKwd > 0.0005
        if (instDown) {
          return installmentDownPaymentMethodId || null
        }
        return isOnCredit ? null : (paymentMethodId || null)
      })(),
      pricing_group_id: type === 'sales' ? (pricingGroupId ?? null) : null,
      receipt_status: type === 'purchase' ? (receiptStatus || null) : null,
      payment_timing: null,
      reference_number: referenceNumber || null,
      notes: notes || null,
      lines: lines.map((l) => {
        const g = lineGrossBeforeDiscount(l)
        const da = Math.max(0, Number(l.discount_amount) || 0)
        const disc = lineHasValidUnitPrice(l) ? Math.min(da, Math.round(g * 1000) / 1000) : 0
        return {
        item_id: l.item_id,
        item_variant_id: l.item_variant_id ?? undefined,
        unit_id: l.unit_id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price ?? 0,
        discount_percent: 0,
        discount_amount: Math.round(disc * 1000) / 1000,
        tax_percent: l.tax_percent,
        // إرسال أرقام تسلسلية فقط إذا:
        // - ميزة الأرقام التسلسلية مفعّلة، و
        // - الصنف مفعّل عليه خيار تتبع الأرقام التسلسلية
        serial_numbers:
          invoiceUseSerialNumbers && l.use_serial_number
            ? (l.serial_numbers ?? []).map((s) => String(s).trim()).filter(Boolean)
            : undefined,
        ...(invoiceExpiryDatesEnabled
          ? {
              expiry_date: l.expiry_date?.trim() ? l.expiry_date.trim().slice(0, 10) : undefined,
              batch_number: l.batch_number?.trim() ? l.batch_number.trim().slice(0, 120) : undefined,
            }
          : {}),
        }
      }),
    }
    if (type === 'purchase' && !isReturn) {
      payload.additional_expenses = additionalExpenses.map((e) => ({
        description: e.description.trim() || null,
        expense_account_id: e.expense_account_id || null,
        creditor_account_id: e.creditor_account_id || null,
        amount_net: Math.round((Number(e.amount_net) || 0) * 1000) / 1000,
        tax_amount: Math.round((Number(e.tax_amount) || 0) * 1000) / 1000,
        total_amount: Math.round((Number(e.total_amount) || 0) * 1000) / 1000,
      }))
    }
    if (currencyCode) {
      payload.currency = currencyCode
      payload.exchange_rate = exchangeRate
    }
    if (type === 'sales' && !isReturn) {
      if (salesOrderFulfillment === 'delivery') {
        payload.order_type = 'delivery'
        if (deliveryDriverId) payload.delivery_driver_id = deliveryDriverId
      }
      payload.sales_payment_tab = salesPaymentTab
      if (deliveryFees.length > 0) {
        payload.delivery_fees = deliveryFees.map(({ type: feeType, label, amount, account_id }) => ({
          type: feeType,
          label,
          amount: Math.round(amount * 1000) / 1000,
          ...(account_id ? { account_id } : {}),
        }))
      }
    }
    if (fromPurchaseRequest && type === 'purchase' && (fromPurchaseRequest.discount_amount ?? 0) > 0) {
      payload.discount_amount = fromPurchaseRequest.discount_amount
    } else if (totals.discountAmount > 0) {
      payload.discount_amount = totals.discountAmount
    }

    if (type === 'sales' && !isReturn && promoDiscount > 0.0005 && appliedPromo) {
      const base = Number(payload.discount_amount ?? 0)
      payload.discount_amount = Math.round((base + promoDiscount) * 1000) / 1000
      payload.promotion_id = appliedPromo.promotion_id
    }
    if (type === 'sales' && !isReturn && loyaltyRedeemDiscount > 0.0005) {
      const base = Number(payload.discount_amount ?? 0)
      payload.discount_amount = Math.round((base + loyaltyRedeemDiscount) * 1000) / 1000
      payload.redeem_points = loyaltyRedeemPoints
      if (loyaltyProgramId) payload.loyalty_program_id = loyaltyProgramId
    }
    const amountPaidNum = parseFloat(amountPaidStr) || 0
    const partialActive =
      type === 'sales' &&
      !isReturn &&
      partialPayment.enabled &&
      partialPayment.amount > 0.0005 &&
      partialPayment.method_id != null &&
      salesPaymentTab !== 'installment'

    if (partialActive) {
      payload.partial_payment = {
        amount: Math.round(partialPayment.amount * 1000) / 1000,
        method_id: partialPayment.method_id,
        date: partialPayment.date,
      }
      payload.amount_paid = 0
      payload.payment_method_id = null
    } else if (
      type === 'sales' &&
      !isReturn &&
      salesPaymentTab === 'mixed' &&
      mixedPaymentLines.some((r) => r.method_id != null && (parseFloat(r.amount) || 0) > 0.0005)
    ) {
      const pl = mixedPaymentLines
        .filter((r) => r.method_id != null && (parseFloat(r.amount) || 0) > 0.0005)
        .map((r) => ({
          method_id: r.method_id as number,
          amount: Math.round((parseFloat(r.amount) || 0) * 1000) / 1000,
          date,
        }))
      if (pl.length > 0) {
        payload.payment_lines = pl
        payload.amount_paid = 0
        payload.payment_method_id = null
      }
    } else {
      if (!isOnCredit && paymentMethodId != null && amountPaidNum > 0) {
        payload.amount_paid = amountPaidNum
      }
      if (type === 'sales' && !isReturn && salesPaymentTab === 'installment' && installmentDownPaymentKwd > 0.0005) {
        payload.amount_paid = installmentDownPaymentKwd
      }
    }
    return payload
  }

  const hasLinkedPayments = Boolean(isEditingInvoice && existingInvoice?.payments?.length)
  const isPaymentDeferredForUi =
    isEditingInvoice ?
      paymentTiming !== 'paid'
    : isOnCredit || (type === 'sales' && !isReturn && partialPayment.enabled)
  const isCashInvoice =
    isEditingInvoice &&
    (paymentTiming === 'paid' || existingInvoice?.payment_timing === 'paid')
  const lockPaymentMethodAndTiming = Boolean(isEditingInvoice && hasLinkedPayments && isCashInvoice)

  const amountPaidNum = parseFloat(amountPaidStr) || 0
  const amountPaidForBalance = hasLinkedPayments ? Number(existingInvoice?.amount_paid ?? 0) : amountPaidNum
  const minInstallmentAmountRule = useMemo(() => parseMinInstallmentAmount(settings), [settings])
  const maxInstallmentsAllowed = useMemo(() => parseMaxInstallmentsCount(settings), [settings])
  const showSalesPaymentTabs = type === 'sales' && !isReturn && !lockPaymentMethodAndTiming
  const showPmDropdown =
    !showSalesPaymentTabs ||
    (salesPaymentTab !== 'deferred' &&
      salesPaymentTab !== 'installment' &&
      salesPaymentTab !== 'mixed' &&
      !(type === 'sales' && !isReturn && partialPayment.enabled))
  const mixedPaymentTotalPaid = useMemo(
    () => mixedPaymentLines.reduce((sum, r) => sum + (parseFloat(String(r.amount)) || 0), 0),
    [mixedPaymentLines],
  )

  const amountExceedsTotal = !hasLinkedPayments && amountPaidNum > grandTotal
  const linkedPaidExceedsNewTotal =
    hasLinkedPayments && amountPaidForBalance > grandTotal + 0.0005

  const partnerRequired = !partnerId
  const salesRepRequiredMissing = type === 'sales' && salesRepEnabledInSettings && salesRepRequiredInSettings && !salesRepId

  const installmentPlanSatisfied = useMemo(() => {
    if (!requiresInstallmentDraftBeforeSave) return true
    if (pendingInstallmentSchedule) return true
    if (isEditingInvoice && existingInvoice?.installment_id) return true
    return false
  }, [requiresInstallmentDraftBeforeSave, pendingInstallmentSchedule, isEditingInvoice, existingInvoice?.installment_id])

  useEffect(() => {
    if (!requiresInstallmentDraftBeforeSave) {
      setPendingInstallmentSchedule(null)
    }
  }, [requiresInstallmentDraftBeforeSave])

  useEffect(() => {
    if (type !== 'sales' || isReturn || salesPaymentTab !== 'installment') return
    if (isEditingInvoice && existingInvoice?.installment_id) return
    const periodMonths = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }[instPeriod]
    const anchor = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toLocalDateString(new Date())
    const first = new Date(anchor + 'T12:00:00')
    first.setMonth(first.getMonth() + periodMonths)
    const start_date = toLocalDateString(first)
    const maxC = parseMaxInstallmentsCount(settings)
    const n = Math.min(maxC, Math.max(1, instCount))
    setPendingInstallmentSchedule({
      start_date,
      num_installments: n,
      period_months: periodMonths,
      branch_id: branchId ?? undefined,
    })
  }, [
    type,
    isReturn,
    salesPaymentTab,
    isEditingInvoice,
    existingInvoice?.installment_id,
    instPeriod,
    instCount,
    date,
    branchId,
    settings,
  ])

  const paymentMethodRows = useMemo(() => {
    const placeholderLabel = lang === 'ar' ? 'اختر طريقة السداد' : 'Select payment method'
    return [
      { id: null as number | null, label: placeholderLabel },
      ...paymentMethods.map((pm) => ({
        id: pm.id,
        label: lang === 'ar' ? pm.name : (pm.name_en || pm.name),
      })),
    ]
  }, [paymentMethods, lang])

  const selectedPaymentMethodRowIdx = useMemo(() => {
    if (paymentMethodId == null) return 0
    const idx = paymentMethodRows.findIndex((r) => r.id === paymentMethodId)
    return idx >= 0 ? idx : 0
  }, [paymentMethodRows, paymentMethodId])

  function updatePaymentMethodMenuPosition() {
    const el = paymentMethodTriggerRef.current
    if (!el) {
      setPaymentMethodMenuRect(null)
      return
    }
    setPaymentMethodMenuRect(computePaymentMethodMenuRect(el.getBoundingClientRect()))
  }

  function closePaymentMethodMenu() {
    setPaymentMethodMenuOpen(false)
    setPaymentMethodMenuRect(null)
    setPaymentMethodHighlightIdx(-1)
  }

  function openPaymentMethodMenu() {
    if (lockPaymentMethodAndTiming) return
    setPaymentMethodMenuOpen(true)
    setPaymentMethodHighlightIdx(selectedPaymentMethodRowIdx)
    updatePaymentMethodMenuPosition()
    requestAnimationFrame(() => updatePaymentMethodMenuPosition())
  }

  function commitPaymentMethodSelection(nextId: number | null) {
    setPaymentMethodId(nextId)
    if (nextId == null) {
      setAmountPaidStr('')
      if (isEditingInvoice) setPaymentTiming('deferred')
      setIsOnCredit(true)
      if (type === 'sales' && !isReturn) {
        setSalesPaymentTab('deferred')
        setInstallmentDownPaymentMethodId(null)
      }
    } else {
      if (isEditingInvoice) setPaymentTiming('paid')
      setIsOnCredit(false)
      if (type === 'sales' && !isReturn) {
        const pm = paymentMethods.find((p) => p.id === nextId)
        if (pm?.type === 'bank') setSalesPaymentTab('bank')
        else if (pm?.type === 'cash') setSalesPaymentTab('cash')
        else setSalesPaymentTab('mixed')
      }
    }
    closePaymentMethodMenu()
  }

  function applySalesPaymentTab(tab: SalesPaymentTab) {
    if (type !== 'sales' || isReturn || lockPaymentMethodAndTiming) return
    setSalesPaymentTab(tab)
    if (tab === 'deferred') {
      if (isEditingInvoice) setPaymentTiming('deferred')
      setIsOnCredit(true)
      setPaymentMethodId(null)
      setAmountPaidStr('')
      setInstallmentDownPaymentMethodId(null)
      return
    }
    if (tab === 'installment') {
      if (isEditingInvoice) setPaymentTiming('deferred')
      setIsOnCredit(true)
      setPaymentMethodId(null)
      setAmountPaidStr('')
      setInstallmentDownPaymentMethodId(null)
      return
    }
    if (tab === 'cash') {
      setInstallmentDownPaymentMethodId(null)
      if (isEditingInvoice) setPaymentTiming('paid')
      setIsOnCredit(false)
      const first = paymentMethods.find((pm) => pm.is_active && pm.type === 'cash')
      if (first) setPaymentMethodId(first.id)
      setAmountPaidStr(grandTotal > 0 ? grandTotal.toFixed(3) : '')
      return
    }
    if (tab === 'bank') {
      setInstallmentDownPaymentMethodId(null)
      if (isEditingInvoice) setPaymentTiming('paid')
      setIsOnCredit(false)
      const first = paymentMethods.find((pm) => pm.is_active && pm.type === 'bank')
      if (first) setPaymentMethodId(first.id)
      setAmountPaidStr(grandTotal > 0 ? grandTotal.toFixed(3) : '')
      return
    }
    if (tab === 'mixed') {
      setInstallmentDownPaymentMethodId(null)
      if (isEditingInvoice) setPaymentTiming('paid')
      setIsOnCredit(false)
      const first =
        paymentMethods.find((pm) => pm.is_active && pm.type === 'cash') ??
        paymentMethods.find((pm) => pm.is_active && pm.type === 'bank')
      if (first) setPaymentMethodId(first.id)
      setAmountPaidStr('')
      setMixedPaymentLines([{ id: `m-${Date.now()}`, method_id: first?.id ?? null, amount: '' }])
    }
  }

  useEffect(() => {
    if (!paymentMethodMenuOpen) return
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null
      const trigger = paymentMethodTriggerRef.current
      if (trigger && t && trigger.contains(t)) return
      if (t instanceof HTMLElement && t.closest(`#${paymentMethodMenuId}`)) return
      closePaymentMethodMenu()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePaymentMethodMenu()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown, { passive: true })
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [paymentMethodMenuOpen])

  useLayoutEffect(() => {
    if (!paymentMethodMenuOpen) return
    updatePaymentMethodMenuPosition()
    const onScroll = () => updatePaymentMethodMenuPosition()
    const onResize = () => updatePaymentMethodMenuPosition()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [paymentMethodMenuOpen, paymentMethodId, paymentMethods])

  useEffect(() => {
    if (lockPaymentMethodAndTiming) closePaymentMethodMenu()
  }, [lockPaymentMethodAndTiming])

  function validateSerialNumbers(): string | null {
    // لا يوجد تحقق إذا كانت ميزة الأرقام التسلسلية معطّلة بالكامل
    if (!invoiceUseSerialNumbers) return null
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const itemId = line.item_id
      if (!itemId) continue
      // يتم فرض إدخال الأرقام التسلسلية فقط للأصناف التي مفعّل عليها خيار التتبع
      if (!line.use_serial_number) continue
      const required = Math.round(line.quantity)
      const count = (line.serial_numbers ?? []).filter((s) => String(s).trim()).length
      if (count !== required) {
        return lang === 'ar'
          ? `السطر ${i + 1} (${line.description}): يلزم إدخال ${required} رقم تسلسلي، تم إدخال ${count}.`
          : `Line ${i + 1} (${line.description}): ${required} serial(s) required, ${count} entered.`
      }
    }
    return null
  }

  const postMut = useMutation({
    mutationFn: (id: number) =>
      postInvoice(
        tenantId,
        id,
        type === 'sales' && !isReturn && salesOrderFulfillment === 'delivery'
          ? { delivery_driver_id: deliveryDriverId ?? undefined }
          : undefined,
      ),
    onSuccess: invalidateAfterInvoiceAccountingChange,
  })

  function resetToNewInvoice() {
    closePaymentMethodMenu()
    const today = toLocalDateString(new Date())
    setDate(today)
    setDueDate('')
    setPartnerId(null)
    setBranchId(null)
    setWarehouseId(null)
    setCostCenterId(null)
    setPaymentMethodId(null)
    setIsOnCredit(true)
    setReferenceNumber('')
    setNotes('')
    setAmountPaidStr('')
    setReceiptStatus('')
    setSalesRepId(null)
    setSalesOrderFulfillment('')
    setDeliveryDriverId(null)
    setQuotationId(null)
    setParentInvoiceId(null)
    setRefInvoiceNumber('')
    setBarcodeSearch('')
    setBarcodeError(null)
    setOpenItemLineIdx(null)
    setItemSearchByLine({})
    setLines([{ ...emptyLine, tax_percent: defaultVatRate, serial_numbers: [] }])
    setAdditionalExpenses([])
    setAttachmentFile(null)
    setDiscountInputStr('')
    setDiscountType('amount')
    setSalesPaymentTab('deferred')
    setInstCount(6)
    setInstPeriod('monthly')
    setInstDownPayment(0)
    setInstDownType('fixed')
    setInstInterest(0)
    setInstallmentDownPaymentMethodId(null)
    setPendingInstallmentSchedule(null)
    setDeliveryFees([])
    setPartialPayment({
      enabled: false,
      amount: 0,
      method_id: null,
      date: toLocalDateString(new Date()),
    })
    setMixedPaymentLines([{ id: 'm1', method_id: null, amount: '' }])
    setSavedReceiptHint(null)
    if (defaultCurrencyCode) {
      setCurrencyCode(defaultCurrencyCode)
      setExchangeRate(defaultCurrency?.exchange_rate ?? 1)
    }
  }

  function navigateBackToList() {
    if (isReturn) {
      navigate(type === 'sales' ? '/invoices/sales-returns' : '/invoices/purchase-returns')
      return
    }
    navigate(`/invoices/${type === 'sales' ? 'sales' : 'purchases'}`)
  }

  const cancelMut = useMutation({
    mutationFn: () => cancelInvoice(tenantId, editInvoiceId!),
    onSuccess: () => {
      invalidateAfterInvoiceAccountingChange()
      navigateBackToList()
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } }; message?: string }
      setSubmitError(
        ax.response?.data?.message ??
          ax.message ??
          (lang === 'ar' ? 'فشل إلغاء الفاتورة.' : 'Failed to cancel invoice.'),
      )
    },
  })

  function handleCancelInvoice() {
    if (!isEditingInvoice || !existingInvoice || existingInvoice.status === 'cancelled') {
      navigateBackToList()
      return
    }
    cancelMut.mutate()
  }

  function buildUpdatePayload(): Record<string, unknown> {
    const inv = existingInvoice!
    const deferred = paymentTiming !== 'paid'
    const paidNum = parseFloat(amountPaidStr) || 0
    let discountAmountOut = totals.discountAmount
    const loyaltyExtra: Record<string, unknown> = {}
    if (type === 'sales' && !isReturn) {
      if (loyaltyRedeemDiscount > 0.0005 && loyaltyRedeemPoints > 0.0005) {
        discountAmountOut = Math.round((discountAmountOut + loyaltyRedeemDiscount) * 1000) / 1000
        loyaltyExtra.redeem_points = loyaltyRedeemPoints
        if (loyaltyProgramId != null) loyaltyExtra.loyalty_program_id = loyaltyProgramId
      } else {
        loyaltyExtra.redeem_points = 0
        loyaltyExtra.loyalty_program_id = null
      }
    }
    return {
      type,
      date,
      due_date: dueDate || null,
      customer_id: type === 'sales' ? (partnerId || null) : null,
      vendor_id: type === 'purchase' ? (partnerId || null) : null,
      sales_rep_id: type === 'sales' ? (salesRepId ?? null) : null,
      branch_id: branchId || null,
      warehouse_id: warehouseId || null,
      cost_center_id: costCenterId || null,
      payment_method_id: (() => {
        if (!deferred) {
          return paymentMethodId || null
        }
        if (type === 'sales' && !isReturn && salesPaymentTab === 'installment' && installmentDownPaymentKwd > 0.0005) {
          return installmentDownPaymentMethodId || null
        }
        return null
      })(),
      receipt_status: type === 'purchase' ? (receiptStatus || null) : null,
      payment_timing: paymentTiming || (deferred ? 'deferred' : 'paid'),
      reference_number: referenceNumber || null,
      notes: notes || null,
      discount_amount: discountAmountOut,
      ...loyaltyExtra,
      ...(type === 'sales' && !isReturn
        ? { order_type: salesOrderFulfillment === 'delivery' ? 'delivery' : null }
        : {}),
      ...(!deferred
        ? { amount_paid: paidNum }
        : type === 'sales' && !isReturn && salesPaymentTab === 'installment' && installmentDownPaymentKwd > 0.0005
          ? { amount_paid: installmentDownPaymentKwd }
          : {}),
      lines: lines.map((l) => {
        const g = lineGrossBeforeDiscount(l)
        const da = Math.max(0, Number(l.discount_amount) || 0)
        const disc = lineHasValidUnitPrice(l) ? Math.min(da, Math.round(g * 1000) / 1000) : 0
        return {
        item_id: l.item_id || null,
        item_variant_id: l.item_variant_id ?? undefined,
        unit_id: l.unit_id || null,
        description: l.description || '',
        quantity: l.quantity,
        unit_price: l.unit_price ?? 0,
        discount_percent: 0,
        discount_amount: Math.round(disc * 1000) / 1000,
        tax_percent: l.tax_percent,
        serial_numbers:
          invoiceUseSerialNumbers && l.use_serial_number
            ? (l.serial_numbers ?? []).map((s) => String(s).trim()).filter(Boolean)
            : undefined,
        ...(invoiceExpiryDatesEnabled
          ? {
              expiry_date: l.expiry_date?.trim() ? l.expiry_date.trim().slice(0, 10) : undefined,
              batch_number: l.batch_number?.trim() ? l.batch_number.trim().slice(0, 120) : undefined,
            }
          : {}),
        }
      }),
      ...(currencyCode
        ? { currency: currencyCode, exchange_rate: exchangeRate }
        : {}),
      ...(type === 'purchase' && !isReturn
        ? {
            additional_expenses: additionalExpenses.map((e) => ({
              description: e.description.trim() || null,
              expense_account_id: e.expense_account_id || null,
              creditor_account_id: e.creditor_account_id || null,
              amount_net: Math.round((Number(e.amount_net) || 0) * 1000) / 1000,
              tax_amount: Math.round((Number(e.tax_amount) || 0) * 1000) / 1000,
              total_amount: Math.round((Number(e.total_amount) || 0) * 1000) / 1000,
            })),
          }
        : {}),
    }
  }

  async function handleSaveCommon(goToPrint: boolean) {
    if (partnerRequired) return
    if (amountExceedsTotal) return
    if (linkedPaidExceedsNewTotal) return
    const partialActiveForSave =
      type === 'sales' && !isReturn && partialPayment.enabled && salesPaymentTab !== 'installment'
    if (partialActiveForSave) {
      if (partialPayment.amount <= 0.0005 || partialPayment.method_id == null) {
        setSubmitError(
          lang === 'ar' ? 'أكمل المبلغ وطريقة الدفع للدفع الجزئي.' : 'Enter partial payment amount and payment method.',
        )
        return
      }
      if (partialPayment.amount > grandTotal + 1e-6) {
        setSubmitError(
          lang === 'ar' ? 'مبلغ الدفع الجزئي يتجاوز إجمالي الفاتورة.' : 'Partial amount exceeds invoice total.',
        )
        return
      }
    }
    if (
      type === 'sales' &&
      !isReturn &&
      salesPaymentTab === 'mixed' &&
      !partialPayment.enabled &&
      mixedPaymentLines.some((r) => r.method_id != null && (parseFloat(r.amount) || 0) > 0.0005)
    ) {
      const mixSum = mixedPaymentLines.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
      if (mixSum - grandTotal > 0.01) {
        setSubmitError(
          lang === 'ar'
            ? 'مجموع الدفع المختلط أكبر من إجمالي الفاتورة.'
            : 'Mixed payment total exceeds invoice total.',
        )
        return
      }
    }
    if (type === 'sales' && salesRepEnabledInSettings && salesRepRequiredInSettings && !salesRepId) {
      setSubmitError(
        lang === 'ar'
          ? 'يجب اختيار المندوب عند تفعيل الخانة وجعلها إجبارية.'
          : 'Sales rep is required when the field is enabled and set as required.'
      )
      return
    }
    const serialErr = validateSerialNumbers()
    if (serialErr) {
      setSubmitError(serialErr)
      return
    }
    if (variantsEnabledForInvoice) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.item_id) continue
        const vars = await ensureItemVariantsInMap(line.item_id)
        if (vars.length > 0 && !line.item_variant_id) {
          setSubmitError(
            lang === 'ar'
              ? `السطر ${i + 1}: يرجى اختيار المتغير أو استخدام «توزيع الكميات».`
              : `Line ${i + 1}: select a variant or use quantity distribution.`,
          )
          return
        }
      }
    }
    setSubmitError(null)
    if (!installmentPlanSatisfied) {
      setSubmitError(lang === 'ar' ? 'يرجى إنشاء جدول الأقساط أولاً.' : 'Please create an installment schedule first.')
      return
    }
    if (type === 'sales' && !isReturn && salesPaymentTab === 'installment') {
      if (installmentDownPaymentKwd > 0.0005 && !installmentDownPaymentMethodId) {
        setSubmitError(
          lang === 'ar'
            ? 'يرجى اختيار طريقة دفع الدفعة الأولى (صندوق/بنك …) — مطلوبة لترحيل المبلغ المدفوع مقدّماً.'
            : 'Please select a payment method for the down payment (cash/bank account).',
        )
        return
      }
      if (minInstallmentAmountRule > 0 && balanceAfterDownForInstallments + 1e-9 < minInstallmentAmountRule) {
        setSubmitError(
          tInstallments.remainingBelowMin ??
            (lang === 'ar'
              ? 'المبلغ المتبقي أقل من الحد الأدنى المسموح للتقسيط.'
              : 'The remaining amount is below the minimum allowed for installments.'),
        )
        return
      }
    }

    const installmentDraftSnapshot = pendingInstallmentSchedule

    if (isEditingInvoice && existingInvoice) {
      try {
        await updateMut.mutateAsync(buildUpdatePayload())
        let postedFromDraft: Invoice | undefined
        if (existingInvoice.status === 'draft') {
          postedFromDraft = (await postMut.mutateAsync(editInvoiceId!)) as Invoice
        }
        if (attachmentFile && editInvoiceId != null) {
          try {
            await uploadInvoiceAttachment(tenantId, editInvoiceId, attachmentFile)
            setAttachmentFile(null)
          } catch (e: any) {
            const msg =
              e?.response?.data?.message ||
              e?.message ||
              (lang === 'ar' ? 'فشل رفع المرفق. حاول مرة أخرى.' : 'Failed to upload attachment. Please try again.')
            setSubmitError(msg)
            return
          }
        }
        if (installmentDraftSnapshot && editInvoiceId != null) {
          try {
            await createInstallmentScheduleFromInvoice(tenantId, editInvoiceId, installmentDraftSnapshot)
            setPendingInstallmentSchedule(null)
          } catch (e: any) {
            const msg =
              e?.response?.data?.message ||
              e?.message ||
              (lang === 'ar' ? 'تم حفظ الفاتورة لكن فشل إنشاء جدول الأقساط.' : 'Invoice saved but installment schedule failed.')
            setSubmitError(msg)
            return
          }
        }
        if (goToPrint) {
          const justPostedWithMfg =
            type === 'sales' && existingInvoice.status === 'draft' && invoiceHasAutoManufacturingDoc(postedFromDraft)
          navigate(`/invoices/view/${editInvoiceId}`, {
            state: justPostedWithMfg ? { openManufacturingOrder: true } : undefined,
          })
        } else {
          navigateBackToList()
        }
      } catch {
        // handled by updateMut
      }
      return
    }
    try {
      const res = (await createMut.mutateAsync(buildPayload())) as CreateInvoiceResponse
      const created = res.invoice
      const createdId = created?.id
      if (res.has_receipt && res.receipt) {
        setSavedReceiptHint(
          lang === 'ar'
            ? `تم توليد سند قبض: ${res.receipt.reference} بمبلغ ${res.receipt.amount.toFixed(3)} (متبقي ${res.receipt.remaining.toFixed(3)})`
            : `Receipt ${res.receipt.reference} created: ${res.receipt.amount.toFixed(3)} (balance ${res.receipt.remaining.toFixed(3)})`,
        )
      } else {
        setSavedReceiptHint(null)
      }

      // إذا اختار المستخدم مرفقاً: ارفعه تلقائياً بعد إنشاء الفاتورة وربطه بالرقم
      if (attachmentFile && createdId) {
        try {
          await uploadInvoiceAttachment(tenantId, createdId, attachmentFile)
          setAttachmentFile(null)
        } catch (e: any) {
          const msg =
            e?.response?.data?.message ||
            e?.message ||
            (lang === 'ar' ? 'فشل رفع المرفق. حاول مرة أخرى.' : 'Failed to upload attachment. Please try again.')
          setSubmitError(msg)
          return
        }
      }

      if (installmentDraftSnapshot && createdId) {
        try {
          await createInstallmentScheduleFromInvoice(tenantId, createdId, installmentDraftSnapshot)
          setPendingInstallmentSchedule(null)
        } catch (e: any) {
          const msg =
            e?.response?.data?.message ||
            e?.message ||
            (lang === 'ar' ? 'تم حفظ الفاتورة لكن فشل إنشاء جدول الأقساط.' : 'Invoice saved but installment schedule failed.')
          setSubmitError(msg)
          return
        }
      }

      // إنشاء الفاتورة من الباكند يضمّن الترحيل التلقائي (postInvoice)، فلا نستدعي ترحيلاً ثانياً لتجنب حركات مخزنية مكررة
      const openMfgAfterCreate = type === 'sales' && invoiceHasAutoManufacturingDoc(created)
      if (goToPrint && createdId) {
        navigate(`/invoices/view/${createdId}`, {
          state: openMfgAfterCreate ? { openManufacturingOrder: true } : undefined,
        })
      } else if (openMfgAfterCreate && createdId) {
        navigate(`/invoices/view/${createdId}`, { state: { openManufacturingOrder: true } })
      } else {
        setSavedInvoiceId(createdId ?? null)
        setPostSaveOpen(true)
      }
    } catch {
      // errors handled by mutations
    }
  }

  function handleSave() {
    void handleSaveCommon(false)
  }

  function handleSaveAndPrint() {
    void handleSaveCommon(true)
  }

  const isSaving = createMut.isPending || updateMut.isPending || postMut.isPending
  // تنسيق موحد لبنود الفاتورة: ارتفاع واحد، border-radius، محاذاة
  const lineInputClass = 'h-9 w-full rounded-md px-2.5 text-sm border border-slate-300 focus:ring-1 focus:ring-inset focus:ring-primary-500 outline-none bg-white'
  const lineInputNumberClass = lineInputClass + ' text-right tabular-nums input-no-spinner'
  const lineInputReadOnlyClass =
    'h-9 w-full rounded-md px-2.5 text-sm border border-slate-200 bg-slate-50 cursor-not-allowed text-right tabular-nums input-no-spinner'

  const pageTitle = (() => {
    if (isEditingInvoice && existingInvoice) {
      if (existingInvoice.is_return) {
        return type === 'sales'
          ? (t.invoices.documentSalesReturn ?? (lang === 'ar' ? 'مرتجع مبيعات' : 'Sales return'))
          : (t.invoices.documentPurchaseReturn ?? (lang === 'ar' ? 'مرتجع مشتريات' : 'Purchase return'))
      }
      return type === 'sales'
        ? (t.invoices.documentSalesInvoice ?? (lang === 'ar' ? 'فاتورة مبيعات' : 'Sales invoice'))
        : (t.invoices.documentPurchaseInvoice ?? (lang === 'ar' ? 'فاتورة مشتريات' : 'Purchase invoice'))
    }
    if (isReturn) {
      return type === 'sales'
        ? (t.invoices.createSalesReturn ?? 'إنشاء مرتجع مبيعات')
        : (t.invoices.createPurchaseReturn ?? 'إنشاء مرتجع مشتريات')
    }
    return type === 'sales' ? t.invoices.createSalesInvoice : t.invoices.createPurchaseInvoice
  })()
  const partnerLabel = type === 'sales' ? t.invoices.customer : t.invoices.vendor
  const textAlign = isRtl ? 'text-right' : 'text-left'

  useDocumentTitle(
    isEditingInvoice && existingInvoice?.number
      ? lang === 'ar'
        ? `${existingInvoice.is_return ? 'مرتجع' : type === 'sales' ? 'فاتورة مبيعات' : 'فاتورة مشتريات'} #${existingInvoice.number}`
        : `Invoice #${existingInvoice.number}`
      : null
  )

  if (isEditingInvoice && (existingInvoiceLoading || !existingInvoice || !editFormLoaded)) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (isEditingInvoice && existingInvoice && existingInvoice.type !== type) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="px-0 py-2 space-y-4 w-full min-w-0 max-w-full">
      <div className="flex items-center min-h-0">
        <h1 className="text-base font-bold text-slate-900 leading-snug">{pageTitle}</h1>
      </div>
      {isEditingInvoice && hasLinkedPayments && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          {t.invoices.linkedVoucherRepostHint ?? t.invoices.adminOnlyEditHint}
        </p>
      )}
      {isEditingInvoice && lockPaymentMethodAndTiming && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          {t.invoices.paymentMethodLockedHint ?? 'الفاتورة نقداً ولها سند قبض مرتبط. لا يمكن تغيير طريقة الدفع أو التحويل إلى آجل إلا بعد حذف السند من سندات القبض.'}
        </p>
      )}
      {typeof document !== 'undefined' && submitError && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" onMouseDown={() => setSubmitError(null)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold">!</div>
                <div className="font-semibold text-slate-900">{lang === 'ar' ? 'تنبيه' : 'Warning'}</div>
              </div>
              <button
                type="button"
                onClick={() => setSubmitError(null)}
                className="rounded-lg px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
                title={lang === 'ar' ? 'إغلاق' : 'Close'}
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 text-sm text-slate-700 leading-relaxed">
              {submitError}
            </div>
            <div className="px-5 py-4 border-t border-slate-200 bg-white flex justify-end">
              <button
                type="button"
                onClick={() => setSubmitError(null)}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-500 transition-colors text-sm font-medium"
              >
                {lang === 'ar' ? 'حسناً' : 'OK'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {typeof document !== 'undefined' && postSaveOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" onMouseDown={() => setPostSaveOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <div className="font-semibold text-slate-900">{lang === 'ar' ? 'تم الحفظ' : 'Saved'}</div>
              <button
                type="button"
                onClick={() => setPostSaveOpen(false)}
                className="rounded-lg px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
                title={lang === 'ar' ? 'إغلاق' : 'Close'}
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 text-sm text-slate-700 leading-relaxed space-y-2">
              <p>
                {lang === 'ar' ? 'تم حفظ الفاتورة.' : 'Invoice has been saved.'}
                {savedInvoiceId ? (
                  <span className="text-slate-500"> {lang === 'ar' ? `(#${savedInvoiceId})` : `(#${savedInvoiceId})`}</span>
                ) : null}
              </p>
              {savedReceiptHint ? (
                <p className="text-emerald-800 font-medium text-sm bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  {savedReceiptHint}
                </p>
              ) : null}
            </div>
            <div className="px-5 py-4 border-t border-slate-200 bg-white flex flex-col sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setPostSaveOpen(false)
                  navigateBackToList()
                }}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors text-sm font-medium"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPostSaveOpen(false)
                  setSavedInvoiceId(null)
                  resetToNewInvoice()
                }}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-500 transition-colors text-sm font-medium"
              >
                {lang === 'ar' ? 'فاتورة جديدة' : 'New invoice'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {typeof document !== 'undefined' && paymentMethodMenuOpen && paymentMethodMenuRect && createPortal(
        <div
          id={paymentMethodMenuId}
          role="listbox"
          dir={isRtl ? 'rtl' : 'ltr'}
          className="fixed z-[9500] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
          style={{
            left: paymentMethodMenuRect.left,
            width: paymentMethodMenuRect.width,
            maxHeight: paymentMethodMenuRect.maxHeight,
            ...(paymentMethodMenuRect.top != null
              ? { top: paymentMethodMenuRect.top, bottom: 'auto' }
              : { bottom: paymentMethodMenuRect.bottom, top: 'auto' }),
          }}
        >
          <div className="max-h-full overflow-y-auto py-1">
            {paymentMethodRows.map((row, idx) => {
              const isSelected = paymentMethodId === row.id
              const isActive = (paymentMethodHighlightIdx < 0 ? selectedPaymentMethodRowIdx : paymentMethodHighlightIdx) === idx
              return (
                <button
                  key={row.id == null ? 'pm-empty' : String(row.id)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`w-full px-3 py-2 text-sm transition-colors ${
                    isRtl ? 'text-right' : 'text-left'
                  } ${
                    isActive
                      ? 'bg-primary-50 text-primary-800'
                      : 'text-slate-800 hover:bg-slate-50'
                  } ${row.id == null ? 'text-slate-500' : ''}`}
                  onMouseEnter={() => setPaymentMethodHighlightIdx(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commitPaymentMethodSelection(row.id)}
                >
                  {row.label}
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-2.5 sm:p-3 space-y-2.5 sm:space-y-3">
        {/* صف الحقول الأساسية: Grid مرن auto-fit — استقرار عند الزووم */}
        <div className="invoice-header-grid-autofit">
          <div className="min-w-0">
            <label className="block text-xs font-medium text-slate-600 mb-0.5">{t.invoices.costCenter}</label>
            <select value={costCenterId ?? ''} onChange={(e) => setCostCenterId(e.target.value ? +e.target.value : null)} className="w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none">
              <option value="">{lang === 'ar' ? 'اختر' : 'Select'}</option>
              {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-slate-600 mb-0.5">{t.invoices.branch}</label>
            <select value={branchId ?? ''} onChange={(e) => setBranchId(e.target.value ? +e.target.value : null)} className="w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none">
              <option value="">{lang === 'ar' ? 'اختر' : 'Select'}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-slate-600 mb-0.5">{t.invoices.warehouse}</label>
            <select value={warehouseId ?? ''} onChange={(e) => setWarehouseId(e.target.value ? +e.target.value : null)} className="w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none">
              <option value="">{lang === 'ar' ? 'اختر' : 'Select'}</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code ? `${w.code} - ` : ''}{w.name}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-slate-600 mb-0.5">{t.invoices.invoiceDate} *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
              required
            />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-slate-600 mb-0.5">{t.invoices.dueDate}</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
        </div>

        {/* باقي الحقول — Grid مرن */}
        <div className="invoice-header-secondary-autofit">
          <div className="min-w-0 invoice-header-partner-cell">
            <label className="block text-xs font-medium text-slate-600 mb-0.5">{partnerLabel} *</label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={partnerId ?? ''}
                onChange={(e) => setPartnerId(e.target.value ? +e.target.value : null)}
                className="flex-1 min-w-0 h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
                required
              >
                <option value="">{t.items.selectItem.replace(t.items.item, partnerLabel)}</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {type === 'sales' && (
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(true)}
                  className="h-9 w-9 rounded-md border border-slate-300 bg-white text-primary-600 hover:bg-slate-50 transition-colors flex items-center justify-center shrink-0"
                  title={lang === 'ar' ? 'إضافة عميل جديد' : 'Add new customer'}
                  aria-label={lang === 'ar' ? 'إضافة عميل جديد' : 'Add new customer'}
                >
                  <Plus size={18} />
                </button>
              )}
              {type === 'purchase' && (
                <button
                  type="button"
                  onClick={() => setShowAddVendorModal(true)}
                  className="h-9 w-9 rounded-md border border-slate-300 bg-white text-primary-600 hover:bg-slate-50 transition-colors flex items-center justify-center shrink-0"
                  title={lang === 'ar' ? 'إضافة مورد جديد' : 'Add new vendor'}
                  aria-label={lang === 'ar' ? 'إضافة مورد جديد' : 'Add new vendor'}
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
          </div>
          {type === 'sales' && (
            <div className="min-w-0">
              <label className="block text-xs font-medium text-slate-600 mb-0.5">{lang === 'ar' ? 'مجموعة التسعير' : 'Pricing group'}</label>
              <select
                value={pricingGroupId ?? ''}
                onChange={(e) => {
                  const next = e.target.value ? Number(e.target.value) : null
                  setPricingGroupId(next)
                }}
                disabled={!can('invoices.switch_pricing_group')}
                className="w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none disabled:bg-slate-50 disabled:text-slate-500"
                title={!can('invoices.switch_pricing_group') ? (lang === 'ar' ? 'غير مسموح بتبديل مجموعة التسعير' : 'Not allowed to switch pricing group') : undefined}
              >
                <option value="">{lang === 'ar' ? 'بدون' : 'None'}</option>
                {(pricingGroups as PricingGroup[])
                  .filter((g) => g.is_active)
                  .filter((g) => {
                    const allowed = Array.isArray(meData?.pricing_group_ids) ? meData!.pricing_group_ids! : []
                    return allowed.length ? allowed.includes(g.id) : true
                  })
                  .filter((g) => {
                    // فلترة حسب الفرع المحدد: إذا لم يتم تحديد فرع، لا نعرض إلا المجموعات العامة (غير مرتبطة بفروع)
                    const branchIds = Array.isArray(g.branches) ? g.branches.map((b) => b.id) : []
                    if (!branchIds.length) return true
                    if (branchId == null) return false
                    return branchIds.includes(branchId)
                  })
                  .filter((g) => {
                    // فلترة حسب المستخدم الحالي (tenant_users.id). إذا لم يتم توفره نعرض فقط المجموعات العامة.
                    const userScopeIds = Array.isArray((g as any).tenantUsers)
                      ? ((g as any).tenantUsers as any[]).map((tu) => Number(tu?.id)).filter((n) => Number.isFinite(n))
                      : Array.isArray((g as any).tenant_users)
                        ? ((g as any).tenant_users as any[]).map((tu) => Number(tu?.id)).filter((n) => Number.isFinite(n))
                        : []
                    if (!userScopeIds.length) return true
                    const meTenantUserId = meData?.tenant_user_id ?? null
                    if (meTenantUserId == null) return false
                    return userScopeIds.includes(meTenantUserId)
                  })
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {type === 'sales' && canAccessFeature('sales_reps') && salesRepEnabledInSettings && (
            <div className="min-w-0">
              <label className="block text-xs font-medium text-slate-600 mb-0.5">{lang === 'ar' ? 'المندوب' : 'Sales Rep'}{salesRepRequiredInSettings ? ' *' : ''}</label>
              <select value={salesRepId ?? ''} onChange={(e) => setSalesRepId(e.target.value ? +e.target.value : null)} className="w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none" required={salesRepRequiredInSettings}>
                <option value="">{lang === 'ar' ? 'اختر' : 'Select'}</option>
                {(salesRepsData?.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}{r.region ? ` - ${r.region}` : ''}</option>)}
              </select>
            </div>
          )}
          {type === 'sales' && !isReturn && (
            <>
              <div className="min-w-0">
                <label className="block text-xs font-medium text-slate-600 mb-0.5">
                  {(t as { delivery?: { fulfillmentType?: string } }).delivery?.fulfillmentType ?? (lang === 'ar' ? 'نوع الطلب' : 'Order type')}
                </label>
                <select
                  value={salesOrderFulfillment}
                  onChange={(e) => setSalesOrderFulfillment(e.target.value === 'delivery' ? 'delivery' : '')}
                  className="w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option value="">
                    {(t as { delivery?: { fulfillmentStandard?: string } }).delivery?.fulfillmentStandard ?? (lang === 'ar' ? 'عادي' : 'Standard')}
                  </option>
                  <option value="delivery">
                    {(t as { delivery?: { fulfillmentDelivery?: string } }).delivery?.fulfillmentDelivery ?? (lang === 'ar' ? 'توصيل' : 'Delivery')}
                  </option>
                </select>
              </div>
              {salesOrderFulfillment === 'delivery' && (
                <div className="min-w-0 md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-0.5">
                    {(t as { delivery?: { driverField?: string } }).delivery?.driverField ?? (lang === 'ar' ? 'السائق' : 'Driver')}
                  </label>
                  <select
                    value={deliveryDriverId ?? ''}
                    onChange={(e) => setDeliveryDriverId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none max-w-md"
                  >
                    <option value="">—</option>
                    {deliveryDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.phone ? ` · ${d.phone}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    {(t as { delivery?: { fulfillmentHint?: string } }).delivery?.fulfillmentHint ??
                      (lang === 'ar'
                        ? 'مع سائق ورصيد آجل يُسند تلقائياً إلى عهدة السائق. اختر السائق من هنا أو من نقطة البيع.'
                        : 'With a driver and credit balance, assignment is automatic to driver custody. Choose the driver here or at POS.')}
                  </p>
                </div>
              )}
            </>
          )}
          {isEditingInvoice && existingInvoice?.number ? (
            <div className="min-w-0">
              <label className="block text-xs font-medium text-slate-600 mb-0.5">{t.invoices.invoiceNumber}</label>
              <input
                type="text"
                readOnly
                value={existingInvoice.number}
                title={t.invoices.invoiceNumberReadOnly ?? 'رقم الفاتورة ثابت ولا يُعدَّل'}
                className="w-full h-9 border border-slate-200 rounded-md px-2.5 text-sm bg-slate-50 text-slate-700 font-mono cursor-not-allowed"
              />
            </div>
          ) : null}
          <div className="min-w-0">
            <label className="block text-xs font-medium text-slate-600 mb-0.5">{t.invoices.referenceNumber}</label>
            <input type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="—" className="w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none" />
          </div>
          {type === 'purchase' && (
            <div className="min-w-0">
              <label className="block text-xs font-medium text-slate-600 mb-0.5">{t.invoices.receiptStatus ?? 'حالة الاستلام'}</label>
              <select value={receiptStatus} onChange={(e) => setReceiptStatus(e.target.value)} className="w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none">
                <option value="">{lang === 'ar' ? 'اختر' : 'Select'}</option>
                <option value="received">{t.invoices?.receiptReceived ?? 'مستلمة'}</option>
                <option value="partial">{t.invoices?.receiptPartial ?? 'استلام جزئي'}</option>
                <option value="pending">{t.invoices?.receiptPending ?? 'معلقة'}</option>
              </select>
            </div>
          )}
          <div className="min-w-0">
            <label className="block text-xs font-medium text-slate-600 mb-0.5">{lang === 'ar' ? 'إرفاق المستندات' : 'Attach documents'}</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={attachmentInputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="hidden"
                onChange={(e) => {
                  setAttachmentFromFile(e.target.files?.[0] ?? null)
                }}
              />
              <button
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <FolderOpen size={14} className="text-primary-600" />
                {lang === 'ar' ? 'تصفح' : 'Browse'}
              </button>
              {attachmentFile && (
                <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1">
                  <Paperclip size={12} className="text-primary-600 shrink-0" />
                  <span className="text-xs text-slate-700 truncate max-w-[12.5rem]">{attachmentFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachmentFromFile(null)}
                    className="p-0.5 rounded text-slate-400 hover:text-red-500 transition-colors"
                    title={lang === 'ar' ? 'إزالة' : 'Remove'}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
              {isEditingInvoice && !attachmentFile && existingInvoice?.attachment_url ? (
                <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1">
                  <Paperclip size={12} className="text-primary-600 shrink-0" />
                  <span className="text-xs font-medium text-slate-700 truncate max-w-[12.5rem]">
                    {existingInvoice.attachment ? String(existingInvoice.attachment).split('/').pop() : (lang === 'ar' ? 'مرفق سابقاً' : 'Attached previously')}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <AddCustomerModal
        open={showAddCustomerModal}
        tenantId={tenantId}
        onClose={() => setShowAddCustomerModal(false)}
        onCreated={(c) => {
          setAddedCustomer(c)
          setPartnerId(c.id)
        }}
      />

      <AddVendorModal
        open={showAddVendorModal}
        tenantId={tenantId}
        onClose={() => setShowAddVendorModal(false)}
        onCreated={(v) => {
          setAddedVendor(v)
          setPartnerId(v.id)
        }}
      />

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0 w-full sm:min-w-[18rem]">
              <Search size={18} className="text-slate-400 shrink-0" />
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeSearch}
                onChange={(e) => { setBarcodeSearch(e.target.value); setBarcodeError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItemByBarcodeOrCode())}
                placeholder={t.invoices.searchOrScanBarcode ?? 'بحث أو مسح الباركود (Enter)'}
                className="flex-1 min-w-0 h-9 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              />
            </div>
            {barcodeError && <span className="text-sm text-red-600">{barcodeError}</span>}
          </div>
          <button onClick={addLine} className="btn-action flex items-center gap-1 text-primary-600 hover:text-primary-500 text-sm font-medium">
            <Plus size={16} />
            {t.invoices.addLine}
          </button>
        </div>
        <div className="ui-table-scroll table-responsive-wrap overflow-y-visible -mx-2 sm:mx-0">
          <table
            className={`w-full text-sm table-fixed fc-keep-table-fixed ${
              showVariantColumn && showExpiryColumns
                ? showStockColumn
                  ? 'min-w-[79.5rem]'
                  : 'min-w-[76rem]'
                : showVariantColumn
                  ? showStockColumn
                    ? 'min-w-[67.5rem]'
                    : 'min-w-[64rem]'
                  : showExpiryColumns
                    ? showStockColumn
                      ? 'min-w-[70.5rem]'
                      : 'min-w-[67rem]'
                    : showStockColumn
                      ? 'min-w-[58.5rem]'
                      : 'min-w-[55rem]'
            }`}
          >
            <colgroup>
              <col style={{ width: '7%', minWidth: 70 }} />
              <col style={{ width: showVariantColumn ? '20%' : '28%', minWidth: 160 }} />
              {showVariantColumn && <col style={{ width: '12%', minWidth: 110 }} />}
              {showExpiryColumns && <col style={{ width: '9%', minWidth: 108 }} />}
              {showExpiryColumns && <col style={{ width: '8%', minWidth: 88 }} />}
              <col style={{ width: '8%', minWidth: 88 }} />
              <col style={{ width: '7%', minWidth: 72 }} />
              {showStockColumn && <col style={{ width: '6%', minWidth: 56 }} />}
              <col style={{ width: '8%', minWidth: 88 }} />
              <col style={{ width: '6%', minWidth: 68 }} />
              <col style={{ width: '6%', minWidth: 68 }} />
              <col style={{ width: '8%', minWidth: 88 }} />
              {showSerialColumn && <col style={{ width: '20%', minWidth: 180 }} />}
              <col style={{ width: '2%', minWidth: 44 }} />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-2.5 py-3 font-medium text-center min-w-[70px] w-[70px]">{t.invoices.lineNumber ?? '#'}</th>
                <th className={`${textAlign} px-2 py-3 font-medium`}>{t.invoices.item}</th>
                {showVariantColumn && (
                  <th className={`${textAlign} px-2 py-3 font-medium`}>{lang === 'ar' ? 'المتغير' : 'Variant'}</th>
                )}
                {showExpiryColumns && (
                  <th className={`${textAlign} px-2 py-3 font-medium`}>{lang === 'ar' ? 'تاريخ الصلاحية' : 'Expiry'}</th>
                )}
                {showExpiryColumns && (
                  <th className={`${textAlign} px-2 py-3 font-medium`}>{lang === 'ar' ? 'رقم الباتش' : 'Batch'}</th>
                )}
                <th className={`${textAlign} px-2 py-3 font-medium`}>{t.invoices.unit}</th>
                <th className={`${textAlign} px-2 py-3 font-medium`}>{t.invoices.quantity}</th>
                {showStockColumn && (
                  <th className="text-center text-[10px] font-medium text-slate-500 px-2 py-3 w-14">المتاح</th>
                )}
                <th className={`${textAlign} px-2 py-3 font-medium`}>{t.invoices.unitPrice}</th>
                <th className={`${textAlign} px-2 py-3 font-medium`}>{lang === 'ar' ? 'الخصم' : `${t.invoices.discount} (${t.amount})`}</th>
                <th className={`${textAlign} px-2 py-3 font-medium`}>{t.invoices.tax} %</th>
                <th
                  className={`${textAlign} px-2 py-3 font-medium`}
                  title={
                    lang === 'ar'
                      ? 'يمكن إدخال سعر الوحدة أو إجمالي السطر (بعد خصم وضريبة السطر). عند إدخال الإجمالي يُحسب السعر تلقائياً عند مغادرة الحقل.'
                      : 'Enter unit price, or enter line total (after line discount & tax); total derives unit price on blur.'
                  }
                >
                  {t.amount}
                </th>
                {showSerialColumn && (
                  <th className={`${textAlign} px-2 py-3 font-medium`}>{lang === 'ar' ? 'أرقام تسلسلية' : 'Serial numbers'}</th>
                )}
                <th className="px-2 py-3 w-11" aria-label={lang === 'ar' ? 'حذف' : 'Delete'}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {lines.map((line, idx) => {
                const lineAmount = lineGrossBeforeDiscount(line)
                const afterDiscount = invoiceLineNetBeforeTax(lineAmount, Number(line.discount_amount) || 0)
                const tax = afterDiscount * (line.tax_percent / 100)
                const lineTotal = afterDiscount + tax

                const isDragging = draggingIndex === idx
                const isDragOver = dragOverIndex === idx && draggingIndex !== null && draggingIndex !== idx

                return (
                  <tr
                    key={idx}
                    draggable
                    onDragStart={() => {
                      setDraggingIndex(idx)
                      setDragOverIndex(idx)
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (draggingIndex !== null && draggingIndex !== idx) {
                        setDragOverIndex(idx)
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (draggingIndex !== null && dragOverIndex !== null) {
                        moveLine(draggingIndex, dragOverIndex)
                      }
                      setDraggingIndex(null)
                      setDragOverIndex(null)
                      setOpenItemLineIdx(null)
                      setItemSearchByLine({})
                    }}
                    onDragEnd={() => {
                      setDraggingIndex(null)
                      setDragOverIndex(null)
                    }}
                    className={`hover:bg-slate-50 transition-colors ${isDragging ? 'bg-primary-50' : ''} ${isDragOver ? 'ring-2 ring-primary-300' : ''}`}
                  >
                    <td className="px-2.5 py-2 text-center align-middle select-none text-slate-500 min-w-[70px] w-[70px]">
                      <div className="inline-flex items-center gap-1">
                        <span className="text-xs font-medium tabular-nums">{idx + 1}</span>
                        <span className="cursor-grab text-slate-400 hover:text-slate-600">
                          <GripVertical size={14} />
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 align-middle cell-ellipsis">
                      <div className="relative min-w-0">
                        <input
                          ref={openItemLineIdx === idx ? (el) => { itemInputRef.current = el } : undefined}
                          type="text"
                          value={openItemLineIdx === idx ? (itemSearchByLine[idx] ?? '') : (line.item_id ? (items.find((i) => i.id === line.item_id)?.name ?? '') : '')}
                          title={line.item_id ? (items.find((i) => i.id === line.item_id)?.name ?? '') : ''}
                          onChange={(e) => {
                            setItemSearchByLine((p) => ({ ...p, [idx]: e.target.value }))
                            setOpenItemLineIdx(idx)
                          }}
                          onFocus={() => {
                            setOpenItemLineIdx(idx)
                            if (!line.item_id) setItemSearchByLine((p) => ({ ...p, [idx]: p[idx] ?? '' }))
                          }}
                          onBlur={() => setTimeout(() => setOpenItemLineIdx(null), 200)}
                          placeholder={t.invoices.searchItemPlaceholder}
                          className={`${lineInputClass} ${openItemLineIdx !== idx ? 'truncate' : ''}`}
                        />
                      </div>
                    </td>
                    {showVariantColumn && (
                      <td className="px-2 py-2 align-middle">
                        {line.item_id ? (
                          <>
                            {variantsEnabledForInvoice && (
                              <InvoiceLineVariantPrefetch itemId={line.item_id} load={ensureItemVariantsInMap} />
                            )}
                            <div className="flex flex-col gap-1 min-w-0">
                              <select
                                value={line.item_variant_id ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  updateLine(idx, 'item_variant_id', v === '' ? null : Number(v))
                                }}
                                className={`${lineInputClass} text-xs`}
                                title={lang === 'ar' ? 'المتغير' : 'Variant'}
                              >
                                <option value="">{lang === 'ar' ? '—' : '—'}</option>
                                {(itemVariantsByItemId[line.item_id] ?? []).map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name ||
                                      (v.options
                                        ? Object.entries(v.options)
                                            .map(([a, b]) => `${a}: ${b}`)
                                            .join(' · ')
                                        : `#${v.id}`)}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="text-xs text-primary-600 hover:underline whitespace-nowrap"
                                onClick={() => setVariantBulkModal({ lineIdx: idx, itemId: line.item_id! })}
                              >
                                {lang === 'ar' ? 'توزيع الكميات…' : 'Distribute qty…'}
                              </button>
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    {showExpiryColumns && (
                      <td className="px-2 py-2 align-middle">
                        {line.item_id ? (
                          <input
                            type="date"
                            value={line.expiry_date ? line.expiry_date.slice(0, 10) : ''}
                            onChange={(e) => updateLine(idx, 'expiry_date', e.target.value)}
                            className={`${lineInputClass} text-xs min-w-0`}
                            title={lang === 'ar' ? 'تاريخ الصلاحية' : 'Expiry date'}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    {showExpiryColumns && (
                      <td className="px-2 py-2 align-middle">
                        {line.item_id ? (
                          <input
                            type="text"
                            value={line.batch_number ?? ''}
                            onChange={(e) => updateLine(idx, 'batch_number', e.target.value)}
                            placeholder={lang === 'ar' ? 'رقم الباتش' : 'Batch #'}
                            className={`${lineInputClass} text-xs min-w-0`}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    <td className="px-2 py-2 text-slate-600 text-sm align-middle">
                      {line.item_id ? (() => {
                        const it = items.find((i) => i.id === line.item_id) as (Item & { unit_options?: ItemUnitOption[]; unitOptions?: ItemUnitOption[]; item_unit?: { id: number; name: string; name_en?: string | null } }) | undefined
                        const opts = it?.unit_options ?? it?.unitOptions
                        const fromItem = opts && opts.length > 0
                          ? opts.map((o) => ({ id: o.unit_id, name: o.unit ? (lang === 'ar' ? o.unit.name : (o.unit.name_en || o.unit.name)) : `#${o.unit_id}` }))
                          : (it?.unit_id && it?.item_unit ? [{ id: it.unit_id, name: lang === 'ar' ? it.item_unit.name : (it.item_unit.name_en || it.item_unit.name) }] : [])
                        const unitList = fromItem
                        const value = String(line.unit_id ?? it?.unit_id ?? (unitList[0]?.id ?? ''))
                        if (unitList.length === 0) {
                          const u = it?.item_unit
                          return u ? (lang === 'ar' ? u.name : (u.name_en || u.name)) : (it?.unit ?? '—')
                        }
                        return (
                          <select
                            value={value}
                            onChange={(e) => {
                              const val = e.target.value
                              const uid = val ? Number(val) : null
                              const newPrice = it ? getPriceForUnit(it, uid) : 0
                              handleUnitChange(idx, uid, newPrice)
                            }}
                            className={lineInputClass}
                          >
                            {unitList.map((u) => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        )
                      })() : '—'}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, 'quantity', +e.target.value)}
                        className={lineInputNumberClass}
                      />
                    </td>
                    {showStockColumn && (
                      <td className="px-2 py-2 text-center align-middle">
                        {(() => {
                          const it = line.item_id ? items.find((i) => i.id === line.item_id) : undefined
                          const stock = it?.current_stock
                          const minQ = it?.min_quantity ?? 5
                          if (stock === undefined || stock === null) return <span className="text-slate-300 text-[10px]">—</span>
                          if (stock <= 0) {
                            return <span className="text-[10px] text-red-500">نفذ ✕</span>
                          }
                          if (stock <= minQ) {
                            return (
                              <span className="text-[10px] text-amber-600">
                                {stock} !
                              </span>
                            )
                          }
                          return (
                            <span className="text-[10px] text-emerald-600">
                              {stock} ✓
                            </span>
                          )
                        })()}
                      </td>
                    )}
                    <td className="px-2 py-2 align-middle">
                      <input
                        type="number"
                        step="0.0001"
                        min={0}
                        value={lineHasValidUnitPrice(line) ? line.unit_price! : ''}
                        onChange={(e) => {
                          const raw = e.target.value.trim()
                          if (raw === '' || raw === '.') {
                            updateLine(idx, 'unit_price', null)
                            return
                          }
                          const n = parseFloat(raw)
                          updateLine(idx, 'unit_price', Number.isFinite(n) ? n : null)
                        }}
                        className={lineInputNumberClass}
                      />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <input
                        type="number"
                        step="0.001"
                        min={0}
                        max={lineHasValidUnitPrice(line) ? lineGrossBeforeDiscount(line) : undefined}
                        value={line.discount_amount}
                        onChange={(e) => {
                          const raw = e.target.value
                          const n = raw === '' ? 0 : parseFloat(raw)
                          const v = Number.isFinite(n) ? Math.max(0, n) : 0
                          const cap = lineHasValidUnitPrice(line) ? lineGrossBeforeDiscount(line) : v
                          updateLine(idx, 'discount_amount', Math.round(Math.min(v, cap) * 1000) / 1000)
                        }}
                        className={lineInputNumberClass}
                      />
                    </td>
                    <td className="px-2 py-2 align-middle" title={lang === 'ar' ? 'تُحدد من إعدادات الصنف أو إعدادات الضرائب' : 'From item or tax settings'}>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={100}
                        readOnly
                        value={line.tax_percent}
                        className={lineInputReadOnlyClass}
                      />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <input
                        key={`line-amt-${idx}-${String(line.unit_price ?? 'x')}-${line.quantity}-${line.discount_amount}-${line.tax_percent}`}
                        type="number"
                        step="any"
                        min={0}
                        defaultValue={
                          lineHasValidUnitPrice(line)
                            ? Number(lineTotal.toFixed(Math.min(8, priceDecimals + 4)))
                            : ''
                        }
                        onBlur={(e) => applyLineTotalInput(idx, e.target.value)}
                        placeholder={lang === 'ar' ? 'إجمالي أو سعر' : 'Total or price'}
                        title={
                          lang === 'ar'
                            ? 'أدخل إجمالي السطر ثم اضغط خارج الحقل لحساب سعر الوحدة، أو املأ سعر الوحدة مباشرة.'
                            : 'Enter line total then blur to derive unit price, or fill unit price first.'
                        }
                        className={lineInputNumberClass}
                      />
                    </td>
                    {showSerialColumn && (
                      <td className="px-2 py-2 align-top">
                        {line.use_serial_number ? (() => {
                          const required = Math.round(line.quantity)
                          const arr = [...(line.serial_numbers ?? [])]
                          while (arr.length < required) arr.push('')
                          const list = arr.slice(0, required)
                          // الأرقام المختارة في هذا السطر (لاستبعادها من القائمة)
                          const usedInThisLine = list.filter((s) => String(s).trim())
                          // كل الأرقام المختارة في كل الأسطر
                          const allChosenSerials = lines
                            .flatMap((l, li) =>
                              li === idx ? [] : (l.serial_numbers ?? []).filter((s) => String(s).trim())
                            )
                            .concat(usedInThisLine.filter((_, si) => false)) // سيتم تحديثه لكل خلية
                          return (
                            <div className="space-y-1">
                              {list.map((_, serialIdx) => {
                                const excludeForThisCell = [
                                  // استبعاد ما اختير في نفس السطر وخلايا أخرى
                                  ...list
                                    .filter((s, si) => si !== serialIdx && String(s).trim())
                                    .map((s) => String(s).trim()),
                                  ...lines
                                    .flatMap((l, li) =>
                                      li === idx
                                        ? []
                                        : (l.item_id === line.item_id
                                            ? (l.serial_numbers ?? []).filter((s) => String(s).trim())
                                            : [])
                                    ),
                                ]
                                return (
                                  <SerialNumberSelect
                                    key={serialIdx}
                                    tenantId={tenantId}
                                    itemId={line.item_id!}
                                    warehouseId={warehouseId}
                                    value={list[serialIdx] ?? ''}
                                    onChange={(v) => setLineSerialAt(idx, serialIdx, v)}
                                    placeholder={lang === 'ar' ? `رقم ${serialIdx + 1}` : `#${serialIdx + 1}`}
                                    excludeSerials={excludeForThisCell}
                                  />
                                )
                              })}
                              {required > 0 && list.filter((s) => String(s).trim()).length !== required && (
                                <p className="text-amber-600 text-xs mt-0.5">{lang === 'ar' ? `يلزم ${required} رقم تسلسلي` : `${required} serial(s) required`}</p>
                              )}
                            </div>
                          )
                        })() : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                    )}
                    <td className="px-2 py-2 align-middle w-11">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length <= 1}
                        className="p-1.5 rounded text-red-500/80 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30"
                        aria-label={lang === 'ar' ? 'حذف السطر' : 'Remove line'}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {showPurchaseExpensesSection && (
          <div className="border-t border-slate-200 px-3 py-4 bg-slate-50/50">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h4 className="text-sm font-semibold text-slate-800">
                {lang === 'ar' ? 'مصاريف الشراء الإضافية' : 'Additional purchase expenses'}
              </h4>
              <button
                type="button"
                onClick={() => setAdditionalExpenses((prev) => [...prev, emptyAdditionalExpense()])}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50"
              >
                <Plus size={14} />
                {lang === 'ar' ? 'إضافة مصروف' : 'Add expense'}
              </button>
            </div>
            {additionalExpenses.length === 0 ? (
              <p className="text-xs text-slate-500">{lang === 'ar' ? 'لا توجد مصاريف إضافية.' : 'No additional expenses.'}</p>
            ) : (
              <div className="ui-table-scroll overflow-x-auto -mx-2 sm:mx-0">
                <table className="w-full text-sm min-w-[56rem] table-fixed fc-keep-table-fixed">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 text-xs">
                      <th className={`${textAlign} px-2 py-2 font-medium w-[30%] min-w-[12rem]`}>{lang === 'ar' ? 'البيان' : 'Description'}</th>
                      <th className="px-2 py-2 font-medium text-end w-[8%] tabular-nums">{lang === 'ar' ? 'صافي' : 'Net'}</th>
                      <th className="px-2 py-2 font-medium text-end w-[7%] tabular-nums">{lang === 'ar' ? 'ضريبة' : 'Tax'}</th>
                      <th className="px-2 py-2 font-medium text-end w-[8%] tabular-nums">{lang === 'ar' ? 'إجمالي' : 'Total'}</th>
                      <th className={`${textAlign} px-2 py-2 font-medium w-[20%] min-w-[11rem]`}>{lang === 'ar' ? 'حساب مصروف' : 'Expense A/C'}</th>
                      <th className={`${textAlign} px-2 py-2 font-medium w-[20%] min-w-[11rem]`}>{lang === 'ar' ? 'حساب دائن' : 'Creditor A/C'}</th>
                      <th className="w-10 p-2 shrink-0" aria-label="del" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {additionalExpenses.map((row, ei) => (
                      <tr key={ei} className="hover:bg-white/80">
                        <td className="px-2 py-1.5 align-middle">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => {
                              const v = e.target.value
                              setAdditionalExpenses((prev) => prev.map((r, j) => (j === ei ? { ...r, description: v } : r)))
                            }}
                            className={lineInputClass}
                          />
                        </td>
                        <td className="px-2 py-1.5 align-middle">
                          <input
                            type="number"
                            step="0.001"
                            min={0}
                            value={row.amount_net}
                            onChange={(e) => {
                              const net = Math.round((parseFloat(String(e.target.value)) || 0) * 1000) / 1000
                              const tax = row.tax_amount
                              setAdditionalExpenses((prev) =>
                                prev.map((r, j) =>
                                  j === ei ? { ...r, amount_net: net, total_amount: Math.round((net + tax) * 1000) / 1000 } : r
                                )
                              )
                            }}
                            className={lineInputNumberClass}
                          />
                        </td>
                        <td className="px-2 py-1.5 align-middle">
                          <input
                            type="number"
                            step="0.001"
                            min={0}
                            value={row.tax_amount}
                            onChange={(e) => {
                              const tax = Math.round((parseFloat(String(e.target.value)) || 0) * 1000) / 1000
                              const net = row.amount_net
                              setAdditionalExpenses((prev) =>
                                prev.map((r, j) =>
                                  j === ei ? { ...r, tax_amount: tax, total_amount: Math.round((net + tax) * 1000) / 1000 } : r
                                )
                              )
                            }}
                            className={lineInputNumberClass}
                          />
                        </td>
                        <td className="px-2 py-1.5 align-middle">
                          <input
                            type="number"
                            step="0.001"
                            readOnly
                            value={row.total_amount}
                            className={lineInputReadOnlyClass}
                          />
                        </td>
                        <td className="px-2 py-1.5 align-middle">
                          <AccountSearchSelect
                            value={row.expense_account_id}
                            accounts={postableAccounts}
                            onChange={(id) =>
                              setAdditionalExpenses((prev) =>
                                prev.map((r, j) => (j === ei ? { ...r, expense_account_id: id } : r))
                              )
                            }
                            placeholder={lang === 'ar' ? 'حساب مصروف' : 'Expense account'}
                            className="min-w-0"
                            inputClassName={lineInputClass}
                            allowEmpty
                          />
                        </td>
                        <td className="px-2 py-1.5 align-middle">
                          <AccountSearchSelect
                            value={row.creditor_account_id}
                            accounts={postableAccounts}
                            onChange={(id) =>
                              setAdditionalExpenses((prev) =>
                                prev.map((r, j) => (j === ei ? { ...r, creditor_account_id: id } : r))
                              )
                            }
                            placeholder={lang === 'ar' ? 'حساب دائن' : 'Creditor account'}
                            className="min-w-0"
                            inputClassName={lineInputClass}
                            allowEmpty
                          />
                        </td>
                        <td className="px-2 py-1.5 align-middle text-center">
                          <button
                            type="button"
                            onClick={() => setAdditionalExpenses((prev) => prev.filter((_, j) => j !== ei))}
                            className="p-1 rounded text-red-500/80 hover:bg-red-50"
                            aria-label={lang === 'ar' ? 'حذف' : 'Remove'}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-slate-200 p-4 flex flex-wrap gap-4 justify-between">
          <div className="flex-1 min-w-0 w-full max-w-full lg:max-w-[640px] flex flex-col">
            {type === 'sales' && !isReturn && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 shadow-sm">
                <DeliveryFeesSection variant="embedded" fees={deliveryFees} onChange={setDeliveryFees} />
              </div>
            )}
            <div className={type === 'sales' && !isReturn ? 'mt-6 pt-2' : ''}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.notes}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
              />
            </div>
          </div>
          <div className="totals-wrapper totals-container">
            <div className="totals-item total-row">
              <span className="totals-label total-label">{lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
              <span className="totals-value total-value" dir="ltr">{fmtWithSymbol(totals.subtotal)}</span>
            </div>
            <div className="totals-item total-row" style={{ color: '#d9534f' }}>
              <span className="totals-label total-label">{lang === 'ar' ? 'الخصم' : 'Discount'}</span>
              <div className="flex items-center gap-2 flex-wrap shrink-0 total-value">
                <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5" role="group">
                  <button type="button" onClick={() => setDiscountType('amount')} className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${discountType === 'amount' ? 'bg-white text-primary-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>{lang === 'ar' ? 'مبلغ' : 'Amount'}</button>
                  <button type="button" onClick={() => setDiscountType('percent')} className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${discountType === 'percent' ? 'bg-white text-primary-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>%</button>
                </div>
                <input type="text" inputMode="decimal" value={discountInputStr} onChange={(e) => setDiscountInputStr(e.target.value)} placeholder="0" className="w-20 sm:w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-left outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500/50 tabular-nums" />
                <span className="totals-value" dir="ltr">- {fmtWithSymbol(totals.discountAmount)}</span>
              </div>
            </div>
            {type === 'sales' && !isReturn && availablePromos.length > 0 && (
              <div className="col-span-full">
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mt-1">
                  <p className="text-xs font-bold text-rose-700 mb-2">
                    {lang === 'ar' ? '🏷️ عروض متاحة تلقائياً' : '🏷️ Available promotions'}
                  </p>
                  {availablePromos.map((p) => (
                    <label
                      key={p.promotion_id}
                      className="flex items-center gap-2 text-xs cursor-pointer mb-1"
                    >
                      <input
                        type="radio"
                        name="promo"
                        checked={appliedPromo?.promotion_id === p.promotion_id}
                        onChange={() => {
                          setAppliedPromo(p)
                          setPromoDiscount(p.discount_amount)
                        }}
                      />
                      <span>{p.promotion_name}</span>
                      <span className="font-bold text-rose-600 ms-auto tabular-nums" dir="ltr">
                        - {p.discount_amount.toFixed(3)} KWD
                      </span>
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedPromo(null)
                      setPromoDiscount(0)
                    }}
                    className="text-[10px] text-gray-400 mt-1 hover:text-gray-600"
                  >
                    {lang === 'ar' ? 'بدون عرض' : 'No promotion'}
                  </button>
                </div>
              </div>
            )}
            {type === 'sales' && !isReturn && promoDiscount > 0.0005 && (
              <div className="totals-item total-row text-rose-700">
                <span className="totals-label">{lang === 'ar' ? 'خصم العرض' : 'Promotion'}</span>
                <span className="totals-value tabular-nums" dir="ltr">
                  - {fmtWithSymbol(promoDiscount)}
                </span>
              </div>
            )}
            {type === 'sales' && !isReturn && (
              <div className="totals-item total-row text-emerald-800">
                <span className="totals-label total-label">{lang === 'ar' ? 'الإضافات' : 'Additions'}</span>
                <span className="totals-value total-value" dir="ltr">+ {fmtWithSymbol(totals.additionsTotal)}</span>
              </div>
            )}
            <div className="totals-item total-row">
              <span className="totals-label total-label">{lang === 'ar' ? 'الوعاء الضريبي' : 'Taxable Amount'}</span>
              <span className="totals-value total-value" dir="ltr">{fmtWithSymbol(totals.taxBase)}</span>
            </div>
            <div className="totals-item total-row">
              <span className="totals-label total-label">{lang === 'ar' ? 'قيمة الضريبة' : 'VAT'}</span>
              <span className="totals-value total-value" dir="ltr">+ {fmtWithSymbol(totals.totalTax)}</span>
            </div>
            <div className="totals-item total-row grand-total-row">
              <span className="totals-label grand-total-label">{lang === 'ar' ? 'الصافي النهائي' : 'Grand Total'}</span>
              <span className="totals-value grand-total-value" dir="ltr">
                {fmtWithSymbol(type === 'sales' && !isReturn ? effectiveGrandTotal : grandTotal)}
              </span>
            </div>
            {type === 'sales' && !isReturn && partialPayment.enabled && partialPayment.amount > 0.0005 && (
              <>
                <div className="totals-item total-row text-emerald-700 text-sm">
                  <span className="totals-label">{lang === 'ar' ? 'المدفوع الآن (مخطط)' : 'Paid now (planned)'}</span>
                  <span className="totals-value tabular-nums" dir="ltr">{fmtWithSymbol(partialPayment.amount)}</span>
                </div>
                <div className="totals-item total-row text-red-600 text-sm font-semibold">
                  <span className="totals-label">{lang === 'ar' ? 'الرصيد في الذمة' : 'A/R balance'}</span>
                  <span className="totals-value tabular-nums" dir="ltr">
                    {fmtWithSymbol(Math.max(0, grandTotal - partialPayment.amount))}
                  </span>
                </div>
              </>
            )}
            {showSalesPaymentTabs && salesPaymentTab === 'installment' && instCount > 0 && (
              <div className="border-t border-sky-100 pt-3 mt-2 space-y-1" dir="rtl">
                <p className="text-[10px] font-medium text-sky-700 mb-1">📅 تفاصيل التقسيط</p>
                {(
                  [
                    {
                      label: 'عدد الأقساط',
                      value: `${instCount} أقساط ${
                        instPeriod === 'monthly'
                          ? 'شهرية'
                          : instPeriod === 'quarterly'
                            ? 'ربع سنوية'
                            : instPeriod === 'semi_annual'
                              ? 'نصف سنوية'
                              : 'سنوية'
                      }`,
                    },
                    { label: 'قيمة القسط (معاينة)', value: `${installmentAmountPreview.toFixed(3)} KWD` },
                    { label: 'الدفعة الأولى', value: `${installmentDownPaymentKwd.toFixed(3)} KWD` },
                    {
                      label: 'آخر قسط',
                      value: installmentPreviewSchedule[installmentPreviewSchedule.length - 1]?.date ?? '—',
                    },
                  ] as { label: string; value: string }[]
                ).map((row) => (
                  <div key={row.label} className="flex justify-between text-xs border-b border-sky-50 py-1 gap-2">
                    <span className="text-sky-600">{row.label}</span>
                    <span className="text-sky-800 font-medium tabular-nums">{row.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

          <div className="border-t border-slate-200 p-4 mt-4 bg-slate-50/60 rounded-lg" dir="rtl">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span aria-hidden>💳</span>
              {lang === 'ar' ? 'بيانات السداد' : (t.invoices.paymentDataSection ?? 'Payment')}
            </p>
            {showSalesPaymentTabs && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
                {(
                  [
                    { value: 'cash' as const, label: 'نقدي', icon: '💵' },
                    { value: 'bank' as const, label: 'بنك', icon: '🏦' },
                    { value: 'deferred' as const, label: 'بالآجل', icon: '📋' },
                    { value: 'installment' as const, label: 'تقسيط', icon: '📅' },
                    { value: 'mixed' as const, label: 'مختلط', icon: '🔀' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => applySalesPaymentTab(opt.value)}
                    className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-xl border-2 transition-all duration-200 cursor-pointer min-w-0 ${
                      salesPaymentTab === opt.value
                        ? 'border-emerald-500 bg-emerald-50 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <span className="text-xl mb-1 leading-none">{opt.icon}</span>
                    <span
                      className={`text-[10px] font-semibold ${
                        salesPaymentTab === opt.value ? 'text-emerald-700' : 'text-slate-600'
                      }`}
                    >
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {showSalesPaymentTabs &&
              salesPaymentTab === 'installment' &&
              isEditingInvoice &&
              existingInvoice?.installment_id && (
                <p className="text-xs text-slate-600 mb-3" dir="rtl">
                  {lang === 'ar'
                    ? 'هذه الفاتورة مرتبطة بجدول أقساط. لإدارة الأقساط استخدم صفحة تفاصيل التقسيط.'
                    : 'This invoice is linked to an installment schedule. Manage it from the installment detail page.'}
                </p>
              )}
            {showSalesPaymentTabs &&
              salesPaymentTab === 'installment' &&
              !(isEditingInvoice && existingInvoice?.installment_id) && (
                <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 mb-4" dir="rtl">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-sm font-medium text-sky-800">📅 إعدادات التقسيط</span>
                    <span className="text-xs text-sky-600">
                      يُنشأ جدول الأقساط من رصيد الفاتورة بعد الحفظ (الباقي بعد الدفعة الأولى إن وُجدت).
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-[10px] text-slate-500 mb-1">إجمالي الفاتورة</p>
                      <p className="text-lg font-medium text-slate-900">{grandTotal.toFixed(3)}</p>
                      <p className="text-[10px] text-slate-400">KWD</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-[10px] text-slate-500 mb-1">
                        عدد الأقساط <span className="text-red-500">*</span>
                      </p>
                      <input
                        type="number"
                        min={1}
                        max={maxInstallmentsAllowed}
                        value={instCount}
                        onChange={(e) =>
                          setInstCount(
                            Math.min(maxInstallmentsAllowed, Math.max(1, parseInt(e.target.value, 10) || 1)),
                          )
                        }
                        className="w-full text-center text-lg font-medium text-sky-700 border-none bg-transparent outline-none"
                      />
                      <p className="text-[10px] text-slate-400">قسط</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-[10px] text-slate-500 mb-1">قيمة القسط (معاينة)</p>
                      <p className="text-lg font-medium text-sky-700">{installmentAmountPreview.toFixed(3)}</p>
                      <p className="text-[10px] text-slate-400">KWD</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-[10px] text-slate-500 mb-1">الدفعة الأولى</p>
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={instDownPayment || ''}
                          onChange={(e) => setInstDownPayment(parseFloat(e.target.value) || 0)}
                          className="w-16 text-center text-base font-medium text-sky-700 border-none bg-transparent outline-none"
                          placeholder="0"
                        />
                        <button
                          type="button"
                          onClick={() => setInstDownType((p) => (p === 'fixed' ? 'percent' : 'fixed'))}
                          className="text-[10px] px-1.5 py-0.5 border border-sky-200 rounded text-sky-700 bg-sky-50"
                        >
                          {instDownType === 'fixed' ? 'KWD' : '%'}
                        </button>
                      </div>
                      {installmentDownPaymentKwd > 0 && (
                        <p className="text-[10px] text-sky-600 mt-1">= {installmentDownPaymentKwd.toFixed(3)} KWD</p>
                      )}
                    </div>
                  </div>
                  {installmentDownPaymentKwd > 0.0005 && (
                    <div className="mb-4 rounded-lg border border-sky-100 bg-white p-3">
                      <label className="block text-xs font-medium text-sky-900 mb-1">
                        طريقة دفع الدفعة الأولى <span className="text-red-500">*</span>
                      </label>
                      <p className="text-[10px] text-sky-600 mb-2 leading-snug">
                        يُرحَّل المبلغ المدفوع مقدّماً إلى الحساب المرتبط بهذه الطريقة (صندوق/بنك)، والباقي يبقى على ذمّة
                        العميل ثم يُقسَّط.
                      </p>
                      <select
                        value={installmentDownPaymentMethodId ?? ''}
                        onChange={(e) =>
                          setInstallmentDownPaymentMethodId(e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-full max-w-md h-9 rounded-md border border-sky-200 px-2 text-sm bg-white"
                      >
                        <option value="">{lang === 'ar' ? 'اختر طريقة الدفع' : 'Select payment method'}</option>
                        {paymentMethods
                          .filter((pm) => pm.is_active)
                          .map((pm) => (
                            <option key={pm.id} value={pm.id}>
                              {lang === 'ar' ? pm.name : pm.name_en || pm.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                  <div className="mb-3">
                    <p className="text-[10px] text-sky-600 mb-1">فائدة (معاينة فقط — غير مُرحَّلة)</p>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={instInterest || ''}
                      onChange={(e) => setInstInterest(parseFloat(e.target.value) || 0)}
                      className="w-full max-w-[8rem] h-8 rounded-md border border-sky-200 px-2 text-sm text-center"
                    />
                  </div>
                  <div className="mb-4">
                    <p className="text-[10px] text-sky-600 mb-2">دورية الأقساط</p>
                    <div className="flex gap-2 flex-wrap">
                      {(
                        [
                          { value: 'monthly' as const, label: 'شهري' },
                          { value: 'quarterly' as const, label: 'ربع سنوي' },
                          { value: 'semi_annual' as const, label: 'نصف سنوي' },
                          { value: 'annual' as const, label: 'سنوي' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setInstPeriod(opt.value)}
                          className={`px-3 py-1 rounded-full text-xs transition-colors border ${
                            instPeriod === opt.value
                              ? 'bg-sky-600 text-white border-sky-600'
                              : 'bg-white text-sky-700 border-sky-200 hover:bg-sky-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {installmentPreviewSchedule.length > 0 && (
                    <div className="bg-white rounded-lg p-3 mb-2">
                      <p className="text-[10px] text-slate-500 mb-3">
                        معاينة الجدول — {instCount} أقساط{' '}
                        {
                          {
                            monthly: 'شهرية',
                            quarterly: 'ربع سنوية',
                            semi_annual: 'نصف سنوية',
                            annual: 'سنوية',
                          }[instPeriod]
                        }
                      </p>
                      <div className="flex items-start gap-0 overflow-x-auto pb-2 mb-3" dir="ltr">
                        {installmentPreviewSchedule.slice(0, Math.min(installmentPreviewSchedule.length, 8)).map((row, idx) => (
                          <span key={`${row.number}-${row.date}`} className="flex items-start gap-0">
                            {idx > 0 && <span className="h-0.5 flex-1 bg-sky-100 mt-2.5 min-w-[10px]" />}
                            <span className="flex flex-col items-center shrink-0">
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium ${
                                  row.isDown ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white'
                                }`}
                              >
                                {row.isDown ? '↓' : row.number}
                              </span>
                              <span className="text-[8px] text-slate-500 mt-1">
                                {new Date(row.date + 'T12:00:00').toLocaleDateString('ar', { month: 'short' })}
                              </span>
                              <span className="text-[8px] text-slate-400">{row.amount.toFixed(0)}</span>
                            </span>
                          </span>
                        ))}
                        {installmentPreviewSchedule.length > 8 && (
                          <span className="flex items-center mr-1 text-[10px] text-slate-400">
                            +{installmentPreviewSchedule.length - 8}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 text-xs">
                        {(
                          [
                            { label: 'إجمالي الفاتورة', value: `${grandTotal.toFixed(3)} KWD` },
                            { label: 'الدفعة الأولى', value: `- ${installmentDownPaymentKwd.toFixed(3)} KWD`, color: 'text-emerald-600' },
                            {
                              label: 'الباقي على أقساط',
                              value: `${balanceAfterDownForInstallments.toFixed(3)} KWD`,
                              color: 'text-sky-700',
                            },
                            {
                              label: 'قيمة القسط (معاينة)',
                              value: `${installmentAmountPreview.toFixed(3)} KWD`,
                              color: 'text-sky-800 font-medium',
                            },
                            {
                              label: 'آخر قسط في',
                              value: installmentPreviewSchedule[installmentPreviewSchedule.length - 1]?.date ?? '—',
                              noKwd: true,
                            },
                          ] as { label: string; value: string; color?: string; noKwd?: boolean }[]
                        ).map((row) => (
                          <div key={row.label} className="flex justify-between border-b border-slate-50 py-1 gap-2">
                            <span className="text-slate-500">{row.label}</span>
                            <span className={`tabular-nums ${row.color ?? 'text-slate-800'}`}>
                              {row.value}
                              {!row.noKwd && row.label !== 'آخر قسط في' ? '' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {Math.abs(installmentPreviewSchedule.reduce((s, r) => s + r.amount, 0) - grandTotal) > 0.05 &&
                    instInterest > 0 && (
                      <div className="mt-2 p-2 bg-amber-50 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                        ⚠️ مع الفائدة قد لا يساوي مجموع المعاينة إجمالي الفاتورة — الجدول الفعلي يقسّم رصيد الفاتورة بالتساوي
                        دون فائدة.
                      </div>
                    )}
                  <p className="text-[10px] text-sky-600 mt-2">
                    ℹ️ عند الحفظ يُستدعى واجهة الأقساط تلقائياً بمطابقة هذه الإعدادات. يمكن ضبط التفاصيل من النافذة أو لاحقاً
                    من صفحة الأقساط.
                  </p>
                </div>
              )}
            {showSalesPaymentTabs && salesPaymentTab !== 'installment' && (
              <PartialPaymentSection
                grandTotal={grandTotal}
                paymentMethods={paymentMethods}
                partial={partialPayment}
                onChange={setPartialPayment}
                disabled={Boolean(isEditingInvoice && hasLinkedPayments)}
              />
            )}
            {showSalesPaymentTabs && salesPaymentTab === 'mixed' && (
              <div className="mb-4 space-y-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-bold text-slate-600 truncate">
                      {lang === 'ar' ? 'طرق الدفع' : 'Payment methods'}
                    </span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-semibold shrink-0">
                      {lang === 'ar' ? 'مختلط' : 'Mixed'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 transition-colors shrink-0"
                    onClick={() =>
                      setMixedPaymentLines((rows) => [
                        ...rows,
                        { id: `m-${Date.now()}`, method_id: null, amount: '' },
                      ])
                    }
                  >
                    + {lang === 'ar' ? 'إضافة طريقة' : 'Add method'}
                  </button>
                </div>
                <div className="flex flex-col gap-2 mb-3">
                  {mixedPaymentLines.map((row, ri) => {
                    const selectedMethod = paymentMethods.find((m) => m.id === row.method_id)
                    const methodIcons: Record<string, string> = {
                      cash: '💵',
                      bank: '🏦',
                      credit: '💳',
                      other: '💰',
                    }
                    const icon = selectedMethod ? methodIcons[selectedMethod.type] ?? '💰' : '💰'
                    return (
                      <div
                        key={row.id}
                        className={`grid items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-colors grid-cols-[auto_1fr_minmax(0,7.5rem)_28px] ${
                          ri === 0
                            ? 'border-emerald-400 bg-emerald-50/50'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <span className="text-base leading-none shrink-0" aria-hidden>
                          {icon}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] text-slate-400 mb-0.5">
                            {lang === 'ar' ? 'طريقة الدفع' : 'Method'}
                          </span>
                          <select
                            value={row.method_id ?? ''}
                            onChange={(e) =>
                              setMixedPaymentLines((prev) =>
                                prev.map((r, i) =>
                                  i === ri ? { ...r, method_id: e.target.value ? Number(e.target.value) : null } : r,
                                ),
                              )
                            }
                            className="text-sm font-medium text-slate-800 bg-transparent border border-slate-200 rounded-lg px-2 py-1 outline-none cursor-pointer w-full min-w-0 truncate"
                          >
                            <option value="">{lang === 'ar' ? 'اختر...' : 'Select…'}</option>
                            {paymentMethods
                              .filter((p) => p.is_active)
                              .map((pm) => (
                                <option key={pm.id} value={pm.id}>
                                  {lang === 'ar' ? pm.name : pm.name_en || pm.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] text-slate-400 mb-0.5">
                            {lang === 'ar' ? 'المبلغ (KWD)' : 'Amount (KWD)'}
                          </span>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={row.amount}
                            onChange={(e) =>
                              setMixedPaymentLines((prev) =>
                                prev.map((r, i) => (i === ri ? { ...r, amount: e.target.value } : r)),
                              )
                            }
                            placeholder="0.000"
                            className={`input-no-spinner w-full text-center text-sm font-bold border rounded-lg px-2 py-1 outline-none transition-colors tabular-nums ${
                              ri === 0
                                ? 'border-emerald-300 text-emerald-700 focus:border-emerald-500 bg-white'
                                : 'border-slate-200 text-emerald-700 focus:border-emerald-400 bg-white'
                            }`}
                          />
                        </div>
                        <button
                          type="button"
                          disabled={mixedPaymentLines.length <= 1}
                          onClick={() => setMixedPaymentLines((prev) => prev.filter((_, i) => i !== ri))}
                          title={
                            mixedPaymentLines.length <= 1
                              ? lang === 'ar'
                                ? 'لا يمكن حذف الصف الوحيد'
                                : 'Cannot remove the only row'
                              : lang === 'ar'
                                ? 'حذف'
                                : 'Remove'
                          }
                          aria-label={lang === 'ar' ? 'حذف' : 'Remove'}
                          className="w-7 h-7 rounded-lg bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-0 border border-slate-200">
                  <div className="flex justify-between items-center py-2 gap-2">
                    <span className="text-xs text-slate-500">
                      {lang === 'ar' ? 'إجمالي الفاتورة' : 'Invoice total'}
                    </span>
                    <span className="text-sm font-bold text-emerald-600 tabular-nums" dir="ltr">
                      {fmtWithSymbol(grandTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-t border-slate-100 gap-2">
                    <span className="text-xs text-slate-500">
                      {lang === 'ar' ? 'إجمالي المدفوع' : 'Total paid'}
                    </span>
                    <span className="text-sm font-semibold text-slate-700 tabular-nums" dir="ltr">
                      {fmtWithSymbol(mixedPaymentTotalPaid)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-t border-slate-100 gap-2">
                    <span className="text-xs text-slate-500">
                      {mixedPaymentTotalPaid >= grandTotal - 1e-9
                        ? lang === 'ar'
                          ? 'الفكة / الزيادة'
                          : 'Change'
                        : lang === 'ar'
                          ? 'المتبقي'
                          : 'Remaining'}
                    </span>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        mixedPaymentTotalPaid >= grandTotal - 1e-9 ? 'text-emerald-600' : 'text-red-500'
                      }`}
                      dir="ltr"
                    >
                      {fmtWithSymbol(Math.abs(grandTotal - mixedPaymentTotalPaid))}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-4">
              {!(type === 'sales' && !isReturn && !lockPaymentMethodAndTiming) && (
                <button
                  type="button"
                  disabled={lockPaymentMethodAndTiming}
                  onClick={() => {
                    if (isEditingInvoice) {
                      setPaymentTiming('deferred')
                    }
                    setIsOnCredit(true)
                    setPaymentMethodId(null)
                    setAmountPaidStr('')
                    if (type === 'sales' && !isReturn) setSalesPaymentTab('deferred')
                  }}
                  className={`h-[38px] inline-flex items-center rounded-lg px-4 text-sm font-medium transition-colors border-2 ${isPaymentDeferredForUi ? 'bg-primary-600 border-primary-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'} disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {t.invoices.onCredit ?? 'بالأجل'}
                </button>
              )}
              {showPmDropdown && (
              <div className="min-w-[200px]">
                <label className="block text-xs font-medium text-slate-500 mb-1">{t.invoices.paymentMethod}</label>
                <div className="flex items-center gap-2">
                  <button
                    ref={paymentMethodTriggerRef}
                    type="button"
                    disabled={lockPaymentMethodAndTiming}
                    aria-haspopup="listbox"
                    aria-expanded={paymentMethodMenuOpen}
                    aria-controls={paymentMethodMenuId}
                    onClick={() => (paymentMethodMenuOpen ? closePaymentMethodMenu() : openPaymentMethodMenu())}
                    onKeyDown={(e) => {
                      if (lockPaymentMethodAndTiming) return
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        if (!paymentMethodMenuOpen) {
                          openPaymentMethodMenu()
                          return
                        }
                        setPaymentMethodHighlightIdx((idx) => {
                          const base = idx < 0 ? selectedPaymentMethodRowIdx : idx
                          return Math.min(paymentMethodRows.length - 1, base + 1)
                        })
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        if (!paymentMethodMenuOpen) return
                        setPaymentMethodHighlightIdx((idx) => {
                          const base = idx < 0 ? selectedPaymentMethodRowIdx : idx
                          return Math.max(0, base - 1)
                        })
                      } else if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (!paymentMethodMenuOpen) {
                          openPaymentMethodMenu()
                          return
                        }
                        const idx = paymentMethodHighlightIdx < 0 ? selectedPaymentMethodRowIdx : paymentMethodHighlightIdx
                        const row = paymentMethodRows[idx]
                        if (!row) return
                        commitPaymentMethodSelection(row.id)
                      } else if (e.key === 'Escape') {
                        if (paymentMethodMenuOpen) {
                          e.preventDefault()
                          closePaymentMethodMenu()
                        }
                      }
                    }}
                    className={`flex-1 min-w-0 h-[38px] inline-flex items-center justify-between gap-2 rounded-lg border px-3 text-sm outline-none transition-colors ${
                      lockPaymentMethodAndTiming
                        ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                        : paymentMethodMenuOpen
                          ? 'border-primary-500 ring-2 ring-primary-200 bg-white text-slate-900'
                          : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`min-w-0 truncate ${paymentMethodId == null ? 'text-slate-500' : ''}`}>
                      {paymentMethodRows[selectedPaymentMethodRowIdx]?.label ?? ''}
                    </span>
                    <ChevronDown size={16} className={`shrink-0 text-slate-500 transition-transform ${paymentMethodMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
              )}
              {!isPaymentDeferredForUi &&
                paymentMethodId != null &&
                !(showSalesPaymentTabs && salesPaymentTab === 'mixed') && (
                <>
                  <div className="min-w-[140px]">
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t.invoices.paymentAmount ?? 'المبلغ المدفوع'}</label>
                    <input
                      type="number"
                      min={0}
                      max={grandTotal}
                      step="0.01"
                      value={hasLinkedPayments ? String(existingInvoice?.amount_paid ?? '') : amountPaidStr}
                      onChange={(e) => !hasLinkedPayments && setAmountPaidStr(e.target.value)}
                      readOnly={!!hasLinkedPayments}
                      placeholder="0"
                      className="w-full h-[38px] border border-slate-300 rounded-lg px-3 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none bg-white read-only:bg-slate-50"
                    />
                    {amountExceedsTotal && (
                      <p className="text-xs text-red-600 mt-1">{t.invoices.amountExceedsTotal ?? 'المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة.'}</p>
                    )}
                  </div>
                  <div className="min-w-[120px]">
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t.invoices.balance ?? 'المتبقي'}</label>
                    <p className="py-2 font-semibold text-slate-900">{fmtWithSymbol(Math.max(0, grandTotal - amountPaidForBalance))}</p>
                  </div>
                  {isEditingInvoice && (
                    <div className="min-w-[100px]">
                      <label className="block text-xs font-medium text-slate-500 mb-1">{t.invoices.paymentStatus}</label>
                      <p className="py-2 font-medium text-slate-700">
                        {grandTotal <= 0
                          ? (t.invoices.settledUnpaid ?? 'غير مدفوعة')
                          : amountPaidForBalance >= grandTotal
                            ? (t.invoices.settledPaid ?? 'مدفوعة')
                            : amountPaidForBalance > 0
                              ? (t.invoices.settledPartial ?? 'جزئي')
                              : (t.invoices.settledUnpaid ?? 'غير مدفوعة')}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
            {pendingInstallmentSchedule && (
              <p className="text-xs text-emerald-700 mt-2 font-medium">
                {lang === 'ar'
                  ? 'مسودة جدول الأقساط جاهزة — تُحفَظ مع «حفظ الفاتورة» فقط.'
                  : 'Installment draft is ready — it will be saved only when you click Save invoice.'}
              </p>
            )}
            {isPaymentDeferredForUi &&
              !(showSalesPaymentTabs && salesPaymentTab === 'installment') &&
              !(showSalesPaymentTabs && salesPaymentTab === 'deferred') && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-xs text-slate-500">
                  {t.invoices.onCreditHint ?? 'الفاتورة بالأجل: المبلغ يُسجّل في حساب العميل ولا يُولّد سند قبض حتى يتم الدفع.'}
                </p>
              </div>
            )}
            {showSalesPaymentTabs && salesPaymentTab === 'installment' && (
              <div className="mt-2 rounded-lg border border-sky-100 bg-white px-3 py-2" dir="rtl">
                <p className="text-xs text-sky-700">
                  التقسيط: يُحفظ الدفعة الأولى (إن وُجدت) كمبلغ مدفوع على الفاتورة، ويُقسَّم الرصيد المتبقي في جدول
                  الأقساط عند الحفظ.
                </p>
              </div>
            )}
            {isEditingInvoice && existingInvoice?.payments?.length ? (
              <p className="text-xs text-slate-500 mt-2">
                {t.invoices.voucherNumber ?? 'رقم السند'}:{' '}
                <span className="font-mono font-medium text-slate-700">
                  {existingInvoice.payments.map((p) => p.number).join(', ')}
                </span>
              </p>
            ) : null}
          </div>
      </div>

      {type === 'sales' && !isReturn && partnerId != null && (
        <LoyaltyInvoiceSection
          tenantId={tenantId}
          customerId={partnerId}
          invoiceTotal={grandTotal}
          onRedeemChange={(points, discount) => {
            setLoyaltyRedeemPoints(points)
            setLoyaltyRedeemDiscount(discount)
          }}
          onProgramChange={(pid) => setLoyaltyProgramId(pid)}
          module="invoices"
        />
      )}

      <div className="flex flex-col gap-4 mt-6">
        {partnerRequired && (
          <p className="text-amber-600 text-sm">{t.invoices.customerRequired ?? 'يجب اختيار العميل/المورد قبل الحفظ.'}</p>
        )}
        {salesRepRequiredMissing && (
          <p className="text-amber-600 text-sm">{lang === 'ar' ? 'يجب اختيار المندوب (الإعداد: إجبارياً).' : 'Sales rep is required.'}</p>
        )}
        {linkedPaidExceedsNewTotal && (
          <p className="text-red-600 text-sm">{t.invoices.linkedPaidExceedsNewTotal}</p>
        )}
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col-reverse lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => (isEditingInvoice ? navigateBackToList() : navigate(-1))}
                className="rounded-lg px-4 py-2 text-sm bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 transition-colors"
              >
                {lang === 'ar' ? 'إلغاء' : t.cancel}
              </button>
              {isEditingInvoice && existingInvoice?.status === 'draft' && (
                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={
                    isSaving ||
                    amountExceedsTotal ||
                    linkedPaidExceedsNewTotal ||
                    partnerRequired ||
                    salesRepRequiredMissing ||
                    !installmentPlanSatisfied
                  }
                  className="rounded-lg px-4 py-2 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {lang === 'ar' ? 'حفظ مسودة' : 'Save draft'}
                </button>
              )}
              {isEditingInvoice && existingInvoice && existingInvoice.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => handleCancelInvoice()}
                  disabled={cancelMut.isPending}
                  className="rounded-lg px-4 py-2 text-sm border border-red-300 text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {cancelMut.isPending ? t.saving : (t.invoices.cancelInvoice ?? (lang === 'ar' ? 'إلغاء الفاتورة' : 'Cancel invoice'))}
                </button>
              )}
            </div>
            <div className="flex flex-col items-stretch sm:items-end gap-2">
              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={handleSaveAndPrint}
                  disabled={
                    isSaving ||
                    amountExceedsTotal ||
                    linkedPaidExceedsNewTotal ||
                    partnerRequired ||
                    salesRepRequiredMissing ||
                    !installmentPlanSatisfied
                  }
                  className="rounded-lg px-4 py-2 text-sm bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
                >
                  🖨 {(t as { invoices?: { saveAndPrint?: string } }).invoices?.saveAndPrint ?? (lang === 'ar' ? 'حفظ وطباعة' : 'Save and print')}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={
                    isSaving ||
                    amountExceedsTotal ||
                    linkedPaidExceedsNewTotal ||
                    partnerRequired ||
                    salesRepRequiredMissing ||
                    !installmentPlanSatisfied
                  }
                  className="rounded-lg px-4 py-2 text-sm bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50 font-medium"
                >
                  {createMut.isPending || updateMut.isPending
                    ? t.saving
                    : showSalesPaymentTabs && salesPaymentTab === 'installment'
                      ? lang === 'ar'
                        ? 'حفظ + إنشاء جدول التقسيط'
                        : 'Save + installment schedule'
                      : !isEditingInvoice &&
                          type === 'sales' &&
                          !isReturn &&
                          partialPayment.enabled &&
                          partialPayment.amount > 0.0005 &&
                          salesPaymentTab !== 'installment'
                        ? lang === 'ar'
                          ? 'حفظ + توليد سند قبض'
                          : 'Save + receipt'
                        : lang === 'ar'
                          ? 'حفظ'
                          : 'Save'}
                </button>
              </div>
              {showSalesPaymentTabs && salesPaymentTab === 'installment' && (
                <p className="text-[10px] text-amber-700 text-right max-w-md" dir="rtl">
                  ⚡ عند الحفظ تُرحَّل الفاتورة ويُنشأ جدول الأقساط تلقائياً حسب الإعدادات أعلاه.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {variantBulkModal && (
        <InvoiceVariantBulkModal
          open
          onClose={() => setVariantBulkModal(null)}
          itemName={items.find((i) => i.id === variantBulkModal.itemId)?.name ?? `#${variantBulkModal.itemId}`}
          variants={itemVariantsByItemId[variantBulkModal.itemId] ?? []}
          lang={lang}
          onConfirm={(rows) => {
            setLines((prev) => {
              const idx = variantBulkModal.lineIdx
              const base = prev[idx]
              if (!base || rows.length === 0) return prev
              const itemName = items.find((i) => i.id === variantBulkModal.itemId)?.name ?? ''
              const expanded: LineForm[] = rows.map((r) => {
                const v = (itemVariantsByItemId[variantBulkModal.itemId] ?? []).find((x) => x.id === r.variantId)
                const vlabel =
                  v?.name ||
                  (v?.options ? Object.entries(v.options).map(([a, b]) => `${a}: ${b}`).join(' · ') : `#${r.variantId}`)
                return {
                  ...base,
                  item_variant_id: r.variantId,
                  quantity: r.quantity,
                  description: `${itemName} — ${vlabel}`,
                }
              })
              const next = [...prev]
              next.splice(idx, 1, ...expanded)
              return next
            })
            setVariantBulkModal(null)
          }}
        />
      )}

      {typeof document !== 'undefined' &&
        itemDropdownRect !== null &&
        openItemLineIdx !== null &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden min-w-[200px]"
            style={{
              top: itemDropdownRect.top,
              left: itemDropdownRect.left,
              width: Math.max(itemDropdownRect.width, 200),
              maxHeight: 'min(12rem, 50vh)',
            }}
          >
            <div className="max-h-48 overflow-y-auto overflow-x-hidden py-1" dir="ltr">
              {filterItemsBySearch(itemSearchByLine[openItemLineIdx] ?? '').slice(0, 50).map((item) => (
                <button
                  key={`${item.id}-${(item as { variant_id?: number }).variant_id ?? 'base'}`}
                  type="button"
                  className={`w-full px-3 py-2 text-sm hover:bg-slate-100 block ${isRtl ? 'text-right' : 'text-left'}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    const vid = (item as { variant_id?: number }).variant_id
                    void selectItem(openItemLineIdx, item.id, vid != null && vid > 0 ? vid : null)
                    setItemSearchByLine((p) => ({ ...p, [openItemLineIdx]: '' }))
                    setOpenItemLineIdx(null)
                  }}
                >
                  {(item as { variant_label?: string }).variant_label
                    ? `${item.name} — ${(item as { variant_label?: string }).variant_label}`
                    : `${item.name}${item.code ? ` (${item.code})` : ''}`}
                </button>
              ))}
              {filterItemsBySearch(itemSearchByLine[openItemLineIdx] ?? '').length === 0 && (
                <div className={`px-3 py-2 text-sm text-slate-500 ${isRtl ? 'text-right' : 'text-left'}`}>{t.invoices.noItemsMatch}</div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
