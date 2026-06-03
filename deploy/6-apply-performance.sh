#!/bin/bash
# ═══════════════════════════════════════════════════════════
# First Click ERP — تطبيق تحسينات الأداء
# تشغيل كـ root: bash deploy/6-apply-performance.sh [--with-swap] [--skip-composer]
# ═══════════════════════════════════════════════════════════
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export COMPOSER_PROCESS_TIMEOUT=300

PROJECT_DIR="/var/www/erp"
BACKEND_DIR="$PROJECT_DIR/backend"
WITH_SWAP=false
SKIP_COMPOSER=false
for arg in "$@"; do
  case "$arg" in
    --with-swap) WITH_SWAP=true ;;
    --skip-composer) SKIP_COMPOSER=true ;;
  esac
done

step() { echo ""; echo "▶ $1"; }

# shellcheck source=/dev/null
source "$PROJECT_DIR/deploy/lib/detect-php-fpm.sh"
PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null || echo "8.4")
PHP_FPM_DIR="/etc/php/${PHP_VER}/fpm"

echo "========================================"
echo "⚡ First Click — تحسين الأداء (PHP ${PHP_VER})"
echo "========================================"

if [ -f "$PROJECT_DIR/deploy/diagnose-performance.sh" ]; then
  echo ""
  echo "── قبل التحسين ──"
  bash "$PROJECT_DIR/deploy/diagnose-performance.sh" || true
fi

# ── Redis + phpredis ──
step "Redis"
if ! command -v redis-server >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
    redis-server "php${PHP_VER}-redis"
  systemctl enable redis-server
  systemctl start redis-server
  echo "✓ Redis installed"
else
  apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
    "php${PHP_VER}-redis" 2>/dev/null || true
  systemctl enable redis-server 2>/dev/null || true
  systemctl start redis-server 2>/dev/null || true
  echo "✓ Redis running"
fi
echo "  ⚠️  عيّن في backend/.env: CACHE_STORE=redis SESSION_DRIVER=redis QUEUE_CONNECTION=redis"
echo "      REDIS_CLIENT=phpredis  REDIS_HOST=127.0.0.1"

# ── Nginx ──
step "Nginx"
if [ -f "$PROJECT_DIR/deploy/nginx/firstclick-rate-limit.conf" ]; then
  cp "$PROJECT_DIR/deploy/nginx/firstclick-rate-limit.conf" /etc/nginx/conf.d/firstclick-rate-limit.conf
fi
if [ -f "$PROJECT_DIR/deploy/nginx/http-performance.conf" ]; then
  cp "$PROJECT_DIR/deploy/nginx/http-performance.conf" /etc/nginx/conf.d/firstclick-http-performance.conf
  echo "✓ http performance (gzip, keepalive)"
fi
if [ -f "$PROJECT_DIR/deploy/nginx/firstclick-erp-ssl.conf" ]; then
  cp "$PROJECT_DIR/deploy/nginx/firstclick-erp-ssl.conf" /etc/nginx/sites-available/firstclick-erp
  ln -sf /etc/nginx/sites-available/firstclick-erp /etc/nginx/sites-enabled/firstclick-erp 2>/dev/null || true
  echo "✓ site config refreshed"
fi

# ── OPcache ──
step "OPcache"
if [ -f "$PROJECT_DIR/deploy/php/opcache.ini.example" ]; then
  mkdir -p "${PHP_FPM_DIR}/conf.d"
  cp "$PROJECT_DIR/deploy/php/opcache.ini.example" "${PHP_FPM_DIR}/conf.d/99-firstclick-opcache.ini"
  echo "✓ OPcache → ${PHP_FPM_DIR}/conf.d/99-firstclick-opcache.ini"
fi

# ── PHP-FPM pool ──
step "PHP-FPM"
if [ -f "$PROJECT_DIR/deploy/php/firstclick-fpm-pool.conf" ]; then
  mkdir -p "${PHP_FPM_DIR}/pool.d"
  cp "$PROJECT_DIR/deploy/php/firstclick-fpm-pool.conf" "${PHP_FPM_DIR}/pool.d/zz-firstclick-performance.conf"
  echo "✓ FPM pool overrides"
fi

# ── MySQL 8 (بدون query_cache) ──
step "MySQL"
if [ -f "$PROJECT_DIR/deploy/mysql/mysqld-tuning.cnf.example" ]; then
  cp "$PROJECT_DIR/deploy/mysql/mysqld-tuning.cnf.example" /etc/mysql/mysql.conf.d/99-firstclick.cnf
  echo "✓ MySQL config copied — restarting (may take 30–60s)..."
  timeout 120 systemctl restart mysql 2>/dev/null || timeout 120 systemctl restart mysqld 2>/dev/null || echo "⚠️  MySQL restart skipped"
  echo "✓ MySQL tuning (InnoDB buffer pool 512M)"
fi

# ── Supervisor queue worker ──
step "Supervisor"
if [ -f "$PROJECT_DIR/deploy/supervisor/laravel-worker.conf" ]; then
  apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
    supervisor 2>/dev/null || true
  cp "$PROJECT_DIR/deploy/supervisor/laravel-worker.conf" /etc/supervisor/conf.d/laravel-worker.conf
  supervisorctl reread 2>/dev/null || true
  supervisorctl update 2>/dev/null || true
  echo "✓ laravel-worker (يتطلب QUEUE_CONNECTION=redis)"
fi

# ── Composer + Laravel cache ──
step "Laravel cache"
if [ -f "$BACKEND_DIR/composer.json" ]; then
  cd "$BACKEND_DIR"
  export COMPOSER_ALLOW_SUPERUSER=1
  if ! $SKIP_COMPOSER; then
    echo "  composer install (max 5 min)..."
    timeout 300 composer install --no-dev --optimize-autoloader --no-interaction \
      || timeout 300 composer install --optimize-autoloader --no-interaction \
      || echo "⚠️  composer skipped — run later if needed"
  else
    echo "  composer skipped (--skip-composer)"
  fi
  php artisan config:cache
  php artisan route:cache
  php artisan view:cache
  php artisan event:cache 2>/dev/null || true
  chown -R www-data:www-data storage bootstrap/cache 2>/dev/null || true
  echo "✓ config/route/view/event cache"
fi

# ── Swap (اختياري) ──
if $WITH_SWAP && ! swapon --show | grep -q .; then
  echo ""
  echo "── Swap 2G ──"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  sysctl -p 2>/dev/null || true
  echo "✓ Swap enabled"
fi

# ── Reload services ──
step "Reload nginx + PHP-FPM"
SOCK=$(detect_php_fpm_socket || true)
if [ -n "${SOCK:-}" ] && [ -f "$PROJECT_DIR/deploy/fix-nginx-socket.sh" ]; then
  bash "$PROJECT_DIR/deploy/fix-nginx-socket.sh" 2>/dev/null || true
fi

systemctl restart "php${PHP_VER}-fpm" 2>/dev/null || systemctl restart php8.4-fpm 2>/dev/null || systemctl restart php8.2-fpm
nginx -t
systemctl reload nginx

echo ""
echo "── بعد التحسين ──"
bash "$PROJECT_DIR/deploy/diagnose-performance.sh" || true

echo ""
echo "========================================"
echo "✅ انتهى."
echo "   راجع: docs/PERFORMANCE-AR.md"
echo "   تأكد: APP_DEBUG=false و CACHE_STORE=redis في backend/.env"
echo "========================================"
