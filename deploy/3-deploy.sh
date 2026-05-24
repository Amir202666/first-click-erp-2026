#!/bin/bash
# ================================================
# First Click ERP — Deploy / Update Script
# Run: bash deploy/3-deploy.sh
# ================================================
set -e

PROJECT_DIR="/var/www/erp"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "🚀 Deploying First Click ERP..."
echo "Time: $(date)"

if [ ! -d "$PROJECT_DIR/.git" ]; then
  echo "❌ Project not found at $PROJECT_DIR — run: git clone <repo> $PROJECT_DIR"
  exit 1
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "❌ Missing $BACKEND_DIR/.env"
  echo "   Run: cp $PROJECT_DIR/deploy/env.production $BACKEND_DIR/.env && nano $BACKEND_DIR/.env"
  exit 1
fi

# ── Pull latest code ──
echo "📥 Pulling latest code..."
cd "$PROJECT_DIR"
git pull origin main

# ── Backend: Install/Update dependencies ──
echo "📦 Installing backend dependencies..."
cd "$BACKEND_DIR"
composer install --no-dev --optimize-autoloader --no-interaction

# ── Backend: Run migrations ──
echo "🗄️ Running migrations..."
php artisan migrate --force

# ── Backend: Clear & rebuild caches ──
echo "⚡ Rebuilding caches..."
php artisan config:clear
php artisan route:clear
php artisan view:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

# ── Backend: Storage link ──
php artisan storage:link 2>/dev/null || true

# ── Backend: Permissions ──
echo "🔒 Setting permissions..."
chown -R www-data:www-data "$BACKEND_DIR/storage"
chown -R www-data:www-data "$BACKEND_DIR/bootstrap/cache"
chmod -R 755 "$BACKEND_DIR/storage"
chmod -R 755 "$BACKEND_DIR/bootstrap/cache"

# ── Frontend: Build ──
echo "🏗️ Building frontend..."
cd "$FRONTEND_DIR"
npm ci --prefer-offline
npm run build

# ── Restart services ──
echo "🔄 Restarting services..."
systemctl reload nginx
systemctl reload php8.2-fpm

DOMAIN=""
if [ -f /etc/nginx/sites-available/firstclick-erp ]; then
  DOMAIN=$(grep -m1 'server_name' /etc/nginx/sites-available/firstclick-erp | awk '{print $2}' | tr -d ';' | head -1)
fi

echo ""
echo "✅ Deployment complete!"
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "_" ]; then
  echo "🌐 Site: https://${DOMAIN}"
else
  echo "🌐 Site: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_SERVER_IP')"
fi
