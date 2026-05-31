#!/bin/bash
# استيراد العملات + الفروع + مراكز التكلفة من ملف مرفوع مع Git
# الاستخدام على السيرفر: bash /var/www/erp/deploy/import-reference.sh
set -euo pipefail

PROJECT_DIR="/var/www/erp"
SYNC_FILE="$PROJECT_DIR/scripts/sync-data/reference_first-company.json"
IMPORT_FILE="$PROJECT_DIR/backend/storage/app/imports/reference_first-company.json"
SLUG="${1:-first-company}"

cd "$PROJECT_DIR"
git fetch origin main
git reset --hard origin/main

if [ ! -f "$SYNC_FILE" ]; then
  echo "ERROR: Missing $SYNC_FILE"
  echo "Run export on PC, copy to scripts/sync-data/, git push."
  exit 1
fi

mkdir -p "$(dirname "$IMPORT_FILE")"
cp -f "$SYNC_FILE" "$IMPORT_FILE"

cd "$PROJECT_DIR/backend"
php artisan tenant:sync-reference import --slug="$SLUG" --file=storage/app/imports/reference_first-company.json

echo ""
echo "Done. Check: https://firstclickerp.top"
