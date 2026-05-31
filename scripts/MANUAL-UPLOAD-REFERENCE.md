# رفع ملف العملات/الفروع/مراكز التكلفة (بدون SSH من Windows)

إذا ظهر: `ssh: connect to host ... Connection timed out` — هذا طبيعي من جهازك.

## الطريقة الأسهل — عبر GitHub (موصى بها)

1. على جهازك: `scripts\export-reference-local.bat first-company`
2. انسخ الملف الأحدث إلى:
   `backend\storage\app\imports\reference_first-company.json`
3. `git add backend/storage/app/imports/reference_first-company.json`
4. `git commit` + `git push`
5. على السيرفر (Hostinger Terminal):

```bash
bash /var/www/erp/deploy/import-reference.sh
```

---

## بديل — لوحة Hostinger File Manager

---

## 1) على جهازك — التصدير (تم بنجاح)

الملف موجود تقريباً هنا:

```
d:\erp projects\first click\backend\storage\app\exports\reference_first-company_YYYYMMDD_HHMMSS.json
```

افتح المجلد في مستكشف الملفات وانسخ **أحدث** ملف `reference_first-company_*.json`.

---

## 2) Hostinger — رفع الملف

1. ادخل **hPanel** → **VPS** → **File Manager** (أو SFTP إن كان مفعّلاً).
2. اذهب إلى:
   ```
   /var/www/erp/backend/storage/app/imports/
   ```
3. إن لم يكن مجلد `imports` موجوداً — أنشئه.
4. ارفع الملف وسمّه بالضبط:
   ```
   reference_first-company.json
   ```

---

## 3) Hostinger — Browser Terminal

```bash
cd /var/www/erp
git pull
cd backend
php artisan tenant:sync-reference import --slug=first-company --file=storage/app/imports/reference_first-company.json
```

يجب أن يظهر جدول: عملات / فروع / مراكز تكلفة.

---

## 4) تحقق

افتح https://firstclickerp.top → العملات / الفروع / مراكز التكلفة.

---

## بديل: نسخ المحتوى (ملف صغير)

إذا لم يعمل File Manager:

```bash
mkdir -p /var/www/erp/backend/storage/app/imports
nano /var/www/erp/backend/storage/app/imports/reference_first-company.json
```

الصق محتوى الملف من Notepad واحفظ (Ctrl+O, Enter, Ctrl+X).

ثم نفّذ أمر `php artisan tenant:sync-reference import` أعلاه.
