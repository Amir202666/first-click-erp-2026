#!/bin/bash
# إكمال التحسين يدوياً إذا توقف 6-apply-performance.sh — بدون apt/composer
set -euo pipefail

PROJECT_DIR="/var/www/erp"
BACKEND_DIR="$PROJECT_DIR/backend"
# shellcheck source=/dev/null
source "$PROJECT_DIR/deploy/lib/detect-php-fpm.sh"
PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null || echo "8.4")

echo "▶ Laravel cache..."
cd "$BACKEND_DIR"
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache 2>/dev/null || true

echo "▶ Restart services..."
systemctl restart "php${PHP_VER}-fpm" 2>/dev/null || systemctl restart php8.4-fpm
nginx -t && systemctl reload nginx

echo "▶ Redis..."
redis-cli ping 2>/dev/null || echo "⚠️  Redis not running"

echo "✅ Done — update backend/.env with CACHE_STORE=redis then: php artisan config:cache"
