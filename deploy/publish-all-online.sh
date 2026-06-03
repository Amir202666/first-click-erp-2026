#!/bin/bash
# نشر كل شيء: الكود + قاعدة البيانات الكاملة (بعد رفع db_backup.sql)
# الاستخدام: bash /var/www/erp/deploy/publish-all-online.sh
set -euo pipefail

PROJECT_DIR="/var/www/erp"

echo "========================================"
echo "  Publish ALL — $(date '+%Y-%m-%d %H:%M')"
echo "========================================"

cd "$PROJECT_DIR"
git fetch origin main
git reset --hard origin/main
echo "Code: $(git log -1 --oneline)"

DB_BACKUP=""
for f in "$PROJECT_DIR/deploy/db_backup.sql" /tmp/db_backup.sql "$PROJECT_DIR/db_backup.sql" "$PROJECT_DIR/storage/db_backup.sql"; do
  if [ -f "$f" ]; then DB_BACKUP="$f"; break; fi
done

if [ -n "$DB_BACKUP" ]; then
  size=$(stat -c%s "$DB_BACKUP" 2>/dev/null || stat -f%z "$DB_BACKUP" 2>/dev/null || echo 0)
  if [ "$size" -lt 50000 ]; then
    echo ""
    echo "WARNING: $DB_BACKUP is too small (${size} bytes) — skipping import."
    echo "Remove empty wget file: rm -f /var/www/erp/db_backup.sql"
    echo "Use deploy/db_backup.sql from git (scripts\\رفع-كل-شيء.bat)."
    DB_BACKUP=""
  fi
fi

if [ -n "$DB_BACKUP" ]; then
  echo ""
  echo "--- Import FULL database from $DB_BACKUP ---"
  bash "$PROJECT_DIR/scripts/sync-database.sh" "$DB_BACKUP"
fi

echo ""
echo "--- Deploy code (build, migrate, nginx) ---"
bash "$PROJECT_DIR/deploy.sh"

if [ -z "$DB_BACKUP" ]; then
  echo ""
  echo "NOTE: No valid db backup imported."
  echo "Run scripts\\رفع-كل-شيء.bat on Windows then this script again."
fi

echo ""
echo "========================================"
echo "  Finished"
echo "  https://firstclickerp.top/deploy-revision.txt"
echo "  https://firstclickerp.top/api/health"
echo "  Browser: Ctrl+Shift+R"
echo "========================================"
