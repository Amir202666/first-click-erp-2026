#!/usr/bin/env bash
# تصفير كامل على السيرفر — نفّذ من Hostinger Browser Terminal
set -euo pipefail

cd /var/www/erp/backend

echo ""
echo "========================================"
echo "  تصفير First Click ERP — إنتاج"
echo "========================================"
echo ""
echo "⚠  سيُمسح كل بيانات ERP على السيرفر!"
echo ""

if [[ "${1:-}" != "--force" ]]; then
  read -r -p "اكتب YES للمتابعة: " confirm
  if [[ "$confirm" != "YES" ]]; then
    echo "تم الإلغاء."
    exit 0
  fi
fi

php artisan erp:factory-reset --force
php artisan config:cache
php artisan route:cache

echo ""
echo "✅ تم التصفير على السيرفر."
echo "   تحقق: https://firstclickerp.top"
echo ""
