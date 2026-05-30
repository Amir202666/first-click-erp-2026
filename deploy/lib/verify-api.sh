#!/bin/bash
# فحص /api/health بعد النشر
set -euo pipefail

BACKEND_DIR="${1:-/var/www/erp/backend}"
APP_URL="${2:-}"

if [ -z "$APP_URL" ] && [ -f "$BACKEND_DIR/.env" ]; then
  APP_URL=$(grep -E '^APP_URL=' "$BACKEND_DIR/.env" | cut -d= -f2- | tr -d '"')
fi
APP_URL="${APP_URL:-http://127.0.0.1}"

HEALTH_URL="${APP_URL%/}/api/health"
echo "🔍 فحص: $HEALTH_URL"

BODY=$(curl -sf --max-time 10 "$HEALTH_URL" 2>/dev/null || true)

if echo "$BODY" | grep -q '"ok"'; then
  echo "✅ API يعمل: $BODY"
  exit 0
fi

# محاولة محلية عبر php (بدون nginx)
LOCAL=$(cd "$BACKEND_DIR" && php artisan route:list --path=health 2>/dev/null | grep -c health || true)
if [ ! -f "$BACKEND_DIR/public/index.php" ]; then
  echo "❌ public/index.php مفقود — هذا سبب فشل تسجيل الدخول!"
  exit 1
fi

echo "❌ API لا يستجيب بشكل صحيح (got: ${BODY:-empty})"
echo "   تحقق من nginx و php-fpm"
exit 1
