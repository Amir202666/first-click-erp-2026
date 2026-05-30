#!/bin/bash
# نسخ frontend/dist → backend/public مع الحفاظ على index.php (Laravel)
# الاستخدام: bash deploy/lib/sync-public.sh /var/www/erp
set -euo pipefail

PROJECT_DIR="${1:-/var/www/erp}"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PUBLIC_DIR="$PROJECT_DIR/backend/public"
STUBS="$PROJECT_DIR/deploy/stubs/laravel-public"

if [ ! -d "$FRONTEND_DIR/dist" ]; then
  echo "❌ لا يوجد frontend/dist — شغّل npm run build أولاً"
  exit 1
fi

PRESERVE=(index.php .htaccess templates openapi.json integration-api-docs.html robots.txt favicon.svg favicon.ico FAVICON-README.txt brand print-templates-showcase.html)
BACKUP=$(mktemp -d)

for item in "${PRESERVE[@]}"; do
  if [ -e "$PUBLIC_DIR/$item" ]; then
    cp -a "$PUBLIC_DIR/$item" "$BACKUP/"
  fi
done

echo "📁 rsync dist → public (مع استثناء حذف ملفات Laravel)..."
rsync -a --delete "$FRONTEND_DIR/dist/" "$PUBLIC_DIR/"

for item in "${PRESERVE[@]}"; do
  if [ -e "$BACKUP/$item" ]; then
    cp -a "$BACKUP/$item" "$PUBLIC_DIR/"
  fi
done
rm -rf "$BACKUP"

# ضمان وجود نقطة دخول Laravel — لا يُحذف أبداً
cp -f "$STUBS/index.php" "$PUBLIC_DIR/index.php"
cp -f "$STUBS/.htaccess" "$PUBLIC_DIR/.htaccess"

if [ ! -f "$PUBLIC_DIR/index.php" ]; then
  echo "❌ فشل استعادة index.php"
  exit 1
fi

echo "✓ public/index.php موجود — API يعمل"
