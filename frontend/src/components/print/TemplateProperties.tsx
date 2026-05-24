import { useMemo } from 'react'
import type { PrintDocumentType, PrintMargins, PrintOrientation, PrintPaperSize } from '../../types/printTemplate'
import { VARIABLES_BY_DOC_TYPE } from '../../utils/printUtils'

const PAPER_OPTIONS: { value: PrintPaperSize; ar: string; en: string }[] = [
  { value: 'A4', ar: 'A4', en: 'A4' },
  { value: 'A5', ar: 'A5', en: 'A5' },
  { value: 'thermal_80', ar: 'حراري 80mm', en: 'Thermal 80mm' },
  { value: 'thermal_58', ar: 'حراري 58mm', en: 'Thermal 58mm' },
]

const SECTION_KEYS: { key: string; ar: string; en: string }[] = [
  { key: 'header', ar: 'الترويسة', en: 'Header' },
  { key: 'company', ar: 'بيانات الشركة', en: 'Company' },
  { key: 'customer', ar: 'العميل', en: 'Customer' },
  { key: 'recipient', ar: 'المستفيد', en: 'Recipient' },
  { key: 'items', ar: 'الأسطر / الجدول', en: 'Items' },
  { key: 'totals', ar: 'الإجماليات', en: 'Totals' },
  { key: 'notes', ar: 'ملاحظات', en: 'Notes' },
  { key: 'signature', ar: 'التوقيع', en: 'Signature' },
  { key: 'footer', ar: 'التذييل', en: 'Footer' },
]

type Props = {
  documentType: PrintDocumentType
  name: string
  onNameChange: (v: string) => void
  paperSize: PrintPaperSize
  onPaperSizeChange: (v: PrintPaperSize) => void
  orientation: PrintOrientation
  onOrientationChange: (v: PrintOrientation) => void
  margins: PrintMargins
  onMarginsChange: (m: PrintMargins) => void
  sections: Record<string, boolean>
  onSectionsChange: (s: Record<string, boolean>) => void
  settings: Record<string, unknown>
  onSettingsChange: (s: Record<string, unknown>) => void
  htmlContent: string
  onHtmlChange: (v: string) => void
  onInsertVariable: (code: string) => void
  isRtl: boolean
  lang: 'ar' | 'en'
  readOnlyMeta?: boolean
  /** إخفاء حقل الاسم عندما يُعرض الاسم في شريط علوي (مثل التصميم المرئي) */
  hideNameField?: boolean
}

export default function TemplateProperties({
  documentType,
  name,
  onNameChange,
  paperSize,
  onPaperSizeChange,
  orientation,
  onOrientationChange,
  margins,
  onMarginsChange,
  sections,
  onSectionsChange,
  settings,
  onSettingsChange,
  htmlContent,
  onHtmlChange,
  onInsertVariable,
  isRtl,
  lang,
  readOnlyMeta,
  hideNameField = false,
}: Props) {
  const L = lang === 'ar'
  const groups = useMemo(() => VARIABLES_BY_DOC_TYPE[documentType] ?? VARIABLES_BY_DOC_TYPE.invoice ?? [], [documentType])

  const fontFamily = typeof settings.font_family === 'string' ? settings.font_family : 'Segoe UI'
  const fontSize = typeof settings.font_size === 'number' ? settings.font_size : 10
  const accent = typeof settings.accent_color === 'string' ? settings.accent_color : '#6366f1'

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto border-s border-slate-200 bg-white w-full max-w-[320px] shrink-0 p-3 space-y-4 text-sm" dir={isRtl ? 'rtl' : 'ltr'}>
      {!hideNameField && (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{L ? 'اسم القالب' : 'Template name'}</label>
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            disabled={readOnlyMeta}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-100"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">{L ? 'حجم الورق' : 'Paper size'}</label>
          <select
            value={paperSize}
            onChange={(e) => onPaperSizeChange(e.target.value as PrintPaperSize)}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
          >
            {PAPER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {L ? o.ar : o.en}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{L ? 'الاتجاه' : 'Orientation'}</label>
          <select
            value={orientation}
            onChange={(e) => onOrientationChange(e.target.value as PrintOrientation)}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
          >
            <option value="portrait">{L ? 'عمودي' : 'Portrait'}</option>
            <option value="landscape">{L ? 'أفقي' : 'Landscape'}</option>
          </select>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-600 mb-2">{L ? 'الهوامش (مم)' : 'Margins (mm)'}</div>
        <div className="grid grid-cols-2 gap-2">
          {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
            <label key={k} className="text-[11px] text-slate-500 flex flex-col gap-0.5">
              {L ? ({ top: 'أعلى', right: 'يمين', bottom: 'أسفل', left: 'يسار' } as const)[k] : k}
              <input
                type="number"
                className="border border-slate-300 rounded px-1 py-1 text-xs"
                value={margins[k]}
                onChange={(e) => onMarginsChange({ ...margins, [k]: Number(e.target.value) || 0 })}
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-600 mb-2">{L ? 'المظهر' : 'Appearance'}</div>
        <label className="block text-[11px] text-slate-500 mb-1">Font</label>
        <input
          className="w-full border border-slate-300 rounded-lg px-2 py-1 text-xs mb-2"
          value={fontFamily}
          onChange={(e) => onSettingsChange({ ...settings, font_family: e.target.value })}
        />
        <label className="block text-[11px] text-slate-500 mb-1">{L ? 'حجم الخط' : 'Font size'}</label>
        <input
          type="number"
          className="w-full border border-slate-300 rounded-lg px-2 py-1 text-xs mb-2"
          value={fontSize}
          onChange={(e) => onSettingsChange({ ...settings, font_size: Number(e.target.value) || 10 })}
        />
        <label className="block text-[11px] text-slate-500 mb-1">{L ? 'لون تمييز' : 'Accent'}</label>
        <input
          type="color"
          className="h-8 w-full border border-slate-200 rounded cursor-pointer"
          value={accent}
          onChange={(e) => onSettingsChange({ ...settings, accent_color: e.target.value })}
        />
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-600 mb-2">{L ? 'أقسام المستند' : 'Sections'}</div>
        <div className="space-y-1.5">
          {SECTION_KEYS.map(({ key, ar, en }) => (
            <label key={key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={!!sections[key]}
                onChange={() => onSectionsChange({ ...sections, [key]: !sections[key] })}
              />
              {L ? ar : en}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-600 mb-2">{L ? 'متغيرات جاهزة' : 'Variables'}</div>
        <div className="space-y-2 max-h-40 overflow-y-auto text-[11px]">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="font-medium text-slate-500 mb-1">{g.title}</div>
              <div className="flex flex-wrap gap-1">
                {g.items.map((it) => (
                  <button
                    key={it.code}
                    type="button"
                    className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-primary-50 text-slate-700 border border-slate-200"
                    onClick={() => onInsertVariable(it.code)}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-[120px] flex flex-col">
        <label className="text-xs font-semibold text-slate-600 mb-1">HTML</label>
        <textarea
          value={htmlContent}
          onChange={(e) => onHtmlChange(e.target.value)}
          className="flex-1 w-full min-h-[140px] border border-slate-300 rounded-lg p-2 text-xs font-mono"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
