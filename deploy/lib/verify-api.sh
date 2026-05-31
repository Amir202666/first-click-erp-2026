#!/bin/bash
# فحص صحة API بعد النشر — لا يعتمد على HTTP فقط (يتجنب 301/صيانة/SSL)
set -uo pipefail

BACKEND_DIR="${1:-/var/www/erp/backend}"
APP_URL="${2:-}"

if [ -z "$APP_URL" ] && [ -f "$BACKEND_DIR/.env" ]; then
  APP_URL=$(grep -E '^APP_URL=' "$BACKEND_DIR/.env" | cut -d= -f2- | tr -d '"')
fi
APP_URL="${APP_URL:-https://firstclickerp.top}"

if [ ! -f "$BACKEND_DIR/public/index.php" ]; then
  echo "❌ public/index.php مفقود — Laravel لا يعمل!"
  exit 1
fi

health_ok() {
  echo "$1" | grep -q '"ok"'
}

# ── 1) فحص Laravel مباشرة (الأوثق — لا يمر عبر nginx/SSL/301) ──
echo "🔍 فحص Laravel (داخلي)..."
PHP_BODY=$(cd "$BACKEND_DIR" && php -r "
require 'vendor/autoload.php';
\$app = require 'bootstrap/app.php';
\$kernel = \$app->make(Illuminate\Contracts\Http\Kernel::class);
\$request = Illuminate\Http\Request::create('/api/health', 'GET');
\$response = \$kernel->handle(\$request);
echo \$response->getContent();
\$kernel->terminate(\$request, \$response);
" 2>/dev/null || true)

if health_ok "$PHP_BODY"; then
  echo "✅ Laravel API: $PHP_BODY"
  LARAVEL_OK=1
else
  echo "⚠️  Laravel API: ${PHP_BODY:-empty}"
  LARAVEL_OK=0
fi

# ── 2) فحص HTTPS محلي (يتجاوز DNS — resolve إلى 127.0.0.1) ──
HOST=$(echo "$APP_URL" | sed -E 's#^https?://([^/]+).*#\1#')
HTTPS_URL="https://${HOST}/api/health"
echo "🔍 فحص nginx+SSL: $HTTPS_URL"
HTTPS_BODY=$(curl -sfk --max-time 15 --resolve "${HOST}:443:127.0.0.1" "$HTTPS_URL" 2>/dev/null || true)

if health_ok "$HTTPS_BODY"; then
  echo "✅ nginx+SSL: $HTTPS_BODY"
  HTTP_OK=1
else
  echo "⚠️  nginx+SSL: ${HTTPS_BODY:0:120}${HTTPS_BODY:+...}"
  HTTP_OK=0
fi

# ── 3) قرار ──
if [ "$LARAVEL_OK" = "1" ]; then
  if [ "$HTTP_OK" = "0" ]; then
    echo "⚠️  Laravel يعمل لكن nginx/SSL يحتاج مراجعة — راجع:"
    echo "   nginx -t && systemctl status php8.2-fpm --no-pager"
    echo "   tail -30 /var/log/nginx/firstclick-error.log"
  fi
  exit 0
fi

echo "❌ فشل فحص API — Laravel لا يستجيب بـ {\"ok\":true}"
echo "   tail -50 /var/log/nginx/firstclick-error.log"
exit 1
