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
  echo "/var/run/php/php8.4-fpm.sock"
  return 1
}

# للتوافق مع سكريبتات قديمة
apply_php_socket_to_nginx() {
  local conf="$1"
  local sock="$2"
  # shellcheck source=/dev/null
  local dir
  dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # shellcheck source=/dev/null
  source "$dir/nginx-install.sh"
  repair_fastcgi_pass_lines "$conf" "$sock"
}
