#!/bin/bash
# يُرجع مسار socket فقط (بدون بادئة unix:) — للاستخدام في fastcgi_pass unix:PATH
set -euo pipefail

detect_php_fpm_socket() {
  local s
  for s in /var/run/php/php8.4-fpm.sock /var/run/php/php8.2-fpm.sock /var/run/php/php-fpm.sock; do
    if [ -S "$s" ]; then
      echo "$s"
      return 0
    fi
  done
  # افتراضي — قد لا يكون موجوداً بعد
  echo "/var/run/php/php8.4-fpm.sock"
  return 1
}

# يطبّق المسار على كل fastcgi_pass في ملف nginx
apply_php_socket_to_nginx() {
  local conf="$1"
  local sock="$2"

  if [ ! -f "$conf" ]; then
    echo "⚠️  ملف nginx غير موجود: $conf"
    return 1
  fi

  # إصلاح أخطاء نشر سابقة: fastcgi_pass بدون unix: أو مع علامات اقتباس
  sed -i -E \
    -e 's|fastcgi_pass[[:space:]]+"/var/run/php/([^"]+)";|fastcgi_pass unix:/var/run/php/\1;|g' \
    -e 's|fastcgi_pass[[:space:]]+/var/run/php/([^;[:space:]]+);|fastcgi_pass unix:/var/run/php/\1;|g' \
    -e "s|fastcgi_pass[[:space:]]+unix:[^;\"']+;|fastcgi_pass unix:${sock};|g" \
    "$conf"

  # إزالة upstream blocks خاطئة إن وُجدت (سبب: invalid host in upstream)
  if grep -qE 'upstream[[:space:]]+php' "$conf" 2>/dev/null; then
    echo "⚠️  إزالة upstream php-fpm الخاطئ من $conf — استخدم fastcgi_pass unix: مباشرة"
    sed -i '/^[[:space:]]*upstream[[:space:]]\+php/,/^[[:space:]]*}/d' "$conf"
    sed -i 's|fastcgi_pass[[:space:]]\+php-fpm;|fastcgi_pass unix:'"${sock}"';|g' "$conf"
  fi
}
