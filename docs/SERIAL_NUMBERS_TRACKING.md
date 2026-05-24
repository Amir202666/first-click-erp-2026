# تتبع الأرقام التسلسلية (Serial Numbers Tracking)

## 1. هيكلية قاعدة البيانات (Database Schema)

### الجداول المضافة/المعدّلة

#### `items` (تعديل)
- **use_serial_number** (boolean, default: false)  
  عند تفعيله، يصبح إدخال/اختيار الأرقام التسلسلية إجبارياً في فواتير المشتريات والإضافة المخزنية واختيارها في فواتير المبيعات.

#### `item_serials` (جدول جديد)
| العمود           | النوع        | الوصف |
|------------------|-------------|--------|
| id               | bigint PK   | |
| tenant_id        | FK tenants  | عزل البيانات لكل شركة |
| item_id          | FK items    | الصنف |
| warehouse_id     | FK warehouses (nullable) | المستودع الحالي |
| serial_number    | string(120) | الرقم التسلسلي |
| status           | string(20)  | available, sold, reserved, returned, damaged |
| reference_type   | string(100) nullable | مرجع الحركة (مثلاً InventoryMovement أو InvoiceLine) |
| reference_id     | bigint nullable | معرف المرجع |
| timestamps       | | |

- **فهرس فريد:** `UNIQUE(tenant_id, item_id, serial_number)`  
  → عدم تكرار الرقم التسلسلي **لنفس الشركة (Tenant)** ونفس الصنف فقط؛ يُسمح بتكرار نفس القيمة لشركات أخرى.
- **فهرس:** `(tenant_id, warehouse_id, status)` لتسريع استعلامات "المتاح في المستودع X".

#### `invoice_line_serials` (جدول جديد)
| العمود            | النوع        | الوصف |
|-------------------|-------------|--------|
| id                | bigint PK   | |
| invoice_line_id   | FK invoice_lines | سطر الفاتورة |
| item_serial_id    | FK item_serials   | الرقم التسلسلي المُخَرَّج |
| timestamps        | | |

- **فريد:** `item_serial_id` unique (كل رقم تسلسلي يُربط بسطر فاتورة واحد فقط).

---

## 2. منطق التحقق (Validation Logic)

### أ) عدم تكرار الرقم التسلسلي

- التحقق يتم على مستوى **(tenant_id, item_id, serial_number)**.
- الطريقة: `ItemSerial::isSerialUniqueForTenantItem($tenantId, $itemId, $serialNumber, $excludeId?)`
- القاعدة: `App\Rules\UniqueSerialPerTenantItem` للاستخدام في Form Request أو التحقق اليدوي.

### ب) فاتورة مشتريات / إضافة مخزنية

- لكل صنف له `use_serial_number = true`:
  - **الكمية المدخلة (بالوحدة الصغرى)** = عدد الوحدات.
  - يجب إدخال **نفس العدد** من أرقام تسلسلية فريدة (بدون تكرار ضمن نفس الصنف ونفس الـ tenant).
- الخدمة: `SerialNumbersService::validateSerialsForInbound($tenantId, $lines, $itemSerials, $warehouseId)`  
  ترجع مصفوفة أخطاء؛ إذا كانت فارغة فالبيانات صالحة.
- بعد التحقق، استدعاء `SerialNumbersService::createSerialsForInbound(...)` لإنشاء سجلات `item_serials` مع `status = available` وربطها بـ `reference_type` و `reference_id` (مثلاً حركة المخزن).

### ج) فاتورة مبيعات

- يجب تحديد **مستودع الفاتورة** (warehouse_id).
- لكل سطر صنف له `use_serial_number = true`:
  - يجب اختيار **عدد مساوٍ للكمية** من الأرقام التسلسلية **المتاحة فقط** في ذلك المستودع.
- جلب المتاح: `SerialNumbersService::getAvailableSerialsForItemInWarehouse($tenantId, $itemId, $warehouseId)`.
- قبل التأكيد: `SerialNumbersService::validateSerialsForSalesInvoice($invoice)` ترجع مصفوفة أخطاء.
- عند التأكيد: `SerialNumbersService::allocateSerialsToInvoiceLine($line, $itemSerialIds)` لربط الأرقام بالسطر وتحديث حالة الـ serial إلى `sold` وربطها بـ `InvoiceLine`.

---

## 3. إعدادات الظهور في الفواتير (Print Toggle)

- **على مستوى النظام:** استخدام جدول `tenant_settings`:
  - المفتاح: مثلاً `invoice_show_serial_numbers`
  - القيمة: `1` / `0` أو `true` / `false` حسب آلية القراءة.
- **على مستوى الفاتورة (اختياري):** حقل في `invoices` مثل `show_serial_numbers` (boolean nullable)؛ إذا null يُطبَّق إعداد الـ tenant.
- عند **طباعة الفاتورة**: إذا الإعداد يسمح بإظهار الأرقام التسلسلية، اعرض من علاقة `InvoiceLine::serials()` مع `itemSerial.serial_number`.

---

## 4. API مقترحة

| الطريقة | المسار | الوصف |
|--------|--------|--------|
| GET | `/api/tenant/items/{id}/serials/available` | Query: `warehouse_id`. يرجع الأرقام المتاحة لصنف في مستودع (للمبيعات). |
| POST | (ضمن حفظ فاتورة مشتريات/حركة إدخال) | في body الفاتورة/الحركة: مصفوفة أرقام تسلسلية لكل صنف تسلسلي. التحقق عبر `SerialNumbersService::validateSerialsForInbound` ثم إنشاء السجلات. |
| POST | (ضمن حفظ فاتورة مبيعات) | في body أسطر الفاتورة: لكل سطر صنف تسلسلي مصفوفة `selected_serial_ids`. التحقق عبر `validateSerialsForSalesInvoice` ثم `allocateSerialsToInvoiceLine` عند التأكيد. |
| GET | (إعدادات المستأجر) | قراءة/كتابة `invoice_show_serial_numbers` مع باقي إعدادات الطباعة. |

---

## 5. واجهة المستخدم (UI) ودعم الماسح الضوئي (Barcode Scanner)

### عرض حقل إدخال الأرقام التسلسلية

- **فاتورة مشتريات / إضافة مخزنية:** لكل صنف له `use_serial_number`:
  - إظهار حقل/منطقة إدخال بعدد يساوي **الكمية** (مثلاً قائمة حقول نصية، أو حقل واحد يقبل إدخال رقم ثم إضافته إلى قائمة ثم الانتقال للحقل تلقائياً).
- **فاتورة مبيعات:** لكل سطر صنف تسلسلي:
  - إظهار قائمة الأرقام **المتاحة** في مستودع الفاتورة (من API أعلاه) مع إمكانية اختيار عدد = الكمية (checkboxes أو multi-select).

### دعم الماسح الضوئي (Barcode Scanner)

- معظم الماسحات الضوئية تعمل كـ **لوحة مفاتيح** (HID): بعد مسح الباركود يُرسل النص ثم Enter.
- التوصيات:
  1. **حقل إدخال واحد (مثلاً آخر حقل في قائمة الأرقام)** يركز عليه المستخدم: عند إدخال نص + Enter (أو فقدان التركيز)، إضافة القيمة كرقم تسلسلي جديد ثم مسح الحقل والبقاء في نفس الحقل للمسح التالي.
  2. استخدام **واحد من**:
     - `onKeyDown`: إذا كان `key === 'Enter'`، اعتبار النص الحالي رقماً تسلسلياً وأضفه ثم امسح الحقل.
     - `onBlur` فقط إذا كان المحتوى غير فارغ ثم أضفه (أقل ملاءمة للماسح لأنه قد يرسل Enter).
  3. **منع إعادة التركيز المزعج:** بعد الإضافة لا تنقل التركيز إلى زر أو عنصر آخر؛ أبقِه في نفس الـ input حتى يُمسح الرقم التالي.
  4. عرض القائمة المسجلة (للمشتريات) أو المختارة (للمبيعات) تحته لمراجعة الأرقام وحذف الخطأ إن لزم.

بهذا يصبح الإدخال سريعاً ويُدعم الماسح الضوئي دون تغيير كبير في الـ backend (الباركود = الرقم التسلسلي كنص).

---

## 6. ملخص سريع

| العنصر | التطبيق |
|--------|---------|
| عزل البيانات | كل الجداول مرتبطة بـ `tenant_id`؛ الفريد على (tenant_id, item_id, serial_number). |
| تفعيل التتبع | حقل `items.use_serial_number`. |
| مشتريات/إضافة | إجبار إدخال عدد = الكمية، التحقق بعدم التكرار، إنشاء `item_serials` مع ربط بالحركة. |
| مبيعات | اختيار من المتاح في مستودع الفاتورة فقط، ربط عند التأكيد وتحديث الحالة إلى sold. |
| الطباعة | إعداد tenant (وربما override على الفاتورة) لإظهار/إخفاء الأرقام في الطباعة. |
| السرعة والماسح | حقل واحد يركز عليه المستخدم، Enter = إضافة رقم تسلسلي ومسح الحقل والبقاء في نفس الحقل. |

تم تنفيذ: Migration، نماذج `ItemSerial` و `InvoiceLineSerial`، تحديث `Item` و `InvoiceLine`، قاعدة `UniqueSerialPerTenantItem`، و`SerialNumbersService` للتحقق والربط. دمج استدعاءات الخدمة في نقاط حفظ فاتورة المشتريات/المبيعات والحركات المخزنية يكمّل المنطق على الـ API والـ UI.
