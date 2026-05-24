import type { CanvasElement } from '../../../utils/printDesignerTypes'
import { getElementStyle, isTextLikeElement, type CanvasElementStyle } from '../../../utils/printElementStyle'

const FONT_OPTIONS = ['Segoe UI', 'Cairo', 'Tajawal', 'Arial', 'Tahoma']

function mixed<T>(vals: T[]): T | 'mixed' {
  if (!vals.length) return 'mixed' as const
  const first = vals[0]
  return vals.every((v) => v === first) ? first : ('mixed' as const)
}

type Props = {
  isRtl: boolean
  langAr: boolean
  elements: CanvasElement[]
  onPatchSelected: (patch: Partial<CanvasElement>) => void
  onPatchSelectedStyle: (patch: Partial<CanvasElementStyle>) => void
  onDelete: () => void
  onDeselect: () => void
  onNudge: (dx: number, dy: number) => void
}

export default function PrintDesignerMultiElementPanel({
  isRtl,
  langAr: L,
  elements,
  onPatchSelected,
  onPatchSelectedStyle,
  onDelete,
  onDeselect,
  onNudge,
}: Props) {
  const textEls = elements.filter(isTextLikeElement)
  const styles = textEls.map(getElementStyle)
  const allVisible = elements.every((e) => e.visible !== false)
  const allLocked = elements.every((e) => e.locked)
  const someVisible = elements.some((e) => e.visible !== false)
  const someLocked = elements.some((e) => e.locked)

  const fontFamily = mixed(styles.map((s) => s.fontFamily ?? ''))
  const fontSize = mixed(styles.map((s) => s.fontSize ?? 10))
  const color = mixed(styles.map((s) => s.color ?? '#0f172a'))
  const fontWeight = mixed(styles.map((s) => s.fontWeight ?? 'normal'))
  const fontStyle = mixed(styles.map((s) => s.fontStyle ?? 'normal'))
  const textDecoration = mixed(styles.map((s) => s.textDecoration ?? 'none'))
  const textAlign = mixed(styles.map((s) => s.textAlign ?? 'right'))
  const direction = mixed(styles.map((s) => s.direction ?? 'rtl'))

  return (
    <aside className="w-56 lg:w-60 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0 min-h-0" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="p-4 border-b border-indigo-100 bg-indigo-50/80">
        <p className="text-[10px] text-indigo-700 font-semibold uppercase tracking-wide mb-1">
          {L ? 'تحديد متعدد' : 'Multi-select'}
        </p>
        <p className="text-sm font-bold text-gray-900">
          {L ? `${elements.length} عناصر محددة` : `${elements.length} elements selected`}
        </p>
        <p className="text-[10px] text-gray-500 mt-1">
          {L ? 'التعديلات تُطبَّق على الكل' : 'Changes apply to all selected'}
        </p>
      </div>

      <div className="p-4 space-y-4">
        <section>
          <p className="text-[10px] text-gray-400 mb-1">{L ? 'تحريك دقيق للكل' : 'Nudge all'}</p>
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
              checked={allVisible}
              ref={(el) => {
                if (el) el.indeterminate = !allVisible && someVisible
              }}
              onChange={(e) => onPatchSelected({ visible: e.target.checked })}
              className="rounded accent-teal-600"
            />
          </label>
          <label className="flex items-center justify-between text-xs text-gray-600 cursor-pointer">
            <span>{L ? 'قفل (منع السحب)' : 'Lock position'}</span>
            <input
              type="checkbox"
              checked={allLocked}
              ref={(el) => {
                if (el) el.indeterminate = !allLocked && someLocked
              }}
              onChange={(e) => onPatchSelected({ locked: e.target.checked })}
              className="rounded accent-teal-600"
            />
          </label>
        </section>

        {textEls.length > 0 && (
          <section className="border-t border-gray-100 pt-3">
            <h4 className="text-xs font-bold text-gray-500 mb-2">
              {L ? `الخط والمحاذاة (${textEls.length})` : `Font & alignment (${textEls.length})`}
            </h4>
            <div className="mb-2">
              <label className="text-[10px] text-gray-400 block mb-1">{L ? 'نوع الخط' : 'Font'}</label>
              <select
                value={fontFamily === 'mixed' ? '' : fontFamily}
                onChange={(e) => onPatchSelectedStyle({ fontFamily: e.target.value || undefined })}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5"
              >
                <option value="">{fontFamily === 'mixed' ? (L ? '— مختلط —' : '— Mixed —') : L ? 'افتراضي الصفحة' : 'Page default'}</option>
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
                  placeholder={fontSize === 'mixed' ? '—' : undefined}
                  value={fontSize === 'mixed' ? '' : fontSize}
                  onChange={(e) => onPatchSelectedStyle({ fontSize: Number(e.target.value) || 10 })}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">{L ? 'اللون' : 'Color'}</label>
                <input
                  type="color"
                  value={color === 'mixed' ? '#0f172a' : color.startsWith('#') ? color : '#0f172a'}
                  onChange={(e) => onPatchSelectedStyle({ color: e.target.value })}
                  className="w-full h-8 rounded border border-gray-200 cursor-pointer"
                />
              </div>
            </div>
            <div className="flex gap-1 mb-2">
              {(
                [
                  ['B', 'fontWeight', 'bold', 'normal', fontWeight],
                  ['I', 'fontStyle', 'italic', 'normal', fontStyle],
                  ['U', 'textDecoration', 'underline', 'none', textDecoration],
                ] as const
              ).map(([icon, key, onVal, offVal, current]) => {
                const active = current === onVal
                const mixed = current === 'mixed'
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      onPatchSelectedStyle({ [key]: active || mixed ? offVal : onVal } as Partial<CanvasElementStyle>)
                    }
                    className={`flex-1 py-1.5 rounded border text-xs font-bold ${
                      active ? 'bg-gray-800 text-white border-gray-800' : mixed ? 'bg-gray-100 border-gray-300 text-gray-500' : 'border-gray-200 text-gray-600'
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
                    onClick={() => onPatchSelectedStyle({ textAlign: val })}
                    className={`py-1 text-[10px] rounded border ${
                      textAlign === val ? 'bg-teal-600 text-white border-teal-600' : textAlign === 'mixed' ? 'border-dashed border-gray-300' : 'border-gray-200'
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
                  onClick={() => onPatchSelectedStyle({ direction: 'rtl' })}
                  className={`py-1 text-[10px] rounded border ${
                    direction === 'rtl' ? 'bg-teal-600 text-white' : direction === 'mixed' ? 'border-dashed border-gray-300' : 'border-gray-200'
                  }`}
                >
                  RTL
                </button>
                <button
                  type="button"
                  onClick={() => onPatchSelectedStyle({ direction: 'ltr' })}
                  className={`py-1 text-[10px] rounded border ${
                    direction === 'ltr' ? 'bg-teal-600 text-white' : direction === 'mixed' ? 'border-dashed border-gray-300' : 'border-gray-200'
                  }`}
                >
                  LTR
                </button>
              </div>
            </div>
          </section>
        )}

        <button
          type="button"
          onClick={onDelete}
          className="w-full py-2 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50"
        >
          🗑 {L ? `حذف ${elements.length} عناصر` : `Delete ${elements.length} elements`}
        </button>

        <button
          type="button"
          onClick={onDeselect}
          className="w-full py-2 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-gray-50"
        >
          {L ? '← إلغاء التحديد' : '← Clear selection'}
        </button>
      </div>
    </aside>
  )
}
