import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Login from './pages/auth/Login'
import Dashboard from './pages/dashboard/Dashboard'
import AccountList from './pages/accounts/AccountList'
import AccountStatement from './pages/accounts/AccountStatement'
import AccountStatementSheet from './pages/accounts/AccountStatementSheet'
import FinancialTransfers from './pages/accounts/FinancialTransfers'
import CustomerList from './pages/customers/CustomerList'
import ImportCustomers from './pages/customers/ImportCustomers'
import CustomerBalances from './pages/customers/CustomerBalances'
import CustomerAging from './pages/customers/CustomerAging'
import CustomerAnalysisReport from './pages/customers/CustomerAnalysisReport'
import CustomerGroups from './pages/customers/CustomerGroups'
import ImportVendors from './pages/vendors/ImportVendors'
import VendorList from './pages/vendors/VendorList'
import VendorBalances from './pages/vendors/VendorBalances'
import VendorProfile from './pages/vendors/VendorProfile'
import VendorPurchaseAnalysisReport from './pages/vendors/VendorPurchaseAnalysisReport'
import VendorAgingReport from './pages/vendors/VendorAgingReport'
import VendorPerformanceReport from './pages/vendors/VendorPerformanceReport'
import VendorGroups from './pages/vendors/VendorGroups'
import ImportItems from './pages/items/ImportItems'
import ItemList from './pages/items/ItemList'
import ItemLedger from './pages/items/ItemLedger'
import ItemVariantsPage from './pages/items/ItemVariantsPage'
import ItemMovementPage from './pages/items/ItemMovementPage'
import ItemUnits from './pages/items/ItemUnits'
import ItemCategories from './pages/items/ItemCategories'
import ItemBrands from './pages/items/ItemBrands'
import PricingGroups from './pages/items/PricingGroups'
import StockMovements from './pages/inventory/StockMovements'
import InventoryReport from './pages/inventory/InventoryReport'
import VariantInventoryReport from './pages/inventory/VariantInventoryReport'
import ExpiryStockReport from './pages/inventory/ExpiryStockReport'
import WarehousesList from './pages/inventory/WarehousesList'
import TransferList from './pages/inventory/TransferList'
import CreateTransfer from './pages/inventory/CreateTransfer'
import TransferPrint from './pages/inventory/TransferPrint'
import LowStockAlerts from './pages/inventory/LowStockAlerts'
import InventoryAdjustmentList from './pages/inventory/InventoryAdjustmentList'
import InventoryAdjustmentForm from './pages/inventory/InventoryAdjustmentForm'
import InventoryAdjustmentViewPage from './pages/inventory/InventoryAdjustmentViewPage'
import InvoiceList from './pages/invoices/InvoiceList'
import CreateInvoice from './pages/invoices/CreateInvoice'
import InvoiceEditRedirect from './pages/invoices/InvoiceEditRedirect'
import InvoiceViewPage from './pages/invoices/InvoiceViewPage'
import InvoiceReturnPage from './pages/invoices/InvoiceReturnPage'
import ReturnsListPage from './pages/invoices/ReturnsListPage'
import PosPage from './pages/pos/PosPage'
import PosInvoiceList from './pages/invoices/PosInvoiceList'
import PosExpenseItems from './pages/pos/PosExpenseItems'
import PosExpenseCategories from './pages/pos/PosExpenseCategories'
import ShiftsReport from './pages/pos/ShiftsReport'
import CashierDailyReportPage from './pages/pos/CashierDailyReportPage'
import QuotationList from './pages/quotations/QuotationList'
import QuotationViewPage from './pages/quotations/QuotationViewPage'
import CreateQuotation from './pages/quotations/CreateQuotation'
import EditQuotation from './pages/quotations/EditQuotation'
import PurchaseRequestList from './pages/purchase-requests/PurchaseRequestList'
import CreatePurchaseRequest from './pages/purchase-requests/CreatePurchaseRequest'
import EditPurchaseRequest from './pages/purchase-requests/EditPurchaseRequest'
import JournalEntryList from './pages/journal/JournalEntryList'
import CreateJournalEntry from './pages/journal/CreateJournalEntry'
import JournalEntryEditRedirect from './pages/journal/JournalEntryEditRedirect'
import PaymentList from './pages/payments/PaymentList'
import ReceiptVouchers from './pages/payments/ReceiptVouchers'
import PaymentVouchers from './pages/payments/PaymentVouchers'
import CreateVoucher from './pages/payments/CreateVoucher'
import PaymentVoucherEditRedirect from './pages/payments/PaymentVoucherEditRedirect'
import Reports from './pages/reports/Reports'
import TrialBalance from './pages/reports/TrialBalance'
import IncomeStatement from './pages/reports/IncomeStatement'
import BalanceSheet from './pages/reports/BalanceSheet'
import ReceiptsReport from './pages/reports/ReceiptsReport'
import PaymentsReport from './pages/reports/PaymentsReport'
import TaxDeclarationReport from './pages/reports/TaxDeclarationReport'
import ItemSalesReport from './pages/reports/ItemSalesReport'
import InvoiceProfitsReport from './pages/reports/InvoiceProfitsReport'
import BranchAnnualSalesReport from './pages/reports/BranchAnnualSalesReport'
import CostCenterAnnualSalesReport from './pages/reports/CostCenterAnnualSalesReport'
import BestSellingReport from './pages/reports/BestSellingReport'
import ItemPurchasesReport from './pages/reports/ItemPurchasesReport'
import SerialNumbersInventoryReport from './pages/reports/SerialNumbersInventoryReport'
import MonthlyPurchasesAnalysisReport from './pages/reports/MonthlyPurchasesAnalysisReport'
import ExpensesReport from './pages/reports/ExpensesReport'
import PaymentMethods from './pages/settings/PaymentMethods'
import Currencies from './pages/settings/Currencies'
import Branches from './pages/settings/Branches'
import CostCenters from './pages/settings/CostCenters'
import SettingsAccounting from './pages/settings/SettingsAccounting'
import SettingsPOS from './pages/settings/SettingsPOS'
import SettingsGeneral from './pages/settings/SettingsGeneral'
import SettingsInstallments from './pages/settings/SettingsInstallments'
import SettingsMessages from './pages/settings/SettingsMessages'
import SettingsManufacturing from './pages/settings/SettingsManufacturing'
import TemplateDesignerPage from './pages/settings/TemplateDesignerPage'
import PrintTemplates from './pages/settings/PrintTemplates'
import PrintTemplateDesigner from './pages/settings/PrintTemplateDesigner'
import SettingsApiPlatform from './pages/settings/SettingsApiPlatform'
import SettingsIntegrations from './pages/settings/SettingsIntegrations'
import LoyaltySettings from './pages/loyalty/LoyaltySettings'
import LoyaltyTiers from './pages/loyalty/LoyaltyTiers'
import LoyaltyCustomers from './pages/loyalty/LoyaltyCustomers'
import PromotionsList from './pages/promotions/PromotionsList'
import PromotionForm from './pages/promotions/PromotionForm'
import PromotionReport from './pages/promotions/PromotionReport'
import TenantUserList from './pages/users/TenantUserList'
import RoleList from './pages/users/RoleList'
import AuditLogPage from './pages/users/AuditLogPage'
import OpeningStockList from './pages/openingStock/OpeningStockList'
import CreateOpeningStock from './pages/openingStock/CreateOpeningStock'
import OpeningStockDetail from './pages/openingStock/OpeningStockDetail'
import BarcodeLabelsPage from './pages/barcode/BarcodeLabelsPage'
import Layout from './components/layout/Layout'
import RestaurantPosPage from './pages/restaurant/RestaurantPosPage'
import RestaurantSalesPage from './pages/restaurant/RestaurantSalesPage'
import RestaurantTablesPage from './pages/restaurant/RestaurantTablesPage'
import RestaurantSectionsPage from './pages/restaurant/RestaurantSectionsPage'
import KitchenDisplayPage from './pages/restaurant/KitchenDisplayPage'
import MenuPublic from './pages/restaurant/MenuPublic'
import MenuBuilderPage from './pages/restaurant/MenuBuilderPage'
import SidebarDemoPage from './pages/SidebarDemoPage'
import NotFoundPage from './pages/NotFoundPage'
import RenewSubscription from './pages/subscription/RenewSubscription'
import AdminSubscriptions from './pages/admin/AdminSubscriptions'
import AdminPlans from './pages/admin/AdminPlans'
import AdminBackupReset from './pages/admin/AdminBackupReset'
import { SuperAdminGuard } from './components/superadmin/SuperAdminGuard'
import PWAInstallPrompt from './components/PWAInstallPrompt'
import BomList from './pages/manufacturing/BomList'
import BomForm from './pages/manufacturing/BomForm'
import ProductionOrderList from './pages/manufacturing/ProductionOrderList'
import ProductionOrderForm from './pages/manufacturing/ProductionOrderForm'
import SalesRepList from './pages/sales-reps/SalesRepList'
import DriverListPage from './pages/delivery/DriverListPage'
import DriverSettlementPage from './pages/delivery/DriverSettlementPage'
import DeliveryPerformanceReport from './pages/reports/DeliveryPerformanceReport'
import SalesRepSalesReport from './pages/reports/SalesRepSalesReport'
import SalesRepsMonthlyProductivityReport from './pages/reports/SalesRepsMonthlyProductivityReport'
import InstallmentList from './pages/installments/InstallmentList'
import InstallmentForm from './pages/installments/InstallmentForm'
import InstallmentDetail from './pages/installments/InstallmentDetail'
import InstallmentsStatisticsReport from './pages/installments/InstallmentsStatisticsReport'
import InstallmentsFollowUpReport from './pages/installments/InstallmentsFollowUpReport'
import InstallmentsOverdueReport from './pages/installments/InstallmentsOverdueReport'
import InstallmentsExpectedCollectionReport from './pages/installments/InstallmentsExpectedCollectionReport'
import EmployeeListPage from './pages/hr/EmployeeListPage'
import EmployeeProfilePage from './pages/hr/EmployeeProfilePage'
import AttendancePage from './pages/hr/AttendancePage'
import PayrollPage from './pages/hr/PayrollPage'
import RequestsPage from './pages/hr/RequestsPage'
import AdministrationsPage from './pages/hr/AdministrationsPage'
import DepartmentsPage from './pages/hr/DepartmentsPage'
import HrSettingsPage from './pages/hr/HrSettingsPage'
import JobTitlesPage from './pages/hr/JobTitlesPage'
import LeaveTypesPage from './pages/hr/LeaveTypesPage'
import AllowancesPage from './pages/hr/AllowancesPage'
import DeductionsPage from './pages/hr/DeductionsPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, subscriptionExpired, currentTenant } = useAuth()
  const location = useLocation()
  const isRenewPage = location.pathname === '/renew-subscription'

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (subscriptionExpired) {
    if (isRenewPage) return <RenewSubscription />
    return <Navigate to="/renew-subscription" replace />
  }

  if (!currentTenant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  return <>{children}</>
}

/** يفرض إعادة تركيب المصمم عند قالب جديد أو تغيّر المسار حتى لا تبقى حالة القالب السابق. */
function PrintTemplateDesignerRoute() {
  const location = useLocation()
  const fresh = (location.state as { fresh?: number } | null)?.fresh ?? ''
  const routeKey = `${location.pathname}?${location.search}&f=${fresh}`
  return <PrintTemplateDesigner key={routeKey} />
}

function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true }}>
      <LanguageProvider>
      <ThemeProvider>
      <AuthProvider>
        <PWAInstallPrompt />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/menu/:slug" element={<MenuPublic />} />
          <Route path="/renew-subscription" element={<ProtectedRoute><RenewSubscription /></ProtectedRoute>} />
          <Route path="/sidebar-demo" element={<ProtectedRoute><SidebarDemoPage /></ProtectedRoute>} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/accounts" element={<AccountList />} />
                    <Route path="/accounts/statement/sheet" element={<AccountStatementSheet />} />
                    <Route path="/accounts/statement" element={<AccountStatement />} />
                    <Route path="/financial-transfers" element={<FinancialTransfers />} />
                    <Route path="/customers/import" element={<ImportCustomers />} />
                    <Route path="/customers" element={<CustomerList />} />
                    <Route path="/customers/balances" element={<CustomerBalances />} />
                    <Route path="/customers/aging" element={<CustomerAging />} />
                    <Route path="/customers/analysis" element={<CustomerAnalysisReport />} />
                    <Route path="/customer-groups" element={<CustomerGroups />} />
                    <Route path="/vendors/import" element={<ImportVendors />} />
                    <Route path="/vendors" element={<VendorList />} />
                    <Route path="/vendors/balances" element={<VendorBalances />} />
                    <Route path="/vendors/analysis" element={<VendorPurchaseAnalysisReport />} />
                    <Route path="/vendors/aging" element={<VendorAgingReport />} />
                    <Route path="/vendors/performance" element={<VendorPerformanceReport />} />
                    <Route path="/vendor-groups" element={<VendorGroups />} />
                    <Route path="/vendors/:id" element={<VendorProfile />} />
                    <Route path="/items/import" element={<ImportItems />} />
                    <Route path="/items" element={<ItemList />} />
                    <Route path="/items/movements" element={<ItemMovementPage />} />
                    <Route path="/items/variants" element={<ItemVariantsPage />} />
                    <Route path="/items/:id/ledger" element={<ItemLedger />} />
                    <Route path="/item-units" element={<ItemUnits />} />
                    <Route path="/item-categories" element={<ItemCategories />} />
                    <Route path="/item-brands" element={<ItemBrands />} />
                    <Route path="/pricing-groups" element={<PricingGroups />} />
                    <Route path="/warehouses" element={<WarehousesList />} />
                    <Route path="/inventory/transfers" element={<TransferList />} />
                    <Route path="/inventory/transfers/create" element={<CreateTransfer />} />
                    <Route path="/inventory/transfers/:id/edit" element={<CreateTransfer />} />
                    <Route path="/inventory/transfers/:id/print" element={<TransferPrint />} />
                    <Route path="/inventory/low-stock" element={<LowStockAlerts />} />
                    <Route path="/inventory/adjustments" element={<InventoryAdjustmentList />} />
                    <Route path="/inventory/adjustments/create" element={<InventoryAdjustmentForm />} />
                    <Route path="/inventory/adjustments/edit/:id" element={<InventoryAdjustmentForm />} />
                    <Route path="/inventory/adjustments/view/:id" element={<InventoryAdjustmentViewPage />} />
                    <Route path="/stock-movements" element={<StockMovements />} />
                    <Route path="/inventory-report" element={<InventoryReport />} />
                    <Route path="/inventory/variant-report" element={<VariantInventoryReport />} />
                    <Route path="/inventory/expiry-stock-report" element={<ExpiryStockReport />} />
                    <Route path="/opening-stock" element={<OpeningStockList />} />
                    <Route path="/opening-stock/create" element={<CreateOpeningStock />} />
                    <Route path="/opening-stock/:id" element={<OpeningStockDetail />} />
                    <Route path="/barcode-labels" element={<BarcodeLabelsPage />} />
                    <Route path="/invoices" element={<Navigate to="/invoices/sales" replace />} />
                    <Route path="/invoices/create" element={<CreateInvoice />} />
                    <Route path="/invoices/edit/:id" element={<InvoiceEditRedirect />} />
                    <Route path="/invoices/view/:id" element={<InvoiceViewPage />} />
                    <Route path="/invoices/return/:id" element={<InvoiceReturnPage />} />
                    <Route path="/invoices/sales-returns" element={<ReturnsListPage returnType="sales" />} />
                    <Route path="/invoices/purchase-returns" element={<ReturnsListPage returnType="purchase" />} />
                    <Route path="/invoices/pos" element={<PosPage />} />
                    <Route path="/invoices/pos-list" element={<PosInvoiceList />} />
                    <Route path="/pos/expense-items" element={<PosExpenseItems />} />
                    <Route path="/pos/expense-categories" element={<PosExpenseCategories />} />
                    <Route path="/pos/shifts-report" element={<ShiftsReport />} />
                    <Route path="/pos/shifts/:shiftId/daily-report" element={<CashierDailyReportPage />} />
                    <Route path="/pos/cashier/today" element={<CashierDailyReportPage />} />
                    <Route path="/restaurant/pos" element={<RestaurantPosPage />} />
                    <Route path="/restaurant/sales" element={<RestaurantSalesPage />} />
                    <Route path="/restaurant/tables" element={<RestaurantTablesPage />} />
                    <Route path="/restaurant/sections" element={<RestaurantSectionsPage />} />
                    <Route path="/restaurant/kitchen" element={<KitchenDisplayPage />} />
                    <Route path="/restaurant/menu" element={<MenuBuilderPage />} />
                    <Route path="/purchase-requests" element={<PurchaseRequestList />} />
                    <Route path="/purchase-requests/create" element={<CreatePurchaseRequest />} />
                    <Route path="/purchase-requests/edit/:id" element={<EditPurchaseRequest />} />
                    <Route path="/manufacturing/bom" element={<BomList />} />
                    <Route path="/manufacturing/bom/create" element={<BomForm />} />
                    <Route path="/manufacturing/bom/edit/:id" element={<BomForm />} />
                    <Route path="/manufacturing/production-orders" element={<ProductionOrderList />} />
                    <Route path="/manufacturing/production-orders/create" element={<ProductionOrderForm />} />
                    <Route path="/manufacturing/production-orders/:id" element={<ProductionOrderForm />} />
                    <Route path="/invoices/quotations" element={<QuotationList />} />
                    <Route path="/invoices/quotations/create" element={<CreateQuotation />} />
                    <Route path="/invoices/quotations/edit/:id" element={<EditQuotation />} />
                    <Route path="/invoices/quotations/:id" element={<QuotationViewPage />} />
                    <Route path="/invoices/:type" element={<InvoiceList />} />
                    <Route path="/journal-entries" element={<JournalEntryList />} />
                    <Route path="/fiscal-years/close" element={<Navigate to="/settings/accounting?tab=fiscal_close&view=wizard" replace />} />
                    <Route path="/fiscal-years" element={<Navigate to="/settings/accounting?tab=fiscal_close&view=list" replace />} />
                    <Route path="/journal-entries/create" element={<CreateJournalEntry />} />
                    <Route path="/journal-entries/edit/:id" element={<JournalEntryEditRedirect />} />
                    <Route path="/receipt-vouchers" element={<ReceiptVouchers />} />
                    <Route path="/payment-vouchers" element={<PaymentVouchers />} />
                    <Route path="/payments/create-voucher" element={<CreateVoucher />} />
                    <Route path="/payments/:voucherId/edit" element={<PaymentVoucherEditRedirect />} />
                    <Route path="/payments" element={<PaymentList />} />
                    <Route path="/payment-methods" element={<PaymentMethods />} />
                    <Route path="/currencies" element={<Currencies />} />
                    <Route path="/branches" element={<Branches />} />
                    <Route path="/cost-centers" element={<CostCenters />} />
                    <Route path="/account-defaults" element={<Navigate to="/settings/accounting?tab=defaults" replace />} />
                    <Route path="/settings" element={<Navigate to="/settings/accounting" replace />} />
                    <Route path="/settings/accounting" element={<SettingsAccounting />} />
                    <Route path="/settings/templates/design" element={<TemplateDesignerPage />} />
                    <Route path="/settings/templates/design/:id" element={<TemplateDesignerPage />} />
                    {/* قالب جديد: مسار ثابت بدون :id — يجب أن يكون قبل المسار الديناميكي */}
                    <Route path="/settings/print-templates/designer" element={<PrintTemplateDesignerRoute />} />
                    <Route path="/settings/print-templates/designer/new" element={<Navigate to="/settings/print-templates/designer" replace />} />
                    {/* لا تستخدم :id(\\d+) — compilePath في RR6 لا يدعمها فيُفسَّد التعبير ولا يطابق المسار */}
                    <Route path="/settings/print-templates/designer/:id" element={<PrintTemplateDesignerRoute />} />
                    <Route path="/settings/print-templates/new" element={<Navigate to="/settings/print-templates/designer" replace />} />
                    <Route path="/settings/print-templates" element={<PrintTemplates />} />
                    <Route path="/settings/pos" element={<SettingsPOS />} />
                    <Route path="/settings/manufacturing" element={<SettingsManufacturing />} />
                    <Route path="/settings/general" element={<SettingsGeneral />} />
                    <Route path="/settings/installments" element={<SettingsInstallments />} />
                    <Route path="/settings/messages" element={<SettingsMessages />} />
                    <Route path="/settings/api" element={<SettingsApiPlatform />} />
                    <Route path="/settings/integrations" element={<SettingsIntegrations />} />
                    <Route path="/loyalty/settings" element={<LoyaltySettings />} />
                    <Route path="/loyalty/programs/:programId/tiers" element={<LoyaltyTiers />} />
                    <Route path="/loyalty/tiers" element={<LoyaltyTiers />} />
                    <Route path="/loyalty/customers" element={<LoyaltyCustomers />} />
                    <Route path="/promotions" element={<PromotionsList />} />
                    <Route path="/promotions/report" element={<PromotionReport />} />
                    <Route path="/promotions/new" element={<PromotionForm />} />
                    <Route path="/promotions/:id/edit" element={<PromotionForm />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/reports/trial-balance" element={<TrialBalance />} />
                    <Route path="/reports/income-statement" element={<IncomeStatement />} />
                    <Route path="/reports/balance-sheet" element={<BalanceSheet />} />
                    <Route path="/reports/receipts" element={<ReceiptsReport />} />
                    <Route path="/reports/payments" element={<PaymentsReport />} />
                    <Route path="/reports/tax-declaration" element={<TaxDeclarationReport />} />
                    <Route path="/reports/item-sales" element={<ItemSalesReport />} />
                    <Route path="/reports/invoice-profits" element={<InvoiceProfitsReport />} />
                    <Route path="/reports/branch-sales-annual" element={<BranchAnnualSalesReport />} />
                    <Route path="/reports/cost-center-sales-annual" element={<CostCenterAnnualSalesReport />} />
                    <Route path="/reports/best-selling" element={<BestSellingReport />} />
                    <Route path="/reports/item-purchases" element={<ItemPurchasesReport />} />
                    <Route path="/reports/serial-numbers-inventory" element={<SerialNumbersInventoryReport />} />
                    <Route path="/reports/monthly-purchases-analysis" element={<MonthlyPurchasesAnalysisReport />} />
                    <Route path="/reports/expenses" element={<ExpensesReport />} />
                    <Route path="/reports/sales-rep-sales" element={<SalesRepSalesReport />} />
                    <Route path="/reports/sales-reps-monthly-productivity" element={<SalesRepsMonthlyProductivityReport />} />
                    <Route path="/sales-reps" element={<SalesRepList />} />
                    <Route path="/delivery/drivers" element={<DriverListPage />} />
                    <Route path="/delivery/settlement" element={<DriverSettlementPage />} />
                    <Route path="/reports/delivery-performance" element={<DeliveryPerformanceReport />} />
                    <Route path="/installments/reports/statistics" element={<InstallmentsStatisticsReport />} />
                    <Route path="/installments/reports/follow-up" element={<InstallmentsFollowUpReport />} />
                    <Route path="/installments/reports/overdue" element={<InstallmentsOverdueReport />} />
                    <Route path="/installments/reports/expected-collection" element={<InstallmentsExpectedCollectionReport />} />
                    <Route path="/installments/create" element={<InstallmentForm />} />
                    <Route path="/installments/:id/edit" element={<InstallmentForm />} />
                    <Route path="/installments/:id" element={<InstallmentDetail />} />
                    <Route path="/installments" element={<InstallmentList />} />
                    <Route path="/hr/employees" element={<EmployeeListPage />} />
                    <Route path="/hr/employees/new" element={<EmployeeProfilePage />} />
                    <Route path="/hr/employees/:id" element={<EmployeeProfilePage />} />
                    <Route path="/hr/attendance" element={<AttendancePage />} />
                    <Route path="/hr/payroll" element={<PayrollPage />} />
                    <Route path="/hr/requests" element={<RequestsPage />} />
                    <Route path="/hr/administrations" element={<AdministrationsPage />} />
                    <Route path="/hr/departments" element={<DepartmentsPage />} />
                    <Route path="/hr/job-titles" element={<JobTitlesPage />} />
                    <Route path="/hr/leave-types" element={<LeaveTypesPage />} />
                    <Route path="/hr/allowances" element={<AllowancesPage />} />
                    <Route path="/hr/deductions" element={<DeductionsPage />} />
                    <Route path="/hr/settings" element={<HrSettingsPage />} />
                    <Route path="/tenant-users" element={<TenantUserList />} />
                    <Route path="/roles" element={<RoleList />} />
                    <Route path="/audit-log" element={<AuditLogPage />} />
                    <Route path="/admin/subscriptions" element={<AdminSubscriptions />} />
                    <Route path="/admin/plans" element={<AdminPlans />} />
                    <Route
                      path="/admin/backup-reset"
                      element={
                        <SuperAdminGuard>
                          <AdminBackupReset />
                        </SuperAdminGuard>
                      }
                    />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
      </ThemeProvider>
      </LanguageProvider>
    </BrowserRouter>
  )
}

export default App
