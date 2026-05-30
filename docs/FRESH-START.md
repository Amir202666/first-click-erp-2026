# البدء من الصفر — First Click ERP

> **تصفير البيانات** ≠ حذف الكود. الكود يبقى؛ تُمسح فقط البيانات (عملاء، فواتير، حسابات مُعدّلة، …).

---

## السير العمل الجديد

```
1. تصفير محلي (أوفلاين)
2. إضافة ما تحتاجه واختباره محلياً
3. git commit + push
4. deploy على السيرفر
5. (اختياري) تصفير الإنتاج ثم مزامنة البيانات إن لزم
```

---

## 1) تصفير المحلي (Windows)

### المتطلب
- **MySQL شغّال** من XAMPP (مرة واحدة)

### الأمر
```cmd
cd "D:\erp projects\first click"
scripts\local-reset-fresh.bat
```
اكتب **YES** عند السؤال.

### ماذا يحدث؟
| يُمسح | يُعاد |
|--------|--------|
| كل العملاء والموردين والأصناف | Super Admin |
| الفواتير والقيود والمدفوعات | المالك |
| دليل الحسابات المُعدّل | دليل **103** حساب افتراضي |
| بيانات الاستيراد التجريبية | شركة `first-company` |

### بعد التصفير
```cmd
scripts\local-dev.cmd
```
افتح: http://127.0.0.1:5173

| الحقل | القيمة |
|--------|--------|
| معرف الشركة | `first-company` |
| Super Admin | `admin@firstclickerp.com` / `FirstClick@2026` |

---

## 2) التطوير على الأوفلاين

1. أضف ما تحتاجه (عملاء، حسابات، إعدادات، …)
2. اختبر كل شيء محلياً
3. لا ترفع للسيرفر قبل التأكد

---

## 3) رفع الكود للأونلاين

```cmd
git add .
git commit -m "وصف التعديل"
git push origin main
```

### على السيرفر (Browser Terminal — أمر واحد)
```bash
cd /var/www/erp && bash deploy.sh
```

---

## 4) تصفير الأونلاين (عند الحاجة)

> **تحذير:** يمسح كل بيانات الموقع على السيرفر.

### Hostinger → VPS → Browser Terminal

**أمر 1:**
```bash
cd /var/www/erp
```

**أمر 2:**
```bash
bash scripts/production-reset-fresh.sh
```
اكتب **YES**

أو مباشرة:
```bash
cd /var/www/erp/backend && php artisan erp:factory-reset --force
```

---

## 5) نقل البيانات من محلي → أونلاين (لاحقاً)

| ماذا تنقل | الطريقة |
|-----------|---------|
| **الكود فقط** | `git push` + `deploy.sh` |
| **قاعدة كاملة** | `scripts\export-local-db.bat` ثم استيراد على السيرفر |
| **دليل حسابات فقط** | `scripts\export-chart-local.bat` أو `accounts:reset-professional` |

---

## 6) أوامر Artisan

| الأمر | الاستخدام |
|--------|-----------|
| `php artisan erp:factory-reset --force` | تصفير كامل |
| `php artisan local:setup --fresh` | نفس التصفير (محلي) |
| `php artisan accounts:reset-professional --slug=first-company --force` | دليل حسابات فقط |

---

## 7) ملفات تجريبية

احذف أو تجاهل ملفات `tmp-*.json` في جذر المشروع — للاختبار فقط.
