import fs from 'fs'

const filePath = new URL('../src/pages/settings/PrintTemplates.tsx', import.meta.url)
let s = fs.readFileSync(filePath, 'utf8')

const docTypesStart = s.indexOf('const DOC_TYPES = [')
const docTypesEnd = s.indexOf('function pickImportMeta')
if (docTypesStart === -1 || docTypesEnd === -1) {
  console.error('Could not find DOC_TYPES block')
  process.exit(1)
}

const header = fs.readFileSync(new URL('./restore-print-templates-header.txt', import.meta.url), 'utf8')
s = s.slice(0, docTypesStart) + header + s.slice(docTypesEnd)

const langPairs = [
  ['Block editor', 'محرر الكتل'],
  ['Open editor', 'فتح المحرر'],
  ['Set as default', 'تعيين كافتراضي'],
  ['Landscape', 'أفقي'],
  ['Portrait', 'عمودي'],
  ['Default', 'افتراضي'],
  ['Edit', 'تحرير'],
  ['Copy', 'نسخ'],
  ['Export', 'تصدير'],
  ['Preview', 'معاينة'],
  ['Delete', 'حذف'],
  ['Print templates', 'قوالب الطباعة'],
  ['Search templates...', 'بحث في القوالب...'],
  ['Grid', 'شبكة'],
  ['List', 'قائمة'],
  ['Delete all', 'حذف الكل'],
  ['Reset library', 'إعادة المكتبة'],
  ['Import template from file', 'استيراد قالب من ملف'],
  ['Import', 'استيراد'],
  ['New template', 'قالب جديد'],
  ['Failed to load templates', 'خطأ في تحميل القوالب'],
  ['Retry', 'إعادة المحاولة'],
  ['No templates yet', 'لا توجد قوالب بعد'],
  ['No matches', 'لا توجد نتائج'],
  ['Try another search or tab', 'جرّب بحثًا أو تبويبًا آخر'],
  ['Delete all templates', 'حذف جميع القوالب'],
  ['Yes, delete all', 'نعم، احذف الكل'],
  ['Reset template library', 'إعادة المكتبة'],
  ['Yes, reset', 'نعم، إعادة الإنشاء'],
  ['Delete template', 'حذف القالب'],
  ['Import template', 'استيراد قالب'],
  ['Close', 'إغلاق'],
  ['Review details before saving:', 'تحقق من المعلومات قبل الحفظ:'],
  ['Template name', 'اسم القالب'],
  ['Document type', 'نوع المستند'],
  ['Paper size', 'حجم الورق'],
  ['HTML content', 'محتوى HTML'],
  ['chars', 'حرف'],
  ['Cancel', 'إلغاء'],
  ['Select a company', 'اختر شركة'],
  ['Enter a template name', 'أدخل اسم القالب'],
  ['Check the file format', 'تأكد من صحة الملف'],
  ['All templates deleted.', 'تم حذف جميع القوالب.'],
  ['Could not delete templates', 'تعذر حذف القوالب'],
  ['Template imported successfully.', 'تم استيراد القالب بنجاح.'],
  ['Failed to save imported template', 'فشل في حفظ القالب المستورد'],
  ['Could not seed templates', 'تعذر إنشاء القوالب الافتراضية'],
  ['Thermal 80mm', 'حراري 80mm'],
  ['Thermal 58mm', 'حراري 58mm'],
]

for (const [en, ar] of langPairs) {
  const re = new RegExp(`langAr \\? '[^']*' : '${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'g')
  s = s.replace(re, `langAr ? '${ar}' : '${en}'`)
}

s = s.replace(
  /langAr \? `\$\{templates\.length\}[^`]*` : `\$\{templates\.length\} templates`/,
  "langAr ? `${templates.length} قالب متاح` : `${templates.length} templates`",
)
s = s.replace(
  /setSeedSuccess\(langAr \? '[^']*' : 'Old templates removed; 14 new professional templates created\.'\)/,
  "setSeedSuccess(langAr ? 'تم حذف القوالب القديمة وإنشاء 14 قالبًا احترافيًا جديدًا.' : 'Old templates removed; 14 new professional templates created.')",
)
s = s.replace(
  /langAr \? `[^`]*\$\{message\}` : `Import error: \$\{message\}`/,
  "langAr ? `خطأ في استيراد الملف: ${message}` : `Import error: ${message}`",
)
s = s.replace(
  /message=\{langAr \? `[^`]*\$\{deleteTarget\.name\}[^`]*` : `Delete «\$\{deleteTarget\.name\}»\?`\}/,
  "message={langAr ? `حذف «${deleteTarget.name}»؟` : `Delete «${deleteTarget.name}»?`}",
)
s = s.replace(
  /\? '[^']*'[\s\S]*?: 'Use [^']+Reset library[^']+create a template manually\.'/,
  "? 'استخدم «إعادة المكتبة» لتحميل مجموعة القوالب الجاهزة، أو أنشئ قالبًا يدويًا.'\n                : 'Use “Reset library” to load the built‑in template pack, or create a template manually.'",
)
s = s.replace(
  /\? `[^`]*Continue\?`/,
  "? `سيتم حذف جميع القوالب الحالية (${templates.length}) نهائيًا. يمكنك إنشاء قوالب جديدة لاحقًا من «+ قالب جديد». هل تريد المتابعة؟`",
)
s = s.replace(
  /\? '[^']*All current templates will be deleted and replaced with 14 new professional templates\. Continue\?'/,
  "? 'سيتم حذف جميع القوالب الحالية واستبدالها بـ 14 قالبًا احترافيًا جديدًا (فاتورة، سند، POS، قيد، مشتريات، مخزون). هل تريد المتابعة؟'",
)
s = s.replace(
  /throw new Error\('[^']*Base64 \+ PHP Serialized[^']*'\)/,
  "throw new Error('تعذر تحويل ملف القالب. تأكد أنه ملف قالب POS صحيح (Base64 + PHP Serialized).')",
)
s = s.replace(/throw new Error\('ملف JSON[^']*'\)/g, "throw new Error('ملف JSON غير صالح')")
s = s.replace(
  /throw new Error\('[^']*'\)(?=\s*\n\s*\}\s*\n\s*\} else if \(fileName\.endsWith\('\.txt'\)\))/,
  "throw new Error('لم يتم العثور على محتوى في الملف')",
)
s = s.replace(/\? '📄 [^']*Thermal 80mm'/g, "? '📄 حراري 80mm'")
s = s.replace(/\? '📄 [^']*Thermal 58mm'/g, "? '📄 حراري 58mm'")
s = s.replace(/\} \| \{paperLabel\}/g, '} · {paperLabel}')
s = s.replace(/\{paperLabel\} \| \{orientLabel\}/g, '{paperLabel} · {orientLabel}')
s = s.replace(/\{orientLabel\} \| \{layoutLabel/g, '{orientLabel} · {layoutLabel')
s = s.replace(/\} " \{template\.paper_size\} " \{/g, '} · {template.paper_size} · {')
s = s.replace(
  /importMut\.isPending \? '[^']*' : langAr \? '[^']*' : '✅ Save template'/,
  "importMut.isPending ? '…' : langAr ? '✅ حفظ القالب' : '✅ Save template'",
)
s = s.replace(
  /\{seedMut\.isPending \? '[^']*' : langAr \? '[^']*' : '📥 Reset library'\}/,
  "{seedMut.isPending ? '…' : langAr ? '📥 إعادة المكتبة' : '📥 Reset library'}",
)

fs.writeFileSync(filePath, s, 'utf8')
console.log('Restored Arabic in PrintTemplates.tsx')
