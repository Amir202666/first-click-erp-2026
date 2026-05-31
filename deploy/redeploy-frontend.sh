#!/bin/bash
# إعادة بناء الواجهة فقط + فحص — بدون git pull
set -euo pipefail

PROJECT_DIR="${1:-/var/www/erp}"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKEND_DIR="$PROJECT_DIR/backend"
PUBLIC_DIR="$BACKEND_DIR/public"
STUBS="$PROJECT_DIR/deploy/stubs/laravel-public"

echo "📌 $(git -C "$PROJECT_DIR" log -1 --oneline)"

echo "🎨 بناء الواجهة..."
cd "$FRONTEND_DIR"
if [ -f package-lock.json ]; then
  npm ci --prefer-offline
else
  npm install
fi
npm run build

bash "$PROJECT_DIR/deploy/lib/sync-public.sh" "$PROJECT_DIR"
cp -f "$STUBS/index.php" "$PUBLIC_DIR/index.php"
cp -f "$STUBS/.htaccess" "$PUBLIC_DIR/.htaccess"

cd "$BACKEND_DIR"
php artisan up 2>/dev/null || true
php artisan view:clear

systemctl reload nginx 2>/dev/null || true

bash "$PROJECT_DIR/deploy/lib/verify-api.sh" "$BACKEND_DIR"

REV=$(git -C "$PROJECT_DIR" rev-parse --short HEAD)
echo "$REV $(date -Iseconds)" > "$PUBLIC_DIR/deploy-revision.txt"
echo "✅ تم — revision: $REV"
