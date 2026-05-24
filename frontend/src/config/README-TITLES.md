# عناوين التبويب (Document Title)

## التنسيق

جميع العناوين تظهر بالشكل: **`[اسم الصفحة] | First Click ERP`**

## كيف يعمل

1. **ملف التكوين** `src/config/routeTitles.ts`: يربط كل مسار (path) بمفتاح ترجمة (titleKey). عند التنقل، يُحدَّث `document.title` تلقائياً من هذا الملف والترجمات.

2. **المكوّن** `DocumentTitle`: يعمل داخل `Layout` ويستمع لـ `location.pathname` و`pageTitleOverride`. يغيّر `document.title` داخل `useEffect` فقط (بدون إعادة رندر غير ضرورية للمحتوى).

3. **الحالات الخاصة (عناوين من قاعدة البيانات)**  
   في أي صفحة تريد عنواناً ديناميكياً (مثل "فاتورة #105"):
   - استورد: `import { useDocumentTitle } from '../../hooks/useDocumentTitle'`
   - عند توفّر البيانات (مثلاً بعد تحميل الفاتورة):  
     `useDocumentTitle(lang === 'ar' ? \`فاتورة #${invoice.number}\` : \`Invoice #${invoice.number}\`)`
   - عند المغادرة، الـ hook يمسح العنوان تلقائياً ويعود العنوان الافتراضي للمسار الجديد.

## إضافة صفحة جديدة إلى العناوين

في `routeTitles.ts` أضف قاعدة جديدة في `ROUTE_TITLE_RULES` (الأكثر تحديداً أولاً):

```ts
{ path: '/my-page', titleKey: 'nav.myPage' }
```

ثم أضف المفتاح `nav.myPage` في `i18n/ar.ts` و `i18n/en.ts`.

## أداء

- التحديث يتم داخل `useEffect` فقط (تأثير جانبي على `document.title`).
- لا يسبب إعادة رندر لشجرة المكوّنات إلا عند تغيير `pageTitleOverride` (وذلك يحدث فقط عندما تستدعي صفحة ما `useDocumentTitle(...)`).
