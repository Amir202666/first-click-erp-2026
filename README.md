# First Click ERP - نظام المحاسبة المتكامل

نظام ERP محاسبي متعدد المستأجرين (Multi-Tenant) يعمل بنظام اشتراكات سنوية.

## التقنيات المستخدمة

- **Backend:** Laravel 12 + PHP 8.2
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Database:** PostgreSQL
- **Auth:** Laravel Sanctum

## المتطلبات

- PHP 8.2+
- Composer
- Node.js 18+
- PostgreSQL 15+
- npm أو pnpm

## التثبيت

### 1. إعداد Backend (Laravel)

```bash
cd backend
cp .env.example .env
# عدّل .env وقم بتعيين:
# DB_CONNECTION=pgsql
# DB_HOST=127.0.0.1
# DB_PORT=5432
# DB_DATABASE=first_click_erp
# DB_USERNAME=postgres
# DB_PASSWORD=your_password

php artisan key:generate
php artisan migrate
php artisan db:seed --class=SubscriptionPlanSeeder
php artisan serve
```

### 2. إعداد Frontend (React)

```bash
cd frontend
npm install
# أنشئ ملف .env:
# VITE_API_URL=http://localhost:8000/api

npm run dev
```

### 3. إنشاء مستخدم تجريبي

```bash
cd backend
php artisan tinker
>>> $user = \App\Models\User::create(['name'=>'Admin','email'=>'admin@test.com','password'=>bcrypt('password')]);
>>> $tenant = \App\Models\Tenant::create(['name'=>'شركة تجريبية','slug'=>'demo','email'=>'admin@test.com','is_active'=>true]);
>>> $tenant->users()->attach($user->id, ['role'=>'admin','is_active'=>true]);
>>> \Database\Seeders\ChartOfAccountsSeeder::run($tenant->id);
```

## هيكل المشروع

```
first-click/
├── backend/          # Laravel API
├── frontend/         # React SPA
├── docs/             # التوثيق
│   └── IMPLEMENTATION_PLAN_AR.md  # خطة التنفيذ بالعربية
└── PROJECT_STRUCTURE.md
```

## الميزات المخططة

- [x] نظام Multi-Tenant
- [x] خطط الاشتراكات (أساسي، متوسط، متقدم)
- [x] دليل حسابات شجري
- [x] Migrations لقاعدة البيانات
- [ ] القيود اليومية التلقائية
- [ ] فواتير المبيعات والمشتريات
- [ ] إدارة المخزون (FIFO/LIFO/متوسط)
- [ ] التقارير المالية
- [ ] لوحة تحكم تفاعلية
- [ ] 2FA وتصدير PDF/Excel

## الخطوات التالية

راجع `docs/IMPLEMENTATION_PLAN_AR.md` للخطة التفصيلية.

## الترخيص

MIT
