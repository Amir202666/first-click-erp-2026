#!/bin/bash
# فحص /api/health بعد النشر
set -euo pipefail

BACKEND_DIR="${1:-/var/www/erp/backend}"
APP_URL="${2:-}"

if [ -z "$APP_URL" ] && [ -f "$BACKEND_DIR/.env" ]; then
  APP_URL=$(grep -E '^APP_URL=' "$BACKEND_DIR/.env" | cut -d= -f2- | tr -d '"')
fi
APP_URL="${APP_URL:-http://127.0.0.1}"

if [ ! -f "$BACKEND_DIR/public/index.php" ]; then
  echo "❌ public/index.php مفقود — هذا سبب فشل تسجيل الدخول!"
  exit 1
fi

health_ok() {
  echo "$1" | grep -q '"ok"'
}

try_curl() {
  local url="$1"
  curl -sf --max-time 15 "$url" 2>/dev/null || true
}

HOST=$(echo "$APP_URL" | sed -E 's#^https?://([^/]+).*#\1#')
HEALTH_URL="${APP_URL%/}/api/health"
echo "🔍 فحص: $HEALTH_URL"

BODY=$(try_curl "$HEALTH_URL")
if health_ok "$BODY"; then
  echo "✅ API يعمل: $BODY"
  exit 0
fi

# فحص محلي عبر nginx (HTTPS خارجي قد يفشل من داخل السيرفر)
LOCAL_URL="http://127.0.0.1/api/health"
echo "🔍 فحص محلي: $LOCAL_URL (Host: $HOST)"
BODY=$(curl -sf --max-time 15 -H "Host: ${HOST}" "$LOCAL_URL" 2>/dev/null || true)
if health_ok "$BODY"; then
  echo "✅ API يعمل محلياً: $BODY"
  exit 0
fi

echo "❌ API لا يستجيب بشكل صحيح (external: ${BODY:-empty})"
echo "   تحقق: tail -50 /var/log/nginx/firstclick-error.log"
echo "   systemctl status php8.2-fpm --no-pager"
exit 1
