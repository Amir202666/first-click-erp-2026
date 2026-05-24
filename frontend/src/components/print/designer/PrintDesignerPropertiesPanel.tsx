import type { ReactNode } from 'react'
import type { CanvasElement, CanvasElementLayout, CanvasElementStyle } from '../../../utils/printDesignerTypes'
import { getElementStyle } from '../../../utils/printElementStyle'
import { mmToPx, pxToMm } from '../../../utils/printDesignerUnits'
import { stripVariableCode } from '../../../utils/printDesignerVariable'

const TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  variable: { ar: 'متغير', en: 'Variable' },
  text: { ar: 'نص', en: 'Text' },
  table: { ar: 'جدول', en: 'Table' },
  image: { ar: 'صورة', en: 'Image' },
  divider: { ar: 'فاصل', en: 'Divider' },
  spacer: { ar: 'مسافة', en: 'Spacer' },
  box: { ar: 'مستطيل', en: 'Box' },
  qr: { ar: 'QR', en: 'QR' },
  barcode: { ar: 'باركود', en: 'Barcode' },
  html_embed: { ar: 'HTML', en: 'HTML' },
}

function mixed<T>(vals: T[]): T | 'mixed' {
  if (!vals.length) return 'mixed' as const
  const first = vals[0]
  return vals.every((v) => v === first) ? first : ('mixed' as const)
}

function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-800 shrink-0 min-w-[7rem] text-end">{label}</span>
      <div className="flex-1 flex justify-start min-w-0">{children}</div>
    </div>
  )
}

function UnderlineNum({
  value,
  placeholder,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  value: number | ''
  placeholder?: string
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  unit: string
}) {
  return (
    <div className="flex items-center gap-1 justify-end w-full max-w-[140px]">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-16 text-xs text-end border-0 border-b-2 border-gray-300 bg-transparent py-0.5 focus:outline-none focus:border-blue-500 tabular-nums"
      />
      <span className="text-[10px] text-gray-500 shrink-0">{unit}</span>
    </div>
  )
}

function PropSelect<T extends string>({
  value,
  mixed: isMixed,
  options,
  onChange,
}: {
  value: T | 'mixed'
  mixed?: boolean
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <select
      value={isMixed ? '' : value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full max-w-[140px] text-xs border border-gray-200 rounded px-2 py-1 bg-white"
    >
      {isMixed && <option value="">—</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function ColorRow({
  label,
  color,
  transparent,
  transparentLabel,
  onColor,
  onTransparent,
}: {
  label: string
  color: string
  transparent: boolean
  transparentLabel: string
  onColor: (c: string) => void
  onTransparent: (t: boolean) => void
}) {
  return (
    <PropRow label={label}>
      <div className="flex items-center gap-2 justify-end w-full max-w-[140px]">
        <input
          type="color"
          value={color.startsWith('#') ? color : '#ffffff'}
          disabled={transparent}
          onChange={(e) => onColor(e.target.value)}
          className="w-9 h-7 rounded border border-gray-200 cursor-pointer disabled:opacity-40"
        />
        <label className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={transparent} onChange={(e) => onTransparent(e.target.checked)} className="rounded" />
          {transparentLabel}
        </label>
      </div>
    </PropRow>
  )
}

type Props = {
  isRtl: boolean
  langAr: boolean
  elements: CanvasElement[]
  contentMaxW: number
  contentMaxH: number
  onUpdateElement: (el: CanvasElement) => void
  onPatchStyle: (patch: Partial<CanvasElementStyle>) => void
  onPatchElements: (patch: Partial<CanvasElement>) => void
  onPatchLayout: (patch: Partial<CanvasElementLayout>) => void
  onNudge: (dx: number, dy: number) => void
  onDelete: () => void
  onDeselect: () => void
  onOpenTableColumns?: (id: string) => void
  onOpenTotalsRows?: (id: string) => void
}

export default function PrintDesignerPropertiesPanel({
  isRtl,
  langAr: L,
  elements,
  contentMaxW,
  contentMaxH,
  onUpdateElement,
  onPatchStyle,
  onPatchElements,
  onPatchLayout,
  onNudge,
  onDelete,
  onDeselect,
  onOpenTableColumns,
  onOpenTotalsRows,
}: Props) {
  const multi = elements.length > 1
  const el = elements[0]
  const styles = elements.map(getElementStyle)
  const layouts = elements.map((e) => e.layout ?? { xMm: 0, yMm: 0, wMm: 40, hMm: 10 })

  const wPx = mixed(layouts.map((l) => mmToPx(l.wMm)))
  const hPx = mixed(layouts.map((l) => mmToPx(l.hMm)))
  const fontSize = mixed(styles.map((s) => s.fontSize ?? 10))
  const fontWeight = mixed(styles.map((s) => s.fontWeight ?? 'normal'))
  const lineHeightPt = mixed(styles.map((s) => s.lineHeightPt ?? Math.round((s.lineHeight ?? 1.35) * (s.fontSize ?? 10))))
  const textAlign = mixed(styles.map((s) => s.textAlign ?? 'right'))
  const direction = mixed(styles.map((s) => s.direction ?? 'rtl'))
  const alignItems = mixed(styles.map((s) => s.alignItems ?? 'center'))
  const justifyContent = mixed(styles.map((s) => s.justifyContent ?? 'center'))
  const paddingPx = mixed(styles.map((s) => s.paddingPx ?? 0))
  const borderRadiusPx = mixed(styles.map((s) => s.borderRadiusPx ?? 0))
  const borderWidthPx = mixed(styles.map((s) => s.borderWidthPx ?? 0))
  const borderStyle = mixed(styles.map((s) => s.borderStyle ?? 'none'))
  const bgColor = mixed(styles.map((s) => s.backgroundColor ?? '#ffffff'))
  const bgTrans = elements.every((e) => getElementStyle(e).backgroundTransparent)
  const someBgTrans = elements.some((e) => getElementStyle(e).backgroundTransparent)
  const textColor = mixed(styles.map((s) => s.color ?? '#0f172a'))
  const colorTrans = elements.every((e) => getElementStyle(e).colorTransparent)
  const someColorTrans = elements.some((e) => getElementStyle(e).colorTransparent)
  const borderColor = mixed(styles.map((s) => s.borderColor ?? '#e2e8f0'))
  const borderTrans = elements.every((e) => getElementStyle(e).borderTransparent)
  const someBorderTrans = elements.some((e) => getElementStyle(e).borderTransparent)

  const typeLabel = el ? TYPE_LABELS[el.type] : null
  const unit = L ? 'بيكسل' : 'px'

  const alignOpts = [
    { value: 'right' as const, label: L ? 'يمين' : 'Right' },
    { value: 'center' as const, label: L ? 'وسط' : 'Center' },
    { value: 'left' as const, label: L ? 'يسار' : 'Left' },
  ]
  const dirOpts = [
    { value: 'rtl' as const, label: L ? 'يمين' : 'RTL' },
    { value: 'ltr' as const, label: L ? 'يسار' : 'LTR' },
  ]
  const flexOpts = [
    { value: 'flex-start' as const, label: L ? 'بداية' : 'Start' },
    { value: 'center' as const, label: L ? 'وسط' : 'Center' },
    { value: 'flex-end' as const, label: L ? 'نهاية' : 'End' },
  ]
  const weightOpts = [
    { value: 'normal' as const, label: L ? 'عادي' : 'Normal' },
    { value: 'bold' as const, label: L ? 'سميك' : 'Bold' },
  ]
  const borderOpts = [
    { value: 'none' as const, label: L ? 'بدون' : 'None' },
    { value: 'solid' as const, label: L ? 'عادي' : 'Solid' },
    { value: 'dashed' as const, label: L ? 'متقطع' : 'Dashed' },
  ]

  return (
    <aside className="w-64 lg:w-72 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0 min-h-0 shadow-sm" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-[#2563eb] text-white text-center py-2.5 px-3">
        <h3 className="text-sm font-bold">{L ? 'الخصائص' : 'Properties'}</h3>
        {multi ? (
          <p className="text-[10px] opacity-90 mt-0.5">
            {L ? `${elements.length} عناصر` : `${elements.length} elements`}
          </p>
        ) : typeLabel ? (
          <p className="text-[10px] opacity-90 mt-0.5">{L ? typeLabel.ar : typeLabel.en}</p>
        ) : null}
      </div>

      <div className="p-3">
        {!multi && el?.type === 'table' && onOpenTableColumns && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => onOpenTableColumns(el.id)}
              className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
            >
              {L ? 'إعداد أعمدة الجدول…' : 'Configure table columns…'}
            </button>
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">
              {L ? 'أو انقر مرتين على الجدول في اللوحة' : 'Or double-click the table on canvas'}
            </p>
          </div>
        )}

        {!multi && el?.type === 'totals_table' && onOpenTotalsRows && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => onOpenTotalsRows(el.id)}
              className="w-full py-2.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700"
            >
              {L ? 'إعداد صفوف الإجماليات…' : 'Configure totals rows…'}
            </button>
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">
              {L ? 'أو انقر مرتين على الجدول في اللوحة' : 'Or double-click the totals table on canvas'}
            </p>
          </div>
        )}

        {!multi && el && (
          <div className="mb-3 p-2 border border-gray-200 rounded bg-gray-50/80 text-xs space-y-1">
            {'label' in el && el.label != null && (
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">{L ? 'العنصر' : 'Element'}</span>
                <input
                  value={el.label}
                  onChange={(e) => onUpdateElement({ ...el, label: e.target.value } as CanvasElement)}
                  className="flex-1 text-end border-0 border-b border-gray-300 bg-transparent text-xs focus:outline-none"
                />
              </div>
            )}
            {el.type === 'text' && (
              <textarea
                value={el.text}
                onChange={(e) => onUpdateElement({ ...el, text: e.target.value } as CanvasElement)}
                rows={2}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-y"
                placeholder={L ? 'النص' : 'Text'}
              />
            )}
            {el.type === 'variable' && (
              <input
                value={stripVariableCode(el.var)}
                onChange={(e) => onUpdateElement({ ...el, var: e.target.value.trim() } as CanvasElement)}
                className="w-full font-mono text-xs border border-gray-200 rounded px-2 py-1"
                dir="ltr"
              />
            )}
          </div>
        )}

        <div className="space-y-0">
          <PropRow label={L ? 'العرض' : 'Width'}>
            <UnderlineNum
              value={wPx === 'mixed' ? '' : wPx}
              placeholder={wPx === 'mixed' ? '—' : undefined}
              min={1}
              max={mmToPx(contentMaxW)}
              onChange={(px) => onPatchLayout({ wMm: pxToMm(px) })}
              unit={unit}
            />
          </PropRow>
          <PropRow label={L ? 'الطول' : 'Height'}>
            <UnderlineNum
              value={hPx === 'mixed' ? '' : hPx}
              placeholder={hPx === 'mixed' ? '—' : undefined}
              min={1}
              max={mmToPx(contentMaxH)}
              onChange={(px) => onPatchLayout({ hMm: pxToMm(px) })}
              unit={unit}
            />
          </PropRow>
          <PropRow label={L ? 'حجم الخط' : 'Font size'}>
            <UnderlineNum
              value={fontSize === 'mixed' ? '' : fontSize}
              min={6}
              max={72}
              onChange={(n) => onPatchStyle({ fontSize: n })}
              unit={unit}
            />
          </PropRow>
          <PropRow label={L ? 'سمك الخط' : 'Font weight'}>
            <PropSelect
              value={fontWeight === 'mixed' ? 'mixed' : fontWeight}
              mixed={fontWeight === 'mixed'}
              options={weightOpts}
              onChange={(v) => onPatchStyle({ fontWeight: v })}
            />
          </PropRow>
          <PropRow label={L ? 'ارتفاع الخط' : 'Line height'}>
            <UnderlineNum
              value={lineHeightPt === 'mixed' ? '' : lineHeightPt}
              min={0}
              max={120}
              onChange={(n) => onPatchStyle({ lineHeightPt: n, lineHeight: undefined })}
              unit={unit}
            />
          </PropRow>
          <PropRow label={L ? 'محاذاة النص' : 'Text align'}>
            <PropSelect
              value={textAlign === 'mixed' ? 'mixed' : textAlign}
              mixed={textAlign === 'mixed'}
              options={alignOpts}
              onChange={(v) => onPatchStyle({ textAlign: v })}
            />
          </PropRow>
          <PropRow label={L ? 'اتجاه النص' : 'Text direction'}>
            <PropSelect
              value={direction === 'mixed' ? 'mixed' : direction}
              mixed={direction === 'mixed'}
              options={dirOpts}
              onChange={(v) => onPatchStyle({ direction: v })}
            />
          </PropRow>
          <PropRow label={L ? 'محاذاة المحتوى' : 'Content align'}>
            <PropSelect
              value={alignItems === 'mixed' ? 'mixed' : alignItems}
              mixed={alignItems === 'mixed'}
              options={flexOpts}
              onChange={(v) => onPatchStyle({ alignItems: v })}
            />
          </PropRow>
          <PropRow label={L ? 'محاذاة العناصر' : 'Items align'}>
            <PropSelect
              value={justifyContent === 'mixed' ? 'mixed' : justifyContent}
              mixed={justifyContent === 'mixed'}
              options={flexOpts}
              onChange={(v) => onPatchStyle({ justifyContent: v })}
            />
          </PropRow>
          <PropRow label={L ? 'الحشو' : 'Padding'}>
            <UnderlineNum
              value={paddingPx === 'mixed' ? '' : paddingPx}
              min={0}
              max={80}
              onChange={(n) => onPatchStyle({ paddingPx: n })}
              unit={unit}
            />
          </PropRow>
          <PropRow label={L ? 'الإنحناء' : 'Radius'}>
            <UnderlineNum
              value={borderRadiusPx === 'mixed' ? '' : borderRadiusPx}
              min={0}
              max={80}
              onChange={(n) => onPatchStyle({ borderRadiusPx: n })}
              unit={unit}
            />
          </PropRow>

          <ColorRow
            label={L ? 'لون الخلفية' : 'Background'}
            color={bgColor === 'mixed' ? '#ffffff' : bgColor}
            transparent={bgTrans && !someBgTrans ? true : bgTrans}
            transparentLabel={L ? 'شفاف' : 'Transparent'}
            onColor={(c) => onPatchStyle({ backgroundColor: c, backgroundTransparent: false })}
            onTransparent={(t) => onPatchStyle({ backgroundTransparent: t })}
          />
          <ColorRow
            label={L ? 'لون الخط' : 'Font color'}
            color={textColor === 'mixed' ? '#0f172a' : textColor}
            transparent={colorTrans && !someColorTrans ? true : colorTrans}
            transparentLabel={L ? 'شفاف' : 'Transparent'}
            onColor={(c) => onPatchStyle({ color: c, colorTransparent: false })}
            onTransparent={(t) => onPatchStyle({ colorTransparent: t })}
          />
          <ColorRow
            label={L ? 'لون الحدود' : 'Border color'}
            color={borderColor === 'mixed' ? '#e2e8f0' : borderColor}
            transparent={borderTrans && !someBorderTrans ? true : borderTrans}
            transparentLabel={L ? 'شفاف' : 'Transparent'}
            onColor={(c) => onPatchStyle({ borderColor: c, borderTransparent: false })}
            onTransparent={(t) => onPatchStyle({ borderTransparent: t })}
          />

          <PropRow label={L ? 'عرض الحدود' : 'Border width'}>
            <UnderlineNum
              value={borderWidthPx === 'mixed' ? '' : borderWidthPx}
              min={0}
              max={20}
              onChange={(n) =>
                onPatchStyle({
                  borderWidthPx: n,
                  borderStyle: n > 0 ? 'solid' : 'none',
                  ...(n > 0 ? { borderTransparent: false, borderColor: borderColor === 'mixed' ? '#334155' : borderColor || '#334155' } : {}),
                })
              }
              unit={unit}
            />
          </PropRow>
          <PropRow label={L ? 'استايل الحدود' : 'Border style'}>
            <PropSelect
              value={borderStyle === 'mixed' ? 'mixed' : borderStyle}
              mixed={borderStyle === 'mixed'}
              options={borderOpts}
              onChange={(v) =>
                onPatchStyle({
                  borderStyle: v,
                  ...(v !== 'none' && (borderWidthPx === 'mixed' ? true : borderWidthPx > 0)
                    ? { borderTransparent: false, borderColor: borderColor === 'mixed' ? '#334155' : borderColor || '#334155' }
                    : {}),
                })
              }
            />
          </PropRow>
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 mb-2 text-center">{L ? 'تحريك دقيق' : 'Nudge'}</p>
          <div className="grid grid-cols-3 gap-1 w-24 mx-auto mb-4">
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
          <label className="flex items-center justify-between text-xs text-gray-600 mb-3 cursor-pointer">
            <span>{L ? 'ظاهر' : 'Visible'}</span>
            <input
              type="checkbox"
              checked={elements.every((e) => e.visible !== false)}
              ref={(inp) => {
                if (inp) {
                  const all = elements.every((e) => e.visible !== false)
                  const some = elements.some((e) => e.visible !== false)
                  inp.indeterminate = !all && some
                }
              }}
              onChange={(e) => onPatchElements({ visible: e.target.checked })}
              className="rounded accent-blue-600"
            />
          </label>
          <label className="flex items-center justify-between text-xs text-gray-600 mb-4 cursor-pointer">
            <span>{L ? 'قفل' : 'Lock'}</span>
            <input
              type="checkbox"
              checked={elements.every((e) => e.locked)}
              ref={(inp) => {
                if (inp) {
                  const all = elements.every((e) => e.locked)
                  const some = elements.some((e) => e.locked)
                  inp.indeterminate = !all && some
                }
              }}
              onChange={(e) => onPatchElements({ locked: e.target.checked })}
              className="rounded accent-blue-600"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="w-full py-2 mb-2 rounded border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50"
        >
          🗑 {multi ? (L ? `حذف ${elements.length}` : `Delete ${elements.length}`) : L ? 'حذف' : 'Delete'}
        </button>
        <button
          type="button"
          onClick={onDeselect}
          className="w-full py-2 rounded border border-gray-200 text-gray-500 text-xs hover:bg-gray-50"
        >
          {L ? '← خصائص الصفحة' : '← Page properties'}
        </button>
      </div>
    </aside>
  )
}
