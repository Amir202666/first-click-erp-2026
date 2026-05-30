#!/bin/bash
# Complete production setup after migrations (run on server once)
set -e
cd /var/www/erp

echo "🔧 Fixing migrations..."
bash deploy/fix-mysql-identifiers.sh

echo "⚡ Laravel caches..."
cd backend
export COMPOSER_ALLOW_SUPERUSER=1
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan storage:link 2>/dev/null || true
chown -R www-data:www-data storage bootstrap/cache
chmod -R 755 storage bootstrap/cache

echo "🏗️ Building frontend..."
cd ../frontend
npm ci --prefer-offline
npm run build

echo "🔄 Reloading services..."
PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')
systemctl reload nginx
systemctl reload "php${PHP_VER}-fpm" 2>/dev/null || systemctl reload php8.2-fpm

echo ""
echo "✅ Production setup complete!"
echo "🌐 Open: http://firstclickerp.top (HTTPS after SSL step)"
