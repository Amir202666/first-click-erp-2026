#!/bin/bash
# ═══════════════════════════════════════════════════════════
# First Click ERP — نشر التحديثات على السيرفر
# الاستخدام: bash /var/www/erp/deploy.sh
# ═══════════════════════════════════════════════════════════
set -euo pipefail

PROJECT_DIR="/var/www/erp"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PUBLIC_DIR="$BACKEND_DIR/public"

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
if [ -n "$(git status --porcelain scripts/sync-database.sh 2>/dev/null)" ]; then
  git checkout -- scripts/sync-database.sh 2>/dev/null || true
fi
git pull origin main

# ── 3. Backend ───────────────────────────────────────────
echo "📦 composer install..."
cd "$BACKEND_DIR"
composer install --no-dev --optimize-autoloader --no-interaction

echo "🗄️  migrations..."
php artisan migrate --force

# ── 4. Frontend build → backend/public ───────────────────
echo "🎨 بناء الواجهة..."
cd "$FRONTEND_DIR"
if [ -f package-lock.json ]; then
  npm ci --prefer-offline
else
  npm install
fi
npm run build

echo "📁 نسخ dist إلى backend/public..."
mkdir -p "$PUBLIC_DIR"
rsync -a --delete "$FRONTEND_DIR/dist/" "$PUBLIC_DIR/" 2>/dev/null || {
  rm -rf "$PUBLIC_DIR/assets" "$PUBLIC_DIR/index.html" 2>/dev/null || true
  cp -r "$FRONTEND_DIR/dist/"* "$PUBLIC_DIR/"
}

# ── 5. Cache & permissions ───────────────────────────────
echo "⚡ cache..."
cd "$BACKEND_DIR"
php artisan storage:link 2>/dev/null || true
php artisan config:clear
php artisan route:clear
php artisan view:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache 2>/dev/null || true

if id www-data &>/dev/null; then
  chown -R www-data:www-data "$BACKEND_DIR/storage" "$BACKEND_DIR/bootstrap/cache" 2>/dev/null || true
fi
chmod -R 775 "$BACKEND_DIR/storage" "$BACKEND_DIR/bootstrap/cache" 2>/dev/null || true

# ── 6. خدمات ─────────────────────────────────────────────
if command -v systemctl &>/dev/null; then
  systemctl reload nginx 2>/dev/null || true
  systemctl reload php8.2-fpm 2>/dev/null || systemctl reload php-fpm 2>/dev/null || true
fi
if command -v supervisorctl &>/dev/null; then
  supervisorctl restart laravel-worker:* 2>/dev/null || true
fi

echo "========================================"
echo "✅ Deploy اكتمل بنجاح"
echo "========================================"
