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

echo ""
echo "--- Deploy code (build, migrate, nginx) ---"
bash "$PROJECT_DIR/deploy.sh"

if [ -f /tmp/db_backup.sql ]; then
  echo ""
  echo "--- Import FULL database from /tmp/db_backup.sql ---"
  bash "$PROJECT_DIR/scripts/sync-database.sh"
else
  echo ""
  echo "NOTE: /tmp/db_backup.sql not found."
  echo "Only CODE was updated. To sync ALL data from your PC:"
  echo "  1) Run scripts\\publish-all-to-online.bat on Windows"
  echo "  2) Upload backup_*.sql to /tmp/db_backup.sql via Hostinger"
  echo "  3) Run this script again"
fi

echo ""
echo "========================================"
echo "  Finished"
echo "  https://firstclickerp.top/deploy-revision.txt"
echo "  https://firstclickerp.top/api/health"
echo "  Browser: Ctrl+Shift+R"
echo "========================================"
