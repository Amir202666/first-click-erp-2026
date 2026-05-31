#!/bin/bash
# ═══════════════════════════════════════════════════════════
# First Click ERP — نشر التحديثات على السيرفر (نسخة مستقرة)
# الاستخدام: bash /var/www/erp/deploy.sh
# ═══════════════════════════════════════════════════════════
set -euo pipefail

PROJECT_DIR="/var/www/erp"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PUBLIC_DIR="$BACKEND_DIR/public"
export COMPOSER_ALLOW_SUPERUSER=1

detect_php_fpm() {
  for s in /var/run/php/php8.4-fpm.sock /var/run/php/php8.2-fpm.sock /var/run/php/php-fpm.sock; do
    if [ -S "$s" ]; then echo "$s"; return; fi
  done
  echo "unix:/var/run/php/php8.2-fpm.sock"
}

ensure_laravel_entry() {
  cp -f "$PROJECT_DIR/deploy/stubs/laravel-public/index.php" "$PUBLIC_DIR/index.php"
  cp -f "$PROJECT_DIR/deploy/stubs/laravel-public/.htaccess" "$PUBLIC_DIR/.htaccess"
}

echo "========================================"
echo "🚀 بدء Deploy — $(date '+%Y-%m-%d %H:%M')"
echo "========================================"

if [ ! -d "$PROJECT_DIR/.git" ]; then
  echo "❌ المشروع غير موجود في $PROJECT_DIR"
  exit 1
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "❌ ملف .env غير موجود — انسخ deploy/env.production إلى backend/.env"
  exit 1
fi

# ── 1. وضع الصيانة ───────────────────────────────────────
echo "⏸  وضع الصيانة..."
cd "$BACKEND_DIR"
php artisan down --retry=60 --secret="${DEPLOY_SECRET:-deploy2026}" 2>/dev/null || php artisan down --retry=60 || true

cleanup() {
  echo "▶  إيقاف وضع الصيانة..."
  cd "$BACKEND_DIR" && php artisan up 2>/dev/null || true
}
trap cleanup EXIT

# ── 2. جلب التعديلات ─────────────────────────────────────
echo "📥 git pull..."
cd "$PROJECT_DIR"
git fetch origin main
git reset --hard origin/main
echo "📌 $(git log -1 --oneline)"

# ── 3. Backend ───────────────────────────────────────────
echo "📦 composer install..."
cd "$BACKEND_DIR"
composer install --no-dev --optimize-autoloader --no-interaction

echo "🗄️  migrations..."
php artisan migrate --force

echo "👤 حساب الدخول الوحيد..."
php artisan db:seed --class=OwnerSeeder --force 2>/dev/null || true

# ── 4. Frontend build → backend/public ───────────────────
echo "🎨 بناء الواجهة..."
cd "$FRONTEND_DIR"
if [ -f package-lock.json ]; then
  npm ci --prefer-offline
else
  npm install
fi
npm run build

bash "$PROJECT_DIR/deploy/lib/sync-public.sh" "$PROJECT_DIR"
ensure_laravel_entry

# ── 5. Cache ───────────────────────────────────────────────
echo "⚡ cache..."
cd "$BACKEND_DIR"
php artisan storage:link 2>/dev/null || true

if grep -qE '^CACHE_STORE=redis' .env 2>/dev/null; then
  php artisan cache:clear 2>/dev/null || echo "⚠️  Redis غير متاح — تجاهل cache:clear"
fi

php artisan config:clear
php artisan route:clear
php artisan view:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache 2>/dev/null || true

# ── 6. Nginx ───────────────────────────────────────────────
PHP_SOCK=$(detect_php_fpm)
if [ -f "$PROJECT_DIR/deploy/nginx/firstclick-erp-ssl.conf" ] && [ -d /etc/nginx/sites-available ]; then
  cp "$PROJECT_DIR/deploy/nginx/firstclick-erp-ssl.conf" /etc/nginx/sites-available/firstclick-erp
  sed -i "s|unix:/var/run/php/php8.2-fpm.sock|${PHP_SOCK}|g" /etc/nginx/sites-available/firstclick-erp
  ln -sf /etc/nginx/sites-available/firstclick-erp /etc/nginx/sites-enabled/firstclick-erp 2>/dev/null || true
fi

# ── 7. إيقاف الصيانة قبل الفحص (مهم — الفحص HTTP يفشل أثناء الصيانة) ──
echo "▶  رفع وضع الصيانة قبل الفحص..."
php artisan up
trap - EXIT

if id www-data &>/dev/null; then
  chown -R www-data:www-data "$BACKEND_DIR/storage" "$BACKEND_DIR/bootstrap/cache" "$PUBLIC_DIR/index.php" 2>/dev/null || true
fi
chmod -R 775 "$BACKEND_DIR/storage" "$BACKEND_DIR/bootstrap/cache" 2>/dev/null || true

if command -v systemctl &>/dev/null; then
  nginx -t
  systemctl reload nginx
  systemctl reload php8.4-fpm 2>/dev/null || systemctl reload php8.2-fpm 2>/dev/null || systemctl reload php-fpm 2>/dev/null || true
fi
if command -v supervisorctl &>/dev/null; then
  supervisorctl restart laravel-worker:* 2>/dev/null || true
fi

# ── 8. تحقق API ───────────────────────────────────────────
if ! bash "$PROJECT_DIR/deploy/lib/verify-api.sh" "$BACKEND_DIR"; then
  echo "🔧 إصلاح index.php وإعادة المحاولة..."
  ensure_laravel_entry
  systemctl reload nginx 2>/dev/null || true
  bash "$PROJECT_DIR/deploy/lib/verify-api.sh" "$BACKEND_DIR"
fi

# ── 9. سجل النشر ─────────────────────────────────────────
DEPLOY_REV=$(git -C "$PROJECT_DIR" rev-parse --short HEAD)
echo "$DEPLOY_REV $(date -Iseconds)" > "$PUBLIC_DIR/deploy-revision.txt"
echo "📋 revision: $DEPLOY_REV → https://firstclickerp.top/deploy-revision.txt"

echo "========================================"
echo "✅ Deploy اكتمل — $(date '+%H:%M')"
echo "   حدّث المتصفح: Ctrl+Shift+R"
echo "   أو امسح Service Worker من DevTools"
echo "========================================"
