#!/bin/bash
# ═══════════════════════════════════════════════════════════
# First Click ERP — تطبيق تحسينات الأداء (بدون تغيير SSH)
# تشغيل كـ root: bash deploy/6-apply-performance.sh
# ═══════════════════════════════════════════════════════════
set -euo pipefail

PROJECT_DIR="/var/www/erp"
BACKEND_DIR="$PROJECT_DIR/backend"

echo "========================================"
echo "⚡ تطبيق تحسينات الأداء"
echo "========================================"

# Redis
if ! command -v redis-server &>/dev/null; then
  echo "📦 تثبيت Redis..."
  apt install -y redis-server php8.2-redis
  systemctl enable redis-server
  systemctl start redis-server
  echo "⚠️  عيّن requirepass في /etc/redis/redis.conf ثم حدّث backend/.env"
else
  echo "✓ Redis موجود"
fi

# Nginx rate limit
if [ -f "$PROJECT_DIR/deploy/nginx/firstclick-rate-limit.conf" ]; then
  cp "$PROJECT_DIR/deploy/nginx/firstclick-rate-limit.conf" /etc/nginx/conf.d/firstclick-rate-limit.conf
  echo "✓ Rate limit zones"
fi

# OPcache snippet (يدمج يدوياً إن لزم)
if [ -f "$PROJECT_DIR/deploy/php/opcache.ini.example" ]; then
  cp "$PROJECT_DIR/deploy/php/opcache.ini.example" /etc/php/8.2/fpm/conf.d/99-firstclick-opcache.ini
  echo "✓ OPcache config"
fi

# Supervisor worker
if command -v supervisorctl &>/dev/null; then
  if [ -f "$PROJECT_DIR/deploy/supervisor/laravel-worker.conf" ]; then
    cp "$PROJECT_DIR/deploy/supervisor/laravel-worker.conf" /etc/supervisor/conf.d/laravel-worker.conf
    supervisorctl reread
    supervisorctl update || true
    echo "✓ Supervisor laravel-worker"
  fi
else
  apt install -y supervisor
  cp "$PROJECT_DIR/deploy/supervisor/laravel-worker.conf" /etc/supervisor/conf.d/laravel-worker.conf
  supervisorctl reread && supervisorctl update
fi

# Laravel caches
if [ -f "$BACKEND_DIR/.env" ]; then
  cd "$BACKEND_DIR"
  php artisan config:cache
  php artisan route:cache
  php artisan view:cache
  php artisan event:cache 2>/dev/null || true
  echo "✓ Laravel caches"
fi

PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null || echo "8.2")
systemctl restart "php${PHP_VER}-fpm" 2>/dev/null || systemctl restart php8.2-fpm
nginx -t && systemctl reload nginx

echo ""
echo "✅ انتهى. راجع docs/SERVER-SECURITY-PERFORMANCE.md للخطوات اليدوية (SSH, Fail2Ban, SSL)."
