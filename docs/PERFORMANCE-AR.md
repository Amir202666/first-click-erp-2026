# دليل تحسين أداء First Click ERP

> **السيرفر:** firstclickerp.top · Ubuntu · PHP 8.4 · MySQL 8 · Nginx  
> **سكربت واحد يطبّق معظم التحسينات:** `bash deploy/6-apply-performance.sh`  
> **تشخيص قبل/بعد:** `bash deploy/diagnose-performance.sh`

---

## 1) تشخيص المشكلة أولاً

على **Console السيرفر**:

```bash
cd /var/www/erp
bash deploy/diagnose-performance.sh
```

أو يدوياً:

```bash
curl -o /dev/null -s -w "DNS: %{time_namelookup}s | Connect: %{time_connect}s | TTFB: %{time_starttransfer}s | Total: %{time_total}s\n" https://firstclickerp.top

curl -o /dev/null -s -w "API: %{time_total}s\n" https://firstclickerp.top/api/health

free -h
df -h
top -bn1 | head -20
```

---

## 2) تطبيق التحسينات (أمر واحد)

```bash
cd /var/www/erp
git pull origin main
bash deploy/6-apply-performance.sh
```

إذا RAM أقل من 2GB:

```bash
bash deploy/6-apply-performance.sh --with-swap
```

**ما يفعله السكربت:**

| المكوّن | الإجراء |
|---------|---------|
| Redis | تثبيت + `php8.4-redis` |
| OPcache | 256MB — `validate_timestamps=0` |
| PHP-FPM | `pm.max_children=20` … |
| MySQL 8 | InnoDB buffer pool 512M + slow log |
| Nginx | gzip، keepalive، static cache 30d |
| Laravel | `config/route/view/event` cache |
| Composer | `--optimize-autoloader --no-dev` |

---

## 3) ضبط `.env` (يدوياً — مرة واحدة)

```bash
nano /var/www/erp/backend/.env
```

```env
APP_ENV=production
APP_DEBUG=false
LOG_LEVEL=error

# Laravel 11 — استخدم CACHE_STORE وليس CACHE_DRIVER
CACHE_STORE=redis
SESSION_DRIVER=redis
QUEUE_CONNECTION=redis
REDIS_CLIENT=phpredis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# REDIS_PASSWORD=...   # إن فعّلت requirepass في redis.conf
```

```bash
cd /var/www/erp/backend
php artisan config:cache
```

> **لا تحتاج** `composer require predis/predis` — المشروع يستخدم امتداد **phpredis** (`php8.4-redis`).

---

## 4) Redis (إن لم يُثبَّت تلقائياً)

```bash
apt install redis-server php8.4-redis -y
systemctl enable redis-server && systemctl start redis-server
```

اختياري في `/etc/redis/redis.conf`:

```conf
bind 127.0.0.1
requirepass YOUR_REDIS_PASSWORD
maxmemory 256mb
maxmemory-policy allkeys-lru
```

---

## 5) OPcache و PHP-FPM

الملفات في المشروع:

| ملف | يُنسخ إلى |
|-----|-----------|
| `deploy/php/opcache.ini.example` | `/etc/php/8.4/fpm/conf.d/99-firstclick-opcache.ini` |
| `deploy/php/firstclick-fpm-pool.conf` | `/etc/php/8.4/fpm/pool.d/zz-firstclick-performance.conf` |

```bash
systemctl restart php8.4-fpm
```

> بعد كل `deploy.sh` يُعاد تشغيل php-fpm تلقائياً لتحميل الكود.

---

## 6) Nginx

القالب الرئيسي: `deploy/nginx/firstclick-erp-ssl.conf`  
- Static assets: cache **30 يوم** (`immutable`)  
- `index.html` / `sw.js`: **no-cache** (لتحديث الواجهة)

ضبط عام: `deploy/nginx/http-performance.conf` → `/etc/nginx/conf.d/`

```bash
nginx -t && systemctl reload nginx
```

> **لا تفعّل** `fastcgi_cache` لمسارات `/api` — Laravel يحتاج استجابات حية.

---

## 7) MySQL 8

```bash
cp /var/www/erp/deploy/mysql/mysqld-tuning.cnf.example /etc/mysql/mysql.conf.d/99-firstclick.cnf
systemctl restart mysql
```

> **MySQL 8 أزال `query_cache`** — لا تضف `query_cache_type` (سيفشل).

مراقبة الاستعلامات البطيئة:

```bash
tail -f /var/log/mysql/slow.log
```

---

## 8) Frontend (React/Vite)

محسّن مسبقاً في `frontend/vite.config.ts`:

- تقسيم `manualChunks` (react, router, query, ui)
- حذف `console.log` في الإنتاج (`esbuild.drop`)

إعادة البناء تتم عبر:

```bash
bash /var/www/erp/deploy/publish-online.sh
```

---

## 9) Swap (RAM &lt; 2GB)

```bash
bash deploy/6-apply-performance.sh --with-swap
```

---

## 10) نسخة احتياطية يومية

```bash
# أنشئ /root/.my.cnf (انظر docs/SERVER-SECURITY-PERFORMANCE.md)
bash /var/www/erp/deploy/backup-daily.sh
```

Cron (مرة واحدة):

```bash
cp /var/www/erp/deploy/cron/firstclick-maintenance.example /etc/cron.d/firstclick-maintenance
nano /etc/cron.d/firstclick-maintenance
chmod 644 /etc/cron.d/firstclick-maintenance
```

---

## 11) مراقبة

```bash
apt install htop iotop -y
tail -f /var/log/nginx/firstclick-error.log
tail -f /var/www/erp/backend/storage/logs/laravel.log
```

---

## ملخص الأولويات

| الإجراء | التأثير | الوقت |
|---------|---------|-------|
| `bash deploy/6-apply-performance.sh` | 🔥 شامل | ~5 دقائق |
| `APP_DEBUG=false` | 🔥 كبير | دقيقة |
| OPcache 256MB | 🔥 كبير | ضمن السكربت |
| Redis للـ cache | ⚡ كبير | ضمن السكربت + `.env` |
| MySQL InnoDB tuning | ⚡ متوسط | ضمن السكربت |
| Swap (RAM قليل) | 📈 مساعد | `--with-swap` |

---

## اختبار بعد التحسين

```bash
bash deploy/diagnose-performance.sh
```

**أهداف تقريبية:**

| المقياس | جيد |
|---------|-----|
| API `/api/health` | &lt; 200ms |
| TTFB الصفحة الرئيسية | &lt; 800ms |

---

**مرتبط:** [`docs/SERVER-SECURITY-PERFORMANCE.md`](SERVER-SECURITY-PERFORMANCE.md) — أمان + أداء شامل
