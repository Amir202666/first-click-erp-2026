#!/bin/bash
# إعادة بناء الواجهة فقط (بدون git pull) — للتأكد من ظهور التحديثات
set -euo pipefail

PROJECT_DIR="${1:-/var/www/erp}"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKEND_DIR="$PROJECT_DIR/backend"

echo "📥 آخر commit:"
git -C "$PROJECT_DIR" log -1 --oneline

echo "🎨 بناء الواجهة..."
cd "$FRONTEND_DIR"
if [ -f package-lock.json ]; then
  npm ci --prefer-offline
else
  npm install
fi
npm run build

bash "$PROJECT_DIR/deploy/lib/sync-public.sh" "$PROJECT_DIR"

cd "$BACKEND_DIR"
php artisan up 2>/dev/null || true
php artisan config:clear
php artisan view:clear

echo "🔍 فحص API..."
bash "$PROJECT_DIR/deploy/lib/verify-api.sh" "$BACKEND_DIR"

echo "✅ تم — حدّث المتصفح بـ Ctrl+Shift+R على https://firstclickerp.top"
