#!/bin/bash
# ═══════════════════════════════════════════════════════════
# First Click ERP — نشر الإنتاج
# الاستخدام: bash /var/www/erp/deploy.sh
# ═══════════════════════════════════════════════════════════
set -euo pipefail

PROJECT_DIR="/var/www/erp"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PUBLIC_DIR="$BACKEND_DIR/public"
BACKUP_DIR="/var/www/backups"
NGINX_CONF="/etc/nginx/sites-available/firstclick-erp"
NGINX_SOURCE="$PROJECT_DIR/deploy/nginx/firstclick-erp-ssl.conf"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
export COMPOSER_ALLOW_SUPERUSER=1

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_step() { echo -e "${YELLOW}$1${NC}"; }
log_ok()   { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_err()  { echo -e "${RED}❌ $1${NC}"; }

# shellcheck source=/dev/null
source "$PROJECT_DIR/deploy/lib/detect-php-fpm.sh"
# shellcheck source=/dev/null
source "$PROJECT_DIR/deploy/lib/nginx-install.sh"

NGINX_BACKUP=""
ENV_BACKUP=""
DEPLOY_FAILED=0

ensure_laravel_entry() {
  cp -f "$PROJECT_DIR/deploy/stubs/laravel-public/index.php" "$PUBLIC_DIR/index.php"
  cp -f "$PROJECT_DIR/deploy/stubs/laravel-public/.htaccess" "$PUBLIC_DIR/.htaccess"
}

rollback_nginx() {
  if [ -n "$NGINX_BACKUP" ] && [ -f "$NGINX_BACKUP" ]; then
    log_warn "استرجاع nginx من النسخة الاحتياطية..."
    cp -f "$NGINX_BACKUP" "$NGINX_CONF"
    nginx -t && systemctl reload nginx || true
  fi
}

on_exit() {
  if [ "$DEPLOY_FAILED" = "1" ]; then
    rollback_nginx
    log_err "فشل النشر — راجع السجل أعلاه"
  fi
  if [ -f "$BACKEND_DIR/artisan" ]; then
    cd "$BACKEND_DIR" && php artisan up 2>/dev/null || true
  fi
}
trap on_exit EXIT

write_revision() {
  local rev
  rev=$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
  echo "${rev} $(date -Iseconds)" > "$PUBLIC_DIR/deploy-revision.txt"
  echo "📋 revision: $rev → https://firstclickerp.top/deploy-revision.txt"
}

# ── [1/10] فحص المتطلبات ─────────────────────────────────
check_prerequisites() {
  log_step "[1/10] فحص المتطلبات..."

  if [ "$(id -u)" -ne 0 ]; then
    log_warn "يُفضّل التشغيل كـ root (sudo bash deploy.sh)"
  fi

  for cmd in git php composer npm nginx; do
    if ! command -v "$cmd" &>/dev/null; then
      log_err "الأمر غير موجود: $cmd"
      exit 1
    fi
  done

  if [ ! -d "$PROJECT_DIR/.git" ]; then
    log_err "المشروع غير موجود: $PROJECT_DIR"
    exit 1
  fi
  if [ ! -f "$BACKEND_DIR/.env" ]; then
    log_err "ملف .env مفقود — انسخ deploy/env.production إلى backend/.env"
    exit 1
  fi

  PHP_SOCK=$(detect_php_fpm_socket)
  if [ ! -S "$PHP_SOCK" ]; then
    log_warn "Socket غير موجود — تشغيل php-fpm..."
    systemctl start php8.4-fpm 2>/dev/null || systemctl start php8.2-fpm 2>/dev/null || true
    sleep 2
    PHP_SOCK=$(detect_php_fpm_socket)
  fi
  if [ ! -S "$PHP_SOCK" ]; then
    log_err "PHP-FPM socket غير موجود: $PHP_SOCK"
    exit 1
  fi
  log_ok "PHP-FPM socket: $PHP_SOCK"

  if ! systemctl is-active --quiet nginx 2>/dev/null; then
    log_warn "nginx غير نشط — محاولة التشغيل..."
    systemctl start nginx || true
  fi
}

# ── [2/10] نسخ احتياطية ───────────────────────────────────
create_backups() {
  log_step "[2/10] نسخ احتياطية..."
  mkdir -p "$BACKUP_DIR"

  if [ -f "$NGINX_CONF" ]; then
    NGINX_BACKUP="$BACKUP_DIR/nginx_${TIMESTAMP}.conf"
    cp -f "$NGINX_CONF" "$NGINX_BACKUP"
  fi

  if [ -f "$BACKEND_DIR/.env" ]; then
    ENV_BACKUP="$BACKUP_DIR/env_${TIMESTAMP}"
    cp -f "$BACKEND_DIR/.env" "$ENV_BACKUP"
  fi

  if command -v mysqldump &>/dev/null; then
    mysqldump -u root firstclick_erp > "$BACKUP_DIR/db_${TIMESTAMP}.sql" 2>/dev/null \
      && log_ok "نسخة قاعدة البيانات" \
      || log_warn "تخطي نسخة قاعدة البيانات (تحقق من صلاحيات MySQL)"
  else
    log_warn "mysqldump غير متوفر — تخطي نسخة DB"
  fi

  log_ok "النسخ الاحتياطية في $BACKUP_DIR"
}

# ── [3/10] جلب الكود ──────────────────────────────────────
pull_code() {
  log_step "[3/10] جلب التعديلات من GitHub..."
  cd "$PROJECT_DIR"
  git fetch origin main
  git reset --hard origin/main
  echo "📌 $(git log -1 --oneline)"
  log_ok "الكود محدّث"
}

# ── [4/10] صيانة + Backend ────────────────────────────────
deploy_backend() {
  log_step "[4/10] تحديث Backend (Laravel)..."
  cd "$BACKEND_DIR"
  php artisan down --retry=60 --secret="${DEPLOY_SECRET:-deploy2026}" 2>/dev/null \
    || php artisan down --retry=60 || true

  composer install --no-dev --optimize-autoloader --no-interaction
  php artisan migrate --force
  php artisan db:seed --class=OwnerSeeder --force 2>/dev/null || true
  log_ok "Backend packages + migrations"
}

# ── [5/10] Frontend build ─────────────────────────────────
deploy_frontend() {
  log_step "[5/10] بناء Frontend..."
  cd "$FRONTEND_DIR"
  if [ -f package-lock.json ]; then
    npm ci --prefer-offline
  else
    npm install
  fi
  # منع تسريب VITE_API_URL المحلي (127.0.0.1) إلى bundle الإنتاج
  export VITE_API_URL=/api
  if [ -f .env.local ]; then
    mv .env.local .env.local.build-bak
  fi
  npm run build
  if [ -f .env.local.build-bak ]; then
    mv .env.local.build-bak .env.local
  fi
  if grep -rq '127\.0\.0\.1:8000' dist/ 2>/dev/null; then
    log_err "Frontend build contains localhost API URL — aborting deploy"
    exit 1
  fi
  bash "$PROJECT_DIR/deploy/lib/sync-public.sh" "$PROJECT_DIR"
  ensure_laravel_entry
  log_ok "Frontend built → backend/public"
}

# ── [6/10] Cache ──────────────────────────────────────────
rebuild_cache() {
  log_step "[6/10] إعادة بناء Cache..."
  cd "$BACKEND_DIR"
  php artisan storage:link 2>/dev/null || true

  if grep -qE '^CACHE_STORE=redis' .env 2>/dev/null; then
    php artisan cache:clear 2>/dev/null || log_warn "Redis غير متاح"
  fi

  php artisan config:clear
  php artisan route:clear
  php artisan view:clear
  php artisan config:cache
  php artisan route:cache
  php artisan view:cache
  php artisan event:cache 2>/dev/null || true
  log_ok "Cache rebuilt"
}

# ── [7/10] صلاحيات ────────────────────────────────────────
fix_permissions() {
  log_step "[7/10] صلاحيات الملفات..."
  if id www-data &>/dev/null; then
    chown -R www-data:www-data "$BACKEND_DIR/storage" "$BACKEND_DIR/bootstrap/cache" 2>/dev/null || true
    chown www-data:www-data "$PUBLIC_DIR/index.php" 2>/dev/null || true
  fi
  chmod -R 775 "$BACKEND_DIR/storage" "$BACKEND_DIR/bootstrap/cache" 2>/dev/null || true
  log_ok "الصلاحيات"
}

# ── [8/10] nginx + PHP-FPM ────────────────────────────────
apply_nginx_and_reload() {
  log_step "[8/10] nginx + PHP-FPM..."
  PHP_SOCK=$(detect_php_fpm_socket)

  if [ -d /etc/nginx/sites-available ]; then
    install_nginx_site "$PROJECT_DIR" "$PHP_SOCK"
  else
    log_warn "nginx sites-available غير موجود — تخطي"
    return 0
  fi

  if ! test_and_reload_nginx; then
    log_err "nginx -t فشل — استرجاع النسخة الاحتياطية"
    DEPLOY_FAILED=1
    exit 1
  fi
  PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null || echo "8.4")
  systemctl restart "php${PHP_VER}-fpm" 2>/dev/null || systemctl restart php8.4-fpm 2>/dev/null || systemctl restart php8.2-fpm 2>/dev/null || true
  log_ok "nginx و PHP-FPM"
}

# ── [9/10] رفع الصيانة + فحص ─────────────────────────────
verify_deployment() {
  log_step "[9/10] التحقق من API..."
  cd "$BACKEND_DIR"
  php artisan up
  trap - EXIT

  if ! bash "$PROJECT_DIR/deploy/lib/verify-api.sh" "$BACKEND_DIR"; then
    log_warn "إعادة محاولة بعد إصلاح index.php..."
    ensure_laravel_entry
    systemctl reload nginx 2>/dev/null || true
    bash "$PROJECT_DIR/deploy/lib/verify-api.sh" "$BACKEND_DIR" || {
      DEPLOY_FAILED=1
      exit 1
    }
  fi

  if command -v supervisorctl &>/dev/null; then
    supervisorctl restart laravel-worker:* 2>/dev/null || true
  fi
}

# ── [10/10] سجل النشر + فحص HTTP ──────────────────────────
finalize() {
  log_step "[10/10] إنهاء النشر..."
  write_revision

  local http_code api_body
  http_code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 \
    "https://firstclickerp.top/" 2>/dev/null || echo "000")
  api_body=$(curl -sS --max-time 20 "https://firstclickerp.top/api/health" 2>/dev/null \
    || echo "unreachable")

  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}🎉 تم النشر بنجاح${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo "الموقع: https://firstclickerp.top (HTTP: ${http_code})"
  echo "API: ${api_body}"
  echo "Commit: $(git -C "$PROJECT_DIR" log -1 --oneline)"
  echo "التاريخ: $(date)"
  echo -e "${GREEN}========================================${NC}"
  echo "حدّث المتصفح: Ctrl+Shift+R أو نافذة خاصة"

  find "$BACKUP_DIR" -type f -mtime +7 -delete 2>/dev/null || true
}

# ── التشغيل ───────────────────────────────────────────────
echo "========================================"
echo "🚀 بدء Deploy — $(date '+%Y-%m-%d %H:%M')"
echo "========================================"

check_prerequisites
create_backups
pull_code
deploy_backend
deploy_frontend
rebuild_cache
fix_permissions
apply_nginx_and_reload
verify_deployment
finalize
