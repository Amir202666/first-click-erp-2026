import type { CanvasElement, CanvasElementLayout } from '../../../utils/printDesignerTypes'
import { getElementStyle, patchElementStyle, type CanvasElementStyle } from '../../../utils/printElementStyle'

const FONT_OPTIONS = ['Segoe UI', 'Cairo', 'Tajawal', 'Arial', 'Tahoma']

const TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  variable: { ar: 'متغير', en: 'Variable' },
  text: { ar: 'نص', en: 'Text' },
  table: { ar: 'جدول', en: 'Table' },
  totals_table: { ar: 'جدول إجماليات', en: 'Totals table' },
  image: { ar: 'صورة', en: 'Image' },
  divider: { ar: 'فاصل', en: 'Divider' },
  spacer: { ar: 'مسافة', en: 'Spacer' },
  box: { ar: 'مستطيل', en: 'Box' },
  qr: { ar: 'QR', en: 'QR' },
  barcode: { ar: 'باركود', en: 'Barcode' },
  html_embed: { ar: 'HTML', en: 'HTML' },
}

type Props = {
  isRtl: boolean
  langAr: boolean
  element: CanvasElement
  contentMaxW: number
  contentMaxH: number
  onChange: (el: CanvasElement) => void
  onDelete: () => void
  onDeselect: () => void
  onNudge: (dx: number, dy: number) => void
}

export default function PrintDesignerElementPanel({
  isRtl,
  langAr: L,
  element: el,
  contentMaxW,
  contentMaxH,
  onChange,
  onDelete,
  onDeselect,
  onNudge,
}: Props) {
  const style = getElementStyle(el)
  const layout = el.layout ?? { xMm: 0, yMm: 0, wMm: 40, hMm: 10 }

  const patch = (p: Partial<CanvasElement>) => onChange({ ...el, ...p } as CanvasElement)
  const patchStyle = (p: Partial<CanvasElementStyle>) => onChange(patchElementStyle(el, p))
  const patchLayout = (p: Partial<CanvasElementLayout>) => patch({ layout: { ...layout, ...p } })

  const typeLabel = TYPE_LABELS[el.type] ?? { ar: el.type, en: el.type }

  return (
    <aside className="w-56 lg:w-60 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0 min-h-0" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="p-4 border-b border-teal-100 bg-teal-50/80">
        <p className="text-[10px] text-teal-700 font-semibold uppercase tracking-wide mb-1">
          {L ? 'أدوات العنصر' : 'Element tools'}
        </p>
        <p className="text-sm font-bold text-gray-900">{L ? typeLabel.ar : typeLabel.en}</p>
        {'label' in el && (
          <input
            value={el.label ?? ''}
            onChange={(e) => patch({ label: e.target.value } as Partial<CanvasElement>)}
            className="mt-2 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5"
            placeholder={L ? 'اسم العنصر' : 'Element name'}
          />
        )}
      </div>

      <div className="p-4 space-y-4">
        <section>
          <h4 className="text-xs font-bold text-gray-500 mb-2">{L ? 'الموضع والحجم (مم)' : 'Position & size (mm)'}</h4>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['xMm', 'X', contentMaxW],
                ['yMm', 'Y', contentMaxH],
                ['wMm', L ? 'العرض' : 'Width', contentMaxW],
                ['hMm', L ? 'الارتفاع' : 'Height', contentMaxH],
              ] as const
            ).map(([key, lab, max]) => (
              <div key={key}>
                <label className="text-[10px] text-gray-400">{lab}</label>
                <input
                  type="number"
                  min={0}
                  max={max}
                  step={0.5}
                  value={Math.round(layout[key] * 10) / 10}
                  onChange={(e) => patchLayout({ [key]: Number(e.target.value) || 0 })}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 mt-0.5"
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-2 mb-1">{L ? 'تحريك دقيق' : 'Nudge'}</p>
          <div className="grid grid-cols-3 gap-1 w-24 mx-auto">
            <span />
            <button type="button" onClick={() => onNudge(0, -1)} className="py-1 text-xs border rounded hover:bg-gray-50">
              ↑
            </button>
            <span />
            <button type="button" onClick={() => onNudge(-1, 0)} className="py-1 text-xs border rounded hover:bg-gray-50">
              {isRtl ? '→' : '←'}
            </button>
            <button type="button" onClick={() => onNudge(0, 1)} className="py-1 text-xs border rounded hover:bg-gray-50">
              ↓
            </button>
            <button type="button" onClick={() => onNudge(1, 0)} className="py-1 text-xs border rounded hover:bg-gray-50">
              {isRtl ? '←' : '→'}
            </button>
          </div>
        </section>

        <section className="border-t border-gray-100 pt-3">
          <h4 className="text-xs font-bold text-gray-500 mb-2">{L ? 'الظهور' : 'Visibility'}</h4>
          <label className="flex items-center justify-between text-xs text-gray-600 mb-2 cursor-pointer">
            <span>{L ? 'ظاهر على الصفحة' : 'Visible'}</span>
            <input
              type="checkbox"
              checked={el.visible !== false}
              onChange={(e) => patch({ visible: e.target.checked })}
              className="rounded accent-teal-600"
            />
          </label>
          <label className="flex items-center justify-between text-xs text-gray-600 cursor-pointer">
            <span>{L ? 'قفل (منع السحب)' : 'Lock position'}</span>
            <input
              type="checkbox"
              checked={!!el.locked}
              onChange={(e) => patch({ locked: e.target.checked })}
              className="rounded accent-teal-600"
            />
          </label>
        </section>

        {(el.type === 'text' || el.type === 'variable') && (
          <section className="border-t border-gray-100 pt-3">
            <h4 className="text-xs font-bold text-gray-500 mb-2">{L ? 'الخط والمحاذاة' : 'Font & alignment'}</h4>
            {el.type === 'text' && (
              <div className="mb-2">
                <label className="text-[10px] text-gray-400 block mb-1">{L ? 'النص' : 'Text'}</label>
                <textarea
                  value={el.text}
                  onChange={(e) => patch({ text: e.target.value } as Partial<CanvasElement>)}
                  rows={3}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-y"
                />
              </div>
            )}
            {el.type === 'variable' && (
              <div className="mb-2">
                <label className="text-[10px] text-gray-400 block mb-1">{L ? 'المتغير' : 'Variable'}</label>
                <input
                  value={el.var}
                  onChange={(e) => patch({ var: e.target.value } as Partial<CanvasElement>)}
                  className="w-full text-xs font-mono border border-gray-200 rounded-lg px-2 py-1.5"
                  dir="ltr"
                />
              </div>
            )}
            <div className="mb-2">
              <label className="text-[10px] text-gray-400 block mb-1">{L ? 'نوع الخط' : 'Font'}</label>
              <select
                value={style.fontFamily ?? ''}
                onChange={(e) => patchStyle({ fontFamily: e.target.value || undefined })}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5"
              >
                <option value="">{L ? 'افتراضي الصفحة' : 'Page default'}</option>
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">{L ? 'الحجم (pt)' : 'Size (pt)'}</label>
                <input
                  type="number"
                  min={6}
                  max={48}
                  value={style.fontSize ?? 10}
                  onChange={(e) => patchStyle({ fontSize: Number(e.target.value) || 10 })}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">{L ? 'اللون' : 'Color'}</label>
                <input
                  type="color"
                  value={style.color?.startsWith('#') ? style.color : '#0f172a'}
                  onChange={(e) => patchStyle({ color: e.target.value })}
                  className="w-full h-8 rounded border border-gray-200 cursor-pointer"
                />
              </div>
            </div>
            <div className="flex gap-1 mb-2">
              {(
                [
                  ['B', 'fontWeight', 'bold', 'normal'],
                  ['I', 'fontStyle', 'italic', 'normal'],
                  ['U', 'textDecoration', 'underline', 'none'],
                ] as const
              ).map(([icon, key, onVal, offVal]) => {
                const active = style[key] === onVal
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => patchStyle({ [key]: active ? offVal : onVal } as Partial<CanvasElementStyle>)}
                    className={`flex-1 py-1.5 rounded border text-xs font-bold ${
                      active ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {icon}
                  </button>
                )
              })}
            </div>
            <div className="mb-2">
              <label className="text-[10px] text-gray-400 block mb-1">{L ? 'المحاذاة' : 'Align'}</label>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    ['right', L ? 'يمين' : 'Right'],
                    ['center', L ? 'وسط' : 'Center'],
                    ['left', L ? 'يسار' : 'Left'],
                  ] as const
                ).map(([val, lab]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => patchStyle({ textAlign: val })}
                    className={`py-1 text-[10px] rounded border ${
                      style.textAlign === val ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200'
                    }`}
                  >
                    {lab}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-2">
              <label className="text-[10px] text-gray-400 block mb-1">{L ? 'اتجاه النص' : 'Direction'}</label>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => patchStyle({ direction: 'rtl' })}
                  className={`py-1 text-[10px] rounded border ${
                    style.direction === 'rtl' ? 'bg-teal-600 text-white' : 'border-gray-200'
                  }`}
                >
                  RTL
                </button>
                <button
                  type="button"
                  onClick={() => patchStyle({ direction: 'ltr' })}
                  className={`py-1 text-[10px] rounded border ${
                    style.direction === 'ltr' ? 'bg-teal-600 text-white' : 'border-gray-200'
                  }`}
                >
                  LTR
                </button>
              </div>
            </div>
          </section>
        )}

        {el.type === 'image' && (
          <section className="border-t border-gray-100 pt-3">
            <h4 className="text-xs font-bold text-gray-500 mb-2">{L ? 'الصورة' : 'Image'}</h4>
            <label className="text-[10px] text-gray-400 block mb-1">URL</label>
            <input
              value={el.src}
              onChange={(e) => patch({ src: e.target.value } as Partial<CanvasElement>)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 font-mono"
              dir="ltr"
            />
          </section>
        )}

        {el.type === 'spacer' && (
          <section className="border-t border-gray-100 pt-3">
            <label className="text-[10px] text-gray-400 block mb-1">{L ? 'ارتفاع المسافة (مم)' : 'Spacer height (mm)'}</label>
            <input
              type="number"
              min={1}
              max={80}
              value={el.heightMm}
              onChange={(e) => patch({ heightMm: Number(e.target.value) || 4 } as Partial<CanvasElement>)}
              className="w-full text-xs border border-gray-200 rounded px-2 py-1"
            />
          </section>
        )}

        {el.type === 'table' && (
          <section className="border-t border-gray-100 pt-3">
            <label className="text-[10px] text-gray-400 block mb-1">{L ? 'عنوان الجدول' : 'Table title'}</label>
            <input
              value={el.label}
              onChange={(e) => patch({ label: e.target.value } as Partial<CanvasElement>)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 mb-2"
            />
            <label className="text-[10px] text-gray-400 block mb-1">{L ? 'لون رأس الجدول' : 'Header color'}</label>
            <input
              type="color"
              value={style.backgroundColor?.startsWith('#') ? style.backgroundColor : '#4f46e5'}
              onChange={(e) => patchStyle({ backgroundColor: e.target.value })}
              className="w-full h-8 rounded border border-gray-200 cursor-pointer"
            />
          </section>
        )}

        <button
          type="button"
          onClick={onDelete}
          className="w-full py-2 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50"
        >
          🗑 {L ? 'حذف العنصر' : 'Delete element'}
        </button>

        <button
          type="button"
          onClick={onDeselect}
          className="w-full py-2 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-gray-50"
        >
          {L ? '← خصائص الصفحة' : '← Page properties'}
        </button>
      </div>
    </aside>
  )
}
