#!/bin/bash
# نشر كامل بعد git push من المحلي — أمر واحد على السيرفر
# bash /var/www/erp/deploy/publish-online.sh
set -euo pipefail

PROJECT_DIR="/var/www/erp"

echo "========================================"
echo "  Publish online — $(date '+%Y-%m-%d %H:%M')"
echo "========================================"

cd "$PROJECT_DIR"
git fetch origin main
git reset --hard origin/main
echo "Commit: $(git log -1 --oneline)"

bash "$PROJECT_DIR/deploy.sh"

echo ""
echo "Platform owner (is_super_admin)..."
cd "$PROJECT_DIR/backend"
php artisan admin:grant-super-admin || true
php artisan admin:grant-super-admin --display-name="مالك النظام" 2>/dev/null || true

echo ""
echo "Subscription plans (official tiers)..."
php artisan plans:setup-official || true

# استيراد المرجع يُستبدل بيانات العملات/الفروع — فقط عند الطلب الصريح:
# bash deploy/publish-online.sh --with-reference
if [ "${1:-}" = "--with-reference" ] && [ -f "$PROJECT_DIR/scripts/sync-data/reference_first-company.json" ]; then
  echo ""
  echo "Importing reference data (currencies, branches, payment methods, units, categories)..."
  bash "$PROJECT_DIR/deploy/import-reference.sh" --import-only
fi

REV=$(cat "$PROJECT_DIR/backend/public/deploy-revision.txt" 2>/dev/null || echo "n/a")
echo ""
echo "========================================"
echo "  Done"
echo "  revision: $REV"
echo "  https://firstclickerp.top/deploy-revision.txt"
echo "  https://firstclickerp.top/api/health"
echo "  Browser: Ctrl+Shift+R once after deploy"
echo "========================================"
