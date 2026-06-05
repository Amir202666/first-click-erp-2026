#!/bin/bash
# إصلاح سريع: API + تسجيل الدخول — بدون استيراد قاعدة ولا مسح إعدادات
# bash /var/www/erp/deploy/repair-api-quick.sh
set -euo pipefail

PROJECT_DIR="/var/www/erp"
BACKEND_DIR="$PROJECT_DIR/backend"
ENV_FILE="$BACKEND_DIR/.env"

echo "════════════════════════════════════════"
echo "  إصلاح API — بدون لمس البيانات"
echo "════════════════════════════════════════"

# shellcheck source=/dev/null
source "$PROJECT_DIR/deploy/lib/detect-php-fpm.sh"
PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null || echo "8.4")

patch_env() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

echo ""
echo "▶ 0) APP_URL / FRONTEND_URL"
bash "$PROJECT_DIR/deploy/lib/fix-production-env.sh" "$BACKEND_DIR"

echo ""
echo "▶ 1) Redis"
if redis-cli ping 2>/dev/null | grep -q PONG; then
  echo "  ✓ Redis يعمل"
else
  echo "  ⚠️  Redis لا يعمل — العودة مؤقتاً لـ file/database (الموقع يعمل)"
  systemctl start redis-server 2>/dev/null || true
  if ! redis-cli ping 2>/dev/null | grep -q PONG; then
    [ -f "$ENV_FILE" ] && cp "$ENV_FILE" "${ENV_FILE}.bak.repair.$(date +%Y%m%d_%H%M%S)"
    patch_env CACHE_STORE file
    patch_env SESSION_DRIVER database
    patch_env QUEUE_CONNECTION sync
  fi
fi

echo ""
echo "▶ 2) MySQL"
systemctl start mysql 2>/dev/null || systemctl start mysqld 2>/dev/null || true

echo ""
echo "▶ 3) nginx + PHP-FPM socket"
bash "$PROJECT_DIR/deploy/fix-nginx-socket.sh"

echo ""
echo "▶ 4) Laravel"
cd "$BACKEND_DIR"
php artisan up 2>/dev/null || true
php artisan config:clear
php artisan route:clear
php artisan view:clear
php artisan cache:clear 2>/dev/null || true
php artisan config:cache
php artisan route:cache
php artisan view:cache

echo ""
echo "▶ 5) إعادة تشغيل الخدمات"
systemctl restart "php${PHP_VER}-fpm" 2>/dev/null || systemctl restart php8.4-fpm
systemctl reload nginx

echo ""
echo "▶ 6) فحص"
HEALTH=$(curl -sf --max-time 15 "https://firstclickerp.top/api/health" 2>/dev/null || echo "FAIL")
LOGIN=$(curl -sf --max-time 15 "https://firstclickerp.top/api/login-page" 2>/dev/null | head -c 120 || echo "FAIL")
echo "  health: $HEALTH"
echo "  login-page: $LOGIN..."

echo ""
if echo "$HEALTH" | grep -q '"ok"'; then
  echo "✅ API يعمل — حدّث المتصفح: Ctrl+Shift+R"
  echo "   إعدادات التواصل ستعود من قاعدة البيانات (ليست محذوفة إن لم تستورد db_backup)"
else
  echo "❌ API ما زال لا يستجيب — شغّل: bash $PROJECT_DIR/deploy/diagnose-api.sh"
fi
echo "════════════════════════════════════════"
