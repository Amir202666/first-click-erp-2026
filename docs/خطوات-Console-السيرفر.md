# خطوات بسيطة — Console السيرفر (بدون SSH من Windows)

> **المشكلة:** GitHub Actions يظهر `dial tcp :22: i/o timeout`  
> **السبب:** منفذ SSH (22) مغلق من الإنترنت — ليس خطأ في Secrets.

---

## الخطوة 1 — ادخل Console السيرفر

1. افتح لوحة **Hostinger** (أو مزود VPS)
2. **VPS** → اختر السيرفر `187.124.35.87`
3. اضغط **Browser terminal** أو **Console** (نافذة سوداء داخل المتصفح)

---

## الخطوة 2 — انسخ والصق هذا الأمر كاملاً

```bash
cd /var/www/erp 2>/dev/null || mkdir -p /var/www/erp
if [ -d /var/www/erp/.git ]; then
  cd /var/www/erp && git fetch origin main && git reset --hard origin/main
else
  apt update -qq && apt install -y git
  git clone https://github.com/Amir202666/first-click-erp-2026.git /var/www/erp
  cd /var/www/erp
fi
bash /var/www/erp/deploy/vps-fix-ssh-for-github.sh
```

انتظر حتى ينتهي. في النهاية يطبع **مفتاحاً خاصاً** بين سطرين:
`----- COPY BELOW TO GITHUB SERVER_SSH_KEY -----`

---

## الخطوة 3 — أضف المفتاح في GitHub

1. [Secrets → Actions](https://github.com/Amir202666/first-click-erp-2026/settings/secrets/actions)
2. **New repository secret**
3. Name: `SERVER_SSH_KEY`
4. Secret: الصق **كل** المفتاح (من `BEGIN` إلى `END`)
5. تأكد أيضاً من وجود: `SERVER_HOST` = `187.124.35.87` و `SERVER_USER` = `root`

---

## الخطوة 4 — افتح المنفذ 22 في Hostinger

1. **VPS** → **Security** → **Firewall**
2. **Add rule**: Protocol **TCP**, Port **22**, Source **Anywhere**
3. Save

> بدون هذه الخطوة، GitHub **لن يتصل** حتى لو السكربت نجح.

---

## الخطوة 5 — انشر الموقع الآن (من Console)

```bash
bash /var/www/erp/deploy/publish-online.sh
```

لرفع **الكود + الفواتير** من قاعدة Git:

```bash
bash /var/www/erp/scripts/sync-database.sh /var/www/erp/deploy/db_backup.sql
bash /var/www/erp/deploy/publish-all-online.sh
```

---

## الخطوة 6 — اختبر GitHub Actions

1. [Deploy to Production](https://github.com/Amir202666/first-click-erp-2026/actions/workflows/deploy.yml)
2. **Run workflow** → branch **main** → **Run workflow**

إذا نجح ✅ — كل push على `main` ينشر تلقائياً.

---

## إذا فشل مرة أخرى

| رسالة الخطأ | الحل |
|-------------|------|
| `i/o timeout` | لم تفتح منفذ 22 في Firewall لوحة Hostinger |
| `permission denied` | أعد لصق `SERVER_SSH_KEY` من س output السكربت |
| `SERVER_PORT` | إذا السكربت قال SSH على منفذ غير 22 — أضف Secret `SERVER_PORT` |
