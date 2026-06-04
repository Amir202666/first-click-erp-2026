#!/bin/bash
# ضبط Redis في backend/.env بعد تثبيت redis-server
# bash deploy/set-redis-env.sh
set -euo pipefail

ENV_FILE="/var/www/erp/backend/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ لم يُعثر على $ENV_FILE"
  exit 1
fi

cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d_%H%M%S)"

set_or_replace() {
  local key="$1"
  local val="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  elif grep -qE "^# *${key}=" "$ENV_FILE"; then
    sed -i "s|^# *${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

set_or_replace APP_ENV production
set_or_replace APP_DEBUG false
set_or_replace LOG_LEVEL error
set_or_replace CACHE_STORE redis
set_or_replace SESSION_DRIVER redis
set_or_replace QUEUE_CONNECTION redis
set_or_replace REDIS_CLIENT phpredis
set_or_replace REDIS_HOST 127.0.0.1
set_or_replace REDIS_PORT 6379

# REDIS_PASSWORD — اتركه فارغاً إن لم تفعّل requirepass
if ! grep -qE '^REDIS_PASSWORD=' "$ENV_FILE"; then
  echo "REDIS_PASSWORD=" >> "$ENV_FILE"
fi

echo "✅ تم تحديث $ENV_FILE"
echo ""
grep -E '^(APP_ENV|APP_DEBUG|LOG_LEVEL|CACHE_STORE|SESSION_DRIVER|QUEUE_CONNECTION|REDIS_)' "$ENV_FILE"

if redis-cli ping 2>/dev/null | grep -q PONG; then
  cd /var/www/erp/backend
  php artisan config:clear
  php artisan config:cache
  systemctl restart php8.4-fpm 2>/dev/null || systemctl restart php8.2-fpm
  echo "✅ config:cache + php-fpm restart"
else
  echo "⚠️  Redis لا يرد — شغّل: systemctl start redis-server"
  echo "   أو استخدم مؤقتاً CACHE_STORE=file و SESSION_DRIVER=database"
fi
