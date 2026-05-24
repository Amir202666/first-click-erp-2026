<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AccountDefaultsController;
use App\Http\Controllers\Api\AdminPlanController;
use App\Http\Controllers\Api\AdminSubscriptionController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BomController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\CostCenterController;
use App\Http\Controllers\Api\CurrencyController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\CustomerGroupController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DeliveryController;
use App\Http\Controllers\Api\DeliveryDriverController;
use App\Http\Controllers\Api\DocumentTemplateController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\FiscalYearController;
use App\Http\Controllers\Api\HrCompensationController;
use App\Http\Controllers\Api\HrOrgController;
use App\Http\Controllers\Api\HrRequestController;
use App\Http\Controllers\Api\HrSettingsController;
use App\Http\Controllers\Api\InstallmentController;
use App\Http\Controllers\Api\IntegrationApiKeyController;
use App\Http\Controllers\Api\IntegrationWebhookController;
use App\Http\Controllers\Api\InventoryAdjustmentController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\ItemSettingsController;
use App\Http\Controllers\Api\JournalEntryController;
use App\Http\Controllers\Api\KitchenTicketController;
use App\Http\Controllers\Api\LoyaltyController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\OpeningStockController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PrintTemplateController;
use App\Http\Controllers\Api\PaymentMethodController;
use App\Http\Controllers\Api\PayrollController;
use App\Http\Controllers\Api\PermissionController;
use App\Http\Controllers\Api\PosController;
use App\Http\Controllers\Api\PosShiftReportController;
use App\Http\Controllers\Api\CashierDailyReportController;
use App\Http\Controllers\Api\PosRestaurantController;
use App\Http\Controllers\Api\PricingGroupController;
use App\Http\Controllers\Api\ProductionOrderController;
use App\Http\Controllers\Api\PurchaseRequestController;
use App\Http\Controllers\Api\QuotationController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\PublicMenuController;
use App\Http\Controllers\Api\RestaurantMenuController;
use App\Http\Controllers\Api\RestaurantSectionController;
use App\Http\Controllers\Api\RestaurantTableController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SalesRepController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\TenantController;
use App\Http\Controllers\Api\TenantUserController;
use App\Http\Controllers\Api\TransferController;
use App\Http\Controllers\Api\V1\InventoryController as V1InventoryController;
use App\Http\Controllers\Api\V1\OrderController as V1OrderController;
use App\Http\Controllers\Api\V1\ProductController as V1ProductController;
use App\Http\Controllers\Api\VendorController;
use App\Http\Controllers\Api\VendorGroupController;
use App\Http\Controllers\Api\WarehouseController;
use Illuminate\Support\Facades\Route;

// ──── Health (لا يحتاج تسجيل دخول، للتحقق من أن الخادم يعمل)
Route::get('/health', fn () => response()->json(['ok' => true]));

// ──── Public integration API (مفتاح X-API-Key، بدون جلسة مستخدم) ────
Route::prefix('v1')->middleware(['throttle:1000,1', 'api.key'])->group(function () {
    Route::get('/products', [V1ProductController::class, 'index']);
    Route::get('/products/{id}', [V1ProductController::class, 'show']);
    Route::post('/orders', [V1OrderController::class, 'store']);
    Route::post('/orders/{id}/fulfill', [V1OrderController::class, 'fulfill']);
    Route::get('/inventory', [V1InventoryController::class, 'index']);
    Route::post('/inventory/adjust', [V1InventoryController::class, 'adjust']);
});

// ──── Auth (Public) ────
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:5,1');

// ──── Public restaurant menu (QR — بدون auth) ────
Route::prefix('public/menu')->group(function () {
    Route::get('/{slug}', [PublicMenuController::class, 'show']);
    Route::post('/{slug}/orders', [PublicMenuController::class, 'placeOrder']);
    Route::get('/{slug}/orders/{orderNumber}', [PublicMenuController::class, 'trackOrder']);
});

// ──── Auth (Protected) ────
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);
    Route::get('/tenants', [TenantController::class, 'index']);

    // إدارة الاشتراكات (للمشرف العام فقط — لا يتطلب X-Tenant-ID)
    Route::prefix('admin')->middleware('super_admin')->group(function () {
        Route::get('/subscriptions', [AdminSubscriptionController::class, 'index']);
        Route::get('/subscriptions/plans', [AdminSubscriptionController::class, 'plans']);
        Route::put('/subscriptions/{tenantId}', [AdminSubscriptionController::class, 'update']);
        Route::post('/subscriptions/tenants', [AdminSubscriptionController::class, 'storeTenant']);
        Route::patch('/subscriptions/tenants/{tenantId}/toggle-active', [AdminSubscriptionController::class, 'toggleTenantActive']);
        Route::get('/plans', [AdminPlanController::class, 'index']);
        Route::post('/plans', [AdminPlanController::class, 'store']);
        Route::put('/plans/{id}', [AdminPlanController::class, 'update']);
    });

    // ──── Tenant-Scoped Routes (عزل بيانات: المستأجر من الهيدر فقط، منع الحقن من الرابط) ────
    // Important: enforce_tenant must run BEFORE tenant, otherwise tenant_id gets merged first.
    Route::middleware(['enforce_tenant', 'tenant', 'check_subscription', 'check_plan_features'])->group(function () {

        Route::get('/me', [AuthController::class, 'me']);

        // الإشعارات المركزية
        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
        Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
        Route::post('/notifications/{id}/read', [NotificationController::class, 'markAsRead']);

        // إعدادات الحسابات الافتراضية (للربط التلقائي بعمليات البيع/الشراء)
        Route::get('/account-defaults', [AccountDefaultsController::class, 'show']);
        Route::put('/account-defaults', [AccountDefaultsController::class, 'update']);

        // إعدادات الشريك (محاسبة، نقطة بيع، عام) Key-Value مع كاش
        Route::get('/settings', [SettingsController::class, 'index']);
        Route::put('/settings', [SettingsController::class, 'update']);
        Route::post('/settings/upload-company-logo', [SettingsController::class, 'uploadCompanyLogo']);

        // منصة التكامل (مفاتيح API و Webhooks)
        Route::get('/integration-api-keys', [IntegrationApiKeyController::class, 'index']);
        Route::post('/integration-api-keys', [IntegrationApiKeyController::class, 'store']);
        Route::delete('/integration-api-keys/{id}', [IntegrationApiKeyController::class, 'destroy']);
        Route::get('/integration-webhooks', [IntegrationWebhookController::class, 'index']);
        Route::post('/integration-webhooks', [IntegrationWebhookController::class, 'store']);
        Route::delete('/integration-webhooks/{id}', [IntegrationWebhookController::class, 'destroy']);

        // قوالب المستندات (فواتير، سندات، ... )
        Route::get('/document-templates', [DocumentTemplateController::class, 'index']);
        Route::post('/document-templates/convert-php', [DocumentTemplateController::class, 'convertPhpSerialized']);
        Route::get('/document-templates/{id}', [DocumentTemplateController::class, 'show']);
        Route::post('/document-templates', [DocumentTemplateController::class, 'store']);
        Route::put('/document-templates/{id}', [DocumentTemplateController::class, 'update']);
        Route::delete('/document-templates/{id}', [DocumentTemplateController::class, 'destroy']);

        // قوالب الطباعة (A4 / حراري / HTML)
        Route::prefix('print-templates')->group(function () {
            Route::get('/', [PrintTemplateController::class, 'index']);
            Route::post('/', [PrintTemplateController::class, 'store']);
            Route::get('/default/{type}', [PrintTemplateController::class, 'getDefault']);
            Route::post('/seed', [PrintTemplateController::class, 'seedDefaults']);
            Route::post('/clear', [PrintTemplateController::class, 'clearAll']);
            Route::get('/{id}', [PrintTemplateController::class, 'show']);
            Route::put('/{id}', [PrintTemplateController::class, 'update']);
            Route::delete('/{id}', [PrintTemplateController::class, 'destroy']);
            Route::put('/{id}/set-default', [PrintTemplateController::class, 'setDefault']);
            Route::post('/{id}/duplicate', [PrintTemplateController::class, 'duplicate']);
        });

        // Dashboard
        Route::get('/dashboard', [DashboardController::class, 'index']);

        // Chart of Accounts
        Route::get('/accounts', [AccountController::class, 'index']);
        Route::get('/accounts/tree', [AccountController::class, 'tree']);
        Route::get('/accounts/next-code', [AccountController::class, 'nextCode']);
        Route::get('/accounts/export', [AccountController::class, 'export']);
        Route::post('/accounts/import', [AccountController::class, 'import']);
        Route::post('/accounts/import-wizard', [AccountController::class, 'importWizard']);
        Route::post('/accounts', [AccountController::class, 'store']);
        Route::get('/accounts/{id}', [AccountController::class, 'show']);
        Route::put('/accounts/{id}', [AccountController::class, 'update']);
        Route::delete('/accounts/{id}', [AccountController::class, 'destroy'])->middleware('permission:accounts.delete');

        // Journal Entries
        Route::get('/journal-entries', [JournalEntryController::class, 'index']);
        Route::post('/journal-entries', [JournalEntryController::class, 'store']);
        Route::get('/journal-entries/{id}', [JournalEntryController::class, 'show']);
        Route::put('/journal-entries/{id}', [JournalEntryController::class, 'update']);
        Route::delete('/journal-entries/{id}', [JournalEntryController::class, 'destroy']);
        Route::post('/journal-entries/{id}/void', [JournalEntryController::class, 'void']);
        Route::post('/journal-entries/{id}/unpost', [JournalEntryController::class, 'unpost']);
        Route::post('/journal-entries/{id}/post', [JournalEntryController::class, 'post']);

        Route::get('/fiscal-years', [FiscalYearController::class, 'index'])->middleware('permission:fiscal_years.view');
        Route::get('/fiscal-years/equity-accounts', [FiscalYearController::class, 'equityAccounts'])->middleware('permission:fiscal_years.close');
        Route::get('/fiscal-years/{id}', [FiscalYearController::class, 'show'])->middleware('permission:fiscal_years.view');
        Route::get('/fiscal-years/{id}/pre-close-checks', [FiscalYearController::class, 'preCloseChecks'])->middleware('permission:fiscal_years.close');
        Route::get('/fiscal-years/{id}/preview-closing-entry', [FiscalYearController::class, 'previewClosingEntry'])->middleware('permission:fiscal_years.close');
        Route::post('/fiscal-years/{id}/close', [FiscalYearController::class, 'close'])->middleware('permission:fiscal_years.close');
        Route::patch('/fiscal-years/{id}/lock', [FiscalYearController::class, 'setLock'])->middleware('permission:fiscal_years.lock');

        // Customers (party-search قبل apiResource حتى لا يُفسَّر quick-search كـ {customer})
        Route::post('/customers/party-search', [CustomerController::class, 'partySearch']);
        Route::apiResource('customers', CustomerController::class);

        // Customer Groups
        Route::get('/customer-groups', [CustomerGroupController::class, 'index']);
        Route::post('/customer-groups', [CustomerGroupController::class, 'store']);
        Route::put('/customer-groups/{id}', [CustomerGroupController::class, 'update']);
        Route::delete('/customer-groups/{id}', [CustomerGroupController::class, 'destroy']);

        // Pricing Groups (مجموعات التسعير)
        Route::get('/pricing-groups', [PricingGroupController::class, 'index']);
        Route::post('/pricing-groups', [PricingGroupController::class, 'store']);
        Route::put('/pricing-groups/{id}', [PricingGroupController::class, 'update']);
        Route::delete('/pricing-groups/{id}', [PricingGroupController::class, 'destroy']);

        // Vendors
        Route::post('/vendors/party-search', [VendorController::class, 'partySearch']);
        Route::apiResource('vendors', VendorController::class);
        Route::get('/vendor-groups', [VendorGroupController::class, 'index']);
        Route::post('/vendor-groups', [VendorGroupController::class, 'store']);
        Route::put('/vendor-groups/{id}', [VendorGroupController::class, 'update']);
        Route::delete('/vendor-groups/{id}', [VendorGroupController::class, 'destroy']);

        // Item Settings (Units, Brands, Categories)
        Route::get('/item-units', [ItemSettingsController::class, 'units']);
        Route::post('/item-units', [ItemSettingsController::class, 'storeUnit']);
        Route::put('/item-units/{id}', [ItemSettingsController::class, 'updateUnit']);
        Route::delete('/item-units/{id}', [ItemSettingsController::class, 'destroyUnit']);

        Route::get('/item-brands', [ItemSettingsController::class, 'brands']);
        Route::post('/item-brands', [ItemSettingsController::class, 'storeBrand']);
        Route::put('/item-brands/{id}', [ItemSettingsController::class, 'updateBrand']);
        Route::delete('/item-brands/{id}', [ItemSettingsController::class, 'destroyBrand']);

        Route::get('/item-categories', [ItemSettingsController::class, 'categories']);
        Route::post('/item-categories', [ItemSettingsController::class, 'storeCategory']);
        Route::put('/item-categories/{id}', [ItemSettingsController::class, 'updateCategory']);
        Route::delete('/item-categories/{id}', [ItemSettingsController::class, 'destroyCategory']);

        Route::get('/item-attribute-templates', [ItemSettingsController::class, 'attributeTemplates']);
        Route::post('/item-attribute-templates', [ItemSettingsController::class, 'storeAttributeTemplate']);

        // Items
        Route::get('/items/next-code', [ItemController::class, 'nextCode']);
        Route::get('/items/{id}/available-serials', [ItemController::class, 'availableSerials']);
        Route::post('/items/{id}/generate-barcode', [ItemController::class, 'generateBarcode']);
        Route::apiResource('items', ItemController::class);

        // Warehouses (المخازن)
        Route::get('/warehouses', [WarehouseController::class, 'index']);
        Route::post('/warehouses', [WarehouseController::class, 'store']);
        Route::get('/warehouses/{id}', [WarehouseController::class, 'show']);
        Route::put('/warehouses/{id}', [WarehouseController::class, 'update']);
        Route::delete('/warehouses/{id}', [WarehouseController::class, 'destroy']);

        // Transfers (تحويلات المخزون)
        Route::get('/transfers', [TransferController::class, 'index']);
        Route::get('/transfers/next-number', [TransferController::class, 'nextNumber']);
        Route::post('/transfers', [TransferController::class, 'store']);
        Route::get('/transfers/{id}', [TransferController::class, 'show']);
        Route::put('/transfers/{id}', [TransferController::class, 'update']);
        Route::delete('/transfers/{id}', [TransferController::class, 'destroy']);
        Route::post('/transfers/{id}/in-transit', [TransferController::class, 'setInTransit']);
        Route::post('/transfers/{id}/received', [TransferController::class, 'setReceived']);

        // Inventory
        Route::get('/inventory/movements', [InventoryController::class, 'movements']);
        Route::get('/inventory/items/{itemId}/movements', [InventoryController::class, 'itemMovements']);
        Route::get('/inventory/low-stock', [InventoryController::class, 'lowStockAlerts']);
        Route::post('/inventory/movements', [InventoryController::class, 'addMovement']);
        Route::post('/inventory/adjust', [InventoryController::class, 'adjustStock']);
        Route::post('/inventory/clean-orphan-production-movements', [InventoryController::class, 'cleanOrphanedProductionOrderMovements']);
        Route::get('/inventory/report', [InventoryController::class, 'report']);
        Route::get('/inventory/variant-report', [InventoryController::class, 'variantReport']);
        Route::get('/inventory/expiry-alerts', [InventoryController::class, 'expiryAlerts']);
        Route::get('/inventory/expiry-stock-report', [InventoryController::class, 'expiryStockReport']);
        Route::get('/inventory/adjustments', [InventoryAdjustmentController::class, 'index']);
        Route::post('/inventory/adjustments', [InventoryAdjustmentController::class, 'store']);
        Route::get('/inventory/adjustments/{id}', [InventoryAdjustmentController::class, 'show']);
        Route::put('/inventory/adjustments/{id}', [InventoryAdjustmentController::class, 'update']);
        Route::delete('/inventory/adjustments/{id}', [InventoryAdjustmentController::class, 'destroy']);
        Route::post('/inventory/adjustments/{id}/attachment', [InventoryAdjustmentController::class, 'uploadAttachment']);
        Route::get('/opening-stock', [OpeningStockController::class, 'index']);
        Route::post('/opening-stock', [OpeningStockController::class, 'store']);
        Route::get('/opening-stock/{id}', [OpeningStockController::class, 'show']);
        Route::put('/opening-stock/{id}', [OpeningStockController::class, 'update']);
        Route::post('/opening-stock/{id}/update', [OpeningStockController::class, 'update']);
        Route::delete('/opening-stock/{id}', [OpeningStockController::class, 'destroy']);
        Route::post('/opening-stock/{id}/approve', [OpeningStockController::class, 'approve']);
        Route::post('/opening-stock/{id}/unpost', [OpeningStockController::class, 'unpost']);

        // التصنيع (Manufacturing)
        Route::get('/boms', [BomController::class, 'index']);
        Route::post('/boms', [BomController::class, 'store']);
        Route::get('/boms/{id}', [BomController::class, 'show']);
        Route::get('/boms/{id}/estimated-cost', [BomController::class, 'estimatedCost']);
        Route::put('/boms/{id}', [BomController::class, 'update']);
        Route::delete('/boms/{id}', [BomController::class, 'destroy']);
        Route::get('/production-orders/next-number', [ProductionOrderController::class, 'nextNumber']);
        Route::get('/production-orders', [ProductionOrderController::class, 'index']);
        Route::post('/production-orders', [ProductionOrderController::class, 'store']);
        Route::get('/production-orders/{id}', [ProductionOrderController::class, 'show']);
        Route::put('/production-orders/{id}', [ProductionOrderController::class, 'update']);
        Route::delete('/production-orders/{id}', [ProductionOrderController::class, 'destroy']);
        Route::post('/production-orders/{id}/approve', [ProductionOrderController::class, 'approve']);

        Route::get('/sales-reps', [SalesRepController::class, 'index']);
        Route::post('/sales-reps', [SalesRepController::class, 'store']);
        Route::get('/sales-reps/{id}', [SalesRepController::class, 'show']);
        Route::put('/sales-reps/{id}', [SalesRepController::class, 'update']);
        Route::delete('/sales-reps/{id}', [SalesRepController::class, 'destroy']);

        // إدارة التوصيل (سائقون، إسناد، تسوية عهدة)
        Route::get('/delivery-drivers', [DeliveryDriverController::class, 'index']);
        Route::post('/delivery-drivers', [DeliveryDriverController::class, 'store']);
        Route::get('/delivery-drivers/{id}', [DeliveryDriverController::class, 'show']);
        Route::put('/delivery-drivers/{id}', [DeliveryDriverController::class, 'update']);
        Route::delete('/delivery-drivers/{id}', [DeliveryDriverController::class, 'destroy']);

        Route::get('/delivery/ready-invoices', [DeliveryController::class, 'readyInvoices']);
        Route::post('/delivery/invoices/{invoiceId}/ready', [DeliveryController::class, 'markInvoiceReady']);
        Route::delete('/delivery/invoices/{invoiceId}/ready', [DeliveryController::class, 'unmarkInvoiceReady']);
        Route::post('/delivery/assign', [DeliveryController::class, 'assign']);
        Route::post('/delivery/assignments/{assignmentId}/cancel', [DeliveryController::class, 'cancelAssignment']);
        Route::post('/delivery/assignments/{assignmentId}/delivered', [DeliveryController::class, 'markDelivered']);
        Route::get('/delivery/pending-settlements', [DeliveryController::class, 'pendingSettlements']);
        Route::post('/delivery/settle', [DeliveryController::class, 'settle']);
        Route::get('/reports/delivery-performance', [DeliveryController::class, 'performanceReport']);

        // Invoices
        Route::get('/invoices', [InvoiceController::class, 'index'])->middleware('permission:invoices.view');
        Route::get('/invoices/delivery-fee-types', [InvoiceController::class, 'deliveryFeeTypes'])->middleware('permission:invoices.view');
        Route::get('/invoices/{id}/share-url', [InvoiceController::class, 'shareUrl'])->middleware('permission:invoices.view');
        Route::post('/invoices', [InvoiceController::class, 'store'])->middleware('permission:invoices.create');
        Route::get('/invoices/{id}', [InvoiceController::class, 'show'])->middleware('permission:invoices.view');
        Route::put('/invoices/{id}', [InvoiceController::class, 'update'])->middleware('permission:invoices.edit');
        Route::patch('/invoices/{id}/receipt-status', [InvoiceController::class, 'updateReceiptStatus'])->middleware('permission:invoices.edit');
        Route::delete('/invoices/{id}', [InvoiceController::class, 'destroy'])->middleware('permission:invoices.delete');
        Route::post('/invoices/{id}/post', [InvoiceController::class, 'post'])->middleware('permission:invoices.edit');
        Route::post('/invoices/{id}/cancel', [InvoiceController::class, 'cancel'])->middleware('permission:invoices.edit');
        Route::post('/invoices/{id}/unpost', [InvoiceController::class, 'unpost'])->middleware('permission:invoices.edit');
        Route::post('/invoices/{id}/rebuild-journal', [InvoiceController::class, 'rebuildJournal'])->middleware('permission:invoices.edit');
        Route::post('/invoices/{id}/payments', [InvoiceController::class, 'addPayment'])->middleware('permission:payments.create');
        Route::post('/invoices/{id}/attachment', [InvoiceController::class, 'uploadAttachment'])->middleware('permission:invoices.edit');
        Route::post('/invoices/{invoice}/installments', [InstallmentController::class, 'createFromInvoice'])->middleware('permission:installments.create');

        // Loyalty (Customer Points)
        Route::prefix('loyalty')->group(function () {
            // Programs CRUD (multi-program)
            Route::get('/programs', [LoyaltyController::class, 'listPrograms']);
            Route::post('/programs', [LoyaltyController::class, 'createProgram']);
            Route::put('/programs/{id}', [LoyaltyController::class, 'updateProgram']);
            Route::delete('/programs/{id}', [LoyaltyController::class, 'deleteProgram']);
            Route::get('/programs/{id}/calculate', [LoyaltyController::class, 'calculateForProgram']);

            // Tiers per program
            Route::get('/programs/{programId}/tiers', [LoyaltyController::class, 'getTiers']);
            Route::post('/programs/{programId}/tiers', [LoyaltyController::class, 'saveTier']);

            // Backward compatible (single-program) endpoints
            Route::get('/program', [LoyaltyController::class, 'getProgram']);
            Route::post('/program', [LoyaltyController::class, 'saveProgram']);
            Route::get('/tiers', [LoyaltyController::class, 'getTiers']);
            Route::post('/tiers', [LoyaltyController::class, 'saveTier']);
            Route::delete('/tiers/{id}', [LoyaltyController::class, 'deleteTier']);
            Route::get('/customers', [LoyaltyController::class, 'getCustomers']);
            Route::get('/customers/{id}', [LoyaltyController::class, 'getCustomerPoints']);
            Route::get('/calculate', [LoyaltyController::class, 'calculate']);
            Route::post('/manual', [LoyaltyController::class, 'manualAdjust']);
        });

        // Quotations (عروض الأسعار)
        Route::get('/quotations', [QuotationController::class, 'index']);
        Route::post('/quotations', [QuotationController::class, 'store']);
        Route::get('/quotations/{id}', [QuotationController::class, 'show']);
        Route::put('/quotations/{id}', [QuotationController::class, 'update']);
        Route::delete('/quotations/{id}', [QuotationController::class, 'destroy']);
        Route::post('/quotations/{id}/convert-to-invoice', [QuotationController::class, 'convertToInvoice']);

        // Purchase Requests (طلبات الشراء — غير مرحل)
        Route::get('/purchase-requests', [PurchaseRequestController::class, 'index']);
        Route::post('/purchase-requests', [PurchaseRequestController::class, 'store']);
        Route::post('/purchase-requests/from-shortage', [PurchaseRequestController::class, 'fromShortage']);
        Route::get('/purchase-requests/{id}', [PurchaseRequestController::class, 'show']);
        Route::put('/purchase-requests/{id}', [PurchaseRequestController::class, 'update']);
        Route::delete('/purchase-requests/{id}', [PurchaseRequestController::class, 'destroy']);
        Route::get('/purchase-requests/{id}/convert-to-invoice', [PurchaseRequestController::class, 'convertToInvoice']);

        // نقطة البيع (POS)
        Route::get('/pos/items', [PosController::class, 'items']);
        Route::get('/pos/shift', [PosController::class, 'shift']);
        Route::post('/pos/shift/open', [PosController::class, 'openShift']);
        Route::post('/pos/sale', [PosController::class, 'sale']);
        Route::post('/pos/return', [PosController::class, 'return']);
        Route::post('/pos/hold', [PosController::class, 'hold']);
        Route::get('/pos/hold', [PosController::class, 'heldList']);
        Route::post('/pos/hold/{id}/resume', [PosController::class, 'resumeHeld']);
        Route::get('/pos/shift/x-report', [PosController::class, 'xReport']);
        Route::post('/pos/shift/close', [PosController::class, 'closeShift']);
        Route::patch('/pos/shift/{id}', [PosController::class, 'updateShift'])->middleware('permission:invoices.edit');
        Route::post('/pos/shift/{id}/reopen', [PosController::class, 'reopenShift'])->middleware('permission:invoices.edit');
        Route::get('/pos/shifts-report', [PosShiftReportController::class, 'index'])->middleware('permission:invoices.view');
        Route::get('/pos/shifts-report/cashiers', [PosShiftReportController::class, 'cashiers'])->middleware('permission:invoices.view');
        Route::get('/pos/shifts-report/{id}', [PosShiftReportController::class, 'show'])->middleware('permission:invoices.view');
        Route::get('/pos/cashier-daily-report/cashiers', [CashierDailyReportController::class, 'cashiersForDailyReport'])->middleware('permission:invoices.view|pos.view_reports');
        Route::get('/pos/cashier-daily-report/shifts', [CashierDailyReportController::class, 'shiftsForDailyReport'])->middleware('permission:invoices.view|pos.view_reports');
        Route::get('/pos/shifts/{shiftId}/daily-report', [CashierDailyReportController::class, 'show'])->middleware('permission:invoices.view|pos.view_reports');
        Route::get('/pos/cashier/today-report', [CashierDailyReportController::class, 'todayReport'])->middleware('permission:invoices.view|pos.view_reports');
        Route::get('/pos/expense-categories', [PosController::class, 'expenseCategories']);
        Route::post('/pos/expense-categories', [PosController::class, 'storeExpenseCategory']);
        Route::put('/pos/expense-categories/{id}', [PosController::class, 'updateExpenseCategory']);
        Route::delete('/pos/expense-categories/{id}', [PosController::class, 'destroyExpenseCategory']);
        Route::get('/pos/expense-items', [PosController::class, 'expenseItems']);
        Route::post('/pos/expense-items', [PosController::class, 'storeExpenseItem']);
        Route::put('/pos/expense-items/{id}', [PosController::class, 'updateExpenseItem']);
        Route::delete('/pos/expense-items/{id}', [PosController::class, 'destroyExpenseItem']);
        Route::post('/pos/expense', [PosController::class, 'recordExpense']);

        // مطاعم - إدارة الطاولات وطلبات المطعم
        Route::get('/restaurant/tables', [RestaurantTableController::class, 'index']);
        Route::post('/restaurant/tables', [RestaurantTableController::class, 'store']);
        Route::put('/restaurant/tables/{id}', [RestaurantTableController::class, 'update']);
        Route::delete('/restaurant/tables/{id}', [RestaurantTableController::class, 'destroy']);

        Route::get('/restaurant/sections', [RestaurantSectionController::class, 'index']);
        Route::post('/restaurant/sections', [RestaurantSectionController::class, 'store']);
        Route::put('/restaurant/sections/{id}', [RestaurantSectionController::class, 'update']);
        Route::delete('/restaurant/sections/{id}', [RestaurantSectionController::class, 'destroy']);

        Route::get('/restaurant/menu', [RestaurantMenuController::class, 'show']);
        Route::put('/restaurant/menu/settings', [RestaurantMenuController::class, 'updateSettings']);
        Route::post('/restaurant/menu/cover', [RestaurantMenuController::class, 'uploadCover']);
        Route::post('/restaurant/menu/categories', [RestaurantMenuController::class, 'storeCategory']);
        Route::post('/restaurant/menu/categories/{id}', [RestaurantMenuController::class, 'updateCategory']);
        Route::put('/restaurant/menu/categories/{id}', [RestaurantMenuController::class, 'updateCategory']);
        Route::delete('/restaurant/menu/categories/{id}', [RestaurantMenuController::class, 'destroyCategory']);
        Route::post('/restaurant/menu/items', [RestaurantMenuController::class, 'storeItem']);
        Route::post('/restaurant/menu/items/{id}', [RestaurantMenuController::class, 'updateItem']);
        Route::put('/restaurant/menu/items/{id}', [RestaurantMenuController::class, 'updateItem']);
        Route::delete('/restaurant/menu/items/{id}', [RestaurantMenuController::class, 'destroyItem']);

        Route::post('/restaurant/pos/orders', [PosRestaurantController::class, 'store']);
        Route::post('/restaurant/pos/send-order', [PosRestaurantController::class, 'sendOrder']);
        Route::get('/restaurant/pos/open-orders', [PosRestaurantController::class, 'openOrders']);
        Route::get('/restaurant/pos/open-order-by-table/{tableId}', [PosRestaurantController::class, 'openOrderByTable']);
        Route::get('/restaurant/pos/orders/{orderId}', [PosRestaurantController::class, 'getOrder']);
        Route::post('/restaurant/pos/orders/{orderId}/checkout', [PosRestaurantController::class, 'checkout']);
        Route::post('/restaurant/pos/orders/{invoiceId}/send-to-kitchen', [PosRestaurantController::class, 'sendToKitchen']);
        Route::post('/restaurant/pos/orders/{invoiceId}/cancel', [PosRestaurantController::class, 'cancelOrder']);
        Route::post('/restaurant/pos/order/{orderId}/cancel', [PosRestaurantController::class, 'cancelRestaurantOrder']);
        Route::get('/restaurant/kitchen-tickets', [KitchenTicketController::class, 'index']);
        Route::patch('/restaurant/kitchen-tickets/{id}', [KitchenTicketController::class, 'updateStatus']);
        Route::patch('/restaurant/kitchen-tickets/{id}/lines/{lineId}', [KitchenTicketController::class, 'updateLineCompleted']);
        Route::get('/kitchen-orders', [KitchenTicketController::class, 'indexKds']);
        Route::patch('/kitchen-orders/{id}/status', [KitchenTicketController::class, 'updateStatusKds']);
        Route::patch('/kitchen-orders/{id}/items/{lineId}', [KitchenTicketController::class, 'updateLineKds']);

        // Payments
        Route::get('/payments', [PaymentController::class, 'index']);
        Route::post('/payments', [PaymentController::class, 'store']);
        Route::get('/payments/{id}', [PaymentController::class, 'show']);
        Route::put('/payments/{id}', [PaymentController::class, 'update']);
        Route::post('/payments/{id}/approve', [PaymentController::class, 'approve']);
        Route::post('/payments/{id}/attachment', [PaymentController::class, 'uploadAttachment']);
        Route::delete('/payments/{id}', [PaymentController::class, 'destroy']);

        // Payment Methods
        Route::get('/payment-methods', [PaymentMethodController::class, 'index']);
        Route::post('/payment-methods', [PaymentMethodController::class, 'store']);
        Route::get('/payment-methods/{id}', [PaymentMethodController::class, 'show']);
        Route::put('/payment-methods/{id}', [PaymentMethodController::class, 'update']);
        Route::delete('/payment-methods/{id}', [PaymentMethodController::class, 'destroy']);

        // Currencies
        Route::get('/currencies', [CurrencyController::class, 'index']);
        Route::post('/currencies', [CurrencyController::class, 'store']);
        Route::post('/currencies/fetch-rates', [CurrencyController::class, 'fetchRates']);
        Route::put('/currencies/{id}', [CurrencyController::class, 'update']);
        Route::put('/currencies/{id}/settings', [CurrencyController::class, 'updateSettings']);
        Route::delete('/currencies/{id}', [CurrencyController::class, 'destroy']);

        // Branches
        Route::get('/branches', [BranchController::class, 'index']);
        Route::post('/branches', [BranchController::class, 'store']);
        Route::put('/branches/{id}', [BranchController::class, 'update']);
        Route::delete('/branches/{id}', [BranchController::class, 'destroy']);

        // Cost Centers
        Route::get('/cost-centers', [CostCenterController::class, 'index']);
        Route::get('/cost-centers/tree', [CostCenterController::class, 'tree']);
        Route::post('/cost-centers', [CostCenterController::class, 'store']);
        Route::put('/cost-centers/{id}', [CostCenterController::class, 'update']);
        Route::delete('/cost-centers/{id}', [CostCenterController::class, 'destroy']);

        // Installments (التقسيط)
        Route::get('/installment-periods', [InstallmentController::class, 'periods'])->middleware('permission:installments.view');
        Route::get('/installments/reports/statistics', [InstallmentController::class, 'statistics'])->middleware('permission:installments.view');
        Route::get('/installments/reports/follow-up', [InstallmentController::class, 'followUp'])->middleware('permission:installments.view');
        Route::get('/installments/reports/overdue', [InstallmentController::class, 'overdue'])->middleware('permission:installments.view');
        Route::get('/installments/reports/expected-collection', [InstallmentController::class, 'expectedCollection'])->middleware('permission:installments.view');
        Route::post('/installments/generate', [InstallmentController::class, 'generate'])->middleware('permission:installments.create');
        Route::post('/installments/lines/{line}/pay', [InstallmentController::class, 'payLine'])->middleware('permission:installments.pay');
        Route::get('/installments', [InstallmentController::class, 'index'])->middleware('permission:installments.view');
        Route::post('/installments', [InstallmentController::class, 'store'])->middleware('permission:installments.create');
        Route::get('/installments/{id}', [InstallmentController::class, 'show'])->middleware('permission:installments.view');
        Route::put('/installments/{id}', [InstallmentController::class, 'update'])->middleware('permission:installments.edit');
        Route::delete('/installments/{id}', [InstallmentController::class, 'destroy'])->middleware('permission:installments.delete');
        Route::post('/installments/{id}/approve', [InstallmentController::class, 'approve'])->middleware('permission:installments.approve');

        // ─── HR (الموارد البشرية) ─── صلاحيات: hr.view، hr.payroll.view، hr.payroll.approve
        Route::middleware('permission:hr.view')->group(function () {
            Route::get('/hr/employees', [EmployeeController::class, 'index']);
            Route::post('/hr/employees', [EmployeeController::class, 'store']);
            Route::get('/hr/employees/{id}', [EmployeeController::class, 'show']);
            Route::put('/hr/employees/{id}', [EmployeeController::class, 'update']);
            Route::delete('/hr/employees/{id}', [EmployeeController::class, 'destroy']);
            Route::post('/hr/employees/{employeeId}/documents', [EmployeeController::class, 'uploadDocument']);
            Route::delete('/hr/employees/{employeeId}/documents/{docId}', [EmployeeController::class, 'deleteDocument']);

            Route::get('/hr/attendance', [AttendanceController::class, 'index']);
            Route::post('/hr/attendance', [AttendanceController::class, 'store']);

            Route::get('/hr/requests', [HrRequestController::class, 'index']);
            Route::post('/hr/requests', [HrRequestController::class, 'store']);
            Route::get('/hr/requests/{id}', [HrRequestController::class, 'show']);
            Route::post('/hr/requests/{id}/approve', [HrRequestController::class, 'approve']);
            Route::post('/hr/requests/{id}/reject', [HrRequestController::class, 'reject']);

            Route::get('/hr/administrations', [HrOrgController::class, 'administrations']);
            Route::post('/hr/administrations', [HrOrgController::class, 'storeAdministration']);
            Route::put('/hr/administrations/{id}', [HrOrgController::class, 'updateAdministration']);
            Route::delete('/hr/administrations/{id}', [HrOrgController::class, 'destroyAdministration']);

            Route::get('/hr/departments', [HrOrgController::class, 'departments']);
            Route::post('/hr/departments', [HrOrgController::class, 'storeDepartment']);
            Route::put('/hr/departments/{id}', [HrOrgController::class, 'updateDepartment']);
            Route::delete('/hr/departments/{id}', [HrOrgController::class, 'destroyDepartment']);

            Route::get('/hr/job-titles', [HrOrgController::class, 'jobTitles']);
            Route::post('/hr/job-titles', [HrOrgController::class, 'storeJobTitle']);
            Route::put('/hr/job-titles/{id}', [HrOrgController::class, 'updateJobTitle']);
            Route::delete('/hr/job-titles/{id}', [HrOrgController::class, 'destroyJobTitle']);

            Route::get('/hr/leave-types', [HrOrgController::class, 'leaveTypes']);
            Route::post('/hr/leave-types', [HrOrgController::class, 'storeLeaveType']);
            Route::put('/hr/leave-types/{id}', [HrOrgController::class, 'updateLeaveType']);
            Route::delete('/hr/leave-types/{id}', [HrOrgController::class, 'destroyLeaveType']);

            Route::get('/hr/allowances', [HrCompensationController::class, 'allowances']);
            Route::post('/hr/allowances', [HrCompensationController::class, 'storeAllowance']);
            Route::put('/hr/allowances/{id}', [HrCompensationController::class, 'updateAllowance']);
            Route::delete('/hr/allowances/{id}', [HrCompensationController::class, 'destroyAllowance']);

            Route::get('/hr/deductions', [HrCompensationController::class, 'deductions']);
            Route::post('/hr/deductions', [HrCompensationController::class, 'storeDeduction']);
            Route::put('/hr/deductions/{id}', [HrCompensationController::class, 'updateDeduction']);
            Route::delete('/hr/deductions/{id}', [HrCompensationController::class, 'destroyDeduction']);

            Route::get('/hr/employees/{id}/compensation', [HrCompensationController::class, 'employeeCompensation']);

            Route::get('/hr/settings', [HrSettingsController::class, 'show']);
            Route::put('/hr/settings', [HrSettingsController::class, 'update']);
        });

        Route::middleware('permission:hr.payroll.view')->group(function () {
            Route::get('/hr/payroll', [PayrollController::class, 'index']);
            Route::post('/hr/payroll/generate', [PayrollController::class, 'generate']);
            Route::get('/hr/payroll/{id}', [PayrollController::class, 'show']);
        });
        Route::post('/hr/payroll/{id}/approve', [PayrollController::class, 'approve'])->middleware('permission:hr.payroll.approve');

        // Reports
        Route::prefix('reports')->group(function () {
            Route::get('/trial-balance', [ReportController::class, 'trialBalance']);
            Route::get('/income-statement', [ReportController::class, 'incomeStatement']);
            Route::get('/balance-sheet', [ReportController::class, 'balanceSheet']);
            Route::get('/sales-summary', [ReportController::class, 'salesSummary']);
            Route::get('/purchase-summary', [ReportController::class, 'purchaseSummary']);
            Route::get('/inventory', [ReportController::class, 'inventoryReport']);
            Route::get('/serial-numbers-inventory', [ReportController::class, 'serialNumbersInventory']);
            Route::get('/serial-numbers-inventory/{id}/history', [ReportController::class, 'serialNumberHistory']);
            Route::get('/tax-declaration', [ReportController::class, 'taxDeclaration']);
            Route::get('/account-statement', [ReportController::class, 'accountStatement']);
            Route::get('/customer-balances', [ReportController::class, 'customerBalances']);
            Route::get('/customer-aging', [ReportController::class, 'customerAging']);
            Route::get('/customer-analysis', [ReportController::class, 'customerEvaluationAnalysis']);
            Route::get('/vendor-balances', [ReportController::class, 'vendorBalances']);
            Route::get('/vendor-purchase-analysis', [ReportController::class, 'vendorPurchaseAnalysis']);
            Route::get('/vendor-aging', [ReportController::class, 'vendorAging']);
            Route::get('/vendor-performance', [ReportController::class, 'vendorPerformance']);
            Route::get('/account-last-movements', [ReportController::class, 'accountLastMovements']);
            Route::get('/item-sales/invoices', [ReportController::class, 'itemSalesReportInvoices']);
            Route::get('/item-sales', [ReportController::class, 'itemSalesReport']);
            Route::get('/item-purchases/invoices', [ReportController::class, 'itemPurchasesReportInvoices']);
            Route::get('/item-purchases', [ReportController::class, 'itemPurchasesReport']);
            Route::get('/monthly-purchases-analysis', [ReportController::class, 'monthlyPurchasesAnalysis']);
            Route::get('/expenses', [ReportController::class, 'expensesReport']);
            Route::get('/sales-rep-sales', [ReportController::class, 'salesRepSalesReport']);
            Route::get('/sales-reps-monthly-productivity', [ReportController::class, 'salesRepsMonthlyProductivity']);
            Route::get('/invoice-profits', [ReportController::class, 'invoiceProfits']);
            Route::get('/branch-sales-annual', [ReportController::class, 'branchSalesAnnual']);
            Route::get('/cost-center-sales-annual', [ReportController::class, 'costCenterSalesAnnual']);
        });

        // User Management (إدارة المستخدمين)
        Route::get('/permissions', [PermissionController::class, 'index']);
        Route::get('/tenant-users', [TenantUserController::class, 'index'])->middleware('permission:users.view');
        Route::post('/tenant-users', [TenantUserController::class, 'store'])->middleware('permission:users.create');
        Route::put('/tenant-users/{userId}', [TenantUserController::class, 'update'])->middleware('permission:users.edit');
        Route::delete('/tenant-users/{userId}', [TenantUserController::class, 'destroy'])->middleware('permission:users.delete');
        Route::get('/roles', [RoleController::class, 'index'])->middleware('permission:roles.view');
        Route::post('/roles', [RoleController::class, 'store'])->middleware('permission:roles.create');
        Route::get('/roles/{id}', [RoleController::class, 'show'])->middleware('permission:roles.view');
        Route::put('/roles/{id}', [RoleController::class, 'update'])->middleware('permission:roles.edit');
        Route::delete('/roles/{id}', [RoleController::class, 'destroy'])->middleware('permission:roles.delete');

        // Audit Log (سجل التدقيق)
        Route::get('/audit-logs', [AuditLogController::class, 'index'])->middleware('permission:audit.view');
    });
});
