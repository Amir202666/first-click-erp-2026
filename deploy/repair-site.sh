#!/bin/bash
# إصلاح شامل: nginx + PHP + Laravel + بناء الواجهة
# الاستخدام: bash /var/www/erp/deploy/repair-site.sh
set -euo pipefail

PROJECT_DIR="${1:-/var/www/erp}"
cd "$PROJECT_DIR"

echo "════════════════════════════════════════"
echo "  إصلاح شامل للموقع — $(date '+%H:%M')"
echo "════════════════════════════════════════"

git fetch origin main
git reset --hard origin/main
echo "📌 $(git log -1 --oneline)"

bash "$PROJECT_DIR/deploy/fix-nginx-socket.sh"

cd "$PROJECT_DIR/backend"
php artisan up 2>/dev/null || true
php artisan config:clear
php artisan route:clear
php artisan view:clear
php artisan cache:clear 2>/dev/null || true

if ! grep -qE '^APP_KEY=base64:' .env 2>/dev/null; then
  echo "⚠️  توليد APP_KEY..."
  php artisan key:generate --force
fi

cd "$PROJECT_DIR"
bash deploy.sh

echo ""
echo "── فحص نهائي ──"
curl -sfk --max-time 15 --resolve "firstclickerp.top:443:127.0.0.1" "https://firstclickerp.top/api/health" || curl -sf "https://firstclickerp.top/api/health" || true
echo ""
cat "$PROJECT_DIR/backend/public/deploy-revision.txt" 2>/dev/null || echo "(لا deploy-revision)"
echo ""
echo "✅ انتهى — في المتصفح: Ctrl+Shift+Delete أو نافذة خاصة"
echo "   افتح: https://firstclickerp.top/api/health"
echo "════════════════════════════════════════"
