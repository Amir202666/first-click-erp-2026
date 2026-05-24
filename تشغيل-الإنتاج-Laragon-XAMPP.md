# تشغيل النظام كنسخة إنتاج (Laragon / XAMPP)

يُفضّل التوقف عن استخدام `php artisan serve` و `npm run dev` وتشغيل النظام عبر خادم محلي مستقر (Apache أو Nginx) مع قاعدة بيانات كخدمة.

---

## 1. البناء للإنتاج (مرة واحدة أو بعد كل تحديث للواجهة)

1. نفّذ من مجلد المشروع:
   ```
   build-production.cmd
   ```
2. أو يدوياً:
   ```
   cd frontend
   npm run build
   cd ..
   xcopy /E /Y /I "frontend\dist\*" "backend\public\"
   ```
3. الناتج: ملفات الواجهة داخل `backend\public` (index.html و assets). طلبات `/api/*` يخدمها Laravel من نفس الخادم.

---

## 2. تثبيت Laragon (مُوصى به)

1. حمّل Laragon من https://laragon.org
2. ثبّت وافتح Laragon.
3. من القائمة: **Menu → PHP → Version** واختر 8.1 أو أحدث.
4. انسخ مجلد المشروع بالكامل إلى مجلد Laragon، مثلاً:
   ```
   C:\laragon\www\first-click\
   ```
   بحيث يكون هيكل مثل:
   ```
   first-click\
     backend\     (مجلد Laravel)
       public\    (فيه index.html + assets من البناء، وindex.php و .htaccess)
       ...
     frontend\   (للتطوير فقط؛ التشغيل الإنتاجي من public)
   ```

---

## 3. إعداد Virtual Host في Laragon

1. في Laragon: **Menu → Apache → Virtual Hosts → Add** (أو يدوياً).
2. أنشئ ملف استضافة، مثلاً:
   - الاسم: `first-click.test`
   - المسار: `C:\laragon\www\first-click\backend\public`
3. أو استخدم **Quick add**: انقر يمين على مجلد المشروع داخل www واختر **Laragon → Apache → Add Virtual Host** وسمّه `first-click`.
4. أعد تشغيل Apache من Laragon.
5. افتح المتصفح على: **http://first-click.test** (أو الرابط الذي يظهر في Laragon).

---

## 4. قاعدة البيانات كخدمة (MySQL/MariaDB)

لتقليل انقطاع الاتصال عند حفظ الفواتير المرحلة، استخدم MySQL/MariaDB كخدمة بدلاً من SQLite:

1. في Laragon: **Menu → MySQL → Start** (أو تأكد أن MySQL يعمل كخدمة).
2. من **Menu → MySQL → HeidiSQL** (أو أي عميل) أنشئ قاعدة بيانات جديدة، مثلاً: `first_click_db`.
3. في المشروع انسخ `backend\.env.example` إلى `backend\.env` إن لم يكن موجوداً، ثم عدّل:
   ```env
   DB_CONNECTION=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_DATABASE=first_click_db
   DB_USERNAME=root
   DB_PASSWORD=
   ```
4. من مجلد `backend` نفّذ:
   ```
   php artisan key:generate
   php artisan migrate
   ```
5. إذا كان لديك بيانات قديمة على SQLite وترغب بنقلها، استخدم أدوات استيراد/تصدير أو سكربتات الهجرة حسب الحاجة.

---

## 5. إعدادات Laravel للإنتاج

في `backend\.env`:

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=http://first-click.test

# إن كان التطبيق على منفذ أو مسار مختلف عدّل APP_URL وفقاً لذلك
```

---

## 6. XAMPP بدلاً من Laragon

1. ثبّت XAMPP وانسخ المشروع إلى `C:\xampp\htdocs\first-click` (بنفس الهيكل أعلاه).
2. في **httpd-vhosts.conf** أضف:
   ```apache
   <VirtualHost *:80>
       ServerName first-click.test
       DocumentRoot "C:/xampp/htdocs/first-click/backend/public"
       <Directory "C:/xampp/htdocs/first-click/backend/public">
           AllowOverride All
           Require all granted
       </Directory>
   </VirtualHost>
   ```
3. في `C:\Windows\System32\drivers\etc\hosts` أضف:
   ```
   127.0.0.1   first-click.test
   ```
4. شغّل Apache و MySQL من لوحة XAMPP.
5. نفّذ البناء (الخطوة 1) ثم افتح **http://first-click.test**.

---

## 7. ملخص

| المهمة | الإجراء |
|--------|---------|
| بناء الواجهة | تشغيل `build-production.cmd` |
| الخادم | Apache/Nginx عبر Laragon أو XAMPP يشير إلى `backend\public` |
| قاعدة البيانات | MySQL كخدمة؛ إعداد `.env` وتشغيل `php artisan migrate` |
| رابط التطبيق | مثلاً `http://first-click.test` (حسب اسم الاستضافة) |

بهذا يعمل النظام كنسخة إنتاج محلية دون الحاجة إلى `php artisan serve` أو `npm run dev`، وتعمل قاعدة البيانات كخدمة في الخلفية.
