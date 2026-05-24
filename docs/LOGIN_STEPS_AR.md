# خطوات تسجيل الدخول — First Click ERP

## 1. التأكد من وجود المستخدم التجريبي

من مجلد المشروع، نفّذ:

```powershell
cd "d:\erp projects\first click\backend"
php artisan db:seed --class=DemoDataSeeder
```

إذا ظهر خطأ `Unique constraint` فالمستخدم موجود مسبقاً ولا حاجة لتكرار الأمر.

---

## 2. إعداد ملف البيئة للواجهة الأمامية (Frontend)

تأكد من وجود ملف `frontend\.env` ويحتوي على:

```
VITE_API_URL=http://localhost:8000/api
VITE_APP_NAME="First Click ERP"
```

إن لم يكن الملف موجوداً انسخه من `frontend\.env.example`.

**مهم:** بعد أي تعديل على `.env` في مجلد frontend أعد تشغيل خادم الواجهة (`npm run dev`).

---

## 3. تشغيل الخادمين

### الطرفية الأولى — Backend (Laravel)

```powershell
cd "d:\erp projects\first click\backend"
php artisan serve
```

يجب أن يعمل على: **http://127.0.0.1:8000**

### الطرفية الثانية — Frontend (React)

```powershell
cd "d:\erp projects\first click\frontend"
npm run dev
```

يجب أن يعمل على: **http://localhost:5173**

---

## 4. بيانات الدخول

| الحقل | القيمة |
|--------|--------|
| **البريد الإلكتروني** | `admin@firstclick.com` |
| **كلمة المرور** | `password123` |

---

## 5. تسجيل الدخول من المتصفح

1. افتح المتصفح وادخل إلى: **http://localhost:5173**
2. اكتب البريد: `admin@firstclick.com`
3. اكتب كلمة المرور: `password123`
4. اضغط **تسجيل الدخول**.

---

## إذا استمر فشل تسجيل الدخول

- تأكد أن **Backend** يعمل على المنفذ 8000 (لا تغلق الطرفية التي تشغّل `php artisan serve`).
- تأكد أن **Frontend** يعمل على المنفذ 5173.
- تأكد أن ملف `frontend\.env` موجود وأن `VITE_API_URL=http://localhost:8000/api` ثم أعد تشغيل `npm run dev`.
- إذا ظهرت رسالة **"بيانات الاعتماد غير صحيحة"** فتحقق من كتابة البريد وكلمة المرور كما هي أعلاه (بدون مسافات زائدة).
- جرّب في نافذة خاصة (Incognito) أو امسح الكوكيز لموقع localhost ثم أعد المحاولة.
