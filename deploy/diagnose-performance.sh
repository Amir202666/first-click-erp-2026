#!/bin/bash
# قِس سرعة الموقع وموارد السيرفر — bash deploy/diagnose-performance.sh
set -euo pipefail

DOMAIN="${1:-https://firstclickerp.top}"
API="${DOMAIN%/}/api/health"

echo "========================================"
echo "  First Click — تشخيص الأداء"
echo "  $(date '+%Y-%m-%d %H:%M')"
echo "========================================"
echo ""

if command -v curl >/dev/null 2>&1; then
  echo "── الموقع ──"
  curl -o /dev/null -s -w "  DNS: %{time_namelookup}s | Connect: %{time_connect}s | TTFB: %{time_starttransfer}s | Total: %{time_total}s\n" "$DOMAIN" || echo "  ⚠️  فشل curl للموقع"
  echo ""
  echo "── API /api/health ──"
  curl -o /dev/null -s -w "  API Total: %{time_total}s\n" "$API" || echo "  ⚠️  فشل curl للـ API"
  echo ""
else
  echo "⚠️  curl غير مثبت"
fi

echo "── الذاكرة ──"
free -h 2>/dev/null || true
echo ""
echo "── القرص ──"
df -h / /var/www 2>/dev/null | head -5 || df -h | head -5
echo ""
echo "── CPU (لقطة) ──"
if command -v top >/dev/null 2>&1; then
  top -bn1 | head -12
else
  echo "  top غير متوفر"
fi
echo ""

PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null || echo "?")
echo "── PHP ──"
echo "  Version: $PHP_VER"
php -m 2>/dev/null | grep -iE '^(Zend OPcache|redis)$' | sed 's/^/  Module: /' || true
echo ""

if command -v redis-cli >/dev/null 2>&1; then
  echo "── Redis ──"
  redis-cli ping 2>/dev/null | sed 's/^/  /' || echo "  ⚠️  Redis لا يرد"
  echo ""
fi

if systemctl is-active mysql >/dev/null 2>&1 || systemctl is-active mysqld >/dev/null 2>&1; then
  echo "── MySQL ──"
  mysqladmin variables 2>/dev/null | grep -E 'innodb_buffer_pool_size|max_connections' | sed 's/^/  /' || echo "  (تحتاج صلاحيات root)"
  echo ""
fi

echo "========================================"
echo "  بعد التحسين شغّل: bash deploy/6-apply-performance.sh"
echo "========================================"
