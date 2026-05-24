/**
 * تنسيقات موحّدة لحقول الفلاتر في التقارير والقوائم:
 * - حلقة تركيز داخلية (`ring-inset`) لتظهر على الحواف الأربع دون قصّها مع `overflow-x-auto`.
 * - حشوة أفقية/عمودية لشريط الفلاتر لإفساح مجال للحلقة.
 *
 * ملاحظة: بقية الواجهة تستخدم نفس الاتجاه — أي `focus:ring-1` / `focus:ring-2` في المشروع
 * يُفضّل أن يكون مع `focus:ring-inset` (و`focus:ring-offset-0` عند الحاجة) لتوحيد السلوك.
 */

/** غلاف شريط فلاتر مع تمرير أفقي — يُفضّل وضعه حول صف الحقول */
export const filterBarOverflowClass = 'w-full min-w-0 overflow-x-auto px-2 py-2.5 -mx-0.5'

export const filterRowInnerClass = 'flex flex-nowrap items-center gap-2 w-full min-w-0'

/** صف فلاتر بمحاذاة عمودية stretch (تقرير الجرد) */
export const filterRowInnerStretchClass = 'flex flex-nowrap items-stretch gap-2 w-full min-w-0'

/** خلية فلتر مرنة (تقرير الجرد وغيره) */
export const filterCellGrowClass = 'min-w-0 flex-1 basis-0 shrink overflow-visible flex items-center'

/** خلية فلتر بعرض أساسي (جرد الأرقام التسلسلية) */
export const filterCellBasisClass = 'min-w-0 flex-1 basis-[10rem] shrink overflow-visible'

/** قائمة منسدلة بارتفاع موحّد (h-10) */
export const filterSelectClass =
  'w-full min-w-0 h-10 box-border border border-slate-300 rounded-lg px-2 py-0 text-sm leading-none bg-white text-slate-900 outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'

/** قوائم شريط أدوات تقرير (ارتفاع محتوى + py-2) */
export const filterReportToolbarSelectClass =
  'border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0'

/** مطابق لارتفاع شريط القيود اليومية (h-8) */
export const filterSelectCompactClass =
  'h-8 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 leading-tight shadow-sm outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'

export const filterTextInputClass =
  `${filterSelectCompactClass} placeholder:text-slate-500 placeholder:font-normal`

/** قائمة «عدد السجلات» المدمجة مع القيود اليومية */
export const filterPageSizeSelectClass = `${filterSelectCompactClass} text-center font-semibold tabular-nums`

/** حقل الإدخال داخل SearchableSelect في شريط فلاتر بارتفاع h-10 */
export const filterSearchableInputTallClass =
  'h-10 rounded-lg border border-slate-300 py-0 leading-none text-sm transition-shadow focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0'

/** حقل بحث/نص في شريط فلاتر (h-9) — مثلاً حركات المخزون */
export const filterSearchInputNineClass =
  'h-9 w-full rounded-lg border border-slate-300 bg-white text-sm text-slate-900 outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0'

/** قائمة منسدلة h-9 (وضع فاتح) — حركات المخزون */
export const filterSelectNineLightClass =
  'h-9 min-w-0 border border-slate-300 rounded-lg px-3 text-sm bg-white text-slate-900 outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0'

/** اختيارات تقارير تحليلية (h-9، دعم الوضع الداكن) */
export const filterReportSelectNineClass =
  'w-full h-9 min-w-0 box-border border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-0 text-sm leading-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0'

/** قائمة الفترة في الشريط العلوي للتقارير (h-8) */
export const filterPeriodBarSelectClass =
  'border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 h-8 text-sm min-w-[140px] max-w-[200px] box-border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shrink-0 leading-normal outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0'

/** حقول تاريخ من/إلى في شريط الفترة (h-8) */
export const filterPeriodBarDateInputClass =
  'border border-slate-300 dark:border-slate-600 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 leading-normal shrink-0 outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0'

/** قائمة فترة مصغّرة (rounded-md) — أرصدة العملاء/الموردين */
export const filterBalancePeriodSelectClass =
  'h-8 border border-slate-300 dark:border-slate-600 rounded-md px-2.5 text-xs min-w-[140px] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none transition-shadow shrink-0 focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0'

/** تاريخ بعرض ثابت في شريط أرصدة العملاء/الموردين */
export const filterBalanceCompactDateInputClass =
  'h-8 border border-slate-300 dark:border-slate-600 rounded-md px-2 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-[128px] outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0'

/** حقل بحث في بطاقة أرصدة العملاء/الموردين */
export const filterBalanceSearchInputClass =
  'w-full h-9 box-border border border-slate-300 dark:border-slate-600 rounded-lg py-0 text-sm leading-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0 ltr:pl-9 ltr:pr-3 rtl:pr-9 rtl:pl-3'
