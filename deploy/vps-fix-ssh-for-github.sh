#!/bin/bash
# ═══════════════════════════════════════════════════════════
# إصلاح SSH + مفتاح GitHub Actions — شغّله مرة واحدة من Console السيرفر
# bash /var/www/erp/deploy/vps-fix-ssh-for-github.sh
# ═══════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()  { echo -e "${RED}❌ $1${NC}"; }

echo "========================================"
echo "  First Click — إصلاح SSH لـ GitHub Actions"
echo "  $(date '+%Y-%m-%d %H:%M')"
echo "========================================"
echo ""

# ── 1) SSH service ──
echo "── 1) خدمة SSH ──"
if ! dpkg -l openssh-server 2>/dev/null | grep -q ^ii; then
  apt update -qq
  apt install -y openssh-server
fi
systemctl enable ssh 2>/dev/null || systemctl enable sshd 2>/dev/null || true
systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null || true
systemctl is-active ssh 2>/dev/null || systemctl is-active sshd
ok "SSH service running"

# ── 2) Firewall (ufw) ──
echo ""
echo "── 2) جدار ناري ufw ──"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp comment 'SSH GitHub Actions' || true
  ufw --force enable 2>/dev/null || true
  ufw reload 2>/dev/null || true
  ufw status | head -20
  ok "ufw: port 22 allowed"
else
  warn "ufw not installed — open port 22 in hosting panel (Hostinger Firewall)"
fi

# ── 3) Listen check ──
echo ""
echo "── 3) هل SSH يستمع على 22؟ ──"
ss -tlnp | grep -E ':22\s' || err "Nothing listening on port 22!"
SSH_PORT=$(grep -E '^Port ' /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' || echo "22")
SSH_PORT=${SSH_PORT:-22}
echo "SSH Port in config: $SSH_PORT"
if [ "$SSH_PORT" != "22" ]; then
  warn "SSH is NOT on port 22 — add GitHub Secret SERVER_PORT=$SSH_PORT"
  if command -v ufw >/dev/null 2>&1; then
    ufw allow "${SSH_PORT}/tcp" || true
  fi
fi

# ── 4) GitHub Actions deploy key ──
echo ""
echo "── 4) مفتاح github-actions-deploy ──"
mkdir -p /root/.ssh
chmod 700 /root/.ssh
KEY_FILE=/root/.ssh/github_deploy
if [ ! -f "$KEY_FILE" ]; then
  ssh-keygen -t ed25519 -C "github-actions-deploy" -f "$KEY_FILE" -N ""
  ok "Created $KEY_FILE"
else
  ok "Key already exists: $KEY_FILE"
fi
touch /root/.ssh/authorized_keys
grep -qF "$(cat "${KEY_FILE}.pub")" /root/.ssh/authorized_keys 2>/dev/null \
  || cat "${KEY_FILE}.pub" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
ok "Public key in authorized_keys"

# ── 5) Print private key for GitHub Secret ──
echo ""
echo "========================================"
echo -e "${YELLOW}  انسخ كل ما بين الخطين إلى GitHub Secret: SERVER_SSH_KEY${NC}"
echo "========================================"
echo "----- COPY BELOW TO GITHUB SERVER_SSH_KEY -----"
cat "$KEY_FILE"
echo "----- END COPY -----"
echo ""

# ── 6) Optional: pull latest project ──
if [ -d /var/www/erp/.git ]; then
  echo "── 6) تحديث المشروع من Git ──"
  cd /var/www/erp
  git fetch origin main 2>/dev/null && git reset --hard origin/main 2>/dev/null || warn "git pull skipped"
  ok "Project at: $(git log -1 --oneline 2>/dev/null || echo n/a)"
fi

echo ""
echo "========================================"
warn "مهم: افتح منفذ 22 في لوحة الاستضافة (Hostinger → VPS → Firewall)"
echo "  ثم GitHub → Actions → Deploy to Production → Run workflow"
echo "========================================"
