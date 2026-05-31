#!/bin/bash
# تثبيت/إصلاح nginx لـ First Click ERP
set -euo pipefail

NGINX_CONF="/etc/nginx/sites-available/firstclick-erp"
NGINX_ENABLED="/etc/nginx/sites-enabled/firstclick-erp"
RATE_LIMIT_CONF="/etc/nginx/conf.d/firstclick-rate-limit.conf"

install_nginx_rate_limit() {
  local project_dir="$1"
  local src="$project_dir/deploy/nginx/firstclick-rate-limit.conf"
  if [ ! -f "$src" ]; then
    echo "⚠️  ملف rate-limit غير موجود: $src"
    return 1
  fi
  mkdir -p /etc/nginx/conf.d
  cp -f "$src" "$RATE_LIMIT_CONF"
  echo "✅ rate-limit: $RATE_LIMIT_CONF"
}

repair_fastcgi_pass_lines() {
  local conf="$1"
  local sock="$2"

  if [ ! -f "$conf" ]; then
    return 1
  fi

  # إزالة upstream خاطئ (سبب: invalid host in upstream "...sock")
  if grep -qE 'upstream[[:space:]]+php' "$conf" 2>/dev/null; then
    sed -i '/^[[:space:]]*upstream[[:space:]]\+php/,/^[[:space:]]*}/d' "$conf"
    sed -i "s|fastcgi_pass[[:space:]]\+php-fpm;|fastcgi_pass unix:${sock};|g" "$conf"
  fi

  # إصلاح fastcgi_pass بدون unix: أو بعلامات اقتباس
  sed -i -E \
    -e 's|fastcgi_pass[[:space:]]+"/var/run/php/([^"]+)";|fastcgi_pass unix:/var/run/php/\1;|g' \
    -e 's|fastcgi_pass[[:space:]]+"/var/run/php/([^"]+)"|fastcgi_pass unix:/var/run/php/\1|g' \
    -e 's|fastcgi_pass[[:space:]]+/var/run/php/([^;[:space:]]+);|fastcgi_pass unix:/var/run/php/\1;|g' \
    -e 's|fastcgi_pass[[:space:]]+/var/run/php/([^;[:space:]]+)|fastcgi_pass unix:/var/run/php/\1|g' \
    "$conf"

  # توحيد المسارات المعروفة في القالب — لا نستبدل بـ regex واسع
  sed -i \
    -e "s|unix:/var/run/php/php8\\.4-fpm\\.sock|unix:${sock}|g" \
    -e "s|unix:/var/run/php/php8\\.2-fpm\\.sock|unix:${sock}|g" \
    "$conf"

  # تحقق: كل fastcgi_pass يجب أن تحتوي unix:
  if grep -E 'fastcgi_pass' "$conf" | grep -qv 'unix:'; then
    echo "❌ ما زال هناك fastcgi_pass بدون unix: — راجع $conf"
    grep -n 'fastcgi_pass' "$conf" || true
    return 1
  fi
}

install_nginx_site() {
  local project_dir="$1"
  local sock="$2"
  local src="$project_dir/deploy/nginx/firstclick-erp-ssl.conf"

  if [ ! -f "$src" ]; then
    echo "❌ قالب nginx غير موجود: $src"
    return 1
  fi

  install_nginx_rate_limit "$project_dir"
  cp -f "$src" "$NGINX_CONF"
  repair_fastcgi_pass_lines "$NGINX_CONF" "$sock"
  ln -sf "$NGINX_CONF" "$NGINX_ENABLED" 2>/dev/null || true
  echo "✅ nginx site: $NGINX_CONF"
}

test_and_reload_nginx() {
  if nginx -t 2>&1; then
    systemctl reload nginx
    systemctl restart php8.4-fpm 2>/dev/null || systemctl restart php8.2-fpm 2>/dev/null || true
    return 0
  fi
  return 1
}
