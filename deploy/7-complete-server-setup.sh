#!/bin/bash
# ═══════════════════════════════════════════════════════════
# First Click ERP — إكمال إعداد السيرفر (بعد الخطوات اليدوية)
# تشغيل: cd /var/www/erp && bash deploy/7-complete-server-setup.sh
# ═══════════════════════════════════════════════════════════
set -euo pipefail

PROJECT_DIR="/var/www/erp"
BACKEND_DIR="$PROJECT_DIR/backend"
DOMAIN="${FC_DOMAIN:-firstclickerp.top}"

echo "========================================"
echo "🔧 إكمال إعداد السيرفر — $DOMAIN"
echo "========================================"

# ── PHP-FPM socket ─────────────────────────────────────────
PHP_FPM_SOCK=""
for s in /var/run/php/php8.4-fpm.sock /var/run/php/php8.2-fpm.sock /var/run/php/php-fpm.sock; do
  if [ -S "$s" ]; then
    PHP_FPM_SOCK="$s"
    break
  fi
done
if [ -z "$PHP_FPM_SOCK" ]; then
  echo "❌ لم يُعثر على php-fpm.sock"
  exit 1
fi
echo "✓ PHP-FPM: $PHP_FPM_SOCK"

# ── Git pull ───────────────────────────────────────────────
cd "$PROJECT_DIR"
if [ -d .git ]; then
  if [ -n "$(git status --porcelain scripts/sync-database.sh 2>/dev/null)" ]; then
    git checkout -- scripts/sync-database.sh 2>/dev/null || true
  fi
  echo "📥 git pull..."
  git pull origin main
fi

# ── Nginx rate limit + site ────────────────────────────────
if [ -f "$PROJECT_DIR/deploy/nginx/firstclick-rate-limit.conf" ]; then
  cp "$PROJECT_DIR/deploy/nginx/firstclick-rate-limit.conf" /etc/nginx/conf.d/firstclick-rate-limit.conf
  echo "✓ Rate limit zones"
fi

NGINX_SITE="/etc/nginx/sites-available/firstclick-erp"
if [ -f "$PROJECT_DIR/deploy/nginx/firstclick-erp-ssl.conf" ]; then
  cp "$PROJECT_DIR/deploy/nginx/firstclick-erp-ssl.conf" "$NGINX_SITE"
  sed -i "s/firstclickerp.top/${DOMAIN}/g" "$NGINX_SITE" 2>/dev/null || true
  sed -i "s|unix:/var/run/php/php8.2-fpm.sock|unix:${PHP_FPM_SOCK}|g" "$NGINX_SITE"
  ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/firstclick-erp
  rm -f /etc/nginx/sites-enabled/default
  echo "✓ Nginx site (backend/public)"
fi

# ── Fail2Ban (إن وُجد القالب) ─────────────────────────────
if [ -f "$PROJECT_DIR/deploy/fail2ban/jail.local.example" ] && [ ! -f /etc/fail2ban/jail.local ]; then
  cp "$PROJECT_DIR/deploy/fail2ban/jail.local.example" /etc/fail2ban/jail.local
  systemctl restart fail2ban 2>/dev/null || true
  echo "✓ Fail2Ban jail.local"
fi

# ── Cron صيانة ─────────────────────────────────────────────
if [ -f "$PROJECT_DIR/deploy/cron/firstclick-maintenance.example" ]; then
  cp "$PROJECT_DIR/deploy/cron/firstclick-maintenance.example" /etc/cron.d/firstclick-maintenance
  chmod 644 /etc/cron.d/firstclick-maintenance
  mkdir -p /backups
  chmod 700 /backups
  echo "✓ Cron maintenance (تأكد من /root/.my.cnf للنسخ الاحتياطي)"
fi

# ── MySQL tuning (اختياري) ─────────────────────────────────
if [ -f "$PROJECT_DIR/deploy/mysql/mysqld-tuning.cnf.example" ]; then
  cp "$PROJECT_DIR/deploy/mysql/mysqld-tuning.cnf.example" /etc/mysql/mysql.conf.d/99-firstclick.cnf
  systemctl restart mysql 2>/dev/null || true
  echo "✓ MySQL tuning"
fi

# ── أداء: Redis + OPcache + Supervisor ─────────────────────
if [ -f "$PROJECT_DIR/deploy/6-apply-performance.sh" ]; then
  bash "$PROJECT_DIR/deploy/6-apply-performance.sh"
fi

# ── Deploy كامل (build + migrate + cache) ──────────────────
if [ -f "$PROJECT_DIR/deploy.sh" ]; then
  bash "$PROJECT_DIR/deploy.sh"
elif [ -f "$PROJECT_DIR/deploy/3-deploy.sh" ]; then
  bash "$PROJECT_DIR/deploy/3-deploy.sh"
fi

# ── SSL (إن لم يكن مفعّلاً) ─────────────────────────────────
if ! grep -q "ssl_certificate" "$NGINX_SITE" 2>/dev/null || [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  echo ""
  echo "⚠️  SSL: شغّل يدوياً بعد ضبط DNS:"
  echo "   nano deploy/5-setup-ssl.sh   # DOMAIN و EMAIL"
  echo "   bash deploy/5-setup-ssl.sh"
else
  echo "✓ SSL certificate موجود"
fi

# ── اختبار ─────────────────────────────────────────────────
echo ""
echo "========================================"
echo "🔍 اختبار سريع"
echo "========================================"
nginx -t
systemctl is-active nginx && echo "✓ nginx"
systemctl is-active mysql 2>/dev/null && echo "✓ mysql" || systemctl is-active mariadb 2>/dev/null && echo "✓ mariadb"
systemctl is-active "php$(basename "$PHP_FPM_SOCK" .sock | sed 's/php//;s/-fpm//')-fpm" 2>/dev/null || systemctl is-active php8.2-fpm 2>/dev/null || true

cd "$BACKEND_DIR"
php artisan about --only=environment,cache 2>/dev/null || php artisan --version

if [ -f "$BACKEND_DIR/public/index.html" ]; then
  echo "✓ frontend في public/"
else
  echo "⚠️  لا يوجد public/index.html — راجع deploy.sh"
fi

echo ""
echo "✅ اكتمل الإعداد."
echo "🌐 https://${DOMAIN}"
echo ""
echo "بيانات Super Admin (إن لم تُنشأ):"
echo "   cd $BACKEND_DIR && php artisan admin:create"
