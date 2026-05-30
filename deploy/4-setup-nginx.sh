#!/bin/bash
# ================================================
# First Click ERP — Nginx Configuration
# Edit DOMAIN below, then run: bash deploy/4-setup-nginx.sh
# ================================================
set -e

# ── EDIT THIS ──
DOMAIN="firstclickerp.top"    # عدّل إن لزم
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo "🌐 Setting up Nginx for: $DOMAIN (IP: $SERVER_IP)"

cat > /etc/nginx/sites-available/firstclick-erp << NGINX
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN} ${SERVER_IP};
    charset utf-8;

    # ── Logs ──
    access_log /var/log/nginx/firstclick-access.log;
    error_log  /var/log/nginx/firstclick-error.log;

    # SPA + Laravel من نفس المجلد (بعد deploy.sh)
    root /var/www/erp/backend/public;
    index index.html index.php;

    location ^~ /api {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ^~ /sanctum {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~ \.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME \$realpath_root\$fastcgi_script_name;
        fastcgi_read_timeout 300;
    }

    # ── Laravel Storage files ──
    location /storage {
        alias /var/www/erp/backend/storage/app/public;
        try_files \$uri \$uri/ =404;
    }

    # ── Security headers ──
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    # ── Gzip ──
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # ── Max upload size ──
    client_max_body_size 50M;
}
NGINX

# Enable site
ln -sf /etc/nginx/sites-available/firstclick-erp /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test & restart
nginx -t && systemctl restart nginx

echo "✅ Nginx configured!"
echo ""
echo "Next steps:"
echo "1. Point your domain DNS A record to: $SERVER_IP"
echo "2. Run SSL setup: bash deploy/5-setup-ssl.sh"
