import { useState, useRef, useEffect, useMemo, useLayoutEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useTheme } from '../../contexts/ThemeContext'
import { DocumentTitleProvider } from '../../contexts/DocumentTitleContext'
import DocumentTitle from '../DocumentTitle'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { fetchSettings } from '../../api/tenant'
import { cacheSettings, readCachedSettings } from '../../utils/settingsStorage'
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Users,
  Truck,
  Package,
  ShoppingCart,
  ShoppingBag,
  CreditCard,
  BarChart3,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Landmark,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ArrowLeftRight,
  ClipboardList,
  Ruler,
  FolderTree,
  Award,
  Globe,
  Building2,
  Barcode,
  Wallet,
  Coins,
  Building,
  Target,
  Palette,
  Search,
  Shield,
  UserCog,
  UserPlus,
  FileInput,
  ScrollText,
  PanelLeftClose,
  PanelLeft,
  ArrowLeft,
  Settings,
  Scale,
  TrendingUp,
  Receipt,
  Factory,
  ListTree,
  UserCheck,
  Bell,
  MessageSquare,
  Tags,
  LayoutGrid,
  CalendarClock,
  PieChart,
  AlertTriangle,
  BriefcaseBusiness,
  BadgePercent,
  Gift,
  BadgeMinus,
  Lock,
  Plug,
  Store,
  Star,
  Printer,
  Database,
} from 'lucide-react'
import NotificationBell from '../notifications/NotificationBell'
import ThemePicker from '../ThemePicker'
import { clampUiFontScale, UI_FONT_SCALE_DEFAULT } from '../../constants/uiFontScale'
import { applyUiFontScaleIfChanged, cacheUiFontScale, readCachedUiFontScale } from '../../utils/uiFontScaleStorage'
import { getCompanyName, getCompanyLogoUrl } from '../../utils/companyBranding'

interface LayoutProps {
  children: React.ReactNode
}

interface NavItem {
  path: string
  labelKey: string
  icon: React.ElementType
}

interface NavGroup {
  labelKey: string
  icon: React.ElementType
  basePaths: string[]
  children: NavItem[]
}

type NavEntry = NavItem | NavGroup

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry
}

/** قوائم الإدارة في أسفل الشريط: HR → المستخدمين → الإعدادات → الإدارة (آخر عنصر) */
const SIDEBAR_TAIL_KEYS = ['nav.hr', 'nav.userManagement', 'nav.settings', 'nav.admin'] as const

function buildSidebarNavEntries(isSuperAdmin: boolean, hasFullTenantAccess: boolean): NavEntry[] {
  const findGroup = (labelKey: string) =>
    navEntries.find((e): e is NavGroup => isGroup(e) && e.labelKey === labelKey)

  const tailKeys = new Set<string>()
  const tail: NavEntry[] = []

  if (hasFullTenantAccess) {
    const hr = findGroup('nav.hr')
    if (hr) {
      tail.push(hr)
      tailKeys.add('nav.hr')
    }
    const users = findGroup('nav.userManagement')
    if (users) {
      tail.push(users)
      tailKeys.add('nav.userManagement')
    }
  }

  const settings = findGroup('nav.settings')
  if (settings) {
    tail.push(settings)
    tailKeys.add('nav.settings')
  }

  if (isSuperAdmin) {
    const admin = findGroup('nav.admin')
    if (admin) {
      tail.push(admin)
      tailKeys.add('nav.admin')
    }
  }

  const dashboard = navEntries.find((e) => !isGroup(e) && e.path === '/')
  const middle = navEntries.filter((entry) => {
    if (!isGroup(entry)) return entry.path !== '/'
    if (entry.labelKey === 'nav.admin' && !isSuperAdmin) return false
    return !tailKeys.has(entry.labelKey)
  })

  return [...(dashboard ? [dashboard] : []), ...middle, ...tail]
}

const navEntries: NavEntry[] = [
  { path: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  {
    labelKey: 'nav.accounts',
    icon: Landmark,
    basePaths: ['/accounts', '/accounts/statement', '/accounts/statement/sheet', '/financial-transfers', '/journal-entries', '/receipt-vouchers', '/payment-vouchers', '/payment-methods', '/currencies', '/branches', '/cost-centers'],
    children: [
      { path: '/accounts', labelKey: 'nav.chartOfAccounts', icon: BookOpen },
      { path: '/journal-entries', labelKey: 'nav.journalEntries', icon: FileText },
      { path: '/accounts/statement', labelKey: 'nav.accountStatement', icon: FileText },
      { path: '/receipt-vouchers', labelKey: 'nav.receiptVouchers', icon: ArrowDownToLine },
      { path: '/payment-vouchers', labelKey: 'nav.paymentVouchers', icon: ArrowUpFromLine },
      { path: '/financial-transfers', labelKey: 'nav.financialTransfers', icon: ArrowLeftRight },
      { path: '/payment-methods', labelKey: 'nav.paymentMethods', icon: Wallet },
      { path: '/currencies', labelKey: 'nav.currencies', icon: Coins },
      { path: '/branches', labelKey: 'nav.branches', icon: Building },
      { path: '/cost-centers', labelKey: 'nav.costCenters', icon: Target },
    ],
  },
  {
    labelKey: 'nav.customers',
    icon: Users,
    basePaths: ['/customers', '/customers/import', '/customers/balances', '/customers/aging', '/customers/analysis', '/customer-groups'],
    children: [
      { path: '/customers', labelKey: 'nav.addCustomer', icon: UserPlus },
      { path: '/customers/import', labelKey: 'nav.importCustomers', icon: FileInput },
      { path: '/customers/balances', labelKey: 'nav.customerBalances', icon: FileText },
      { path: '/customers/analysis', labelKey: 'nav.customerAnalysis', icon: TrendingUp },
      { path: '/customers/aging', labelKey: 'nav.customerAging', icon: BarChart3 },
      { path: '/customer-groups', labelKey: 'nav.customerGroups', icon: Users },
    ],
  },
  {
    labelKey: 'nav.vendors',
    icon: Truck,
    basePaths: ['/vendors', '/vendors/import', '/vendors/balances', '/vendors/analysis', '/vendors/aging', '/vendors/performance', '/vendor-groups'],
    children: [
      { path: '/vendors', labelKey: 'nav.addVendor', icon: UserPlus },
      { path: '/vendors/import', labelKey: 'nav.importVendors', icon: FileInput },
      { path: '/vendors/balances', labelKey: 'nav.vendorBalances', icon: FileText },
      { path: '/vendors/analysis', labelKey: 'nav.vendorPurchaseAnalysis', icon: BarChart3 },
      { path: '/vendors/aging', labelKey: 'nav.vendorAging', icon: BarChart3 },
      { path: '/vendors/performance', labelKey: 'nav.vendorPerformance', icon: BarChart3 },
      { path: '/vendor-groups', labelKey: 'nav.vendorGroups', icon: Users },
    ],
  },
  {
    labelKey: 'nav.itemsAndInventory',
    icon: Boxes,
    basePaths: ['/items', '/items/import', '/items/variants', '/item-units', '/item-categories', '/item-brands', '/pricing-groups', '/warehouses', '/inventory/transfers', '/inventory/adjustments', '/stock-movements', '/inventory-report', '/inventory/variant-report', '/inventory/expiry-stock-report', '/reports/serial-numbers-inventory', '/opening-stock', '/inventory/low-stock', '/items/movements', '/items/ledger', '/barcode-labels'],
    children: [
      { path: '/items', labelKey: 'nav.items', icon: Package },
      { path: '/items/import', labelKey: 'nav.importItems', icon: FileInput },
      { path: '/items/variants', labelKey: 'nav.itemVariants', icon: LayoutGrid },
      { path: '/item-units', labelKey: 'nav.itemUnits', icon: Ruler },
      { path: '/item-categories', labelKey: 'nav.itemCategories', icon: FolderTree },
      { path: '/item-brands', labelKey: 'nav.itemBrands', icon: Award },
      { path: '/pricing-groups', labelKey: 'nav.pricingGroups', icon: BadgePercent },
      { path: '/warehouses', labelKey: 'nav.warehouses', icon: Building2 },
      { path: '/barcode-labels', labelKey: 'nav.barcodeLabels', icon: Barcode },
      { path: '/inventory/transfers', labelKey: 'nav.transfers', icon: ArrowLeftRight },
      { path: '/inventory/adjustments', labelKey: 'nav.inventoryAdjustmentsList', icon: ClipboardList },
      { path: '/stock-movements', labelKey: 'nav.stockMovements', icon: ArrowLeftRight },
      { path: '/reports/serial-numbers-inventory', labelKey: 'nav.serialNumbersInventoryReport', icon: BarChart3 },
      { path: '/items/movements', labelKey: 'nav.itemMovement', icon: TrendingUp },
      { path: '/inventory-report', labelKey: 'nav.inventoryReport', icon: ClipboardList },
      { path: '/inventory/variant-report', labelKey: 'nav.variantInventoryReport', icon: ClipboardList },
      { path: '/inventory/expiry-stock-report', labelKey: 'nav.expiryStockReport', icon: CalendarClock },
      { path: '/inventory/low-stock', labelKey: 'nav.lowStockAlerts', icon: Package },
      { path: '/opening-stock', labelKey: 'nav.openingStock', icon: FileText },
    ],
  },
  {
    labelKey: 'nav.purchases',
    icon: ShoppingBag,
    basePaths: [
      '/purchase-requests',
      '/invoices/purchases',
      '/invoices/purchase-returns',
      '/reports/item-purchases',
      '/reports/monthly-purchases-analysis',
    ],
    children: [
      { path: '/purchase-requests', labelKey: 'nav.purchaseRequests', icon: ClipboardList },
      { path: '/invoices/purchases', labelKey: 'nav.purchaseInvoices', icon: FileText },
      { path: '/invoices/purchase-returns', labelKey: 'nav.purchaseReturns', icon: ArrowLeftRight },
      { path: '/reports/item-purchases', labelKey: 'nav.itemPurchasesReport', icon: BarChart3 },
      { path: '/reports/monthly-purchases-analysis', labelKey: 'nav.monthlyPurchasesAnalysisReport', icon: BarChart3 },
    ],
  },
  {
    labelKey: 'nav.sales',
    icon: ShoppingCart,
    basePaths: [
      '/invoices/sales',
      '/invoices/sales-returns',
      '/invoices/quotations',
      '/reports/item-sales',
      '/reports/best-selling',
      '/reports/invoice-profits',
      '/reports/branch-sales-annual',
      '/reports/cost-center-sales-annual',
    ],
    children: [
      { path: '/invoices/sales', labelKey: 'nav.salesInvoices', icon: FileText },
      { path: '/invoices/sales-returns', labelKey: 'nav.salesReturns', icon: ArrowLeftRight },
      { path: '/invoices/quotations', labelKey: 'nav.quotations', icon: ClipboardList },
      { path: '/reports/item-sales', labelKey: 'nav.itemSalesReport', icon: BarChart3 },
      { path: '/reports/best-selling', labelKey: 'nav.bestSelling', icon: TrendingUp },
      { path: '/reports/invoice-profits', labelKey: 'nav.invoiceProfitsReport', icon: BarChart3 },
      { path: '/reports/branch-sales-annual', labelKey: 'nav.branchSalesAnnualReport', icon: BarChart3 },
      { path: '/reports/cost-center-sales-annual', labelKey: 'nav.costCenterSalesReport', icon: BarChart3 },
    ],
  },
  {
    labelKey: 'nav.pos',
    icon: ShoppingCart,
    basePaths: ['/invoices/pos', '/invoices/pos-list', '/pos/expense-items', '/pos/shifts-report', '/pos/cashier/today', '/pos/shifts'],
    children: [
      { path: '/invoices/pos-list', labelKey: 'nav.posInvoices', icon: FileText },
      { path: '/pos/cashier/today', labelKey: 'nav.cashierDaily', icon: ClipboardList },
      { path: '/pos/shifts-report', labelKey: 'nav.posShiftsReport', icon: BarChart3 },
      { path: '/pos/expense-items', labelKey: 'nav.posExpenseItems', icon: Receipt },
      { path: '/pos/expense-categories', labelKey: 'nav.posExpenseCategories', icon: Tags },
    ],
  },
  {
    labelKey: 'nav.loyalty',
    icon: Star,
    basePaths: ['/loyalty'],
    children: [
      { path: '/loyalty/settings', labelKey: 'nav.loyaltySettings', icon: Settings },
      { path: '/loyalty/tiers', labelKey: 'nav.loyaltyTiers', icon: Award },
      { path: '/loyalty/customers', labelKey: 'nav.loyaltyCustomers', icon: Users },
    ],
  },
  {
    labelKey: 'nav.promotionsAndGifts',
    icon: Gift,
    basePaths: ['/promotions'],
    children: [
      { path: '/promotions', labelKey: 'nav.promotions', icon: BadgePercent },
      { path: '/promotions/report', labelKey: 'nav.promotionsReport', icon: BarChart3 },
    ],
  },
  {
    labelKey: 'nav.restaurant',
    icon: ShoppingCart,
    basePaths: ['/restaurant/pos', '/restaurant/sales', '/restaurant/tables', '/restaurant/sections', '/restaurant/kitchen', '/restaurant/menu'],
    children: [
      { path: '/restaurant/pos', labelKey: 'nav.restaurantPos', icon: ShoppingCart },
      { path: '/restaurant/sales', labelKey: 'nav.restaurantSales', icon: FileText },
      { path: '/restaurant/menu', labelKey: 'nav.restaurantMenu', icon: BookOpen },
      { path: '/restaurant/tables', labelKey: 'nav.restaurantTables', icon: Building2 },
      { path: '/restaurant/sections', labelKey: 'nav.restaurantSections', icon: LayoutGrid },
      { path: '/restaurant/kitchen', labelKey: 'nav.kitchenDisplay', icon: Bell },
    ],
  },
  {
    labelKey: 'nav.installments',
    icon: CalendarClock,
    basePaths: ['/installments', '/installments/create', '/installments/reports/statistics', '/installments/reports/follow-up', '/installments/reports/overdue', '/installments/reports/expected-collection'],
    children: [
      { path: '/installments/reports/statistics', labelKey: 'nav.installmentsStatistics', icon: PieChart },
      { path: '/installments/create', labelKey: 'nav.installmentsCreate', icon: FileText },
      { path: '/installments', labelKey: 'nav.installmentsList', icon: ClipboardList },
      { path: '/installments/reports/follow-up', labelKey: 'nav.installmentsFollowUp', icon: BarChart3 },
      { path: '/installments/reports/overdue', labelKey: 'nav.installmentsOverdue', icon: AlertTriangle },
      { path: '/installments/reports/expected-collection', labelKey: 'nav.installmentsExpectedCollection', icon: TrendingUp },
    ],
  },
  {
    labelKey: 'nav.manufacturing',
    icon: Factory,
    basePaths: ['/manufacturing/bom', '/manufacturing/production-orders'],
    children: [
      { path: '/manufacturing/bom', labelKey: 'nav.bom', icon: ListTree },
      { path: '/manufacturing/production-orders', labelKey: 'nav.productionOrders', icon: ClipboardList },
    ],
  },
  {
    labelKey: 'nav.salesReps',
    icon: UserCheck,
    basePaths: ['/sales-reps', '/reports/sales-rep-sales', '/reports/sales-reps-monthly-productivity'],
    children: [
      { path: '/sales-reps', labelKey: 'nav.salesRepsList', icon: UserCheck },
      { path: '/reports/sales-rep-sales', labelKey: 'nav.salesRepSalesReport', icon: BarChart3 },
      { path: '/reports/sales-reps-monthly-productivity', labelKey: 'nav.salesRepsMonthlyProductivityReport', icon: BarChart3 },
    ],
  },
  {
    labelKey: 'nav.delivery',
    icon: Truck,
    basePaths: ['/delivery/drivers', '/delivery/settlement', '/reports/delivery-performance'],
    children: [
      { path: '/delivery/drivers', labelKey: 'nav.deliveryDrivers', icon: Users },
      { path: '/delivery/settlement', labelKey: 'nav.deliverySettlement', icon: Wallet },
      { path: '/reports/delivery-performance', labelKey: 'nav.deliveryPerformanceReport', icon: BarChart3 },
    ],
  },
  {
    labelKey: 'nav.reports',
    icon: BarChart3,
    basePaths: ['/reports'],
    children: [
      { path: '/reports/trial-balance', labelKey: 'reports.trialBalance', icon: Scale },
      { path: '/reports/receipts', labelKey: 'reports.receiptsReport', icon: ArrowDownToLine },
      { path: '/reports/payments', labelKey: 'reports.paymentsReport', icon: ArrowUpFromLine },
      { path: '/reports/tax-declaration', labelKey: 'reports.taxDeclaration', icon: Receipt },
      { path: '/reports/expenses', labelKey: 'reports.expensesReport', icon: ArrowUpFromLine },
    ],
  },
  {
    labelKey: 'nav.financialStatements',
    icon: TrendingUp,
    basePaths: ['/reports/income-statement', '/reports/balance-sheet'],
    children: [
      { path: '/reports/income-statement', labelKey: 'reports.incomeStatement', icon: TrendingUp },
      { path: '/reports/balance-sheet', labelKey: 'reports.balanceSheet', icon: Building2 },
    ],
  },
  {
    labelKey: 'nav.settings',
    icon: Settings,
    basePaths: ['/settings/accounting', '/settings/pos', '/settings/manufacturing', '/settings/general', '/settings/installments', '/settings/messages', '/settings/api', '/settings/integrations', '/settings/print-templates'],
    children: [
      { path: '/settings/accounting', labelKey: 'nav.settingsAccounting', icon: Landmark },
      { path: '/settings/pos', labelKey: 'nav.settingsPOS', icon: ShoppingCart },
      { path: '/settings/manufacturing', labelKey: 'nav.settingsManufacturing', icon: Factory },
      { path: '/settings/general', labelKey: 'nav.settingsGeneral', icon: Building2 },
      { path: '/settings/installments', labelKey: 'nav.settingsInstallments', icon: CalendarClock },
      { path: '/settings/messages', labelKey: 'nav.settingsMessages', icon: MessageSquare },
      { path: '/settings/api', labelKey: 'nav.settingsApi', icon: Plug },
      { path: '/settings/integrations', labelKey: 'nav.settingsIntegrations', icon: Store },
      { path: '/settings/print-templates', labelKey: 'nav.settingsPrintTemplates', icon: Printer },
    ],
  },
  {
    labelKey: 'nav.admin',
    icon: Shield,
    basePaths: ['/admin/subscriptions', '/admin/plans', '/admin/backup-reset'],
    children: [
      { path: '/admin/subscriptions', labelKey: 'nav.subscriptions', icon: CreditCard },
      { path: '/admin/plans', labelKey: 'nav.plans', icon: Package },
      { path: '/admin/backup-reset', labelKey: 'nav.backupReset', icon: Database },
    ],
  },
  {
    labelKey: 'nav.userManagement',
    icon: Shield,
    basePaths: ['/tenant-users', '/roles', '/audit-log'],
    children: [
      { path: '/tenant-users', labelKey: 'nav.users', icon: UserCog },
      { path: '/roles', labelKey: 'nav.roles', icon: Shield },
      { path: '/audit-log', labelKey: 'nav.auditLog', icon: ScrollText },
    ],
  },
  {
    labelKey: 'nav.hr',
    icon: Users,
    basePaths: ['/hr'],
    children: [
      { path: '/hr/employees', labelKey: 'nav.hrEmployees', icon: Users },
      { path: '/hr/attendance', labelKey: 'nav.hrAttendance', icon: CalendarClock },
      { path: '/hr/payroll', labelKey: 'nav.hrPayroll', icon: Wallet },
      { path: '/hr/requests', labelKey: 'nav.hrRequests', icon: ClipboardList },
      { path: '/hr/administrations', labelKey: 'nav.hrAdministrations', icon: Building2 },
      { path: '/hr/departments', labelKey: 'nav.hrDepartments', icon: FolderTree },
      { path: '/hr/job-titles', labelKey: 'nav.hrJobTitles', icon: BriefcaseBusiness },
      { path: '/hr/leave-types', labelKey: 'nav.hrLeaveTypes', icon: CalendarClock },
      { path: '/hr/allowances', labelKey: 'nav.hrAllowances', icon: BadgePercent },
      { path: '/hr/deductions', labelKey: 'nav.hrDeductions', icon: BadgeMinus },
      { path: '/hr/settings', labelKey: 'nav.hrSettings', icon: Settings },
    ],
  },
]

/** Flat list of all nav links for search (path + labelKey). */
const flatNavLinks: { path: string; labelKey: string }[] = []
navEntries.forEach((entry) => {
  if (isGroup(entry)) {
    entry.children.forEach((c) => flatNavLinks.push({ path: c.path, labelKey: c.labelKey }))
  } else {
    flatNavLinks.push({ path: entry.path, labelKey: entry.labelKey })
  }
})

/**
 * مسارات الواجهة التي لا تساوي path رابط القائمة لكنها تابعة له (توسيع المجموعة + تمييز العنصر).
 */
function pathnameForNavHighlight(pathname: string, search: string): string {
  if (pathname === '/payments/create-voucher') {
    const vt = new URLSearchParams(search).get('voucher_type') || 'receipt'
    if (vt === 'payment') return '/payment-vouchers'
    if (vt === 'transfer') return '/financial-transfers'
    return '/receipt-vouchers'
  }
  if (pathname === '/invoices/create') {
    const q = new URLSearchParams(search)
    const type = q.get('type') || 'sales'
    const isReturn = q.get('is_return') === '1' || q.get('is_return') === 'true'
    if (type === 'purchase') {
      return isReturn ? '/invoices/purchase-returns' : '/invoices/purchases'
    }
    return isReturn ? '/invoices/sales-returns' : '/invoices/sales'
  }
  if (pathname.startsWith('/settings/print-templates')) {
    return '/settings/print-templates'
  }
  return pathname
}

/**
 * أي مجموعة جانبية يجب أن تكون مفتوحة لهذا المسار (بحث الصفحات، روابط مباشرة، إلخ).
 * يفضّل المجموعة التي تحتوي أطول مسار فرعي يطابق pathname؛ وإلا يُستخدم basePaths كالسابق.
 */
function deriveOpenGroupsFromPathname(pathname: string, search: string): Record<string, boolean> {
  const navPath = pathnameForNavHighlight(pathname, search)
  let bestGroup: string | null = null
  let bestLen = -1
  for (const entry of navEntries) {
    if (!isGroup(entry)) continue
    for (const c of entry.children) {
      if (navPath === c.path || navPath.startsWith(`${c.path}/`)) {
        if (c.path.length > bestLen) {
          bestLen = c.path.length
          bestGroup = entry.labelKey
        }
      }
    }
  }
  if (bestGroup) {
    return { [bestGroup]: true }
  }
  const multi: Record<string, boolean> = {}
  for (const entry of navEntries) {
    if (!isGroup(entry)) continue
    const match = entry.basePaths.some((bp) => pathname.startsWith(bp) || navPath.startsWith(bp))
    multi[entry.labelKey] = match
  }
  return multi
}

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return path
    }
  }
  return typeof current === 'string' ? current : path
}

export default function Layout({ children }: LayoutProps) {
  const { user, currentTenant, tenants, setCurrentTenant, logout, meData, canAccessPath, can, isPlatformSuperAdmin, hasFullTenantAccess } = useAuth()
  const isSuperAdmin = isPlatformSuperAdmin
  const { t, lang, toggleLang, isRtl } = useLanguage()
  const { currentTheme } = useTheme()
  const lightSidebarChrome = currentTheme.isLightSidebar
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const colorPickerPanelRef = useRef<HTMLDivElement>(null)
  const colorPickerBtnRef = useRef<HTMLButtonElement>(null)
  const [colorPickerFixedStyle, setColorPickerFixedStyle] = useState<CSSProperties | null>(null)
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [navSearch, setNavSearch] = useState('')
  const [navSearchFocused, setNavSearchFocused] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    deriveOpenGroupsFromPathname(location.pathname, location.search),
  )

  const label = (key: string) => getNestedValue(t as unknown as Record<string, unknown>, key)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
      const colorClickInside =
        colorPickerRef.current?.contains(e.target as Node) ||
        colorPickerPanelRef.current?.contains(e.target as Node)
      if (colorPickerOpen && !colorClickInside) {
        setColorPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [colorPickerOpen])

  useLayoutEffect(() => {
    if (!colorPickerOpen) {
      setColorPickerFixedStyle(null)
      return
    }
    const update = () => {
      const btn = colorPickerBtnRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const margin = 8
      const width = 288
      const maxHeight = Math.min(window.innerHeight * 0.9, 600)
      if (isRtl) {
        setColorPickerFixedStyle({
          position: 'fixed',
          top: r.bottom + margin,
          right: Math.max(margin, window.innerWidth - r.right),
          left: 'auto',
          width,
          maxHeight,
          zIndex: 9999,
        })
      } else {
        setColorPickerFixedStyle({
          position: 'fixed',
          top: r.bottom + margin,
          left: Math.max(margin, r.left),
          right: 'auto',
          width,
          maxHeight,
          zIndex: 9999,
        })
      }
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [colorPickerOpen, isRtl])

  const pathname = location.pathname
  const navigate = useNavigate()

  useEffect(() => {
    if (isSuperAdmin || pathname === '/renew-subscription') return
    if (meData?.plan_features?.length && !canAccessPath(pathname)) {
      navigate('/renew-subscription?reason=feature', { replace: true })
    }
  }, [pathname, meData?.plan_features, isSuperAdmin, canAccessPath, navigate])

  useLayoutEffect(() => {
    setOpenGroups(deriveOpenGroupsFromPathname(pathname, location.search))
  }, [pathname, location.search])

  /** يحدد إن كان الرابط (خارج المجموعات) نشطاً — للمسار الجذر فقط مطابقة تامة، وإلا مطابقة تامة أو بداية مسار فرعي */
  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname === path || pathname.startsWith(path + '/')
  }

  const navHighlightPath = useMemo(
    () => pathnameForNavHighlight(pathname, location.search),
    [pathname, location.search],
  )

  const sidebarNavEntries = useMemo(
    () => buildSidebarNavEntries(isSuperAdmin, hasFullTenantAccess),
    [isSuperAdmin, hasFullTenantAccess],
  )

  /** داخل مجموعة: نُظلّل فقط الرابط الأكثر تحديداً (أطول مسار يطابق pathname) لتفادي تظليل "إضافة مورد" و"أرصدة الموردين" معاً */
  const getActiveChildPath = (children: NavItem[]): string | null => {
    const matched = children
      .filter((c) => navHighlightPath === c.path || navHighlightPath.startsWith(c.path + '/'))
      .sort((a, b) => b.path.length - a.path.length)
    return matched.length ? matched[0].path : null
  }

  const navSearchResults = useMemo(() => {
    const q = navSearch.trim().toLowerCase()
    if (!q) return []
    return flatNavLinks
      .map(({ path, labelKey }) => ({ path, label: label(labelKey) }))
      .filter(({ label }) => label.toLowerCase().includes(q))
      .slice(0, 10)
  }, [navSearch, t])

  const toggleGroup = (labelKey: string) => {
    setOpenGroups((prev) => {
      const willOpen = !prev[labelKey]
      if (willOpen) return { [labelKey]: true }
      return { ...prev, [labelKey]: false }
    })
  }

  const closeSidebar = () => setSidebarOpen(false)

  const headerBtnClass = lightSidebarChrome
    ? 'text-sm text-neutral-800 hover:bg-black/[0.06] border-black/10 font-medium min-h-[44px] lg:min-h-0'
    : 'text-sm text-white/85 hover:bg-white/10 border-white/15 font-medium min-h-[44px] lg:min-h-0'
  const headerIconBtnClass = lightSidebarChrome
    ? 'text-neutral-800/85 hover:bg-black/[0.06]'
    : 'text-white/80 hover:bg-white/10'

  const navHoverClass = lightSidebarChrome ? 'hover:bg-black/[0.06]' : 'hover:bg-white/10'

  const navLinkClassName = (active: boolean) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 ease-out text-sm text-start ${navHoverClass} ${
      active ? 'font-semibold' : 'font-medium'
    }`

  const navLinkStyle = (active: boolean): CSSProperties =>
    active
      ? {
          background: 'var(--fc-sidebar-active-bg)',
          color: 'var(--fc-sidebar-text)',
          fontWeight: 600,
          boxShadow: '0 0 0 1px color-mix(in srgb, var(--fc-accent) 28%, transparent)',
          borderInlineEnd: '2px solid var(--fc-sidebar-text)',
        }
      : {
          color: 'var(--fc-sidebar-regular-text)',
          borderInlineEnd: '2px solid transparent',
        }

  const isPosPage = location.pathname === '/invoices/pos' || location.pathname === '/restaurant/pos'
  const isRestaurantListPage = /^\/restaurant\/(tables|sections|kitchen|menu)$/.test(location.pathname)

  const tenantId = currentTenant?.id ?? 0
  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: async () => {
      const data = await fetchSettings(tenantId)
      cacheSettings(tenantId, data)
      return data
    },
    enabled: !!tenantId,
    initialData: () => readCachedSettings(tenantId),
    placeholderData: (prev) => prev ?? readCachedSettings(tenantId),
  })
  const companyName = getCompanyName(settings as Record<string, unknown>, currentTenant)
  const companyLogo = getCompanyLogoUrl(settings as Record<string, unknown>)

  useLayoutEffect(() => {
    if (!tenantId) {
      applyUiFontScaleIfChanged(UI_FONT_SCALE_DEFAULT)
      return
    }
    const raw = Number((settings as Record<string, unknown> | undefined)?.ui_font_scale_percent)
    const pct = Number.isFinite(raw) ? clampUiFontScale(raw) : readCachedUiFontScale(tenantId)
    applyUiFontScaleIfChanged(pct)
    if (Number.isFinite(raw)) {
      cacheUiFontScale(tenantId, pct)
    }
  }, [settings, tenantId])

  return (
    <DocumentTitleProvider>
      <DocumentTitle />
    <div
      data-fc-lang={lang}
      className={`app-shell-print-layout w-full h-full min-h-0 min-w-0 overflow-hidden ${
        isPosPage ? 'flex flex-col fc-shell-pos' : isRtl ? 'fc-shell-rtl' : 'fc-shell-ltr'
      }`}
    >
      {!isPosPage && sidebarOpen && (
        <div
          className="no-print fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - مخفي في صفحة نقطة البيع وعند الطباعة */}
      {!isPosPage && (
      <aside
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`no-print fc-app-sidebar
          max-lg:fixed max-lg:z-50 max-lg:inset-y-0
          lg:static lg:z-auto lg:transform-none
          h-full min-h-0 max-h-full shrink-0 overflow-hidden
          ${isRtl ? 'max-lg:right-0' : 'max-lg:left-0'}
          flex flex-col
          transform transition-[transform,opacity] duration-300 ease-in-out
          ${sidebarCollapsed ? 'lg:w-0 lg:min-w-0 lg:max-w-0 lg:overflow-hidden lg:opacity-0 lg:pointer-events-none' : 'lg:w-64'}
          w-64 min-w-[16rem] max-w-[16rem]
          ${isRtl
            ? (sidebarOpen ? 'max-lg:translate-x-0' : 'max-lg:translate-x-full lg:translate-x-0')
            : (sidebarOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full lg:translate-x-0')
          }
        `}
        style={{ background: 'var(--fc-sidebar-bg)' }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0 border-b"
          style={{ borderColor: 'var(--fc-sidebar-divider)' }}
        >
          <div className="min-w-0">
            <h2
              className="text-xl font-bold truncate"
              style={{ color: 'var(--fc-sidebar-text)' }}
            >
              {t.appName}
            </h2>
            <p
              className="text-sm font-medium mt-0.5"
              style={{ color: 'var(--fc-sidebar-regular-text)' }}
            >
              {t.appSubtitle}
            </p>
          </div>
          <button
            onClick={closeSidebar}
            className={
              lightSidebarChrome
                ? 'lg:hidden p-2 rounded-lg transition-colors text-neutral-600 hover:bg-black/[0.06]'
                : 'lg:hidden p-2 rounded-lg transition-colors text-white/50 hover:bg-white/10 hover:text-white'
            }
            aria-label={t.close}
          >
            <X size={24} />
          </button>
        </div>

        <nav className="fc-sidebar-nav flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-2.5 pt-2 pb-1 space-y-0.5">
          {sidebarNavEntries.map((entry) => {
            if (isGroup(entry)) {
              if (entry.labelKey === 'nav.admin' && !isSuperAdmin) return null
              const visibleChildren = entry.children.filter((child) => {
                if (hasFullTenantAccess) return true
                if (entry.labelKey === 'nav.hr') {
                  if (child.path.startsWith('/hr/payroll')) return can('hr.payroll.view')
                  return can('hr.view')
                }
                if (child.path === '/reports/invoice-profits') return can('invoices.view_profit')
                return true
              })
              if (visibleChildren.length === 0) return null
              const expanded = openGroups[entry.labelKey] ?? false
              const Icon = entry.icon
              const activeChildPath = getActiveChildPath(visibleChildren)
              const groupHasActiveChild = activeChildPath !== null

              return (
                <div key={entry.labelKey}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(entry.labelKey)}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg transition-all duration-200 ease-out text-sm ${navHoverClass} ${
                      groupHasActiveChild ? 'font-semibold' : 'font-medium'
                    }`}
                    style={
                      groupHasActiveChild
                        ? {
                            color: 'var(--fc-sidebar-text)',
                            background: 'var(--fc-sidebar-active-bg)',
                            borderInlineEnd: '2px solid color-mix(in srgb, var(--fc-sidebar-text) 45%, transparent)',
                          }
                        : { color: 'var(--fc-sidebar-regular-text)' }
                    }
                  >
                    <Icon size={18} className="shrink-0 w-[18px] h-[18px]" />
                    <span className="flex-1 min-w-0 truncate text-start">{label(entry.labelKey)}</span>
                    <ChevronDown
                      size={14}
                      className={`shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                    />
                  </button>

                  <div
                    className={`overflow-hidden transition-[max-height,opacity] duration-200 ${
                      expanded ? 'max-h-[2000px] opacity-100 mt-1' : 'max-h-0 opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="ps-3 space-y-0.5 py-0.5">
                      {(() => {
                        return visibleChildren.map((child) => {
                          const ChildIcon = child.icon
                          const active = activeChildPath === child.path
                          return (
                            <Link
                              key={child.path}
                              to={child.path}
                              onClick={closeSidebar}
                              className={navLinkClassName(active)}
                              style={navLinkStyle(active)}
                            >
                              <ChildIcon size={16} className="shrink-0 w-4 h-4" />
                              <span>{label(child.labelKey)}</span>
                            </Link>
                          )
                        })
                      })()}
                    </div>
                  </div>
                </div>
              )
            }

            const Icon = entry.icon
            const isDashboard = entry.path === '/' || entry.path === '/dashboard'
            return (
              <Link
                key={entry.path}
                to={entry.path}
                onClick={() => {
                  closeSidebar()
                  if (isDashboard) setOpenGroups({})
                }}
                className={navLinkClassName(isActive(entry.path))}
                style={navLinkStyle(isActive(entry.path))}
              >
                <Icon size={18} className="shrink-0 w-[18px] h-[18px]" />
                <span>{label(entry.labelKey)}</span>
              </Link>
            )
          })}
          <div className="fc-sidebar-nav-end-spacer shrink-0 pointer-events-none" aria-hidden="true" />
        </nav>
      </aside>
      )}

      {/* Main content — dir هنا لمحتوى الصفحات (الحاوية الخارجية ltr لوضع الشريط فقط) */}
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="app-shell-print-main-column flex flex-col flex-1 min-w-0 min-h-0 h-full overflow-hidden"
      >
        {/* Top Bar — ارتفاع ثابت */}
        <header
          dir={isRtl ? 'rtl' : 'ltr'}
          className="no-print shrink-0 z-30 flex items-center justify-between gap-2 px-2 lg:px-2.5 h-11 lg:h-10 shadow-sm w-full"
          style={{
            background: 'var(--fc-sidebar-bg)',
            borderBottom: '1px solid var(--fc-sidebar-divider)',
          }}
        >
          {/* 1. أقصى اليمين (RTL): زر طي الشريط الجانبي + خانة البحث بجانبه */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              className={`hidden lg:flex h-11 w-11 lg:h-[26px] lg:w-[26px] items-center justify-center rounded-md transition-colors shrink-0 ${headerIconBtnClass}`}
              aria-label={sidebarCollapsed ? label('expandSidebar') : label('collapseSidebar')}
              title={sidebarCollapsed ? label('expandSidebar') : label('collapseSidebar')}
            >
              {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <div className="relative w-full max-w-[10.5rem]">
              <Search
                size={14}
                className={`absolute top-1/2 -translate-y-1/2 pointer-events-none shrink-0 ${
                  lightSidebarChrome ? 'text-neutral-500' : 'text-white/50'
                } ${isRtl ? 'right-2.5 left-auto' : 'left-2.5 right-auto'}`}
              />
              <input
                type="text"
                value={navSearch}
                onChange={(e) => setNavSearch(e.target.value)}
                onFocus={() => setNavSearchFocused(true)}
                onBlur={() => setTimeout(() => setNavSearchFocused(false), 150)}
                placeholder={t.searchPagesPlaceholder}
                className={
                  lightSidebarChrome
                    ? `w-full border border-neutral-200 rounded-md h-11 lg:h-[26px] text-sm font-medium text-neutral-900 placeholder:text-neutral-500 bg-white/90 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-neutral-300 focus:border-neutral-400 transition-colors ${isRtl ? 'pr-8 pl-2' : 'pl-8 pr-2'}`
                    : `w-full border border-white/15 rounded-md h-11 lg:h-[26px] text-sm font-medium text-white placeholder-white/50 bg-white/10 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-white/15 focus:border-white/25 focus:bg-white/10 transition-colors ${isRtl ? 'pr-8 pl-2' : 'pl-8 pr-2'}`
                }
                dir={isRtl ? 'rtl' : 'ltr'}
              />
              {navSearchFocused && navSearch.trim() && navSearchResults.length > 0 && (
                <div className={`absolute top-full mt-1.5 w-full min-w-[240px] bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 max-h-72 overflow-y-auto ${isRtl ? 'right-0 left-auto' : 'left-0 right-auto'}`}>
                  {navSearchResults.map(({ path, label: itemLabel }) => (
                    <Link
                      key={path}
                      to={path}
                      onClick={() => { setNavSearch(''); setNavSearchFocused(false) }}
                      className={`block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 ${isRtl ? 'text-right' : 'text-left'}`}
                    >
                      {itemLabel}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 2. أقصى اليسار (RTL): أدوات التحكم — القائمة، نقطة البيع، السمة، اللغة، التنبيهات، الملف الشخصي */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isPosPage ? (
              <Link
                to="/"
                className={`flex items-center gap-1.5 h-11 px-3 rounded-md transition-colors border lg:h-[26px] lg:px-2.5 ${headerBtnClass}`}
                title={lang === 'ar' ? 'الصفحة الرئيسية' : 'Home'}
              >
                <ArrowLeft size={15} className={isRtl ? 'rotate-180' : ''} />
                <span className="font-semibold">{lang === 'ar' ? 'الرئيسية' : 'Home'}</span>
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className={`lg:hidden inline-flex items-center justify-center h-11 w-11 rounded-md transition-colors ${headerIconBtnClass}`}
                  aria-label="Menu"
                >
                  <Menu size={18} />
                </button>

                {/* نقطة البيع POS - يخفى عند الدخول لشاشة نقطة البيع */}
                <Link
                  to="/invoices/pos"
                  className={`flex items-center gap-1.5 h-11 px-3 rounded-md transition-colors border lg:h-[26px] lg:px-2.5 ${headerBtnClass}`}
                  title={label('nav.posInvoices')}
                >
                  <ShoppingCart size={15} />
                  <span className="hidden sm:inline">{label('nav.posInvoices')}</span>
                </Link>
                {isSuperAdmin && (
                  <Link
                    to="/admin/subscriptions"
                    className={`flex items-center gap-1.5 h-11 px-3 rounded-md transition-colors border lg:h-[26px] lg:px-2.5 ${headerBtnClass}`}
                    title={label('nav.admin')}
                  >
                    <CreditCard size={15} />
                    <span className="hidden sm:inline">{label('nav.admin')}</span>
                  </Link>
                )}
              </>
            )}
            {/* الإشعارات المركزية — يسار زر الألوان */}
            {tenantId > 0 && !isPosPage && (
              <NotificationBell tenantId={tenantId} isRtl={isRtl} lang={lang} />
            )}
            {/* Color Theme Picker */}
            <div className="relative" ref={colorPickerRef}>
              <button
                ref={colorPickerBtnRef}
                type="button"
                onClick={() => setColorPickerOpen(!colorPickerOpen)}
                className={`flex items-center gap-1.5 h-11 px-3 rounded-md transition-colors border lg:h-[26px] lg:px-2.5 ${headerBtnClass}`}
                title={t.themeColor}
              >
                <Palette size={15} />
                <span
                  className="w-4 h-4 rounded-full border border-slate-300"
                  style={{ backgroundColor: 'var(--fc-accent)' }}
                />
              </button>

              {colorPickerOpen &&
                colorPickerFixedStyle &&
                createPortal(
                  <div
                    ref={colorPickerPanelRef}
                    className="overflow-visible min-h-0"
                    style={colorPickerFixedStyle}
                  >
                    <ThemePicker onClose={() => setColorPickerOpen(false)} />
                  </div>,
                  document.body,
                )}
            </div>

            {/* Language Toggle */}
            <button
              onClick={toggleLang}
              className={`flex items-center gap-1.5 h-11 px-3 rounded-md transition-colors border lg:h-[26px] lg:px-2.5 ${headerBtnClass}`}
              title={t.switchLanguage}
            >
              <Globe size={15} />
              <span className="hidden sm:inline">{lang === 'ar' ? 'EN' : 'عربي'}</span>
            </button>

            {/* User Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className={
                  lightSidebarChrome
                    ? 'flex items-center gap-1.5 h-11 px-3 rounded-md text-sm font-medium transition-colors border text-neutral-900 hover:bg-black/[0.06] border-black/10 lg:h-[26px] lg:px-2.5'
                    : 'flex items-center gap-1.5 h-11 px-3 rounded-md text-sm font-medium transition-colors border text-white/90 hover:bg-white/10 border-white/15 lg:h-[26px] lg:px-2.5'
                }
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: 'color-mix(in srgb, var(--fc-accent) 22%, transparent)',
                    color: 'var(--fc-accent)',
                  }}
                >
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="hidden md:block text-start">
                  <p
                    className={`font-semibold text-sm leading-tight ${lightSidebarChrome ? 'text-neutral-900' : 'text-white'}`}
                  >
                    {user?.name || '—'}
                  </p>
                </div>
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''} ${
                    lightSidebarChrome ? 'text-neutral-600' : 'text-white/60'
                  }`}
                />
              </button>

              {userMenuOpen && (
                <div
                  className={`absolute top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 ${
                    isRtl ? 'left-0' : 'right-0'
                  }`}
                >
                  {/* User info */}
                  <div className="px-4 py-4 bg-gradient-to-br from-primary-50 to-slate-50 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary-600 flex items-center justify-center text-white text-lg font-bold shrink-0">
                        {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{user?.name || '—'}</p>
                        <p className="text-sm text-slate-500 truncate">{user?.email || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Tenant selector */}
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-xs text-slate-400 mb-2">{t.currentTenant}</p>
                    {tenants.length > 1 ? (
                      <select
                        value={currentTenant?.id ?? ''}
                        onChange={(e) => {
                          const id = +e.target.value
                          const t = tenants.find((x) => x.id === id)
                          if (t) setCurrentTenant(t)
                        }}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                      >
                        {tenants.map((tn) => (
                          <option key={tn.id} value={tn.id}>{tn.name}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="font-medium text-slate-700 truncate">{companyName || '—'}</p>
                    )}
                  </div>

                  {/* Menu items */}
                  <div className="py-2">
                    <button
                      onClick={() => {
                        toggleLang()
                        setUserMenuOpen(false)
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Globe size={16} className="text-slate-400 shrink-0" />
                      <span>{t.switchLanguage}</span>
                      <span className={`${isRtl ? 'mr-auto' : 'ml-auto'} text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded`}>
                        {lang === 'ar' ? 'EN' : 'عربي'}
                      </span>
                    </button>
                  </div>

                  {/* Logout */}
                  <div className="border-t border-slate-200 py-2">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false)
                        logout()
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={16} className="shrink-0" />
                      <span>{t.logout}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main
          className={`flex-1 w-full max-w-full min-w-0 min-h-0 ${isPosPage ? 'flex flex-col overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}
          style={isPosPage ? undefined : { background: 'var(--fc-page-bg)' }}
        >
          <div className={`app-main-container min-w-0 ${isPosPage ? 'flex-1 flex flex-col min-h-0' : ''} ${isRestaurantListPage ? 'py-5' : ''}`}>
          {user && !currentTenant && tenants.length > 0 && (
            <div className="mx-4 mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center gap-2">
              <Building2 size={18} className="shrink-0" />
              <span>{(t as any).accountDefaults?.ensureClientSelected ?? 'يرجى اختيار الشركة من القائمة أعلاه.'}</span>
            </div>
          )}
          <ErrorBoundary
            backHref="/dashboard"
            backLabel={(t as any).back ?? (lang === 'ar' ? 'العودة' : 'Back')}
            fallbackMessage={(t as any).msg?.errorOccurred ?? (lang === 'ar' ? 'حدث خطأ غير متوقع. يرجى العودة والمحاولة مرة أخرى.' : 'An unexpected error occurred. Please go back and try again.')}
            isRtl={isRtl}
          >
            <div className="fc-route-outlet">{children}</div>
          </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
    </DocumentTitleProvider>
  )
}
