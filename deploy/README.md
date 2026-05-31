# 🚀 First Click ERP — Deploy Guide (Hostinger VPS)

دليل رفع النظام على VPS من Hostinger (Ubuntu) خطوة بخطوة.

> **تأمين وأداء السيرفر (شامل):** [`docs/SERVER-SECURITY-PERFORMANCE.md`](../docs/SERVER-SECURITY-PERFORMANCE.md)

---

## المتطلبات

| الأداة | الإصدار |
|--------|---------|
| Ubuntu | 22.04+ (VPS) |
| PHP | 8.2 |
| MySQL | 8.x |
| Node.js | 20.x |
| Nginx | latest |

---

## الخطوات بالترتيب

### مرة واحدة فقط (إعداد أولي)

#### 1. اتصل بالسيرفر

```bash
ssh root@YOUR_SERVER_IP
```

من Hostinger: **VPS → SSH Access** أو Terminal في اللوحة.

#### 2. ثبّت المطلوبات على السيرفر

```bash
cd /var/www/erp   # بعد clone، أو من مجلد مؤقت بعد رفع الملفات
bash deploy/1-setup-server.sh
```

#### 3. أنشئ قاعدة البيانات

```bash
bash deploy/2-setup-database.sh
```

**احفظ** `DB_PASSWORD` الظاهرة في الطرفية.

> إذا فشل `mysql -u root` بسبب مصادقة socket على Ubuntu:
> `sudo mysql` ثم نفّذ أوامر CREATE يدوياً، أو:
> `sudo mysql_secure_installation`

#### 4. انسخ الكود

```bash
git clone https://github.com/YOUR_USER/first-click.git /var/www/erp
cd /var/www/erp
```

أو ارفع المشروع عبر SFTP إلى `/var/www/erp`.

#### 5. إعداد `.env`

```bash
cp deploy/env.production backend/.env
nano backend/.env
```

عدّل على الأقل:

- `APP_URL` — رابط الدومين
- `DB_PASSWORD` — من خطوة 3
- `SANCTUM_STATEFUL_DOMAINS` و `SESSION_DOMAIN` — اسم الدومين
- `FRONTEND_URL` — نفس `APP_URL`

#### 6. توليد `APP_KEY`

```bash
cd /var/www/erp/backend
php artisan key:generate
```

#### 7. إعداد Nginx

عدّل `DOMAIN` في الملف ثم شغّل:

```bash
nano deploy/4-setup-nginx.sh   # DOMAIN="yourdomain.com"
bash deploy/4-setup-nginx.sh
```

#### 8. أول deploy

```bash
bash deploy/3-deploy.sh
```

#### 9. SSL (بعد ضبط DNS)

عدّد `DOMAIN` و `EMAIL` في `deploy/5-setup-ssl.sh` ثم:

```bash
bash deploy/5-setup-ssl.sh
```

---

### عند كل تحديث

**من جهازك:**

```bash
git add .
git commit -m "your message"
git push origin main
```

**على السيرفر:**

```bash
ssh root@YOUR_SERVER_IP "cd /var/www/erp && bash deploy/3-deploy.sh"
```

---

## إعداد DNS (Hostinger)

| Type | Name | Value |
|------|------|-------|
| A | @ | YOUR_SERVER_IP |
| A | www | YOUR_SERVER_IP |

انتظر 5–30 دقيقة ثم شغّل `5-setup-ssl.sh`.

---

## الواجهة الأمامية والـ API

في الإنتاج، الواجهة تتصل بـ `/api` على نفس الدومين (لا حاجة لـ `VITE_API_URL` إذا كان Nginx مضبوطاً).

للتأكيد عند البناء:

```bash
# اختياري — frontend/.env.production
VITE_API_URL=/api
```

---

## النشر بعد كل تحديث (أمر واحد)

```bash
cd /var/www/erp && bash deploy.sh
```

**تحقق أن النسخة وصلت:**

```bash
curl -s https://firstclickerp.top/deploy-revision.txt
```

يجب أن يطابق آخر commit على GitHub (`git log -1 --oneline`).

> **سبب فشل Deploy سابقاً:** الفحص كان يتم **أثناء وضع الصيانة** فيُرجع HTML/301 بدل `{"ok":true}`. تم إصلاح ذلك — الصيانة تُرفع قبل الفحص.

---

## أوامر مفيدة

```bash
# سجلات Nginx
tail -f /var/log/nginx/firstclick-error.log

# سجلات Laravel
tail -f /var/www/erp/backend/storage/logs/laravel.log

# حالة الخدمات
systemctl status nginx php8.2-fpm mysql

# إعادة تشغيل
systemctl restart nginx php8.2-fpm mysql

# صلاحيات التخزين (إن لزم)
chown -R www-data:www-data /var/www/erp/backend/storage
chown -R www-data:www-data /var/www/erp/backend/bootstrap/cache
```

---

## ملفات السكربتات

| الملف | متى يُشغَّل |
|-------|-------------|
| `1-setup-server.sh` | مرة واحدة — PHP, Nginx, MySQL, Node |
| `2-setup-database.sh` | مرة واحدة — قاعدة البيانات |
| `3-deploy.sh` | كل تحديث — pull, migrate, build |
| `4-setup-nginx.sh` | مرة واحدة — إعداد الموقع |
| `5-setup-ssl.sh` | مرة واحدة — HTTPS |
| `6-apply-performance.sh` | Redis + OPcache + Supervisor + cache |
| `nginx/firstclick-erp-ssl.conf` | Nginx إنتاج HTTPS |
| `env.production` | قالب `backend/.env` |

---

## استكشاف الأخطاء

| التعديلات لا تظهر في المتصفح | امسح Service Worker + Clear site data، أو Ctrl+Shift+R. تحقق من `/deploy-revision.txt` |
| deploy.sh يفشل عند فحص API | تأكد `php artisan up` — السكربت الجديد يرفع الصيانة قبل الفحص |
| 301 على curl محلي | طبيعي لـ HTTP — الفحص يستخدم HTTPS `--resolve` أو Laravel داخلياً |
| 502 Bad Gateway | `systemctl status php8.2-fpm` — تأكد من المسار `php8.2-fpm.sock` |
| 500 Laravel | `tail storage/logs/laravel.log` — غالباً `.env` أو صلاحيات `storage` |
| صفحة بيضاء / 404 للروابط | تأكد من `try_files` ووجود `frontend/dist/index.html` |
| CORS / تسجيل دخول | `SANCTUM_STATEFUL_DOMAINS` و `SESSION_DOMAIN` و HTTPS |
| فشل migrate | تحقق من `DB_*` في `.env` |

---

## جعل السكربتات قابلة للتنفيذ (اختياري)

```bash
chmod +x deploy/*.sh
```
