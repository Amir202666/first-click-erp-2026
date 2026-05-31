#!/bin/bash
# استيراد العملات + الفروع + مراكز التكلفة من ملف مرفوع مع Git
# bash /var/www/erp/deploy/import-reference.sh
# bash /var/www/erp/deploy/import-reference.sh --import-only   (بدون git pull)
set -euo pipefail

PROJECT_DIR="/var/www/erp"
SYNC_FILE="$PROJECT_DIR/scripts/sync-data/reference_first-company.json"
IMPORT_FILE="$PROJECT_DIR/backend/storage/app/imports/reference_first-company.json"
IMPORT_ONLY=false
SLUG="first-company"

if [ "${1:-}" = "--import-only" ]; then
  IMPORT_ONLY=true
  SLUG="${2:-first-company}"
elif [ -n "${1:-}" ]; then
  SLUG="$1"
fi

if [ "$IMPORT_ONLY" != true ]; then
  cd "$PROJECT_DIR"
  git fetch origin main
  git reset --hard origin/main
fi

if [ ! -f "$SYNC_FILE" ]; then
  echo "ERROR: Missing $SYNC_FILE"
  echo "On PC run: scripts\\push-reference-to-github.bat %SLUG%"
  exit 1
fi

mkdir -p "$(dirname "$IMPORT_FILE")"
cp -f "$SYNC_FILE" "$IMPORT_FILE"

cd "$PROJECT_DIR/backend"
php artisan tenant:sync-reference import --slug="$SLUG" --file=storage/app/imports/reference_first-company.json

echo ""
echo "Reference data imported for: $SLUG"
