# رفع db_backup.sql على VPS (بدون File Manager)

على **VPS** لا يوجد عادة «مدير ملفات». وإن فشل WinSCP (timeout) استخدم **الطريقة 0**.

---

## الطريقة 0 — رابط مؤقت (موصى بها عند فشل WinSCP)

1. على جهازك شغّل:

```bat
scripts\upload-db-via-link.bat
```

2. انسخ الأوامر التي تظهر (wget + publish-all-online.sh)
3. الصقها في **Hostinger → VPS → Terminal**

**يدوياً:** افتح https://0x0.st في المتصفح → ارفع `UPLOAD_AS_db_backup.sql` → انسخ الرابط → على السيرفر:

```bash
wget -O /var/www/erp/db_backup.sql "الرابط_هنا"
bash /var/www/erp/deploy/publish-all-online.sh
```

---

## الطريقة 1 — من جهازك (إن كان SSH يعمل)

1. تأكد أن الملف موجود:
   `scripts\backups\UPLOAD_AS_db_backup.sql`
2. انقر مرتين:
   `scripts\upload-db-to-server.bat`
3. أدخل **كلمة مرور root** للسيرفر عندما يطلبها (من Hostinger → VPS → كلمة المرور).

إن نجح → انتهيت. افتح الموقع واضغط Ctrl+Shift+R.

---

## الطريقة 2 — WinSCP (إذا فشلت الطريقة 1)

1. حمّل **WinSCP**: https://winscp.net
2. اتصال جديد:
   - **Host:** `187.124.35.87`
   - **User:** `root`
   - **Password:** من Hostinger → **VPS** → سيرفرك → **Root password** (أو أعد التعيين)
   - **Port:** `22` (أو المنفذ الظاهر في لوحة VPS إن كان مختلفاً)
3. اتصل → اذهب إلى: `/var/www/erp/`
4. اسحب الملف من جهازك:
   `UPLOAD_AS_db_backup.sql`
5. على السيرفر **سمّه:** `db_backup.sql`
6. Hostinger → VPS → **Terminal** والصق:

```bash
bash /var/www/erp/deploy/publish-all-online.sh
```

---

## الطريقة 3 — Terminal في Hostinger فقط

1. hPanel → **VPS** (وليس «مواقع إلكترونية»)
2. اختر السيرفر → **Terminal** / **Browser terminal**
3. ابحث في أعلى نافذة الطرفية عن أيقونة **رفع / Upload** (إن وُجدت)
4. ارفع الملف ثم:

```bash
mv ~/db_backup.sql /var/www/erp/db_backup.sql
# أو إن رُفع لـ /tmp:
cp /tmp/db_backup.sql /var/www/erp/db_backup.sql
bash /var/www/erp/deploy/publish-all-online.sh
```

---

## تحقق أن الملف وصل

```bash
ls -lh /var/www/erp/db_backup.sql
```

يجب أن يظهر حجم ~270 KB أو أكثر.

---

## أين كلمة مرور root؟

**hPanel** → **VPS** → اختر السيرفر → **Manage** → **Root password** / **Change password**

---

## إذا SSH لا يعمل من Windows

استخدم **الطريقة 2 (WinSCP)** أو **الطريقة 3 (Terminal في المتصفح)** فقط — لا تحتاج File Manager.
