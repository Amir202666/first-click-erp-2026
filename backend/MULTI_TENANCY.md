## Multi-tenancy Checklist (Backend)

هذه الوثيقة تلخص قواعد العزل (Multi-tenancy) في الباكند + ما يجب اتباعه عند إضافة أي موديول أو مسار جديد.

---

### 1) القاعدة الذهبية: `tenant_id` مصدره الوحيد هو الهيدر

- **لا يُسمح أبداً** بالاعتماد على `tenant_id` من الـ body أو الـ query.
- الـ Middleware التالية تضمن هذا:
  - `SetTenantContext` (`tenant`):
    - تقرأ `X-Tenant-ID` من الهيدر.
    - تتحقق أن المستخدم لديه صلاحية على هذا المستأجر.
    - تضبط `app('current_tenant')` + تدمج `tenant_id` في الـ Request attributes.
  - `EnforceTenantFromHeader` (`enforce_tenant`):
    - تمنع اختلاف أي `tenant_id` في الـ query/body عن قيمة `X-Tenant-ID`.
    - تعمل قبل `tenant` في `routes/api.php`:
      - `Route::middleware(['enforce_tenant', 'tenant', 'check_subscription', 'check_plan_features'])`

**عند إنشاء أي Route جديد للموديولات متعددة المستأجرين:**
- ضعه داخل مجموعة الـ Middleware السابقة (نفس مجموعة الـ ERP/HR الحالية).

---

### 2) على مستوى الـ Models: استخدام `BelongsToTenant` إلزامي

- أي Model يحتوي عمود `tenant_id` يجب أن:
  - يستخدم Trait: `use BelongsToTenant;`
  - يحتوي `tenant_id` في `$fillable`.
- الـ Trait يقوم بـ:
  - ضبط `tenant_id` تلقائياً عند `creating` إذا كان `current_tenant` مضبوطاً.
  - إضافة Global Scope باسم `tenant` يفلتر كل الاستعلامات على `tenant_id = app('current_tenant')->id`.
  - توفير `scopeForTenant($query, $tenantId)` للاستخدام اليدوي عند الحاجة.

**عند إضافة Model جديد يحتوي `tenant_id`:**
1. إضافة العمود في الـ Migration كـ `foreignId('tenant_id')->constrained()->cascadeOnDelete();` أو مكافئ.
2. في الـ Model:
   - استيراد `App\Traits\BelongsToTenant;`
   - استخدامه: `use BelongsToTenant;`
   - تضمين `tenant_id` في `$fillable`.

---

### 3) على مستوى الـ Controllers: لا Query بدون `tenant_id`

- القاعدة العامة داخل أي Controller لموديول متعدد المستأجرين:
  - **جميع الاستعلامات** يجب أن تستخدم واحداً من:
    - `Model::where('tenant_id', $request->tenant_id)...`
    - أو `Model::forTenant($request->tenant_id)...`
    - أو الاعتماد على Global Scope عبر `Model::query()` بشرط أن لا تُزال الـ Scopes.

- إذا تم استخدام `withoutGlobalScopes()` أو `withoutGlobalScope()` (مثلاً لتوليد أرقام أو حذف Cascaded أو تقارير خاصة):
  - يجب فوراً تقييد الاستعلام بـ `where('tenant_id', $tenantId)` يدوياً.

**أمثلة صحيحة:**
- `Invoice::withoutGlobalScopes()->where('tenant_id', $tenantId)->findOrFail($id);`
- `JournalEntry::where('tenant_id', $request->tenant_id)->with('lines')->paginate(...);`

---

### 4) اختبارات العزل (Isolation Tests) – يجب إضافتها لأي موديول جديد

لكل Resource/موديول مهم، يوجد الآن اختبار Feature يثبت:
1. المستخدم على Tenant A **لا يرى** بيانات Tenant B في الـ Index.
2. أي محاولة `show / update / delete / resume / approve` على سجل Tenant B ترجع **404** أو **403**.

نماذج جاهزة يمكن النسخ منها:

- **محاسبة وحسابات:**
  - `tests/Feature/AccountsIsolationTest.php`
  - `tests/Feature/JournalEntriesIsolationTest.php`
  - `tests/Feature/PaymentsIsolationTest.php`
  - `tests/Feature/CurrenciesIsolationTest.php`
  - `tests/Feature/CostCentersIsolationTest.php`
  - `tests/Feature/OpeningStockIsolationTest.php`
  - `tests/Feature/TransfersIsolationTest.php`

- **العملاء/الموردين/المخزون والفواتير:**
  - `tests/Feature/CustomersIsolationTest.php`
  - `tests/Feature/VendorsIsolationTest.php`
  - `tests/Feature/ItemsIsolationTest.php`
  - `tests/Feature/InventoryMovementsIsolationTest.php`
  - `tests/Feature/PurchaseRequestsIsolationTest.php`
  - `tests/Feature/DocumentTemplatesIsolationTest.php`

- **POS + مطاعم:**
  - `tests/Feature/PosHeldCartsIsolationTest.php`
  - `tests/Feature/RestaurantTablesIsolationTest.php`
  - `tests/Feature/RestaurantSectionsIsolationTest.php`
  - `tests/Feature/KitchenTicketsIsolationTest.php`

- **إعدادات + Notifications:**
  - `tests/Feature/SettingsIsolationTest.php`
  - `tests/Feature/NotificationsIsolationTest.php`
  - `tests/Feature/PaymentMethodsIsolationTest.php`

- **موارد أخرى:**
  - `tests/Feature/BranchesIsolationTest.php`
  - `tests/Feature/WarehousesIsolationTest.php`
  - `tests/Feature/ItemUnitsIsolationTest.php`
  - `tests/Feature/ItemBrandsIsolationTest.php`
  - `tests/Feature/ItemCategoriesIsolationTest.php`

**عند إنشاء موديول جديد:**
1. أنشئ Factory للموديل يتجاهل `tenant_id` ويفرض ضبطه في الاختبار (كما في `AccountFactory`, `CustomerFactory`, إلخ).
2. اكتب `*IsolationTest` جديد بنفس النمط:
   - إنشاء Tenant A و Tenant B.
   - إنشاء User مربوط بـ Tenant A.
   - إنشاء سجلات للموديول لـ Tenant A و Tenant B.
   - اختبار:
     - `GET /resource` مع هيدر Tenant A لا يُرجع سجلات Tenant B.
     - `GET/PUT/DELETE /resource/{id}` على سجل Tenant B → 404/403.

---

### 5) تشغيل الاختبارات كجزء من أي تعديل كبير

- بعد أي تعديل على:
  - Middleware الخاصة بالـ Tenant.
  - Trait `BelongsToTenant`.
  - أي Controller في قائمة الموديولات الحساسة.
- يجب تشغيل:

```bash
cd backend
php artisan test
```

والتأكد أن **كل الاختبارات PASS** (حاليًا: 50+ اختبار، ~200 assertion).

---

### 6) نصائح عند إضافة Features جديدة

- لا تجعل الـ Frontend يرسل `tenant_id` في الـ body أو الـ query؛ فقط يرسل `X-Tenant-ID` في الهيدر.
- في الـ Backend:
  - اعتمد دائمًا على `$request->tenant_id` أو `$request->attributes->get('tenant_id')` التي يضبطها `SetTenantContext`.
  - لا تستخدم `Model::all()` أو `Model::find($id)` بدون فلتر Tenant.
  - عند الحاجة لاستخدام `withoutGlobalScopes()`، تذكّر أن تضيف `where('tenant_id', $tenantId)` يدوياً.

بهذه القواعد + الاختبارات الحالية، النظام جاهز لعزل بيانات الشركات بشكل آمن وقابل للتوسع كمشروع SaaS متعدد الشركات.

