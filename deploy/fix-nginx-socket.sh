#!/bin/bash
# إصلاح nginx: socket + rate-limit zones + fastcgi_pass
# الاستخدام: bash /var/www/erp/deploy/fix-nginx-socket.sh
set -euo pipefail

PROJECT_DIR="${1:-/var/www/erp}"

# shellcheck source=/dev/null
source "$PROJECT_DIR/deploy/lib/detect-php-fpm.sh"
# shellcheck source=/dev/null
source "$PROJECT_DIR/deploy/lib/nginx-install.sh"

PHP_SOCK=$(detect_php_fpm_socket)
echo "🔧 PHP-FPM socket: $PHP_SOCK"

install_nginx_site "$PROJECT_DIR" "$PHP_SOCK"

if ! test_and_reload_nginx; then
  echo ""
  echo "❌ nginx -t فشل. عرض السطور حول fastcgi_pass:"
  grep -n 'fastcgi_pass\|upstream\|limit_req' /etc/nginx/sites-available/firstclick-erp || true
  echo ""
  echo "تحقق من وجود: /etc/nginx/conf.d/firstclick-rate-limit.conf"
  exit 1
fi

echo "✅ nginx يعمل — جرّب: curl -s https://firstclickerp.top/api/health"
