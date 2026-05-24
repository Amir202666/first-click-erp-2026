import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import {
  fetchInvoice, fetchCustomers, fetchVendors, fetchItems,
  fetchBranches, fetchWarehouses, fetchCostCenters, fetchPaymentMethods,
  fetchCurrencies, fetchSettings, updateInvoice, postInvoice, cancelInvoice,
  uploadInvoiceAttachment,
  fetchSalesReps,
  rebuildInvoiceJournal,
  fetchBoms,
} from '../../api/tenant'
import type { Customer, Vendor, Item, Invoice, InvoiceLine, Branch, Warehouse, CostCenter, PaymentMethod, PaginatedResponse, Currency, ItemUnitOption } from '../../types'
import { formatAmount } from '../../utils/currency'
import { invoiceLineDiscountAmountFromApi, invoiceLineNetBeforeTax } from '../../utils/invoiceLineAmounts'
import { computePaymentMethodMenuRect, type PaymentMethodMenuRect } from '../../utils/paymentMethodMenuPosition'
import { finishedItemIdForSalesManufacturingBom, manufacturingFinishedQtyForBom, invoiceHasAutoManufacturingDoc } from '../../utils/manufacturingFromInvoice'
import { Plus, Trash2, Search, GripVertical, Paperclip, FolderOpen, ChevronDown } from 'lucide-react'
import SerialNumberSelect from '../../components/SerialNumberSelect'
import AddCustomerModal from '../../components/AddCustomerModal'

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
  unit_id: number | null
  description: string
  quantity: number
  unit_price: number
  /** خصم السطر كمبلغ ثابت (لا يتجاوز كمية×سعر) */
  discount_amount: number
  tax_percent: number
  serial_numbers: string[]
  use_serial_number?: boolean
}

const emptyLine: LineForm = {
  item_id: null,
  unit_id: null,
  description: '',
  quantity: 1,
  unit_price: 0,
  discount_amount: 0,
  tax_percent: 15,
  serial_numbers: [],
  use_serial_number: false,
}

function lineGrossBeforeDiscount(line: LineForm): number {
  return Math.max(0, line.quantity * (line.unit_price || 0))
}

export default function EditInvoice() {
  const { currentTenant, canAccessFeature } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const invoiceId = Number(id)
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'

  const { data: currencies = [] } = useQuery<Currency[]>({
    queryKey: ['currencies', tenantId],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId,
  })

  const [loaded, setLoaded] = useState(false)
  const [date, setDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [partnerId, setPartnerId] = useState<number | null>(null)
  const [branchId, setBranchId] = useState<number | null>(null)
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [costCenterId, setCostCenterId] = useState<number | null>(null)
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null)
  const [paymentMethodMenuOpen, setPaymentMethodMenuOpen] = useState(false)
  const [paymentMethodMenuRect, setPaymentMethodMenuRect] = useState<PaymentMethodMenuRect | null>(null)
  const [paymentMethodHighlightIdx, setPaymentMethodHighlightIdx] = useState<number>(-1)
  const paymentMethodTriggerRef = useRef<HTMLButtonElement | null>(null)
  const paymentMethodMenuId = 'edit-invoice-payment-method-menu'
  const [amountPaidStr, setAmountPaidStr] = useState<string>('')
  const [receiptStatus, setReceiptStatus] = useState<string>('')
  const [paymentTiming, setPaymentTiming] = useState<string>('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [salesRepId, setSalesRepId] = useState<number | null>(null)
  const [lines, setLines] = useState<LineForm[]>([{ ...emptyLine }])
  const [itemSearchByLine, setItemSearchByLine] = useState<Record<number, string>>({})
  const [openItemLineIdx, setOpenItemLineIdx] = useState<number | null>(null)
  const itemInputRef = useRef<HTMLInputElement | null>(null)
  const [itemDropdownRect, setItemDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [barcodeSearch, setBarcodeSearch] = useState('')
  const [barcodeError, setBarcodeError] = useState<string | null>(null)
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [rebuildJournalNotice, setRebuildJournalNotice] = useState<string | null>(null)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)
  const [addedCustomer, setAddedCustomer] = useState<Customer | null>(null)

  useEffect(() => {
    const t = setTimeout(() => barcodeInputRef.current?.focus(), 150)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (barcodeError) {
      const id = setTimeout(() => setBarcodeError(null), 2500)
      return () => clearTimeout(id)
    }
  }, [barcodeError])

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

  const isPaymentDeferred = paymentTiming === 'deferred'

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

  function getPriceForUnit(it: Item & { unit_options?: ItemUnitOption[] }, uid: number | null): number {
    if (!uid) return type === 'sales' ? it.selling_price : it.cost_price
    const opt = (it.unit_options || []).find((o) => o.unit_id === uid)
    if (opt) {
      const price =
        type === 'sales'
          ? (opt.selling_price ?? it.selling_price)
          : (opt.cost_price ?? opt.selling_price ?? it.cost_price)
      return Number(price) ?? (type === 'sales' ? it.selling_price : it.cost_price)
    }
    return type === 'sales' ? it.selling_price : it.cost_price
  }

  /** عند تغيير الوحدة: تحديث unit_id و unit_price في الحالة فوراً لظهور السعر في خانة السعر */
  function handleUnitChange(lineIndex: number, unitId: number | null, newPrice: number) {
    setLines((prev) => {
      const next = prev.map((l, i) => (i === lineIndex ? { ...l, unit_id: unitId, unit_price: newPrice } : l))
      const row = next[lineIndex]
      const g = lineGrossBeforeDiscount(row)
      const da = Math.max(0, Number(row.discount_amount) || 0)
      if (da > g + 1e-9) {
        next[lineIndex] = { ...next[lineIndex], discount_amount: Math.round(g * 1000) / 1000 }
      }
      return next
    })
  }

  /** يبحث عن صنف ووحدة حسب الباركود (يدعم باركود الوحدات المتعددة مثل الكرتون) */
  function findItemAndUnitByBarcode(q: string): { item: Item & { unit_options?: ItemUnitOption[] }; unit_id: number | null; unit_price: number } | null {
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
        return { item, unit_id: unitMatch.unit_id, unit_price: Number(unitPrice) ?? (type === 'sales' ? item.selling_price : item.cost_price) }
      }
    }
    const item = findItemByCodeOrBarcode(q) as (Item & { unit_options?: ItemUnitOption[] }) | null
    if (!item) return null
    const unitId = item.unit_id ?? (item.unit_options?.[0]?.unit_id) ?? null
    const unitPrice = getPriceForUnit(item, unitId)
    return { item, unit_id: unitId, unit_price: unitPrice }
  }

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
      const taxPercent = (item as Item & { default_tax_percent?: number | null }).default_tax_percent != null && Number.isFinite(Number((item as Item & { default_tax_percent?: number }).default_tax_percent))
        ? Number((item as Item & { default_tax_percent?: number }).default_tax_percent)
        : defaultVatRate
      const newLine: LineForm = {
        item_id: item.id,
        unit_id,
        description: item.name,
        quantity: 1,
        unit_price,
        discount_amount: 0,
        tax_percent: taxPercent,
        serial_numbers: [],
      }
      setLines((prev) => [...prev, newLine])
    }
    setBarcodeSearch('')
    barcodeInputRef.current?.focus()
  }

  function filterItemsBySearch(query: string): Item[] {
    if (!query.trim()) return items
    const q = query.trim().toLowerCase()
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.name_en?.toLowerCase().includes(q)) ||
        i.code.toLowerCase().includes(q) ||
        (i.barcode?.toLowerCase().includes(q)) ||
        (i.sku?.toLowerCase().includes(q))
    )
  }
  function setPaymentTimingAndClearMethod(value: string) {
    setPaymentTiming(value)
    if (value === 'deferred') setPaymentMethodId(null)
  }

  const queryClient = useQueryClient()
  const { data: invoice } = useQuery<Invoice>({
    queryKey: ['invoice', tenantId, invoiceId],
    queryFn: () => fetchInvoice(tenantId, invoiceId),
    enabled: !!tenantId && !!invoiceId,
  })

  const invoiceCurrency = invoice?.currency
    ? (currencies as Currency[]).find((c) => c.code === invoice.currency) ?? { code: invoice.currency, decimal_places: 2 }
    : { decimal_places: 2 }
  const fmt = (n: number) => formatAmount(n, invoiceCurrency, locale)

  useDocumentTitle(
    invoice
      ? lang === 'ar'
        ? `فاتورة #${invoice.number}`
        : `Invoice #${invoice.number}`
      : null
  )

  const type = invoice?.type ?? 'sales'

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
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const isAutoOnSale =
    (settings as Record<string, unknown> | undefined)?.manufacturing_method !== 'manual_orders'

  const finishedItemIdForMfgOrder = useMemo(() => finishedItemIdForSalesManufacturingBom(invoice), [invoice])

  const { data: bomListForMfg } = useQuery({
    queryKey: ['boms', tenantId, 'edit-invoice-mfg', finishedItemIdForMfgOrder],
    queryFn: () => fetchBoms(tenantId, { finished_item_id: String(finishedItemIdForMfgOrder!), is_active: '1', per_page: '10' }),
    enabled: !!tenantId && isAutoOnSale && !!finishedItemIdForMfgOrder && (invoice?.type ?? '') === 'sales',
  })

  const mfgOrderBomId = bomListForMfg?.data?.[0]?.id
  const mfgOrderQty = useMemo(
    () => manufacturingFinishedQtyForBom(invoice, bomListForMfg?.data?.[0]?.finished_item_id ?? finishedItemIdForMfgOrder ?? null),
    [invoice, bomListForMfg?.data, finishedItemIdForMfgOrder]
  )

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

  const defaultVatRate = Number((settings as Record<string, unknown>)?.default_vat_rate ?? 15)
  const invoiceUseSerialNumbers = Boolean((settings as Record<string, unknown>)?.invoice_use_serial_numbers)
  const salesRepEnabledInSettings = (settings as Record<string, unknown> | undefined)?.sales_rep_enabled === true
  const salesRepRequiredInSettings = (settings as Record<string, unknown> | undefined)?.sales_rep_required === true

  const { data: salesRepsData } = useQuery({
    queryKey: ['sales-reps', tenantId],
    queryFn: () => fetchSalesReps(tenantId, { per_page: '200' }),
    enabled: !!tenantId && type === 'sales' && canAccessFeature('sales_reps') && salesRepEnabledInSettings,
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

  const lockPaymentMethodAndTimingForMenu = Boolean(
    invoice?.payments?.length &&
      (paymentTiming === 'paid' || invoice?.payment_timing === 'paid')
  )

  const paymentMethodRows = useMemo(() => {
    const placeholderLabel = lang === 'ar' ? `— اختر طريقة السداد —` : `— Select payment method —`
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
    if (lockPaymentMethodAndTimingForMenu) return
    setPaymentMethodMenuOpen(true)
    setPaymentMethodHighlightIdx(selectedPaymentMethodRowIdx)
    updatePaymentMethodMenuPosition()
  }

  function commitPaymentMethodSelection(nextId: number | null) {
    setPaymentMethodId(nextId)
    if (nextId != null) setPaymentTiming('paid')
    else setPaymentTiming('deferred')
    closePaymentMethodMenu()
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
    if (lockPaymentMethodAndTimingForMenu) closePaymentMethodMenu()
  }, [lockPaymentMethodAndTimingForMenu])

  const partners = type === 'sales'
    ? (() => {
        const base = customersData?.data ?? []
        if (!addedCustomer) return base
        if (base.some((c) => c.id === addedCustomer.id)) return base
        return [...base, addedCustomer]
      })()
    : (vendorsData?.data ?? [])
  const items = itemsData?.data ?? []
  const showSerialColumn = invoiceUseSerialNumbers && lines.some((line) => line.use_serial_number === true)

  useEffect(() => {
    setLoaded(false)
  }, [invoiceId])

  useEffect(() => {
    if (!invoice || invoice.id !== invoiceId) return
    if (loaded) return
    setDate(invoice.date ? String(invoice.date).slice(0, 10) : '')
    setDueDate(invoice.due_date ? String(invoice.due_date).slice(0, 10) : '')
    setPartnerId(type === 'sales' ? invoice.customer_id : invoice.vendor_id)
    setBranchId(invoice.branch_id ?? null)
    setWarehouseId(invoice.warehouse_id ?? null)
    setCostCenterId(invoice.cost_center_id ?? null)
    setSalesRepId((invoice as Invoice & { sales_rep_id?: number | null }).sales_rep_id ?? null)
    const pmId = invoice.payment_method_id ?? invoice.paymentMethod?.id ?? null
    setPaymentMethodId(pmId != null ? Number(pmId) : null)
    setAmountPaidStr(invoice.amount_paid != null ? String(invoice.amount_paid) : '')
    setReceiptStatus(invoice.receipt_status ?? '')
    setPaymentTiming(invoice.payment_timing ?? '')
    setReferenceNumber(invoice.reference_number ?? '')
    setNotes(invoice.notes ?? '')
    setLines(
      (invoice.lines?.length ? invoice.lines : [{ ...emptyLine }]).map((l) => {
        // البحث عن use_serial_number من بيانات الصنف المحلية أولاً، ثم من بيانات السطر المحفوظة
        const itemData = items.find((i) => i.id === l.item_id) as (Item & { use_serial_number?: boolean }) | undefined
        return {
          item_id: l.item_id ?? null,
          unit_id: l.unit_id ?? null,
          description: l.description ?? '',
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          discount_amount: invoiceLineDiscountAmountFromApi(l as InvoiceLine),
          tax_percent: Number(l.tax_percent ?? 0),
          serial_numbers: Array.isArray(l.serial_numbers) ? l.serial_numbers : [],
          use_serial_number: itemData?.use_serial_number ?? l.use_serial_number ?? false,
        }
      })
    )
    setLoaded(true)
  }, [invoice, invoiceId, loaded, type])

  function invalidateAfterInvoiceAccountingChange() {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    queryClient.invalidateQueries({ queryKey: ['invoice', tenantId, invoiceId] })
    queryClient.invalidateQueries({ queryKey: ['journalEntries', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
    queryClient.invalidateQueries({ queryKey: ['journalEntry-from-statement', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
    queryClient.invalidateQueries({ queryKey: ['trialBalance', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['trialBalance', 'accountStatementOverview', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['accounts', tenantId] })
  }

  const updateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => updateInvoice(tenantId, invoiceId, data),
    onSuccess: invalidateAfterInvoiceAccountingChange,
  })

  const postMut = useMutation({
    mutationFn: (id: number) => postInvoice(tenantId, id),
    onSuccess: invalidateAfterInvoiceAccountingChange,
  })

  const rebuildJournalMut = useMutation({
    mutationFn: () => rebuildInvoiceJournal(tenantId, invoiceId),
    onSuccess: (data) => {
      invalidateAfterInvoiceAccountingChange()
      setRebuildJournalNotice(data?.message ?? (t.invoices.rebuildJournalSuccess ?? ''))
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } }
      setSubmitError(ax?.response?.data?.message ?? (lang === 'ar' ? 'فشل إعادة بناء القيد.' : 'Failed to rebuild journal entry.'))
    },
  })

  const cancelMut = useMutation({
    mutationFn: () => cancelInvoice(tenantId, invoiceId),
    onSuccess: () => {
      invalidateAfterInvoiceAccountingChange()
      navigate(`/invoices/${type === 'sales' ? 'sales' : 'purchases'}`)
    },
  })

  function updateLine(index: number, field: keyof LineForm, value: string | number | string[] | null) {
    setLines((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
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

  function getDefaultTaxForItem(it: Item & { default_tax_percent?: number | null }) {
    return it.default_tax_percent != null && Number.isFinite(Number(it.default_tax_percent))
      ? Number(it.default_tax_percent)
      : defaultVatRate
  }

  function selectItem(index: number, itemId: number) {
    const item = items.find((i) => i.id === itemId) as (Item & { unit_options?: ItemUnitOption[]; default_tax_percent?: number | null; use_serial_number?: boolean }) | undefined
    if (!item) return
    const unitId = item.unit_id ?? (item.unit_options?.[0]?.unit_id) ?? null
    const unitPrice = getPriceForUnit(item, unitId)
    const taxPercent = getDefaultTaxForItem(item)
    setLines((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        item_id: item.id,
        unit_id: unitId,
        description: item.name,
        unit_price: unitPrice,
        discount_amount: 0,
        tax_percent: taxPercent,
        serial_numbers: next[index].serial_numbers ?? [],
        use_serial_number: item.use_serial_number === true,
      }
      return next
    })
  }

  function addLine() { setLines((prev) => [...prev, { ...emptyLine, serial_numbers: [] }]) }
  function removeLine(index: number) {
    if (lines.length <= 1) return
    setLines((prev) => prev.filter((_, i) => i !== index))
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

  const totals = useMemo(() => {
    let rawSubtotal = 0
    let totalLineTax = 0
    for (const line of lines) {
      const lineBase = line.quantity * (line.unit_price || 0)
      const afterLineDiscount = invoiceLineNetBeforeTax(lineBase, Number(line.discount_amount) || 0)
      const lineTax = afterLineDiscount * ((line.tax_percent || 0) / 100)
      rawSubtotal += afterLineDiscount
      totalLineTax += lineTax
    }
    return {
      subtotal: rawSubtotal,
      totalDiscount: 0,
      taxBase: rawSubtotal,
      totalTax: totalLineTax,
      total: rawSubtotal + totalLineTax,
    }
  }, [lines])

  function validateSerialNumbers(): string | null {
    if (!showSerialColumn) return null
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const itemId = line.item_id
      if (!itemId) continue
      if (!line.use_serial_number && !invoiceUseSerialNumbers) continue
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

  const salesRepRequiredMissing = type === 'sales' && salesRepEnabledInSettings && salesRepRequiredInSettings && !salesRepId

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

  async function handleSaveCommon(goToPrint: boolean) {
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
    setSubmitError(null)
    setRebuildJournalNotice(null)
    const payload = {
      type,
      date,
      due_date: dueDate || null,
      customer_id: type === 'sales' ? (partnerId || null) : null,
      vendor_id: type === 'purchase' ? (partnerId || null) : null,
      sales_rep_id: type === 'sales' ? (salesRepId ?? null) : null,
      branch_id: branchId || null,
      warehouse_id: warehouseId || null,
      cost_center_id: costCenterId || null,
      payment_method_id: isPaymentDeferred ? null : (paymentMethodId || null),
      receipt_status: receiptStatus || null,
      payment_timing: paymentTiming || null,
      reference_number: referenceNumber || null,
      notes: notes || null,
      discount_amount: invoice?.discount_amount ?? 0,
      ...(!isPaymentDeferred && { amount_paid: amountPaidNum }),
      lines: lines.map((l) => ({
        item_id: l.item_id || null,
        unit_id: l.unit_id || null,
        description: l.description || '',
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_percent: 0,
        discount_amount: (() => {
          const g = lineGrossBeforeDiscount(l)
          const da = Math.max(0, Number(l.discount_amount) || 0)
          return Math.round(Math.min(da, g) * 1000) / 1000
        })(),
        tax_percent: l.tax_percent,
        serial_numbers: invoiceUseSerialNumbers
          ? (l.serial_numbers ?? []).map((s) => String(s).trim()).filter(Boolean)
          : undefined,
      })),
    }
    try {
      await updateMut.mutateAsync(payload)
      let postedInvoice: Invoice | undefined
      if (invoice?.status === 'draft') {
        postedInvoice = (await postMut.mutateAsync(invoiceId)) as Invoice
      }

      if (attachmentFile) {
        try {
          await uploadInvoiceAttachment(tenantId, invoiceId, attachmentFile)
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

      if (goToPrint) {
        const justPostedWithMfg =
          type === 'sales' && invoice?.status === 'draft' && invoiceHasAutoManufacturingDoc(postedInvoice)
        navigate(`/invoices/view/${invoiceId}`, {
          state: justPostedWithMfg ? { openManufacturingOrder: true } : undefined,
        })
      } else {
        navigate(`/invoices/${type === 'sales' ? 'sales' : 'purchases'}`)
      }
    } catch {
      // handled by mutations
    }
  }

  function handleSave() {
    void handleSaveCommon(false)
  }

  function handleSaveAndPrint() {
    void handleSaveCommon(true)
  }

  function handleCancelInvoice() {
    if (!invoice || invoice.status === 'cancelled') {
      navigate(`/invoices/${type === 'sales' ? 'sales' : 'purchases'}`)
      return
    }
    cancelMut.mutate()
  }

  if (!invoice) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    )
  }

  const pageTitle = type === 'sales' ? t.invoices.editSalesInvoice : t.invoices.editPurchaseInvoice
  const partnerLabel = type === 'sales' ? t.invoices.customer : t.invoices.vendor
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const lineInputClass = 'h-9 w-full rounded-md px-2.5 text-sm border border-slate-300 focus:ring-1 focus:ring-inset focus:ring-primary-500 outline-none bg-white'
  const lineInputNumberClass = lineInputClass + ' text-right tabular-nums input-no-spinner'
  const lineInputReadOnlyClass =
    'h-9 w-full rounded-md px-2.5 text-sm border border-slate-200 bg-slate-50 cursor-not-allowed text-right tabular-nums input-no-spinner'

  const hasLinkedPayments = Boolean(invoice?.payments?.length)
  const isCashInvoice = paymentTiming === 'paid' || invoice?.payment_timing === 'paid'
  const lockPaymentMethodAndTiming = hasLinkedPayments && isCashInvoice
  const amountPaidNum = parseFloat(amountPaidStr) || 0
  const amountPaid = hasLinkedPayments ? Number(invoice?.amount_paid ?? 0) : amountPaidNum
  const currentTotal = totals.total
  const paymentSettledStatus = currentTotal <= 0 ? 'unpaid' : amountPaid >= currentTotal ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid'
  const amountExceedsTotal = amountPaidNum > currentTotal

  return (
    <div className="px-0 py-4 space-y-6 w-full min-w-0 max-w-full">
      <h1 className="text-lg font-bold text-slate-900">{pageTitle}</h1>

      {hasLinkedPayments && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          {t.invoices.adminOnlyEditHint ?? 'الفاتورة مرتبطة بسند قبض/صرف. يمكنك تعديل البيانات الإدارية فقط (العميل، المخزن، الفرع، التاريخ، الملاحظات).'}
        </p>
      )}
      {lockPaymentMethodAndTiming && (
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

      {typeof document !== 'undefined' && paymentMethodMenuOpen && paymentMethodMenuRect && createPortal(
        <div
          id={paymentMethodMenuId}
          role="listbox"
          dir={isRtl ? 'rtl' : 'ltr'}
          className="fixed z-[9500] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
          style={{
            top: paymentMethodMenuRect.top,
            left: paymentMethodMenuRect.left,
            width: paymentMethodMenuRect.width,
            maxHeight: paymentMethodMenuRect.maxHeight,
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 space-y-3">
        {/* صف الحقول الأساسية: Grid مرن auto-fit */}
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
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none" required />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-slate-600 mb-0.5">{t.invoices.dueDate}</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none" />
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
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
            </div>
          </div>
          {type === 'sales' && canAccessFeature('sales_reps') && salesRepEnabledInSettings && (
            <div className="min-w-0">
              <label className="block text-xs font-medium text-slate-600 mb-0.5">{lang === 'ar' ? 'المندوب' : 'Sales Rep'}{salesRepRequiredInSettings ? ' *' : ''}</label>
              <select value={salesRepId ?? ''} onChange={(e) => setSalesRepId(e.target.value ? +e.target.value : null)} className="w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none" required={salesRepRequiredInSettings}>
                <option value="">{lang === 'ar' ? 'اختر' : 'Select'}</option>
                {(salesRepsData?.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}{r.region ? ` - ${r.region}` : ''}</option>)}
              </select>
            </div>
          )}
          <div className="min-w-0">
            <label className="block text-xs font-medium text-slate-600 mb-0.5">{t.invoices.invoiceNumber}</label>
            <input type="text" readOnly value={invoice.number ?? ''} title={t.invoices.invoiceNumberReadOnly ?? 'رقم الفاتورة يُعيَّن تلقائياً ولا يمكن تعديله'} className="w-full h-9 border border-slate-200 rounded-md px-2.5 text-sm bg-slate-50 text-slate-700 font-mono cursor-not-allowed" />
          </div>
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
              {attachmentFile ? (
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
              ) : invoice?.attachment_url ? (
                <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1">
                  <Paperclip size={12} className="text-primary-600 shrink-0" />
                  <span className="text-xs font-medium text-slate-700 truncate max-w-[12.5rem]">
                    {invoice?.attachment ? String(invoice.attachment).split('/').pop() : (lang === 'ar' ? 'مرفق سابقاً' : 'Attached previously')}
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
          <button onClick={addLine} className="flex items-center gap-1 text-primary-600 hover:text-primary-500 text-sm font-medium">
            <Plus size={16} /> {t.invoices.addLine}
          </button>
        </div>
        <div className="ui-table-scroll overflow-y-visible">
          <table className="w-full text-sm table-fixed min-w-[55rem]">
            <colgroup>
              <col style={{ width: '7%', minWidth: 70 }} />
              <col style={{ width: '30%', minWidth: 200 }} />
              <col style={{ width: '8%', minWidth: 88 }} />
              <col style={{ width: '7%', minWidth: 72 }} />
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
                <th className={`${textAlign} px-2 py-3 font-medium`}>{t.invoices.unit}</th>
                <th className={`${textAlign} px-2 py-3 font-medium`}>{t.invoices.quantity}</th>
                <th className={`${textAlign} px-2 py-3 font-medium`}>{t.invoices.unitPrice}</th>
                <th className={`${textAlign} px-2 py-3 font-medium`}>{lang === 'ar' ? 'الخصم' : `${t.invoices.discount} (${t.amount})`}</th>
                <th className={`${textAlign} px-2 py-3 font-medium`}>{t.invoices.tax} %</th>
                <th className={`${textAlign} px-2 py-3 font-medium`}>{t.amount}</th>
                {showSerialColumn && (
                  <th className={`${textAlign} px-2 py-3 font-medium`}>{lang === 'ar' ? 'أرقام تسلسلية' : 'Serial numbers'}</th>
                )}
                <th className="px-2 py-3 w-11" aria-label={lang === 'ar' ? 'حذف' : 'Delete'}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {lines.map((line, idx) => {
                const lineAmount = line.quantity * line.unit_price
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
                    <td className="px-2 py-2 align-middle">
                      <div className="relative">
                        <input
                          ref={openItemLineIdx === idx ? (el) => { itemInputRef.current = el } : undefined}
                          type="text"
                          value={openItemLineIdx === idx ? (itemSearchByLine[idx] ?? '') : (line.item_id ? (items.find((i) => i.id === line.item_id)?.name ?? '') : '')}
                          onChange={(e) => {
                            setItemSearchByLine((p) => ({ ...p, [idx]: e.target.value }))
                            setOpenItemLineIdx(idx)
                          }}
                          onFocus={() => { setOpenItemLineIdx(idx) }}
                          onBlur={() => setTimeout(() => setOpenItemLineIdx(null), 200)}
                          placeholder={t.invoices.searchItemPlaceholder}
                          className={lineInputClass}
                        />
                      </div>
                    </td>
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
                          if (u) return lang === 'ar' ? u.name : (u.name_en || u.name)
                          const lineUnit = invoice?.lines?.[idx]?.unit
                          if (lineUnit) return lang === 'ar' ? lineUnit.name : (lineUnit.name_en || lineUnit.name)
                          return it?.unit ?? '—'
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
                      <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(idx, 'quantity', +e.target.value)}
                        className={lineInputNumberClass} />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <input
                        type="number"
                        step="0.0001"
                        min={0}
                        value={typeof line.unit_price === 'number' ? line.unit_price : ''}
                        onChange={(e) => updateLine(idx, 'unit_price', parseFloat(String(e.target.value)) || 0)}
                        className={lineInputNumberClass}
                      />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <input
                        type="number"
                        step="0.001"
                        min={0}
                        max={lineGrossBeforeDiscount(line)}
                        value={line.discount_amount}
                        onChange={(e) => {
                          const raw = e.target.value
                          const n = raw === '' ? 0 : parseFloat(raw)
                          const v = Number.isFinite(n) ? Math.max(0, n) : 0
                          const cap = lineGrossBeforeDiscount(line)
                          updateLine(idx, 'discount_amount', Math.round(Math.min(v, cap) * 1000) / 1000)
                        }}
                        className={lineInputNumberClass}
                      />
                    </td>
                    <td className="px-2 py-2 align-middle" title={lang === 'ar' ? 'تُحدد من إعدادات الصنف أو إعدادات الضرائب' : 'From item or tax settings'}>
                      <input type="number" step="0.01" min={0} max={100} readOnly value={line.tax_percent}
                        className={lineInputReadOnlyClass} />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <input readOnly value={fmt(lineTotal)} className={lineInputReadOnlyClass} />
                    </td>
                    {showSerialColumn && (
                      <td className="px-2 py-2 align-top">
                        {line.use_serial_number ? (() => {
                          const required = Math.round(line.quantity)
                          const arr = [...(line.serial_numbers ?? [])]
                          while (arr.length < required) arr.push('')
                          const list = arr.slice(0, required)
                          return (
                            <div className="space-y-1">
                              {list.map((_, serialIdx) => {
                                const excludeForThisCell = [
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
        <div className="border-t border-slate-200 p-4 flex flex-wrap gap-4 justify-between">
          <div className="flex-1 min-w-[200px] max-w-[600px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.notes}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none resize-none" />
          </div>
          <div className="totals-wrapper totals-container">
            <div className="totals-item total-row">
              <span className="totals-label total-label">{lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
              <span className="totals-value total-value" dir="ltr">{fmt(totals.subtotal)}</span>
            </div>
            <div className="totals-item total-row" style={{ color: '#d9534f' }}>
              <span className="totals-label total-label">{lang === 'ar' ? 'الخصم' : 'Discount'}</span>
              <span className="totals-value total-value" dir="ltr">- {fmt(totals.totalDiscount)}</span>
            </div>
            <div className="totals-item total-row">
              <span className="totals-label total-label">{lang === 'ar' ? 'الوعاء الضريبي' : 'Taxable Amount'}</span>
              <span className="totals-value total-value" dir="ltr">{fmt(totals.taxBase)}</span>
            </div>
            <div className="totals-item total-row">
              <span className="totals-label total-label">{lang === 'ar' ? 'قيمة الضريبة' : 'VAT'}</span>
              <span className="totals-value total-value" dir="ltr">+ {fmt(totals.totalTax)}</span>
            </div>
            <div className="totals-item total-row grand-total-row">
              <span className="totals-label grand-total-label">{lang === 'ar' ? 'الصافي النهائي' : 'Grand Total'}</span>
              <span className="totals-value grand-total-value" dir="ltr">{fmt(totals.total)}</span>
            </div>
          </div>
        </div>

          <div className="border-t border-slate-200 p-4 mt-4 bg-slate-50/60 rounded-lg">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">{t.invoices.paymentDataSection ?? 'بيانات السداد'}</h3>
            <div className="flex flex-wrap items-end gap-4">
              <button
                type="button"
                onClick={() => setPaymentTimingAndClearMethod('deferred')}
                disabled={lockPaymentMethodAndTiming}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors border-2 ${isPaymentDeferred ? 'bg-primary-600 border-primary-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'} disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {t.invoices.onCredit ?? 'بالأجل'}
              </button>
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
              {isPaymentDeferred && currentTotal > 0.0009 && (
                <div className="min-w-[140px]">
                  <label className="block text-xs font-medium text-slate-500 mb-1 opacity-0 select-none">.</label>
                  <button
                    type="button"
                    onClick={() => {
                      // Edit invoice doesn't auto-save here; just open schedule modal if needed later
                      // (keeping behavior consistent: the button is visible for credit invoices)
                    }}
                    className="h-[38px] w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary-600 bg-primary-50 px-3 text-xs font-semibold text-primary-700 hover:bg-primary-100 whitespace-nowrap"
                    title={lang === 'ar' ? 'تقسيط المتبقي' : 'Schedule balance'}
                    aria-label={lang === 'ar' ? 'تقسيط المتبقي' : 'Schedule balance'}
                    disabled
                  >
                    <span>{lang === 'ar' ? 'التقسيط' : 'Installments'}</span>
                  </button>
                </div>
              )}
              {!isPaymentDeferred && paymentMethodId != null && (
                <>
                  <div className="min-w-[140px]">
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t.invoices.paymentAmount ?? 'المبلغ المدفوع'}</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={hasLinkedPayments ? amountPaid : amountPaidStr}
                      onChange={(e) => !hasLinkedPayments && setAmountPaidStr(e.target.value)}
                      readOnly={!!hasLinkedPayments}
                      placeholder="0"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none bg-white disabled:bg-slate-50"
                    />
                    {amountExceedsTotal && (
                      <p className="text-xs text-red-600 mt-1">{t.invoices.amountExceedsTotal ?? 'المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة.'}</p>
                    )}
                  </div>
                  <div className="min-w-[120px]">
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t.invoices.balance ?? 'المتبقي'}</label>
                    <p className="py-2 font-semibold text-slate-900">{fmt(Math.max(0, currentTotal - amountPaid))}</p>
                  </div>
                  <div className="min-w-[100px]">
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t.invoices.paymentStatus}</label>
                    <p className="py-2 font-medium text-slate-700">
                      {paymentSettledStatus === 'paid' ? (t.invoices.settledPaid ?? 'مدفوعة') : paymentSettledStatus === 'partial' ? (t.invoices.settledPartial ?? 'جزئي') : (t.invoices.settledUnpaid ?? 'غير مدفوعة')}
                    </p>
                  </div>
                </>
              )}
            </div>
            {isPaymentDeferred && (
              <p className="text-xs text-slate-500 mt-2">{t.invoices.onCreditHint ?? 'الفاتورة بالأجل: المبلغ يُسجّل في حساب العميل ولا يُولّد سند قبض حتى يتم الدفع.'}</p>
            )}
            {invoice?.payments?.length ? (
              <p className="text-xs text-slate-500 mt-2">
                {t.invoices.voucherNumber ?? 'رقم السند'}: <span className="font-mono font-medium text-slate-700">{invoice.payments.map((p: { number: string }) => p.number).join(', ')}</span>
              </p>
            ) : null}
          </div>
      </div>

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
                  key={item.id}
                  type="button"
                  className={`w-full px-3 py-2 text-sm hover:bg-slate-100 block ${isRtl ? 'text-right' : 'text-left'}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectItem(openItemLineIdx, item.id)
                    setItemSearchByLine((p) => ({ ...p, [openItemLineIdx]: '' }))
                    setOpenItemLineIdx(null)
                  }}
                >
                  {item.name}{item.code ? ` (${item.code})` : ''}
                </button>
              ))}
              {filterItemsBySearch(itemSearchByLine[openItemLineIdx] ?? '').length === 0 && (
                <div className={`px-3 py-2 text-sm text-slate-500 ${isRtl ? 'text-right' : 'text-left'}`}>{t.invoices.noItemsMatch}</div>
              )}
            </div>
          </div>,
          document.body
        )}

      {updateMut.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 space-y-3">
          {(() => {
            const axErr = (updateMut.error as any)
            const isNetworkError = !axErr?.response
            const err = axErr?.response?.data
            const serverMessage = err?.message
              || (err?.errors && typeof err.errors === 'object' ? (Object.values(err.errors).flat() as string[])[0] : null)
              || (isNetworkError ? null : t.msg.updateError)
            return (
              <>
                <p className="font-medium">
                  {isNetworkError ? (t.msg.saveFailedSimple ?? t.msg.networkError) : (serverMessage ?? t.msg.updateError)}
                </p>
                {isNetworkError && (
                  <p className="text-xs text-red-600">{t.msg.networkErrorRetried}</p>
                )}
                <details className="text-xs text-red-600">
                  <summary className="cursor-pointer hover:underline">{t.msg.seeSteps}</summary>
                  <p className="mt-2 whitespace-pre-line">{t.msg.networkErrorSteps}</p>
                </details>
                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => { updateMut.reset(); handleSave(); }}
                    className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg"
                  >
                    {t.msg.retrySave ?? 'إعادة المحاولة'}
                  </button>
                  <button type="button" onClick={() => updateMut.reset()} className="px-3 py-1.5 text-xs font-medium bg-red-100 hover:bg-red-200 text-red-800 rounded border border-red-300">
                    {t.msg.dismissError}
                  </button>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {invoice.status !== 'draft' && invoice.journal_entry_id && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          {t.invoices.postedWarning}
        </div>
      )}

      {type === 'sales' && invoice.status !== 'draft' && (invoice.manufacturing_journal_entry || mfgOrderDocHref) && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm flex flex-wrap items-center gap-x-6 gap-y-2">
          {invoice.manufacturing_journal_entry ? (
            <Link
              to={`/journal-entries/create?id=${invoice.manufacturing_journal_entry.id}`}
              className="font-semibold text-primary-700 hover:text-primary-600 hover:underline"
            >
              {t.invoices.openManufacturingJournal ?? 'قيد التصنيع'}: {invoice.manufacturing_journal_entry.number}
            </Link>
          ) : null}
          {mfgOrderDocHref ? (
            <Link to={mfgOrderDocHref} className="font-semibold text-slate-800 hover:text-primary-600 hover:underline">
              {lang === 'ar' ? 'أمر تصنيع آلي (مستند)' : 'Manufacturing order document'}
            </Link>
          ) : null}
        </div>
      )}

      {rebuildJournalNotice && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
          {rebuildJournalNotice}
        </div>
      )}

      {type === 'sales' && invoice.status !== 'draft' && invoice.journal_entry_id && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
          <p className="min-w-0 flex-1 leading-relaxed">{t.invoices.rebuildJournalHint}</p>
          <button
            type="button"
            onClick={() => {
              setRebuildJournalNotice(null)
              setSubmitError(null)
              rebuildJournalMut.mutate()
            }}
            disabled={rebuildJournalMut.isPending || updateMut.isPending}
            className="shrink-0 rounded-lg border border-primary-600 bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rebuildJournalMut.isPending ? (lang === 'ar' ? 'جاري إعادة البناء…' : 'Rebuilding…') : (t.invoices.rebuildJournal ?? 'إعادة بناء القيد')}
          </button>
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button
          onClick={handleCancelInvoice}
          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
          disabled={cancelMut.isPending}
        >
          {t.cancel}
        </button>
        <button
          onClick={handleSave}
          disabled={updateMut.isPending || amountExceedsTotal || salesRepRequiredMissing}
          className="bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-6 py-2 text-sm disabled:opacity-50 transition-colors font-medium"
        >
          {updateMut.isPending ? t.saving : (lang === 'ar' ? 'حفظ' : (t.invoices.saveChanges ?? 'Save'))}
        </button>
        <button
          onClick={handleSaveAndPrint}
          disabled={updateMut.isPending || amountExceedsTotal || salesRepRequiredMissing}
          className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-6 py-2 text-sm disabled:opacity-50 transition-colors font-medium"
        >
          {t.invoices.saveAndPrint ?? 'حفظ و طباعة'}
        </button>
      </div>
    </div>
  )
}
