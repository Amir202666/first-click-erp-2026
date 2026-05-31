#!/bin/bash
# تشخيص فشل الاتصال بالـ API (صفحة الدخول: فشل الاتصال بالخادم)
# الاستخدام: bash /var/www/erp/deploy/diagnose-api.sh
set -uo pipefail

PROJECT_DIR="${1:-/var/www/erp}"
BACKEND_DIR="$PROJECT_DIR/backend"
HOST="${APP_HOST:-firstclickerp.top}"

echo "════════════════════════════════════════"
echo "  تشخيص API — $(date '+%Y-%m-%d %H:%M')"
echo "════════════════════════════════════════"

echo ""
echo "── PHP-FPM ──"
for svc in php8.4-fpm php8.2-fpm php-fpm; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    echo "✅ $svc: active"
  else
    echo "⚠️  $svc: $(systemctl is-active "$svc" 2>/dev/null || echo missing)"
  fi
done
ls -la /var/run/php/*.sock 2>/dev/null || echo "❌ لا يوجد socket في /var/run/php/"

echo ""
echo "── nginx ──"
if nginx -t 2>&1; then
  echo "✅ nginx config OK"
else
  echo "❌ nginx config فاشل — شغّل: bash $PROJECT_DIR/deploy/fix-nginx-socket.sh"
fi
if [ -f /etc/nginx/conf.d/firstclick-rate-limit.conf ]; then
  echo "✅ rate-limit موجود"
else
  echo "❌ rate-limit مفقود — شغّل fix-nginx-socket.sh"
fi

echo ""
echo "── Laravel ──"
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "❌ .env مفقود"
else
  grep -qE '^APP_KEY=base64:' "$BACKEND_DIR/.env" && echo "✅ APP_KEY موجود" || echo "❌ APP_KEY فارغ — php artisan key:generate"
  grep -E '^APP_URL=|^DB_' "$BACKEND_DIR/.env" | head -5
fi
if [ -f "$BACKEND_DIR/public/index.php" ]; then
  head -3 "$BACKEND_DIR/public/index.php" | grep -q 'LARAVEL_START' && echo "✅ public/index.php = Laravel" || echo "⚠️  public/index.php قد يكون خاطئاً"
else
  echo "❌ public/index.php مفقود"
fi

echo ""
echo "── فحص Laravel داخلي (/api/health) ──"
if [ -f "$BACKEND_DIR/vendor/autoload.php" ]; then
  PHP_BODY=$(cd "$BACKEND_DIR" && php -r "
require 'vendor/autoload.php';
\$app = require 'bootstrap/app.php';
\$kernel = \$app->make(Illuminate\Contracts\Http\Kernel::class);
\$request = Illuminate\Http\Request::create('/api/health', 'GET');
\$response = \$kernel->handle(\$request);
echo \$response->getContent();
" 2>/dev/null || true)
  echo "   ${PHP_BODY:-(فارغ)}"
  echo "$PHP_BODY" | grep -q '"ok"' && echo "✅ Laravel يعمل" || echo "❌ Laravel لا يستجيب"
else
  echo "❌ vendor غير موجود — composer install"
fi

echo ""
echo "── curl عبر nginx (HTTPS محلي) ──"
HTTPS_BODY=$(curl -sfk --max-time 12 --resolve "${HOST}:443:127.0.0.1" "https://${HOST}/api/health" 2>/dev/null || echo "FAIL")
echo "   $HTTPS_BODY"
echo "$HTTPS_BODY" | grep -q '"ok"' && echo "✅ nginx → PHP → Laravel" || echo "❌ فشل /api/health عبر nginx"

echo ""
echo "── آخر أخطاء nginx ──"
tail -5 /var/log/nginx/firstclick-error.log 2>/dev/null || tail -5 /var/log/nginx/error.log 2>/dev/null || true

echo ""
echo "── آخر أخطاء Laravel ──"
tail -8 "$BACKEND_DIR/storage/logs/laravel.log" 2>/dev/null || echo "(لا سجل)"

echo ""
echo "════════════════════════════════════════"
echo "إصلاح سريع:"
echo "  bash $PROJECT_DIR/deploy/fix-nginx-socket.sh"
echo "  cd $BACKEND_DIR && php artisan config:clear && php artisan up"
echo "  bash $PROJECT_DIR/deploy.sh"
echo "════════════════════════════════════════"
