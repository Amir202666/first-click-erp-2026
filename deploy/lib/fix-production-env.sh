#!/bin/bash
# تصحيح APP_URL وروابط SPA في .env على السيرفر (لا يلمس كلمات مرور DB)
set -euo pipefail

BACKEND_DIR="${1:-/var/www/erp/backend}"
ENV_FILE="$BACKEND_DIR/.env"
PRODUCTION_DOMAIN="${FC_PRODUCTION_DOMAIN:-firstclickerp.top}"
PRODUCTION_URL="https://${PRODUCTION_DOMAIN}"

if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️  .env غير موجود — تخطي fix-production-env"
  exit 0
fi

patch_env() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

CURRENT_URL=$(grep -E '^APP_URL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)

needs_fix=0
if [ -z "$CURRENT_URL" ]; then
  needs_fix=1
elif echo "$CURRENT_URL" | grep -qE 'localhost|127\.0\.0\.1|:8000|:5173'; then
  needs_fix=1
elif echo "$CURRENT_URL" | grep -qE '^http://'; then
  needs_fix=1
fi

if [ "$needs_fix" = "0" ]; then
  echo "✅ APP_URL صحيح: $CURRENT_URL"
  exit 0
fi

echo "🔧 تصحيح إعدادات الإنتاج في .env"
echo "   APP_URL: ${CURRENT_URL:-<فارغ>} → ${PRODUCTION_URL}"

patch_env APP_URL "$PRODUCTION_URL"
patch_env FRONTEND_URL "$PRODUCTION_URL"
patch_env SANCTUM_STATEFUL_DOMAINS "${PRODUCTION_DOMAIN},www.${PRODUCTION_DOMAIN}"
patch_env SESSION_DOMAIN ".${PRODUCTION_DOMAIN}"
patch_env APP_ENV production
patch_env APP_DEBUG false

echo "✅ تم تحديث APP_URL و FRONTEND_URL و Sanctum"
