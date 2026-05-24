import type { PrintDocumentType, PrintMargins, PrintOrientation, PrintPaperSize } from '../../../types/printTemplate'
import { DOC_TYPE_LABELS } from '../../../utils/printUtils'

const PAPER_OPTIONS: { value: PrintPaperSize; ar: string; en: string }[] = [
  { value: 'A4', ar: 'A4 (297 × 210 مم)', en: 'A4 (297 × 210 mm)' },
  { value: 'A5', ar: 'A5 (210 × 148 مم)', en: 'A5 (210 × 148 mm)' },
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

const FONT_OPTIONS = ['Segoe UI', 'Cairo', 'Tajawal', 'Arial']

const ACCENT_PRESETS = ['#4f46e5', '#059669', '#dc2626', '#7c3aed', '#d97706', '#0891b2', '#374151']

type Props = {
  isRtl: boolean
  langAr: boolean
  documentType: PrintDocumentType
  readOnlyMeta?: boolean
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
  showGrid: boolean
  onShowGridChange: (v: boolean) => void
  showRuler?: boolean
  onShowRulerChange?: (v: boolean) => void
}

export default function PrintDesignerLeftPanel({
  isRtl,
  langAr,
  documentType,
  readOnlyMeta,
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
  showGrid,
  onShowGridChange,
  showRuler = false,
  onShowRulerChange,
}: Props) {
  const L = langAr
  const fontFamily = typeof settings.font_family === 'string' ? settings.font_family : 'Segoe UI'
  const fontSize = typeof settings.font_size === 'number' ? settings.font_size : 10
  const textColor = typeof settings.text_color === 'string' ? settings.text_color : '#0f172a'
  const accent = typeof settings.accent_color === 'string' ? settings.accent_color : '#059669'
  const formatBold = !!settings.format_bold
  const formatItalic = !!settings.format_italic
  const formatUnderline = !!settings.format_underline

  const toggleFormat = (key: 'bold' | 'italic' | 'underline') => {
    const map = { bold: 'format_bold', italic: 'format_italic', underline: 'format_underline' } as const
    onSettingsChange({ ...settings, [map[key]]: !settings[map[key]] })
  }

  return (
    <div
      className="w-56 lg:w-60 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0 p-4 min-h-0"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">
        {L ? 'الخصائص' : 'Properties'}
      </h3>

      <div className="mb-4">
        <label className="text-xs text-gray-500 mb-1 block">{L ? 'نوع المستند' : 'Document type'}</label>
        <p className="text-xs text-gray-700 font-medium py-1">
          {L ? DOC_TYPE_LABELS[documentType]?.ar : DOC_TYPE_LABELS[documentType]?.en}
        </p>
      </div>

      <div className="mb-4">
        <label className="text-xs text-gray-500 mb-1 block">{L ? 'مقياس الصفحة' : 'Paper size'}</label>
        <select
          value={paperSize}
          onChange={(e) => onPaperSizeChange(e.target.value as PrintPaperSize)}
          disabled={readOnlyMeta}
          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 bg-white disabled:opacity-60"
        >
          {PAPER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {L ? o.ar : o.en}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="text-xs text-gray-500 mb-1 block">{L ? 'الاتجاه' : 'Orientation'}</label>
        <select
          value={orientation}
          onChange={(e) => onOrientationChange(e.target.value as PrintOrientation)}
          disabled={readOnlyMeta}
          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 bg-white disabled:opacity-60"
        >
          <option value="portrait">{L ? 'عمودي' : 'Portrait'}</option>
          <option value="landscape">{L ? 'أفقي' : 'Landscape'}</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="text-xs text-gray-500 mb-2 block">{L ? 'الهوامش (مم)' : 'Margins (mm)'}</label>
        <div className="grid grid-cols-2 gap-2">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <div key={side}>
              <label className="text-[10px] text-gray-400">
                {L
                  ? ({ top: 'أعلى', right: 'يمين', bottom: 'أسفل', left: 'يسار' } as const)[side]
                  : side.charAt(0).toUpperCase() + side.slice(1)}
              </label>
              <input
                type="number"
                min={0}
                max={50}
                value={margins[side]}
                onChange={(e) => onMarginsChange({ ...margins, [side]: Number(e.target.value) || 0 })}
                disabled={readOnlyMeta}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 mt-0.5 disabled:opacity-60"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 my-3" />

      <h3 className="text-xs font-bold text-gray-500 mb-3">{L ? 'منطقة التصميم' : 'Design area'}</h3>
      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer mb-2">
        <input
          type="checkbox"
          checked={showGrid}
          onChange={(e) => onShowGridChange(e.target.checked)}
          className="rounded border-gray-300"
        />
        {L ? 'إظهار خطوط الشبكة الإرشادية' : 'Show guide grid'}
      </label>
      {onShowRulerChange && (
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={showRuler}
            onChange={(e) => onShowRulerChange(e.target.checked)}
            className="rounded border-gray-300"
          />
          {L ? 'إظهار المسطرة' : 'Show ruler'}
        </label>
      )}

      <div className="border-t border-gray-100 my-3" />

      <h3 className="text-xs font-bold text-gray-500 mb-3">{L ? 'الخط الافتراضي' : 'Default font'}</h3>
      <div className="mb-3">
        <label className="text-xs text-gray-400 mb-1 block">{L ? 'نوع الخط' : 'Font family'}</label>
        <select
          value={fontFamily}
          onChange={(e) => onSettingsChange({ ...settings, font_family: e.target.value })}
          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 bg-white"
        >
          {!FONT_OPTIONS.includes(fontFamily) && (
            <option value={fontFamily}>
              {fontFamily}
            </option>
          )}
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">{L ? 'الحجم (pt)' : 'Size (pt)'}</label>
          <input
            type="number"
            min={6}
            max={24}
            value={fontSize}
            onChange={(e) => onSettingsChange({ ...settings, font_size: Number(e.target.value) || 10 })}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">{L ? 'لون النص' : 'Text color'}</label>
          <input
            type="color"
            value={textColor.startsWith('#') ? textColor : '#0f172a'}
            onChange={(e) => onSettingsChange({ ...settings, text_color: e.target.value })}
            className="w-full h-8 rounded border border-gray-200 cursor-pointer"
          />
        </div>
      </div>

      <div className="flex gap-1 mb-4">
        {(
          [
            ['B', 'bold', 'font-bold'],
            ['I', 'italic', 'italic'],
            ['U', 'underline', 'underline'],
          ] as const
        ).map(([icon, key, cls]) => {
          const on =
            key === 'bold' ? formatBold : key === 'italic' ? formatItalic : formatUnderline
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleFormat(key)}
              className={`flex-1 py-1.5 rounded border text-xs ${cls} ${
                on ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {icon}
            </button>
          )
        })}
      </div>

      <div className="border-t border-gray-100 my-3" />

      <div className="mb-4">
        <label className="text-xs text-gray-400 mb-1 block">{L ? 'لون التمييز' : 'Accent color'}</label>
        <div className="flex gap-1 flex-wrap mb-2">
          {ACCENT_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onSettingsChange({ ...settings, accent_color: c })}
              className={`w-6 h-6 rounded-full border-2 shrink-0 ${
                accent === c ? 'border-gray-800 scale-110' : 'border-transparent'
              }`}
              style={{ background: c }}
            />
          ))}
        </div>
        <input
          type="color"
          value={accent.startsWith('#') ? accent : '#059669'}
          onChange={(e) => onSettingsChange({ ...settings, accent_color: e.target.value })}
          className="w-full h-8 rounded border border-gray-200 cursor-pointer"
        />
      </div>

      <div className="border-t border-gray-100 my-3" />

      <h3 className="text-xs font-bold text-gray-500 mb-2">{L ? 'أقسام المستند' : 'Sections'}</h3>
      <div className="space-y-1.5 mb-2">
        {SECTION_KEYS.map(({ key, ar, en }) => (
          <label key={key} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={!!sections[key]}
              onChange={() => onSectionsChange({ ...sections, [key]: !sections[key] })}
              disabled={readOnlyMeta}
            />
            {L ? ar : en}
          </label>
        ))}
      </div>
    </div>
  )
}
