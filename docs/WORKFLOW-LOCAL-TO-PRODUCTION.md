# Workflow التطوير المحلي → السيرفر الأونلاين

دليل العمل الاحترافي لمشروع **First Click ERP**.

```
جهازك (Laragon/XAMPP)  →  git push  →  GitHub (main)  →  deploy على السيرفر
```

---

## 1) هيكل المشروع

```
D:\erp projects\first click\     ← أو D:\laragon\www\first-click
├── backend\                     ← Laravel
│   ├── .env                     ← محلي فقط (لا يُرفع)
│   └── public\                  ← هنا تُنسخ ملفات React بعد البناء
├── frontend\                    ← React (Vite)
│   ├── .env.local               ← محلي فقط
│   └── dist\                    ← مخرجات البناء
├── deploy\                      ← سكريبتات السيرفر
├── deploy.sh                    ← تحديث الإنتاج (على السيرفر)
└── scripts\                     ← أدوات محلية
```

---

## 2) إعداد المحلي (مرة واحدة)

> **مهم:** اختبر كل التعديلات محلياً قبل `git push`.  
> شغّل **MySQL من XAMPP** أولاً.

### طريقة واحدة (موصى بها)

```cmd
cd "D:\erp projects\first click"
scripts\local-bootstrap.bat
scripts\local-dev.cmd
```

يفتح: http://localhost:5173

### بيانات الدخول المحلية (بعد local:setup)

| الحقل | القيمة |
|--------|--------|
| معرف الشركة | `first-company` |
| Super Admin | `admin@firstclickerp.com` / `FirstClick@2026` |
| المالك | `firstclick-erp` / `FirstClickERP` |

### إعداد يدوي (بديل)

```cmd
mysql -u root -e "CREATE DATABASE IF NOT EXISTS firstclick_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### ملفات البيئة

```cmd
cd "D:\erp projects\first click"
scripts\setup-local-env.bat
```

أو يدوياً:

- انسخ `backend\.env.local.example` → `backend\.env`
- انسخ `frontend\.env.local.example` → `frontend\.env.local`
- `cd backend` ثم `php artisan key:generate`

### Migrations وبيانات أولية

```cmd
cd backend
php artisan local:setup
```

أو يدوياً:

```cmd
cd backend
php artisan migrate --force
php artisan admin:create
php artisan tenants:seed-defaults
```

---

## 2b) سير العمل: محلي → GitHub → أونلاين

```
1. عدّل الكود محلياً
2. scripts\local-dev.cmd — اختبر
3. git add / commit / push
4. على السيرفر: cd /var/www/erp && git pull && bash deploy.sh
```

**لا ترفع مباشرة للسيرفر دون اختبار محلي.**

---

## 3) التشغيل اليومي (محلي) — كان 3

### تطوير سريع (Vite + artisan serve)

```cmd
scripts\local-dev.cmd
```

- الواجهة: http://localhost:5173  
- API: http://127.0.0.1:8000/api  

### اختبار كإنتاج محلي (Laragon)

```cmd
build-production.cmd
```

ثم افتح الموقع من Laragon (مثلاً `http://first-click.test`) — الجذر يشير إلى `backend\public`.

---

## 4) بعد إنهاء التعديلات (محلي)

```cmd
cd "D:\erp projects\first click"

git status
git add .
git commit -m "وصف واضح للتعديل"
git push origin main
```

> **لا ترفع أبداً:** `.env`، `backend\.env`، `frontend\.env.local`، `vendor\`، `node_modules\`

---

## 5) النشر على السيرفر (بعد الاختبار المحلي)

### يدوياً (مُوصى به حتى تتأكد من الاستقرار)

```bash
ssh root@187.124.35.87
cd /var/www/erp
bash deploy.sh
```

### ماذا يفعل `deploy.sh`؟

1. وضع صيانة مؤقت
2. `git pull origin main` (مع حفظ تعديلات محلية على السيرفر إن وُجدت)
3. `composer install` + `migrate`
4. بناء الواجهة ونسخها إلى `backend/public`
5. مسح الكاش وإعادة بنائه
6. إيقاف وضع الصيانة

---

## 6) GitHub Actions (اختياري — نشر تلقائي)

عند تفعيل الأسرار في GitHub، كل `push` على `main` يشغّل النشر.

**الإعداد:** GitHub → Repository → Settings → Secrets → Actions

| Secret | القيمة |
|--------|--------|
| `SERVER_HOST` | `187.124.35.87` |
| `SERVER_USER` | `root` |
| `SERVER_PASSWORD` | كلمة مرور SSH |

أو استخدم مفتاح SSH (`SERVER_SSH_KEY`) بدلاً من كلمة المرور — أنسب أمنياً.

يمكن أيضاً تشغيل النشر يدوياً من تبويب **Actions** → **Deploy to Production** → **Run workflow**.

---

## 7) مزامنة بيانات الإنتاج → محلي (اختياري)

```bash
# على السيرفر
mysqldump -u firstclick_user -p firstclick_erp > /tmp/prod.sql

# على Windows (WinSCP أو scp)
# ثم محلياً:
mysql -u root firstclick_local < C:\backup\prod.sql
```

أو استخدم السكريبتات الموجودة: `scripts\export-local-db.bat` و `scripts\sync-database.sh`.

---

## 8) أوامر مفيدة

| المهمة | الأمر |
|--------|--------|
| migration جديد | `php artisan make:migration ...` |
| تشغيل migrations محلياً | `php artisan migrate` |
| اختبار أسعار الصرف | `php artisan exchange:test KWD --targets=SAR` |
| دليل حسابات | `php artisan accounts:seed-chart --slug=first-company` |
| سجلات الأخطاء | `backend\storage\logs\laravel.log` |
| بناء للإنتاج | `build-production.cmd` |

---

## 9) ملخص سير العمل

```
┌─────────────────────────────────────────────────────────┐
│ 1. عدّل محلياً واختبر (npm run dev أو build-production) │
│ 2. git commit + git push origin main                     │
│ 3. على السيرفر: bash deploy.sh                         │
│ 4. تحقق من https://firstclickerp.top                     │
└─────────────────────────────────────────────────────────┘
```

عند **migration جديد**: اختبر `php artisan migrate` محلياً أولاً — السيرفر يشغّله تلقائياً داخل `deploy.sh`.
