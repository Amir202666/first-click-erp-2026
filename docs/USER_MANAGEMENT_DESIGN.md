# موديول إدارة المستخدمين — Multi-tenant ERP

## 1. هيكلية قاعدة البيانات (Database Schema)

### الجداول الأساسية

| الجدول | الوصف | ملاحظات |
|--------|--------|---------|
| `users` | المستخدمون (مستوى النظام) | لا يحتوي على `tenant_id` — المستخدم يمكن أن ينتمي لعدة شركات |
| `tenants` | الشركات (المستأجرون) | كل سجل = شركة |
| `tenant_users` | ربط المستخدم بالشركة + الدور | يحتوي على `tenant_id`, `user_id`, `role_id`, `role` (للتوافق), `permissions` (JSON override), `is_active` |
| `roles` | الأدوار | `tenant_id` NULL = دور على مستوى النظام (مثل Super Admin)، غير NULL = دور ضمن الشركة |
| `permissions` | قائمة الصلاحيات (عالمية) | `key` (مثل journal.create), `module`, `name_ar`, `name_en` |
| `role_permissions` | ربط الدور بالصلاحيات | `role_id`, `permission_id` |
| `audit_logs` | سجل التدقيق | `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `table_name`, `old_values`, `new_values`, `ip_address`, `user_agent` |

### عزل البيانات (Data Isolation)

- جميع الاستعلامات ضمن نطاق شركة معينة **يجب** أن تكون مشروطة بـ `tenant_id` (أو من خلال العلاقة مع الـ tenant الحالي).
- الـ Middleware `SetTenantContext` يضبط الـ tenant من الهيدر `X-Tenant-ID` ويحقّق أن المستخدم الحالي له صلاحية الوصول لهذه الشركة (أو أنه Super Admin).

### Super Admin

- الحقل `users.is_super_admin` (boolean): عندما يكون `true` يتم تجاوز التحقق من صلاحية الـ tenant والصلاحيات ضمن الـ tenant (صلاحيات كاملة على النظام).

---

## 2. نظام الصلاحيات (RBAC)

### الأدوار

- **على مستوى النظام:** دور واحد افتراضي `super_admin` (`tenant_id = NULL`) — صلاحيات كاملة.
- **على مستوى الشركة:** أدوار افتراضية (مدير، محاسب، مبيعات، مخازن) + إمكانية إنشاء **أدوار مخصصة** من قبل مدير الشركة.
- كل دور مرتبط بعدة صلاحيات عبر جدول `role_permissions`.

### الصلاحيات (Permissions)

- مخزنة في جدول `permissions` بمفتاح فريد مثل: `users.view`, `users.create`, `journal.edit`, `reports.view`, `audit.view`, إلخ.
- يتم منح الصلاحية إما عبر الدور (من خلال `role_permissions`) أو كـ override في `tenant_users.permissions` (JSON مصفوفة من المفاتيح).

### التحقق (CheckPermission Middleware)

1. إذا كان المستخدم `is_super_admin` → يُسمح.
2. جلب ربط المستخدم بالشركة الحالية (`tenant_users`).
3. إذا وُجد `role_id`: تحميل الدور والصلاحيات من `role_permissions` والتحقق من المفتاح المطلوب.
4. إذا لم يوجد `role_id`: استخدام القيم الافتراضية للأدوار (legacy) حسب `tenant_users.role` (admin, accountant, sales, warehouse).
5. دمج صلاحيات الـ pivot (override) مع صلاحيات الدور.

---

## 3. تسجيل الدخول والأمان

### التوثيق (Authentication)

- **Laravel Sanctum** (Token-based): بعد تسجيل الدخول يتم إصدار توكن يُرسل في الهيدر `Authorization: Bearer <token>`.
- المستخدم الذي يملك حساباً في أكثر من شركة يستخدم **نفس البريد وكلمة المرور**؛ اختيار الشركة يتم عبر الهيدر `X-Tenant-ID` في كل طلب. الـ middleware يتحقق من أن المستخدم مرتبط بهذه الشركة (أو أنه Super Admin).

### المصادقة الثنائية (MFA)

- الحقول `users.two_factor_secret` و `users.two_factor_confirmed_at` موجودة في الجدول. يمكن لاحقاً تفعيل تدفق TOTP (مثل Google Authenticator) في واجهة تسجيل الدخول وإعدادات الحساب.

### تسجيل أحداث الدخول/الخروج

- عند نجاح أو فشل تسجيل الدخول يتم استدعاء `AuditLogService::log` (مثلاً `action = login` أو `login_failed`).
- عند تسجيل الخروج يتم استدعاء `AuditLogService::logLogout`.

---

## 4. واجهة المستخدم (UI)

### الشاشات المنجزة

| الشاشة | المسار | الوصف |
|--------|--------|--------|
| قائمة المستخدمين | `/tenant-users` | عرض مستخدمي الشركة الحالية، إضافة مستخدم (بريد، اسم، كلمة مرور اختيارية، دور)، تعديل (دور، نشط)، إلغاء ربط المستخدم بالشركة |
| الأدوار والصلاحيات | `/roles` | عرض الأدوار، إنشاء دور مخصص (اسم، وصف، اختيار صلاحيات)، تعديل/حذف الأدوار غير النظامية |
| سجل التدقيق | `/audit-log` | عرض سجل الحركات مع فلتر (تاريخ، إجراء، جدول) |

### التنقل

- مجموعة "إدارة المستخدمين" في القائمة الجانبية تتضمن: المستخدمون، الأدوار والصلاحيات، سجل التدقيق.

---

## 5. سجل التدقيق (Audit Log)

### الحقول

| الحقل | الوصف |
|-------|--------|
| `user_id` | من قام بالحركة |
| `action` | إضافة، تعديل، حذف، دخول، خروج |
| `table_name` / `model_type` | الجدول أو النموذج المتأثر |
| `model_id` | معرف السجل (إن وجد) |
| `old_values` | البيانات قبل التغيير (JSON) |
| `new_values` | البيانات بعد التغيير (JSON) |
| `tenant_id`, `ip_address`, `user_agent`, `created_at` | سياق التنفيذ |

### الاستخدام

- `AuditLogService::log()` يُستدعى من وحدات الأعمال (مثلاً عند إنشاء/تحديث/حذف مستخدم شركة، دور، أو من AuthController للدخول/الخروج).
- واجهة سجل التدقيق تقتصر على من لديه صلاحية `audit.view` (مثل مدير الشركة أو المحاسب حسب الإعداد).

---

## 6. تشغيل التهيئة

```bash
# Migrations (تم تنفيذها)
php artisan migrate

# بذر الصلاحيات ثم الأدوار (وربط tenant_users.role_id إن وُجدت سجلات قديمة)
php artisan db:seed --class=PermissionsSeeder
php artisan db:seed --class=RolesSeeder
```

- **Super Admin:** تعيين `users.is_super_admin = 1` يدوياً لحساب معين من قاعدة البيانات إذا لزم.
- تعيين أدوار جديدة للمستخدمين من واجهة "المستخدمون" أو من خلال ربط `tenant_users.role_id` بالأدوار المناسبة.

---

## 7. قابلية التوسع (Scalability)

- **المسؤول العام (Super Admin):** مستخدم بمستوى النظام (`is_super_admin = true`) يمكنه الوصول لأي شركة وإدارة المستخدمين والأدوار وسجل التدقيق دون ربطه مسبقاً في `tenant_users` (يتم تجاوز التحقق في SetTenantContext و CheckPermission).
- **مدير النظام (Admin) لكل شركة:** دور `admin` ضمن الشركة يمنح كل الصلاحيات (*) لتلك الشركة فقط.
- إضافة صلاحيات جديدة يتم عبر إدراج صفوف في جدول `permissions` (ويمكن لاحقاً إضافة واجهة إدارة للصلاحيات إذا لزم).
