import { useCallback, useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { elementIdsInMarqueeRect } from '../../../utils/printDesignerSelection'
import { stripVariableCode } from '../../../utils/printDesignerVariable'
import { columnField, normalizeTableElement, renderTablePreview } from '../../../utils/printDesignerTable'
import { normalizeTotalsTableElement, renderTotalsTablePreview } from '../../../utils/printDesignerTotalsTable'
import type { CanvasTableEl, CanvasTotalsTableEl } from '../../../utils/printDesignerTypes'
import type { CanvasElement, CanvasElementLayout } from '../../../utils/printDesignerTypes'
import type { PrintMargins, PrintOrientation, PrintPaperSize } from '../../../types/printTemplate'
import {
  ensureCanvasLayouts,
  maxLayoutBottomMm,
  paperContentSizeMm,
  paperOuterSizeMm,
} from '../../../utils/printDesignerLayout'
import { getElementStyle, elementStyleToReact } from '../../../utils/printElementStyle'

type ResizeHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'

function applyResize(handle: ResizeHandle, L0: CanvasElementLayout, dxMm: number, dyMm: number): CanvasElementLayout {
  let { xMm: x, yMm: y, wMm: w, hMm: h } = L0
  switch (handle) {
    case 'e':
      w += dxMm
      break
    case 's':
      h += dyMm
      break
    case 'se':
      w += dxMm
      h += dyMm
      break
    case 'w':
      x += dxMm
      w -= dxMm
      break
    case 'n':
      y += dyMm
      h -= dyMm
      break
    case 'nw':
      x += dxMm
      w -= dxMm
      y += dyMm
      h -= dyMm
      break
    case 'ne':
      w += dxMm
      y += dyMm
      h -= dyMm
      break
    case 'sw':
      x += dxMm
      w -= dxMm
      h += dyMm
      break
    default:
      break
  }
  return { xMm: x, yMm: y, wMm: w, hMm: h }
}

function ElementCanvasBody({
  el,
  accentColor,
  pageFontFamily,
}: {
  el: CanvasElement
  accentColor: string
  pageFontFamily: string
}) {
  const boxStyle = elementStyleToReact(getElementStyle(el), pageFontFamily, el)
  let inner: React.ReactNode = null
  switch (el.type) {
    case 'variable':
      inner = (
        <p className="m-0 text-[10px] font-mono w-full truncate whitespace-nowrap" dir="ltr" title={stripVariableCode(el.var)}>
          {stripVariableCode(el.var)}
        </p>
      )
      break
    case 'text':
      inner = <p className="m-0 whitespace-pre-wrap break-words w-full">{el.text}</p>
      break
    case 'divider':
      inner = (
        <div className="w-full flex items-center justify-center flex-1">
          <hr className="border-0 border-t border-gray-200 m-0 w-full" />
        </div>
      )
      break
    case 'spacer':
      inner = (
        <div
          className="bg-slate-50/80 flex items-center justify-center h-full"
          style={{ minHeight: `${Math.max(4, el.heightMm)}mm` }}
        >
          <span className="text-[9px] text-slate-400">↕ {el.heightMm}mm</span>
        </div>
      )
      break
    case 'box':
      inner = (
        <div
          className="border border-dashed border-slate-300 rounded-lg p-2 h-full box-border flex items-start"
          style={{ minHeight: `${el.minHeightMm ?? 20}mm` }}
        >
          <span className="text-[9px] text-slate-400">□</span>
        </div>
      )
      break
    case 'table': {
      const table = normalizeTableElement(el as CanvasTableEl)
      const { headerBg, columns, thStyle, tdStyle, rowBorderStyle } = renderTablePreview(
        table,
        accentColor,
        pageFontFamily,
      )
      inner = (
        <div className="rounded overflow-visible w-full min-h-0 flex flex-col">
          {table.showTitle && table.label ? (
            <div className="text-[10px] px-2 py-1 font-medium text-white shrink-0 w-full" style={{ backgroundColor: headerBg }}>
              {table.label}
            </div>
          ) : null}
          <div className="w-full shrink-0 overflow-visible">
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: 'inherit', height: 'auto' }}>
              <thead>
                <tr style={{ backgroundColor: headerBg, color: '#fff' }}>
                  {columns.map((c, i) => (
                    <th key={c.key} className="font-semibold" style={thStyle(c, i)}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className={rowBorderStyle ? undefined : 'border-b border-slate-100'} style={rowBorderStyle}>
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className="text-slate-600 font-mono text-[9px] whitespace-nowrap"
                      style={tdStyle(c, i)}
                      dir="ltr"
                    >
                      {columnField(c)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )
      break
    }
    case 'totals_table': {
      const totals = normalizeTotalsTableElement(el as CanvasTotalsTableEl)
      const {
        headerBg,
        rows,
        labelColumnTitle,
        valueColumnTitle,
        showHeader,
        thStyle,
        tdLabelStyle,
        tdValueStyle,
        rowBorderStyle,
      } = renderTotalsTablePreview(totals, accentColor, pageFontFamily)
      inner = (
        <div className="rounded overflow-visible w-full min-h-0 flex flex-col">
          {totals.showTitle && totals.label ? (
            <div className="text-[10px] px-2 py-1 font-medium text-white shrink-0 w-full" style={{ backgroundColor: headerBg }}>
              {totals.label}
            </div>
          ) : null}
          {totals.anchorBelowItems ? (
            <p className="text-[9px] text-teal-700 bg-teal-50 px-2 py-0.5 border-b border-teal-100">
              ↓ ملاصق لجدول الأصناف عند الطباعة
            </p>
          ) : null}
          <div className="w-full shrink-0 overflow-visible">
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: 'inherit', height: 'auto' }}>
              {showHeader ? (
                <thead>
                  <tr style={{ backgroundColor: headerBg, color: '#fff' }}>
                    <th style={thStyle}>{labelColumnTitle}</th>
                    <th style={thStyle}>{valueColumnTitle}</th>
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} style={rowBorderStyle}>
                    <td style={tdLabelStyle}>{r.label}</td>
                    <td style={tdValueStyle} dir="ltr">
                      {(r.field ?? '').replace(/\{\{|\}\}/g, '').trim() || r.key}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
      break
    }
    case 'image':
      inner = (
        <div className="h-full flex items-center justify-center overflow-hidden">
          <img
            src={el.src}
            alt=""
            className="max-w-full max-h-full object-contain"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        </div>
      )
      break
    case 'qr':
      inner = <div className="text-center text-slate-500 text-xs w-full">▦ QR</div>
      break
    case 'barcode':
      inner = <div className="text-center text-slate-500 text-xs w-full">▌▌ Barcode</div>
      break
    case 'html_embed': {
      const raw = el.html?.trim()
      if (!raw) {
        inner = <div className="text-[10px] text-amber-800 w-full text-center">(HTML فارغ)</div>
        break
      }
      inner = (
        <div className="flex h-full min-h-0 w-full flex-col border border-amber-200 bg-white text-[10px] text-slate-800">
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-900">
            HTML{el.label && el.label !== 'HTML' ? ` · ${el.label}` : ''}
          </div>
          <div
            className="min-h-0 flex-1 overflow-auto p-1.5 break-words [font-size:max(8px,0.62em)]"
            style={{ fontFamily: 'inherit' }}
            dir="rtl"
            dangerouslySetInnerHTML={{ __html: raw }}
          />
        </div>
      )
      break
    }
    default:
      inner = null
  }

  return <div style={boxStyle}>{inner}</div>
}

const HANDLE_CLASS =
  'absolute z-20 w-2.5 h-2.5 bg-white border-2 border-teal-500 rounded-sm shadow-sm box-border touch-none'

function PlacedElement({
  el,
  layout,
  selected,
  getMmPerPx,
  onSelect,
  onUpdateLayout,
  accentColor,
  pageFontFamily,
  onEditTableColumns,
  onEditTotalsRows,
}: {
  el: CanvasElement
  layout: CanvasElementLayout
  selected: boolean
  getMmPerPx: () => { x: number; y: number }
  onSelect: (e: ReactMouseEvent) => void
  onUpdateLayout: (layout: CanvasElementLayout, recordHistory: boolean) => void
  accentColor: string
  pageFontFamily: string
  onEditTableColumns?: (id: string) => void
  onEditTotalsRows?: (id: string) => void
}) {
  const ring = selected ? 'ring-2 ring-teal-500 ring-offset-1' : 'hover:ring-1 hover:ring-gray-200'

  const onResizePointerDown = useCallback(
    (handle: ResizeHandle) => (e: ReactPointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startL = { ...layout }
      const startClient = { x: e.clientX, y: e.clientY }
      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return
        const { x: mmPerPxX, y: mmPerPxY } = getMmPerPx()
        const dxMm = (ev.clientX - startClient.x) * mmPerPxX
        const dyMm = (ev.clientY - startClient.y) * mmPerPxY
        onUpdateLayout(applyResize(handle, startL, dxMm, dyMm), false)
      }
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return
        target.releasePointerCapture(e.pointerId)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        const { x: mmPerPxX, y: mmPerPxY } = getMmPerPx()
        const dxMm = (ev.clientX - startClient.x) * mmPerPxX
        const dyMm = (ev.clientY - startClient.y) * mmPerPxY
        onUpdateLayout(applyResize(handle, startL, dxMm, dyMm), true)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [getMmPerPx, layout, onUpdateLayout],
  )

  const onDragPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-resize-handle]')) return
      e.preventDefault()
      e.stopPropagation()
      const startL = { ...layout }
      const startClient = { x: e.clientX, y: e.clientY }
      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return
        const { x: mmPerPxX, y: mmPerPxY } = getMmPerPx()
        const dxMm = (ev.clientX - startClient.x) * mmPerPxX
        const dyMm = (ev.clientY - startClient.y) * mmPerPxY
        onUpdateLayout(
          {
            xMm: startL.xMm + dxMm,
            yMm: startL.yMm + dyMm,
            wMm: startL.wMm,
            hMm: startL.hMm,
          },
          false,
        )
      }
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return
        target.releasePointerCapture(e.pointerId)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        const { x: mmPerPxX, y: mmPerPxY } = getMmPerPx()
        const dxMm = (ev.clientX - startClient.x) * mmPerPxX
        const dyMm = (ev.clientY - startClient.y) * mmPerPxY
        onUpdateLayout(
          {
            xMm: startL.xMm + dxMm,
            yMm: startL.yMm + dyMm,
            wMm: startL.wMm,
            hMm: startL.hMm,
          },
          true,
        )
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [getMmPerPx, layout, onUpdateLayout],
  )

  const z = selected ? 8 : 1

  return (
    <div
      role="presentation"
      data-placed-element
      className={`absolute rounded-md cursor-move select-none ${el.type === 'table' || el.type === 'totals_table' ? 'overflow-visible' : 'overflow-hidden'} ${ring}`}
      style={{
        left: `${layout.xMm}mm`,
        top: `${layout.yMm}mm`,
        width: `${layout.wMm}mm`,
        height: el.type === 'table' || el.type === 'totals_table' ? 'auto' : `${layout.hMm}mm`,
        zIndex: z,
        opacity: el.visible === false ? 0.35 : 1,
        pointerEvents: el.locked ? 'none' : undefined,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(e)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (el.type === 'table' && onEditTableColumns) onEditTableColumns(el.id)
        if (el.type === 'totals_table' && onEditTotalsRows) onEditTotalsRows(el.id)
      }}
      onPointerDown={
        el.locked
          ? undefined
          : (e) => {
              e.stopPropagation()
              onDragPointerDown(e)
            }
      }
    >
      <div
        className={`w-full box-border p-0.5 ${
          el.type === 'table' || el.type === 'totals_table'
            ? 'h-auto overflow-visible pointer-events-none'
            : el.type === 'html_embed'
              ? 'h-full overflow-auto pointer-events-auto'
              : 'h-full overflow-hidden pointer-events-none'
        }`}
      >
        <ElementCanvasBody el={el} accentColor={accentColor} pageFontFamily={pageFontFamily} />
      </div>
      {selected && (
        <>
          <button
            type="button"
            data-resize-handle="nw"
            aria-label="resize nw"
            className={`${HANDLE_CLASS} -top-1.5 -left-1.5 cursor-nwse-resize`}
            onPointerDown={onResizePointerDown('nw')}
          />
          <button
            type="button"
            data-resize-handle="n"
            aria-label="resize n"
            className={`${HANDLE_CLASS} -top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize`}
            onPointerDown={onResizePointerDown('n')}
          />
          <button
            type="button"
            data-resize-handle="ne"
            aria-label="resize ne"
            className={`${HANDLE_CLASS} -top-1.5 -right-1.5 cursor-nesw-resize`}
            onPointerDown={onResizePointerDown('ne')}
          />
          <button
            type="button"
            data-resize-handle="w"
            aria-label="resize w"
            className={`${HANDLE_CLASS} top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize`}
            onPointerDown={onResizePointerDown('w')}
          />
          <button
            type="button"
            data-resize-handle="e"
            aria-label="resize e"
            className={`${HANDLE_CLASS} top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize`}
            onPointerDown={onResizePointerDown('e')}
          />
          <button
            type="button"
            data-resize-handle="sw"
            aria-label="resize sw"
            className={`${HANDLE_CLASS} -bottom-1.5 -left-1.5 cursor-nesw-resize`}
            onPointerDown={onResizePointerDown('sw')}
          />
          <button
            type="button"
            data-resize-handle="s"
            aria-label="resize s"
            className={`${HANDLE_CLASS} -bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize`}
            onPointerDown={onResizePointerDown('s')}
          />
          <button
            type="button"
            data-resize-handle="se"
            aria-label="resize se"
            className={`${HANDLE_CLASS} -bottom-1.5 -right-1.5 cursor-nwse-resize`}
            onPointerDown={onResizePointerDown('se')}
          />
        </>
      )}
    </div>
  )
}

type Props = {
  isRtl: boolean
  langAr: boolean
  paperSize: PrintPaperSize
  orientation: PrintOrientation
  margins: PrintMargins
  zoom: number
  showGrid: boolean
  showRuler?: boolean
  isDragOver: boolean
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomReset?: () => void
  setIsDragOver: (v: boolean) => void
  elements: CanvasElement[]
  selectedIds: Set<string>
  onSelect: (id: string, additive: boolean) => void
  onSelectByIds: (ids: string[], additive: boolean) => void
  onDrop: (e: DragEvent, dropMm?: { x: number; y: number } | null) => void
  onUpdateElementLayout: (id: string, layout: CanvasElementLayout, recordHistory: boolean) => void
  fontFamily: string
  fontSize: number
  textColor: string
  accentColor: string
  formatBold?: boolean
  formatItalic?: boolean
  formatUnderline?: boolean
  onDeselect?: () => void
  onEditTableColumns?: (id: string) => void
  onEditTotalsRows?: (id: string) => void
}

export default function PrintDesignerCanvas({
  isRtl,
  langAr,
  paperSize,
  orientation,
  margins,
  zoom,
  showGrid,
  showRuler = false,
  isDragOver,
  setIsDragOver,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  elements,
  selectedIds,
  onSelect,
  onSelectByIds,
  onDrop,
  onUpdateElementLayout,
  fontFamily,
  fontSize,
  textColor,
  accentColor,
  formatBold,
  formatItalic,
  formatUnderline,
  onDeselect,
  onEditTableColumns,
  onEditTotalsRows,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [marqueePx, setMarqueePx] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const isThermal = paperSize === 'thermal_80' || paperSize === 'thermal_58'
  const outer = paperOuterSizeMm(paperSize, orientation)
  const paperW = `${outer.w}mm`
  const paperH = isThermal ? 'auto' : `${outer.h}mm`

  const contentMm = useMemo(
    () => paperContentSizeMm(paperSize, orientation, margins),
    [paperSize, orientation, margins],
  )

  const laidOut = useMemo(
    () => ensureCanvasLayouts(elements, paperSize, orientation, margins),
    [elements, paperSize, orientation, margins],
  )

  const innerMinHmm = useMemo(() => {
    const bottom = maxLayoutBottomMm(laidOut)
    const floor = isThermal ? Math.max(contentMm.h * 0.25, 120) : contentMm.h
    return Math.max(floor, bottom + 12)
  }, [laidOut, contentMm.h, isThermal])

  const rootStyle: CSSProperties & { ['--accent']?: string } = {
    width: paperW,
    minHeight: paperH,
    transform: `scale(${zoom / 100})`,
    transformOrigin: 'top center',
    padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`,
    fontFamily: `${fontFamily}, Tahoma, Arial, sans-serif`,
    fontSize: `${fontSize}pt`,
    color: textColor,
    fontWeight: formatBold ? 700 : undefined,
    fontStyle: formatItalic ? 'italic' : undefined,
    textDecoration: formatUnderline ? 'underline' : undefined,
    '--accent': accentColor,
  }

  const getMmPerPx = useCallback(() => {
    const el = contentRef.current
    if (!el || el.clientWidth <= 0 || el.clientHeight <= 0) {
      return { x: contentMm.w / 400, y: contentMm.h / 500 }
    }
    return { x: contentMm.w / el.clientWidth, y: contentMm.h / el.clientHeight }
  }, [contentMm.w, contentMm.h])

  const clientToContentPx = useCallback((clientX: number, clientY: number) => {
    const rect = contentRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return null
    return {
      x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, clientY - rect.top)),
    }
  }, [])

  const onCanvasSurfacePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest('[data-placed-element]') || target.closest('[data-resize-handle]')) return

      const start = clientToContentPx(e.clientX, e.clientY)
      if (!start) return

      e.preventDefault()
      const additive = e.shiftKey || e.ctrlKey || e.metaKey
      const startClient = { x: e.clientX, y: e.clientY }
      let active = false

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startClient.x
        const dy = ev.clientY - startClient.y
        if (!active && Math.hypot(dx, dy) < 4) return
        active = true
        const cur = clientToContentPx(ev.clientX, ev.clientY)
        if (!cur) return
        setMarqueePx({ x0: start.x, y0: start.y, x1: cur.x, y1: cur.y })
      }

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        setMarqueePx(null)

        if (!active) {
          if (!additive && onDeselect) onDeselect()
          return
        }

        const end = clientToContentPx(ev.clientX, ev.clientY)
        if (!end) {
          if (!additive && onDeselect) onDeselect()
          return
        }

        const { x: mmPerPxX, y: mmPerPxY } = getMmPerPx()
        const x1px = Math.min(start.x, end.x)
        const y1px = Math.min(start.y, end.y)
        const x2px = Math.max(start.x, end.x)
        const y2px = Math.max(start.y, end.y)
        const rectMm = {
          x1: x1px * mmPerPxX,
          y1: y1px * mmPerPxY,
          x2: x2px * mmPerPxX,
          y2: y2px * mmPerPxY,
        }
        const ids = elementIdsInMarqueeRect(elements, rectMm)
        if (ids.length === 0 && !additive) {
          onDeselect?.()
        } else {
          onSelectByIds(ids, additive)
        }
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [clientToContentPx, getMmPerPx, elements, onSelectByIds, onDeselect],
  )

  const handleDropInner = useCallback(
    (e: DragEvent) => {
      const rect = contentRef.current?.getBoundingClientRect()
      let dropMm: { x: number; y: number } | null = null
      if (rect && rect.width > 0 && rect.height > 0) {
        const fx = (e.clientX - rect.left) / rect.width
        const fy = (e.clientY - rect.top) / rect.height
        dropMm = {
          x: Math.max(0, Math.min(contentMm.w, fx * contentMm.w)),
          y: Math.max(0, Math.min(contentMm.h, fy * contentMm.h)),
        }
      }
      onDrop(e, dropMm)
    },
    [onDrop, contentMm.w, contentMm.h],
  )

  return (
    <div
      className="flex-1 bg-gray-200 overflow-auto flex items-start justify-center p-6 min-h-0 min-w-0 relative"
      dir={isRtl ? 'rtl' : 'ltr'}
      onMouseDown={(e) => {
        if (onDeselect && e.target === e.currentTarget) onDeselect()
      }}
      style={{
        backgroundImage: showGrid ? 'radial-gradient(circle, #94a3b8 1px, transparent 1px)' : undefined,
        backgroundSize: '20px 20px',
      }}
    >
      {(onZoomIn || onZoomOut) && (
        <div className={`absolute top-4 z-30 flex flex-col shadow-lg rounded-lg overflow-hidden border border-gray-200 ${isRtl ? 'left-4' : 'right-4'}`}>
          {onZoomIn && (
            <button type="button" onClick={onZoomIn} className="w-9 h-9 bg-white hover:bg-gray-50 text-lg font-bold border-b border-gray-100">
              +
            </button>
          )}
          {onZoomReset && (
            <button type="button" onClick={onZoomReset} className="w-9 h-9 bg-white hover:bg-gray-50 text-[9px] border-b border-gray-100">
              {zoom}%
            </button>
          )}
          {onZoomOut && (
            <button type="button" onClick={onZoomOut} className="w-9 h-9 bg-white hover:bg-gray-50 text-lg font-bold">
              −
            </button>
          )}
        </div>
      )}
      <div className="bg-white shadow-2xl relative text-left" style={rootStyle}>
        <div
          ref={contentRef}
          className="relative select-none"
          style={{ minHeight: `${innerMinHmm}mm` }}
          onPointerDown={onCanvasSurfacePointerDown}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDrop={handleDropInner}
          onDragLeave={() => setIsDragOver(false)}
        >
          {marqueePx && (
            <div
              className="absolute z-[100] pointer-events-none border-2 border-teal-500 bg-teal-400/15 rounded-sm"
              style={{
                left: Math.min(marqueePx.x0, marqueePx.x1),
                top: Math.min(marqueePx.y0, marqueePx.y1),
                width: Math.abs(marqueePx.x1 - marqueePx.x0),
                height: Math.abs(marqueePx.y1 - marqueePx.y0),
              }}
            />
          )}
          {laidOut.length === 0 ? (
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-colors m-1 ${
                isDragOver ? 'border-teal-400 bg-teal-50' : 'border-gray-200'
              }`}
            >
              <span className="text-3xl mb-2" aria-hidden>
                📄
              </span>
              <p className="text-sm text-gray-400 px-4 text-center">
                {langAr ? 'اسحب العناصر هنا أو اختر قالباً جاهزاً' : 'Drag elements here or pick a preset'}
              </p>
            </div>
          ) : (
            laidOut.map((el) => {
              if (el.visible === false) return null
              const layout = el.layout
              if (!layout) return null
              return (
                <PlacedElement
                  key={el.id}
                  el={el}
                  layout={layout}
                  selected={selectedIds.has(el.id)}
                  getMmPerPx={getMmPerPx}
                  onSelect={(e) => onSelect(el.id, e.shiftKey || e.ctrlKey || e.metaKey)}
                  onUpdateLayout={(L, rec) => onUpdateElementLayout(el.id, L, rec)}
                  accentColor={accentColor}
                  pageFontFamily={fontFamily}
                  onEditTableColumns={onEditTableColumns}
                  onEditTotalsRows={onEditTotalsRows}
                />
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

