/**
 * Maps pathname patterns to i18n title keys for document.title.
 * Order matters: first matching rule wins. More specific paths should come first.
 */
export interface RouteTitleRule {
  /** Exact path or path with :param (e.g. /invoices/edit/:id). Match is prefix or exact. */
  path: string
  /** Key in translations (e.g. nav.dashboard, invoices.editInvoice) */
  titleKey: string
}

const APP_SUFFIX = ' | FIRST CLICK'

export const DOCUMENT_TITLE_SUFFIX = APP_SUFFIX

/** Route → title key. For dynamic segments we use a base title; pages can override via useDocumentTitle(). */
export const ROUTE_TITLE_RULES: RouteTitleRule[] = [
  { path: '/', titleKey: 'nav.dashboard' },
  { path: '/dashboard', titleKey: 'nav.dashboard' },
  { path: '/accounts/statement/sheet', titleKey: 'nav.accountStatement' },
  { path: '/accounts/statement', titleKey: 'nav.accountStatement' },
  { path: '/accounts', titleKey: 'nav.chartOfAccounts' },
  { path: '/financial-transfers', titleKey: 'nav.financialTransfers' },
  { path: '/journal-entries/create', titleKey: 'journal.createEntry' },
  { path: '/journal-entries/edit', titleKey: 'journal.title' },
  { path: '/journal-entries', titleKey: 'nav.journalEntries' },
  { path: '/fiscal-years/close', titleKey: 'fiscalYearClose.pageTitle' },
  { path: '/fiscal-years', titleKey: 'nav.fiscalYears' },
  { path: '/receipt-vouchers', titleKey: 'nav.receiptVouchers' },
  { path: '/payment-vouchers', titleKey: 'nav.paymentVouchers' },
  { path: '/payment-methods', titleKey: 'nav.paymentMethods' },
  { path: '/currencies', titleKey: 'nav.currencies' },
  { path: '/branches', titleKey: 'nav.branches' },
  { path: '/cost-centers', titleKey: 'nav.costCenters' },
  { path: '/customers', titleKey: 'nav.addCustomer' },
  { path: '/customers/balances', titleKey: 'nav.customerBalances' },
  { path: '/customers/aging', titleKey: 'nav.customerAging' },
  { path: '/customers/analysis', titleKey: 'nav.customerAnalysis' },
  { path: '/customer-groups', titleKey: 'nav.customerGroups' },
  { path: '/vendors', titleKey: 'nav.addVendor' },
  { path: '/vendors/balances', titleKey: 'nav.vendorBalances' },
  { path: '/vendors/analysis', titleKey: 'nav.vendorPurchaseAnalysis' },
  { path: '/vendors/aging', titleKey: 'nav.vendorAging' },
  { path: '/vendors/performance', titleKey: 'nav.vendorPerformance' },
  { path: '/vendor-groups', titleKey: 'nav.vendorGroups' },
  { path: '/vendors/:id', titleKey: 'nav.vendors' },
  { path: '/items/movements', titleKey: 'nav.itemMovement' },
  { path: '/items', titleKey: 'nav.items' },
  { path: '/item-units', titleKey: 'nav.itemUnits' },
  { path: '/item-categories', titleKey: 'nav.itemCategories' },
  { path: '/item-brands', titleKey: 'nav.itemBrands' },
  { path: '/pricing-groups', titleKey: 'nav.pricingGroups' },
  { path: '/warehouses', titleKey: 'nav.warehouses' },
  { path: '/inventory/transfers', titleKey: 'nav.transfers' },
  { path: '/inventory/adjustments/create', titleKey: 'nav.inventoryAdjustmentNew' },
  { path: '/inventory/adjustments/edit', titleKey: 'nav.inventoryAdjustment' },
  { path: '/inventory/adjustments/view', titleKey: 'nav.inventoryAdjustment' },
  { path: '/inventory/adjustments', titleKey: 'nav.inventoryAdjustmentsList' },
  { path: '/inventory/low-stock', titleKey: 'nav.lowStockAlerts' },
  { path: '/stock-movements', titleKey: 'nav.stockMovements' },
  { path: '/reports/serial-numbers-inventory', titleKey: 'nav.serialNumbersInventoryReport' },
  { path: '/inventory-report', titleKey: 'nav.inventoryReport' },
  { path: '/inventory/variant-report', titleKey: 'nav.variantInventoryReport' },
  { path: '/inventory/expiry-stock-report', titleKey: 'nav.expiryStockReport' },
  { path: '/opening-stock/create', titleKey: 'openingStock.new' },
  { path: '/opening-stock', titleKey: 'nav.openingStock' },
  { path: '/invoices/create', titleKey: 'invoices.newInvoice' },
  { path: '/invoices/edit', titleKey: 'invoices.editInvoice' },
  { path: '/invoices/view', titleKey: 'invoices.viewInvoice' },
  { path: '/invoices/return', titleKey: 'invoices.returnInvoice' },
  { path: '/invoices/sales-returns', titleKey: 'nav.salesReturns' },
  { path: '/invoices/purchase-returns', titleKey: 'nav.purchaseReturns' },
  { path: '/invoices/pos', titleKey: 'nav.posInvoices' },
  { path: '/restaurant/pos', titleKey: 'nav.restaurantPos' },
  { path: '/restaurant/sales', titleKey: 'nav.restaurantSales' },
  { path: '/restaurant/tables', titleKey: 'nav.restaurantTables' },
  { path: '/restaurant/sections', titleKey: 'nav.restaurantSections' },
  { path: '/restaurant/kitchen', titleKey: 'nav.kitchenDisplay' },
  { path: '/restaurant/menu', titleKey: 'nav.restaurantMenu' },
  { path: '/invoices/sales', titleKey: 'nav.salesInvoices' },
  { path: '/invoices/purchases', titleKey: 'nav.purchaseInvoices' },
  { path: '/invoices/quotations', titleKey: 'nav.quotations' },
  { path: '/invoices', titleKey: 'invoices.title' },
  { path: '/payments', titleKey: 'nav.payments' },
  { path: '/reports/best-selling', titleKey: 'nav.bestSelling' },
  { path: '/reports/item-sales', titleKey: 'nav.itemSalesReport' },
  { path: '/reports/invoice-profits', titleKey: 'nav.invoiceProfitsReport' },
  { path: '/reports/trial-balance', titleKey: 'reports.trialBalance' },
  { path: '/reports/balance-sheet', titleKey: 'reports.balanceSheet' },
  { path: '/reports/income-statement', titleKey: 'reports.incomeStatement' },
  { path: '/reports/receipts', titleKey: 'reports.receiptsReport' },
  { path: '/reports/payments', titleKey: 'reports.paymentsReport' },
  { path: '/reports/tax-declaration', titleKey: 'reports.taxDeclaration' },
  { path: '/reports/item-purchases', titleKey: 'nav.itemPurchasesReport' },
  { path: '/reports/monthly-purchases-analysis', titleKey: 'nav.monthlyPurchasesAnalysisReport' },
  { path: '/reports/expenses', titleKey: 'reports.expensesReport' },
  { path: '/pos/expense-items', titleKey: 'nav.posExpenseItems' },
  { path: '/pos/expense-categories', titleKey: 'nav.posExpenseCategories' },
  { path: '/pos/shifts-report', titleKey: 'nav.posShiftsReport' },
  { path: '/pos/cashier/today', titleKey: 'nav.cashierDaily' },
  { path: '/pos/shifts', titleKey: 'nav.cashierDaily' },
  { path: '/hr/employees', titleKey: 'nav.hrEmployees' },
  { path: '/hr/attendance', titleKey: 'nav.hrAttendance' },
  { path: '/hr/payroll', titleKey: 'nav.hrPayroll' },
  { path: '/hr/requests', titleKey: 'nav.hrRequests' },
  { path: '/hr/administrations', titleKey: 'nav.hrAdministrations' },
  { path: '/hr/departments', titleKey: 'nav.hrDepartments' },
  { path: '/hr/job-titles', titleKey: 'nav.hrJobTitles' },
  { path: '/hr/leave-types', titleKey: 'nav.hrLeaveTypes' },
  { path: '/hr/allowances', titleKey: 'nav.hrAllowances' },
  { path: '/hr/deductions', titleKey: 'nav.hrDeductions' },
  { path: '/hr/settings', titleKey: 'nav.hrSettings' },
  { path: '/reports/sales-rep-sales', titleKey: 'nav.salesRepSalesReport' },
  { path: '/reports/sales-reps-monthly-productivity', titleKey: 'nav.salesRepsMonthlyProductivityReport' },
  { path: '/reports', titleKey: 'nav.reports' },
  // Manufacturing
  { path: '/manufacturing/bom/create', titleKey: 'nav.bom' },
  { path: '/manufacturing/bom/edit', titleKey: 'nav.bom' },
  { path: '/manufacturing/bom', titleKey: 'nav.bom' },
  { path: '/manufacturing/production-orders/create', titleKey: 'nav.productionOrders' },
  { path: '/manufacturing/production-orders', titleKey: 'nav.productionOrders' },
  { path: '/delivery/drivers', titleKey: 'nav.deliveryDrivers' },
  { path: '/delivery/settlement', titleKey: 'nav.deliverySettlement' },
  { path: '/reports/delivery-performance', titleKey: 'nav.deliveryPerformanceReport' },
  { path: '/sales-reps', titleKey: 'nav.salesRepsList' },
  { path: '/tenant-users', titleKey: 'nav.users' },
  { path: '/roles', titleKey: 'nav.roles' },
  { path: '/audit-log', titleKey: 'nav.auditLog' },
  { path: '/settings/accounting', titleKey: 'nav.settingsAccounting' },
  { path: '/settings/pos', titleKey: 'nav.settingsPOS' },
  { path: '/settings/manufacturing', titleKey: 'nav.settingsManufacturing' },
  { path: '/settings/general', titleKey: 'nav.settingsGeneral' },
  { path: '/settings/messages', titleKey: 'nav.settingsMessages' },
  { path: '/settings/api', titleKey: 'apiPlatform.pageTitle' },
  { path: '/settings/integrations', titleKey: 'apiPlatform.integrationsTitle' },
  { path: '/settings', titleKey: 'nav.settings' },
  { path: '/admin/subscriptions', titleKey: 'nav.subscriptions' },
  { path: '/admin/plans', titleKey: 'nav.plans' },
]

/**
 * Returns the i18n title key for the given pathname (first matching rule).
 */
export function getTitleKeyForPath(pathname: string): string {
  const normalized = pathname.replace(/\/$/, '') || '/'
  for (const rule of ROUTE_TITLE_RULES) {
    const path = rule.path.replace(/\/$/, '') || '/'
    if (normalized === path || (path !== '/' && normalized.startsWith(path + '/'))) {
      return rule.titleKey
    }
  }
  return 'appName'
}
