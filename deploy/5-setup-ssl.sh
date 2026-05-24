#!/bin/bash
# ================================================
# First Click ERP — SSL Certificate (Let's Encrypt)
# Run AFTER domain DNS is pointing to this server
# ================================================
set -e

# ── EDIT THIS ──
DOMAIN="yourdomain.com"
EMAIL="your-email@gmail.com"

echo "🔒 Setting up SSL for $DOMAIN..."

# Get certificate
certbot --nginx \
  -d "$DOMAIN" \
  -d "www.$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  --redirect

# Test auto-renewal
certbot renew --dry-run

echo "✅ SSL configured! Site is now HTTPS."
echo "🌐 Visit: https://$DOMAIN"
