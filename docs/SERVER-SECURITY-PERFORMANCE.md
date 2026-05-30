# تأمين وتحسين أداء السيرفر — First Click ERP

**الدومين:** firstclickerp.top  
**النظام:** Ubuntu 22.04 | PHP 8.2 | MySQL 8 | Nginx | Laravel + React  

> ملفات جاهزة في المشروع: `deploy/nginx/` · `deploy/fail2ban/` · `deploy/supervisor/` · `deploy/cron/` · `deploy/mysql/` · `deploy/php/`

---

## تنبيهات قبل البدء

| الموضوع | التوصية |
|---------|---------|
| تغيير منفذ SSH | افتح **نافذة SSH ثانية** على المنفذ الجديد قبل إغلاق القديمة |
| Hostinger Firewall | أضف المنفذ الجديد **قبل** إعادة تشغيل `sshd` |
| كلمات المرور | لا تضعها في Git — استخدم `.env` و `/root/.my.cnf` فقط |
| جذر الموقع | **`/var/www/erp/backend/public`** (بعد `deploy.sh` تُنسخ الواجهة هنا) |
| PHP | المشروع مبني على **8.2** — تحقق: `php -v` ومسار FPM |

```bash
# اكتشاف إصدار PHP-FPM
ls /var/run/php/php*-fpm.sock
```

---

## ترتيب التنفيذ

### اليوم الأول — الأمان

1. تحديث النظام  
2. تأمين SSH (منفذ + مفاتيح)  
3. Fail2Ban  
4. UFW  
5. تأمين MySQL + مستخدم التطبيق  
6. Laravel `.env` (إنتاج)  
7. Nginx + رؤوس الأمان + Rate limit  
8. SSL (Let's Encrypt)

### اليوم الثاني — الأداء

9. Redis (cache + session + queue)  
10. PHP-FPM + OPcache  
11. ضبط MySQL 8  
12. Laravel cache + Supervisor للـ Queue  
13. بناء Frontend محسّن (`vite.config.ts`)  
14. مراقبة + Cron صيانة

---

## 1) تحديث النظام

```bash
apt update && apt upgrade -y
apt autoremove -y
```

---

## 2) تأمين SSH

```bash
nano /etc/ssh/sshd_config
```

```text
Port 2222
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
```

```bash
sshd -t && systemctl restart sshd
```

**Hostinger:** VPS → Security → Firewall → Allow TCP **2222**  
**اختبر:** `ssh -p 2222 user@187.124.35.87` من نافذة جديدة قبل قطع الجلسة الحالية.

---

## 3) Fail2Ban

```bash
apt install fail2ban -y
cp /var/www/erp/deploy/fail2ban/jail.local.example /etc/fail2ban/jail.local
# عدّل port = 2222 إن غيّرت SSH
systemctl enable fail2ban
systemctl restart fail2ban
fail2ban-client status
```

---

## 4) جدار UFW

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 2222/tcp comment 'SSH'
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status verbose
```

---

## 5) تأمين MySQL

```bash
mysql_secure_installation
sudo mysql
```

```sql
CREATE DATABASE IF NOT EXISTS firstclick_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'firstclick_user'@'localhost' IDENTIFIED BY 'YOUR_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON firstclick_erp.* TO 'firstclick_user'@'localhost';
FLUSH PRIVILEGES;
```

```bash
nano /var/www/erp/backend/.env
# DB_USERNAME=firstclick_user
# DB_PASSWORD=YOUR_STRONG_PASSWORD
```

**نسخ احتياطي آمن (بدون كلمة مرور في cron):**

```bash
cat > /root/.my.cnf << 'EOF'
[client]
user=firstclick_user
password=YOUR_STRONG_PASSWORD
host=localhost
EOF
chmod 600 /root/.my.cnf
```

---

## 6) تأمين Laravel

```bash
nano /var/www/erp/backend/.env
```

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=https://firstclickerp.top

SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_SECURE_COOKIE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax

SANCTUM_STATEFUL_DOMAINS=firstclickerp.top,www.firstclickerp.top
SESSION_DOMAIN=.firstclickerp.top
FRONTEND_URL=https://firstclickerp.top
```

```bash
cd /var/www/erp/backend
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache
chmod 600 .env
```

> **لا تستخدم `chmod 777`** — يكفي `775` مع مالك `www-data`.

---

## 7) Nginx (إنتاج)

### أ) Rate limiting (مرة واحدة — داخل `http {}`)

```bash
cp /var/www/erp/deploy/nginx/firstclick-rate-limit.conf /etc/nginx/conf.d/firstclick-rate-limit.conf
```

### ب) موقع HTTPS

```bash
cp /var/www/erp/deploy/nginx/firstclick-erp-ssl.conf /etc/nginx/sites-available/firstclick-erp
# عدّل server_name ومسار شهادة SSL إن لزم
ln -sf /etc/nginx/sites-available/firstclick-erp /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

القالب يستخدم:

- `root /var/www/erp/backend/public`
- `try_files` للـ SPA + `index.php` لـ `/api` و `/sanctum`
- رؤوس أمان + gzip + حد معدل الطلبات

---

## 8) SSL

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d firstclickerp.top -d www.firstclickerp.top
systemctl enable certbot.timer
certbot renew --dry-run
```

---

## 9) Redis

```bash
apt install redis-server php8.2-redis -y
```

```bash
nano /etc/redis/redis.conf
# bind 127.0.0.1
# requirepass YOUR_REDIS_PASSWORD
# maxmemory 256mb
# maxmemory-policy allkeys-lru
systemctl restart redis-server
```

```env
CACHE_STORE=redis
SESSION_DRIVER=redis
QUEUE_CONNECTION=redis
REDIS_HOST=127.0.0.1
REDIS_PASSWORD=YOUR_REDIS_PASSWORD
REDIS_PORT=6379
```

```bash
cd /var/www/erp/backend && php artisan config:cache
```

---

## 10) PHP-FPM + OPcache

```bash
# مقتطفات في deploy/php/
nano /etc/php/8.2/fpm/pool.d/www.conf
nano /etc/php/8.2/fpm/conf.d/10-opcache.ini
systemctl restart php8.2-fpm
```

راجع `deploy/php/opcache.ini.example` و `deploy/php-fpm-www.conf.snippet`.

---

## 11) MySQL 8 (بدون query_cache)

> MySQL 8 أزال `query_cache` — لا تفعّله.

```bash
cp /var/www/erp/deploy/mysql/mysqld-tuning.cnf.example /etc/mysql/mysql.conf.d/99-firstclick.cnf
systemctl restart mysql
```

---

## 12) Queue Worker (Supervisor)

```bash
apt install supervisor -y
cp /var/www/erp/deploy/supervisor/laravel-worker.conf /etc/supervisor/conf.d/laravel-worker.conf
supervisorctl reread && supervisorctl update
supervisorctl status
```

يتطلب `QUEUE_CONNECTION=redis` في `.env`.

---

## 13) Frontend Build

محسّن في `frontend/vite.config.ts` (تقسيم chunks + إزالة `console` في الإنتاج).

```bash
cd /var/www/erp
bash deploy.sh
```

---

## 14) مراقبة

```bash
apt install htop iotop -y
tail -f /var/log/nginx/firstclick-error.log
tail -f /var/www/erp/backend/storage/logs/laravel.log
fail2ban-client status sshd
```

---

## 15) صيانة تلقائية (Cron)

```bash
mkdir -p /backups && chmod 700 /backups
cp /var/www/erp/deploy/cron/firstclick-maintenance.example /etc/cron.d/firstclick-maintenance
nano /etc/cron.d/firstclick-maintenance   # تأكد من المسارات
chmod 644 /etc/cron.d/firstclick-maintenance
```

---

## 16) اختبار بعد الإعداد

```bash
curl -I https://firstclickerp.top
curl -I https://firstclickerp.top | grep -iE 'strict-transport|x-frame|x-content'
cd /var/www/erp/backend && php artisan about
redis-cli -a 'YOUR_REDIS_PASSWORD' ping
fail2ban-client status
ss -tlnp
```

---

## النشر بعد كل تحديث

```bash
cd /var/www/erp && git pull && bash deploy.sh
```

---

## النتائج المتوقعة (تقريبية)

| المقياس | قبل | بعد (تقريبي) |
|---------|-----|----------------|
| استجابة API | 500–800ms | 100–200ms |
| تحميل الصفحة | 2–3s | &lt;1s |
| حماية Brute Force | ❌ | ✅ Fail2Ban + rate limit |
| نسخ DB تلقائية | ❌ | ✅ cron يومي |

---

## استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| 502 | `systemctl status php8.2-fpm` — مسار socket في nginx |
| 500 Laravel | `storage/logs/laravel.log` — `.env` أو صلاحيات |
| Rate limit nginx error | تأكد من `conf.d/firstclick-rate-limit.conf` قبل `sites-enabled` |
| Redis connection | `REDIS_PASSWORD` + `php8.2-redis` |
| قفل SSH | Hostinger Console / VNC — أعد المنفذ 22 مؤقتاً |
