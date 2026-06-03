# حماية مشروع First Click ERP على GitHub

> **المستودع:** [Amir202666/first-click-erp-2026](https://github.com/Amir202666/first-click-erp-2026)  
> **النشر على السيرفر:** `bash /var/www/erp/deploy/publish-online.sh` (كود) أو `publish-all-online.sh` (كود + قاعدة)

---

## 1) حماية `.env` والملفات الحساسة

### تحقق محلياً

```bash
git check-ignore -v backend/.env
git ls-files backend/.env
```

السطر الثاني **يجب أن لا يُرجع شيئاً**. إن ظهر `backend/.env` في Git:

```bash
git rm --cached backend/.env
git commit -m "chore: stop tracking backend/.env"
git push origin main
```

### ما هو محمي في `.gitignore` (جذر المشروع)

- `backend/.env` و `frontend/.env*`
- `backend/vendor/` و `node_modules/`
- `scripts/backups/*.sql` (نسخ محلية)
- **استثناء:** `deploy/db_backup.sql` — يُرفع عمداً مع «رفع كل شيء»؛ **احذفه من Git بعد الاستيراد** إن كان فيه بيانات حساسة.

### ⚠️ لا تستخدم `git filter-branch --force` إلا إذا `.env` دخل التاريخ فعلاً

هذا يعيد كتابة التاريخ ويتطلب `force push` — خطر على الفريق.  
بديل أأمن: `git rm --cached` + Secret Scanning + تدوير كلمات المرور.

---

## 2) Branch Protection (من واجهة GitHub)

1. [Settings → Branches](https://github.com/Amir202666/first-click-erp-2026/settings/branches)
2. **Add rule** لـ `main`:
   - Require pull request before merging
   - Require approvals (1)
   - Require status checks (بعد تفعيل Actions)
   - Do not allow bypassing
3. كرر لـ `staging` إن استخدمته

> للعمل Solo: يمكنك تخفيف «Require PR» مؤقتاً، لكن **لا ترفع `.env` أبداً**.

---

## 3) GitHub Secrets (Settings → Secrets → Actions)

| Secret | القيمة |
|--------|--------|
| `SERVER_HOST` | IP السيرفر (مثل `187.124.35.87`) |
| `SERVER_USER` | `root` |
| `SERVER_SSH_KEY` | محتوى **private key** (مفضل) |
| `SERVER_PASSWORD` | بديل إن لم تستخدم مفتاحاً (أقل أماناً) |
| `SERVER_PORT` | `22` أو منفذ SSH المخصص |

**لا تضف** `DB_PASSWORD` أو `APP_KEY` في Secrets للـ deploy الحالي — السيرفر يقرأها من `backend/.env` المحلي على VPS فقط.

---

## 4) GitHub Actions — موجود مسبقاً

| الملف | متى يعمل |
|-------|----------|
| `.github/workflows/deploy.yml` | push على `main` |
| `.github/workflows/deploy-staging.yml` | push على `staging` |

السكربت على السيرفر:

```bash
cd /var/www/erp && git reset --hard origin/main && bash deploy.sh
```

**لا تكرر** `composer` / `npm` يدوياً في Workflow — `deploy.sh` يفعل ذلك.

### تفعيل النشر التلقائي

1. أضف Secrets (أعلاه)
2. على السيرفر: أضف **public key** لـ GitHub Actions في `~/.ssh/authorized_keys`
3. ادفع على `main` → Actions تشغّل النشر

> GitHub Actions يتصل من سحابة GitHub — قد ينجح حتى لو SSH من Windows عندك **timeout**.

---

## 5) Dependabot و CODEOWNERS

| ملف | الغرض |
|-----|--------|
| `.github/dependabot.yml` | تحديثات أمنية أسبوعية Composer/npm/Actions |
| `.github/CODEOWNERS` | مراجعة إلزامية للملفات الحساسة |

فعّل من Settings → Code security: **Secret scanning**, **Dependabot alerts**.

---

## 6) مفتاح SSH لـ GitHub Actions (على السيرفر)

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

انسخ **المحتوى الكامل** لـ `~/.ssh/github_deploy` (private) → Secret `SERVER_SSH_KEY`.

---

## 7) نسخة احتياطية قبل النشر

`deploy.sh` يأخذ نسخة من nginx و `.env` و (إن أمكن) MySQL.  
Workflow `deploy.yml` يأخذ dump سريع قبل `deploy.sh` إن وُجد `mysqldump`.

---

## 8) مسارات النشر — ثابتة

| الهدف | جهازك | السيرفر |
|-------|--------|---------|
| كود فقط | `scripts\رفع-للاونلاين.bat` → 1 | `publish-online.sh` أو Actions |
| كود + بيانات | `scripts\رفع-كل-شيء.bat` | `publish-all-online.sh` |

**لا ترفع** `deploy/db_backup.sql` إلا عند نقل البيانات، ثم احذفه من commit لاحق إن لزم.

---

## 9) Checklist

| البند | |
|-------|---|
| `.env` غير متتبع في Git | ☐ |
| Secrets مضبوطة في GitHub | ☐ |
| Branch protection على `main` | ☐ |
| Secret scanning مفعّل | ☐ |
| مفتاح SSH للـ Actions على السيرفر | ☐ |
| `deploy.yml` ينجح من تبويب Actions | ☐ |
