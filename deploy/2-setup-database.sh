#!/bin/bash
# ================================================
# First Click ERP — Database Setup
# Run: bash deploy/2-setup-database.sh
# ================================================
set -e

# ── EDIT THESE ──
DB_NAME="firstclick_erp"
DB_USER="firstclick_user"
DB_PASS="$(openssl rand -base64 16)"  # auto-generate strong password

echo "🗄️ Setting up database..."
echo "Generated password: $DB_PASS"
echo "⚠️  SAVE THIS PASSWORD — you'll need it for .env"

mysql -u root << EOF
CREATE DATABASE IF NOT EXISTS ${DB_NAME}
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost'
  IDENTIFIED BY '${DB_PASS}';

GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF

echo ""
echo "✅ Database created!"
echo "DB_DATABASE=${DB_NAME}"
echo "DB_USERNAME=${DB_USER}"
echo "DB_PASSWORD=${DB_PASS}"
echo ""
echo "Copy these to your backend/.env file ↑"
