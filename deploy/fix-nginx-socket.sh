#!/bin/bash
# إصلاح سريع لخطأ: invalid host in upstream "/var/run/php/php8.4-fpm.sock"
# الاستخدام على السيرفر: bash /var/www/erp/deploy/fix-nginx-socket.sh
set -euo pipefail

PROJECT_DIR="${1:-/var/www/erp}"
CONF="/etc/nginx/sites-available/firstclick-erp"
SOURCE_CONF="$PROJECT_DIR/deploy/nginx/firstclick-erp-ssl.conf"

# shellcheck source=/dev/null
source "$PROJECT_DIR/deploy/lib/detect-php-fpm.sh"

PHP_SOCK=$(detect_php_fpm_socket)
echo "🔧 PHP-FPM socket: $PHP_SOCK"

if [ -f "$SOURCE_CONF" ]; then
  cp "$SOURCE_CONF" "$CONF"
  echo "📄 نسخ القالب من المستودع"
fi

apply_php_socket_to_nginx "$CONF" "$PHP_SOCK"

nginx -t
systemctl reload nginx
systemctl restart php8.4-fpm 2>/dev/null || systemctl restart php8.2-fpm 2>/dev/null || true

echo "✅ nginx تم إصلاحه وإعادة التحميل"
