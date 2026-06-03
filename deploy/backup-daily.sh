#!/bin/bash
# نسخة احتياطية يومية — يُستدعى من cron (انظر deploy/cron/firstclick-maintenance.example)
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/www/backups}"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

DB_NAME="${DB_NAME:-firstclick_erp}"

if [ -f /root/.my.cnf ]; then
  mysqldump "$DB_NAME" | gzip > "$BACKUP_DIR/db_${DATE}.sql.gz"
else
  echo "⚠️  أنشئ /root/.my.cnf — راجع docs/PERFORMANCE-AR.md"
  exit 1
fi

find "$BACKUP_DIR" -name 'db_*.sql.gz' -mtime +7 -delete 2>/dev/null || true
echo "✅ Backup: $BACKUP_DIR/db_${DATE}.sql.gz"
