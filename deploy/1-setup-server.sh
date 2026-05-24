#!/bin/bash
# ================================================
# First Click ERP — Hostinger VPS Initial Setup
# Run once as root: bash deploy/1-setup-server.sh
# ================================================
set -e
echo "🚀 Starting First Click ERP Server Setup..."

# ── Update system ──
apt update && apt upgrade -y

# ── Install Nginx ──
apt install -y nginx
systemctl enable nginx
systemctl start nginx

# ── Install PHP 8.2 ──
apt install -y software-properties-common
add-apt-repository ppa:ondrej/php -y
apt update
apt install -y php8.2-fpm php8.2-cli php8.2-mysql php8.2-mbstring \
  php8.2-xml php8.2-curl php8.2-zip php8.2-bcmath \
  php8.2-gd php8.2-intl php8.2-redis

# ── Install MySQL ──
apt install -y mysql-server
systemctl enable mysql
systemctl start mysql

# ── Install Composer ──
curl -sS https://getcomposer.org/installer | php
mv composer.phar /usr/local/bin/composer
chmod +x /usr/local/bin/composer

# ── Install Node.js 20 ──
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# ── Install Git ──
apt install -y git curl unzip

# ── Install Certbot (SSL) ──
apt install -y certbot python3-certbot-nginx

# ── Create project directory ──
mkdir -p /var/www/erp
chown -R www-data:www-data /var/www/erp

echo "✅ Server setup complete!"
echo "PHP: $(php -v | head -1)"
echo "Node: $(node -v)"
echo "MySQL: $(mysql -V)"
echo "Nginx: $(nginx -v 2>&1)"
