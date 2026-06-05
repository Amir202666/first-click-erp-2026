#!/bin/bash
# إصلاح الواجهة: إعادة بناء بدون localhost في bundle
# bash /var/www/erp/deploy/rebuild-frontend-production.sh
set -euo pipefail

PROJECT_DIR="/var/www/erp"
FRONTEND_DIR="$PROJECT_DIR/frontend"

cd "$PROJECT_DIR"
git fetch origin main
git reset --hard origin/main

cd "$FRONTEND_DIR"
export VITE_API_URL=/api
[ -f .env.local ] && mv .env.local .env.local.build-bak
npm run build
[ -f .env.local.build-bak ] && mv .env.local.build-bak .env.local

if grep -rq '127\.0\.0\.1:8000' dist/; then
  echo "❌ Build still contains localhost — contact support"
  exit 1
fi

bash "$PROJECT_DIR/deploy/lib/sync-public.sh" "$PROJECT_DIR"
cp -f "$PROJECT_DIR/deploy/stubs/laravel-public/index.php" "$PROJECT_DIR/backend/public/index.php"
cp -f "$PROJECT_DIR/deploy/stubs/laravel-public/.htaccess" "$PROJECT_DIR/backend/public/.htaccess"

PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null || echo "8.4")
systemctl reload nginx
systemctl restart "php${PHP_VER}-fpm" 2>/dev/null || true

REV=$(git -C "$PROJECT_DIR" rev-parse --short HEAD)
echo "$REV $(date -Iseconds)" > "$PROJECT_DIR/backend/public/deploy-revision.txt"

echo "✅ Frontend rebuilt — revision $REV"
echo "   في المتصفح: Ctrl+Shift+Delete → Clear site data → أو نافذة خاصة"
