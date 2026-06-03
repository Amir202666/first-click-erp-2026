#!/bin/bash
# استيراد نسخة MySQL — ارفع الملف إلى أحد المسارات (انظر publish-all-to-online.bat)
set -euo pipefail

echo "===================================="
echo "  استيراد قاعدة البيانات"
echo "===================================="

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT/backend"

if [[ ! -f .env ]]; then
  echo "[خطأ] backend/.env غير موجود"
  exit 1
fi

DB_BACKUP_FILE="${1:-}"
if [[ -z "$DB_BACKUP_FILE" ]]; then
  for candidate in \
    "$PROJECT_ROOT/deploy/db_backup.sql" \
    "/tmp/db_backup.sql" \
    "$PROJECT_ROOT/db_backup.sql" \
    "$PROJECT_ROOT/storage/db_backup.sql"; do
    if [[ -f "$candidate" ]]; then
      DB_BACKUP_FILE="$candidate"
      break
    fi
  done
fi

if [[ -z "$DB_BACKUP_FILE" || ! -f "$DB_BACKUP_FILE" ]]; then
  echo "[خطأ] ملف db_backup.sql غير موجود."
  echo "استخدم: bash scripts/sync-database.sh /var/www/erp/deploy/db_backup.sql"
  exit 1
fi

file_size=$(stat -c%s "$DB_BACKUP_FILE" 2>/dev/null || stat -f%z "$DB_BACKUP_FILE" 2>/dev/null || echo 0)
if [[ "$file_size" -lt 50000 ]]; then
  echo "[خطأ] الملف صغير جداً (${file_size} bytes) — غالباً فارغ من wget فاشل."
  echo "احذف: rm -f /var/www/erp/db_backup.sql"
  echo "استخدم: /var/www/erp/deploy/db_backup.sql من GitHub"
  exit 1
fi

read_env() {
  local key="$1"
  grep -E "^${key}=" .env | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//'
}

DB_NAME="$(read_env DB_DATABASE)"
DB_USER="$(read_env DB_USERNAME)"
DB_PASS="$(read_env DB_PASSWORD)"
DB_HOST="$(read_env DB_HOST)"
DB_PORT="$(read_env DB_PORT)"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"

if [[ -z "$DB_NAME" || -z "$DB_USER" ]]; then
  echo "[خطأ] DB_DATABASE أو DB_USERNAME غير مضبوطين في .env"
  exit 1
fi

echo "قاعدة البيانات: $DB_NAME"
echo "المستخدم: $DB_USER"
echo "الملف: $DB_BACKUP_FILE ($(du -h "$DB_BACKUP_FILE" | cut -f1))"
echo ""

mysql_cmd() {
  MYSQL_PWD="$DB_PASS" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$@"
}

mysqldump_cmd() {
  MYSQL_PWD="$DB_PASS" mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$@"
}

# وضع الصيانة
php artisan down --retry=60 || true

BACKUP_BEFORE="/tmp/backup_before_import_$(date +%Y%m%d_%H%M%S).sql"
echo "جاري أخذ نسخة احتياطية للبيانات الحالية..."
mysqldump_cmd --single-transaction --routines --triggers "$DB_NAME" > "$BACKUP_BEFORE"
echo "تم: $BACKUP_BEFORE"

echo "جاري استيراد البيانات الجديدة..."
if ! mysql_cmd "$DB_NAME" < "$DB_BACKUP_FILE"; then
  echo "[خطأ] فشل استيراد MySQL. راجع $DB_BACKUP_FILE"
  php artisan up 2>/dev/null || true
  exit 1
fi
echo "تم الاستيراد."

echo "تحقق سريع من البيانات..."
mysql_cmd "$DB_NAME" -e "SELECT slug, (SELECT COUNT(*) FROM customers c WHERE c.tenant_id=t.id) AS customers, (SELECT COUNT(*) FROM invoices i WHERE i.tenant_id=t.id) AS invoices, (SELECT COUNT(*) FROM invoices i WHERE i.tenant_id=t.id AND i.type='purchase') AS purchase_invoices FROM tenants t;"

echo "جاري تشغيل migrations (إن وُجدت جديدة)..."
php artisan migrate --force

echo "مسح الكاش..."
php artisan optimize:clear
php artisan config:cache

php artisan up

echo ""
echo "===================================="
echo "  تم الاستيراد بنجاح"
echo "===================================="
echo "تحقق من الموقع: https://firstclickerp.top"
