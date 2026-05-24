import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  createPrintTemplate,
  fetchPrintTemplate,
  fetchPrintTemplates,
  updatePrintTemplate,
} from '../../api/printTemplates'
import type { PrintDocumentType, PrintMargins, PrintOrientation, PrintPaperSize, PrintTemplate } from '../../types/printTemplate'
import { DOC_TYPE_LABELS, DOC_TYPE_ORDER, TEMPLATE_THUMB_COLORS } from '../../utils/printUtils'
import Toast, { type ToastType } from '../../components/ui/Toast'
import TemplatePreviewModal from '../../components/print/TemplatePreviewModal'
import PrintDesignerTopBar from '../../components/print/designer/PrintDesignerTopBar'
import PrintDesignerSaveAsDialog from '../../components/print/designer/PrintDesignerSaveAsDialog'
import PrintDesignerSidebar from '../../components/print/designer/PrintDesignerSidebar'
import PrintDesignerCanvas from '../../components/print/designer/PrintDesignerCanvas'
import PrintDesignerRightPanel, { cloneCanvasElement } from '../../components/print/designer/PrintDesignerRightPanel'
import PrintDesignerTableColumnsDialog from '../../components/print/designer/PrintDesignerTableColumnsDialog'
import PrintDesignerTotalsRowsDialog from '../../components/print/designer/PrintDesignerTotalsRowsDialog'
import { normalizeTableElement } from '../../utils/printDesignerTable'
import { normalizeTotalsTableElement } from '../../utils/printDesignerTotalsTable'
import type { CanvasTableEl, CanvasTotalsTableEl } from '../../utils/printDesignerTypes'
import type { CanvasElement } from '../../utils/printDesignerTypes'
import { createCanvasId } from '../../utils/printDesignerTypes'
import { createPaletteElement } from '../../utils/printDesignerPalette'
import type { PaletteElementType } from '../../utils/printDesignerPalette'
import {
  buildProInvoiceCanvas,
  getPrintDesignerPresets,
  loadCanvasFromTemplate,
  serializeCanvasToHtml,
} from '../../utils/printDesignerSerialize'
import { patchElementStyle } from '../../utils/printElementStyle'
import type { CanvasElementStyle } from '../../utils/printDesignerTypes'
import { selectAllIds, selectOnly, toggleInSelection } from '../../utils/printDesignerSelection'
import {
  clampLayoutToContent,
  defaultSizeMmForElement,
  ensureCanvasLayouts,
  hasValidCanvasLayout,
  nextStackLayoutMm,
  paperContentSizeMm,
} from '../../utils/printDesignerLayout'
import type { CanvasElementLayout } from '../../utils/printDesignerTypes'
import { clampZoom } from '../../utils/printUtils'
import { createLabelValuePair } from '../../utils/printDesignerVariable'

const defaultSections: Record<string, boolean> = {
  header: true,
  company: true,
  customer: true,
  recipient: true,
  items: true,
  totals: true,
  notes: true,
  signature: true,
  footer: true,
}

const defaultMargins: PrintMargins = { top: 10, right: 10, bottom: 10, left: 10 }

const PRESET_LABEL_EN: Record<string, string> = {
  empty: '— Empty —',
  classic_invoice: 'Classic invoice',
  modern_invoice: 'Modern invoice',
  thermal_pos: 'Thermal receipt',
}

type CanvasHistState = {
  elements: CanvasElement[]
  past: CanvasElement[][]
  future: CanvasElement[][]
}

type CanvasHistAction =
  | { type: 'reset'; elements: CanvasElement[] }
  | { type: 'set'; elements: CanvasElement[]; record: boolean }
  | { type: 'undo' }
  | { type: 'redo' }

function cloneCanvasRow(row: CanvasElement): CanvasElement {
  if (row.type === 'table') {
    const table = row as CanvasTableEl
    return {
      ...table,
      columns: table.columns?.map((c) => ({ ...c })),
    }
  }
  if (row.type === 'totals_table') {
    const totals = row as CanvasTotalsTableEl
    return {
      ...totals,
      rows: totals.rows?.map((r) => ({ ...r })),
    }
  }
  return { ...row }
}

function cloneRows(rows: CanvasElement[]): CanvasElement[] {
  return rows.map(cloneCanvasRow)
}

function canvasHistReducer(state: CanvasHistState, action: CanvasHistAction): CanvasHistState {
  switch (action.type) {
    case 'reset':
      return { elements: cloneRows(action.elements), past: [], future: [] }
    case 'set': {
      if (!action.record) return { ...state, elements: cloneRows(action.elements) }
      return {
        elements: cloneRows(action.elements),
        past: [...state.past, state.elements.map((r) => ({ ...r }))],
        future: [],
      }
    }
    case 'undo': {
      if (!state.past.length) return state
      const snap = state.past[state.past.length - 1]
      return {
        elements: snap.map((r) => ({ ...r })),
        past: state.past.slice(0, -1),
        future: [state.elements.map((r) => ({ ...r })), ...state.future],
      }
    }
    case 'redo': {
      if (!state.future.length) return state
      const snap = state.future[0]
      return {
        elements: snap.map((r) => ({ ...r })),
        future: state.future.slice(1),
        past: [...state.past, state.elements.map((r) => ({ ...r }))],
      }
    }
    default:
      return state
  }
}

function emptyForm(docType: PrintDocumentType): Omit<PrintTemplate, 'id' | 'tenant_id' | 'created_at' | 'updated_at'> {
  return {
    name: '',
    document_type: docType,
    paper_size: 'A4',
    orientation: 'portrait',
    margins: { ...defaultMargins },
    settings: {
      font_family: 'Segoe UI',
      font_size: 10,
      accent_color: TEMPLATE_THUMB_COLORS[docType] ?? '#6366f1',
      text_color: '#0f172a',
    },
    sections: { ...defaultSections },
    html_content: '<div class="print-doc-root"></div>',
    is_default: false,
    is_system: false,
    sort_order: 0,
  }
}

export default function PrintTemplateDesigner() {
  const { id: idParam } = useParams<{ id?: string }>()
  /** قالب جديد: لا يوجد :id في المسار، أو معرف غير رقمي لا يُحمّل كقالب */
  const numericId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : NaN
  const isNewTemplate = !Number.isFinite(numericId)
  const [searchParams, setSearchParams] = useSearchParams()
  const typeFromUrl = (searchParams.get('type') || 'invoice') as PrintDocumentType

  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? 0
  const { lang, isRtl } = useLanguage()
  const L = lang === 'ar'
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()

  const [docType, setDocType] = useState<PrintDocumentType>(typeFromUrl)
  const [zoom, setZoom] = useState(100)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [presetId, setPresetId] = useState('')
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [saveAsName, setSaveAsName] = useState('')
  const [tableEditorId, setTableEditorId] = useState<string | null>(null)
  const [totalsEditorId, setTotalsEditorId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [paperSize, setPaperSize] = useState<PrintPaperSize>('A4')
  const [orientation, setOrientation] = useState<PrintOrientation>('portrait')
  const [margins, setMargins] = useState<PrintMargins>({ ...defaultMargins })
  const [sections, setSections] = useState<Record<string, boolean>>({ ...defaultSections })
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [loaded, setLoaded] = useState<PrintTemplate | null>(null)

  const [canvasHist, dispatchCanvas] = useReducer(canvasHistReducer, {
    elements: [] as CanvasElement[],
    past: [] as CanvasElement[][],
    future: [] as CanvasElement[][],
  })
  const elements = canvasHist.elements
  const elementsRef = useRef(elements)
  elementsRef.current = elements

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [showGrid, setShowGrid] = useState(true)
  const [showRuler, setShowRuler] = useState(true)
  const [isDragOver, setIsDragOver] = useState(false)

  const clipboardRef = useRef<CanvasElement | null>(null)

  const replaceElements = useCallback(
    (next: CanvasElement[] | ((prev: CanvasElement[]) => CanvasElement[]), recordHistory: boolean) => {
      const resolved = typeof next === 'function' ? next(elementsRef.current) : next
      dispatchCanvas({ type: 'set', elements: resolved, record: recordHistory })
    },
    [],
  )

  const undo = useCallback(() => {
    dispatchCanvas({ type: 'undo' })
    setSelectedIds(new Set())
  }, [])

  const redo = useCallback(() => {
    dispatchCanvas({ type: 'redo' })
    setSelectedIds(new Set())
  }, [])

  const handleSelect = useCallback((id: string, additive = false) => {
    if (additive) setSelectedIds((prev) => toggleInSelection(prev, id))
    else setSelectedIds(selectOnly(id))
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const selectAllElements = useCallback(() => {
    setSelectedIds(selectAllIds(elements.map((e) => e.id)))
  }, [elements])

  const selectByIds = useCallback((ids: string[], additive: boolean) => {
    if (additive) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of ids) next.add(id)
        return next
      })
    } else {
      setSelectedIds(new Set(ids))
    }
  }, [])

  const { data: fetched, isLoading: oneLoading } = useQuery({
    queryKey: ['print-template', tenantId, numericId],
    queryFn: () => fetchPrintTemplate(tenantId, numericId),
    enabled: tenantId > 0 && Number.isFinite(numericId),
    staleTime: 0,
  })

  useLayoutEffect(() => {
    if (isNewTemplate) {
      qc.removeQueries({ queryKey: ['print-template', tenantId], exact: false })
    }
  }, [isNewTemplate, tenantId, qc])

  const { data: previewListData } = useQuery({
    queryKey: ['print-templates', tenantId],
    queryFn: () => fetchPrintTemplates(tenantId),
    enabled: tenantId > 0 && showPreview,
  })

  const freshStamp = (location.state as { fresh?: number } | null)?.fresh ?? 0
  const newSessionStamp = searchParams.get('_nc') ?? ''

  useEffect(() => {
    if (!isNewTemplate) return
    const init = emptyForm(typeFromUrl)
    setDocType(typeFromUrl)
    setName(init.name)
    setPaperSize(init.paper_size)
    setOrientation(init.orientation)
    setMargins(init.margins ?? { ...defaultMargins })
    setSections({ ...defaultSections, ...(init.sections ?? {}) })
    setSettings((init.settings as Record<string, unknown>) ?? {})
    const emptyPreset = getPrintDesignerPresets().find((p) => p.id === 'empty')
    const initial = ensureCanvasLayouts(
      emptyPreset?.build() ?? [],
      'A4',
      'portrait',
      init.margins ?? defaultMargins,
    )
    dispatchCanvas({ type: 'reset', elements: initial })
    setSelectedIds(new Set())
    setPresetId('empty')
    setLoaded(null)
    setShowGrid(true)
    setShowRuler(true)
    setSearchParams((prev) => {
      if (!prev.has('_nc')) return prev
      const next = new URLSearchParams(prev)
      next.delete('_nc')
      return next
    }, { replace: true })
  }, [isNewTemplate, typeFromUrl, location.key, freshStamp, newSessionStamp, setSearchParams])

  const loadedTemplateIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!Number.isFinite(numericId)) return
    if (!fetched) return

    const s = (fetched.settings as Record<string, unknown>) ?? {}
    setLoaded(fetched)
    setDocType(fetched.document_type)
    setName(fetched.name)
    setPaperSize(fetched.paper_size)
    setOrientation(fetched.orientation)
    setMargins(fetched.margins ?? { ...defaultMargins })
    setSections({ ...defaultSections, ...(fetched.sections ?? {}) })
    setSettings(s)
    setShowGrid(s.designer_show_grid !== false)
    setShowRuler(!!s.designer_show_ruler)

    if (loadedTemplateIdRef.current !== numericId) {
      loadedTemplateIdRef.current = numericId
      dispatchCanvas({ type: 'reset', elements: loadCanvasFromTemplate(fetched) })
      setSelectedIds(new Set())
      setPresetId('')
      setTableEditorId(null)
    }
  }, [fetched, numericId])

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const fontFamily = typeof settings.font_family === 'string' ? settings.font_family : 'Segoe UI'
  const fontSize = typeof settings.font_size === 'number' ? settings.font_size : 10
  const textColor = typeof settings.text_color === 'string' ? settings.text_color : '#0f172a'
  const accent = (settings.accent_color as string) || TEMPLATE_THUMB_COLORS[docType] || '#6366f1'

  const contentBoxMm = useMemo(
    () => paperContentSizeMm(paperSize, orientation, margins),
    [paperSize, orientation, margins],
  )

  useEffect(() => {
    if (!elements.length) return
    if (!elements.some((el) => !hasValidCanvasLayout(el))) return
    replaceElements(ensureCanvasLayouts(elements, paperSize, orientation, margins), false)
  }, [elements, paperSize, orientation, margins, replaceElements])

  const serializedHtml = useMemo(
    () =>
      serializeCanvasToHtml(elements, {
        fontFamily,
        fontSize,
        accentColor: accent,
        textColor,
        formatBold: !!settings.format_bold,
        formatItalic: !!settings.format_italic,
        formatUnderline: !!settings.format_underline,
        paperSize,
        orientation,
        margins,
      }),
    [
      elements,
      fontFamily,
      fontSize,
      accent,
      textColor,
      settings.format_bold,
      settings.format_italic,
      settings.format_underline,
      paperSize,
      orientation,
      margins,
    ],
  )

  const outputHtml = serializedHtml

  const presetOptions = useMemo(
    () =>
      getPrintDesignerPresets().map((p) => ({
        id: p.id,
        label: L ? p.label : PRESET_LABEL_EN[p.id] ?? p.label,
      })),
    [L],
  )

  const docTypeOptions = useMemo(
    () =>
      DOC_TYPE_ORDER.map((k) => ({
        value: k,
        label: L ? DOC_TYPE_LABELS[k].ar : DOC_TYPE_LABELS[k].en,
      })),
    [L],
  )

  const handlePresetChange = useCallback(
    (id: string) => {
      setPresetId(id)
      if (!id) return
      const preset = getPrintDesignerPresets().find((p) => p.id === id)
      if (!preset) return
      replaceElements(ensureCanvasLayouts(preset.build(), paperSize, orientation, margins), true)
      setSelectedIds(new Set())
    },
    [replaceElements, paperSize, orientation, margins],
  )

  const onDocTypeChange = (next: PrintDocumentType) => {
    setDocType(next)
    setSearchParams({ type: next }, { replace: true })
    if (!Number.isFinite(numericId)) {
      const init = emptyForm(next)
      setPaperSize(init.paper_size)
      setSettings((init.settings as Record<string, unknown>) ?? {})
      const emptyPreset = getPrintDesignerPresets().find((p) => p.id === 'empty')
      replaceElements(
        ensureCanvasLayouts(emptyPreset?.build() ?? [], init.paper_size, init.orientation, init.margins ?? defaultMargins),
        true,
      )
      setPresetId('empty')
    }
  }

  const updateElementLayout = useCallback(
    (id: string, layout: CanvasElementLayout, recordHistory: boolean) => {
      const clamped = clampLayoutToContent(layout, contentBoxMm.w, contentBoxMm.h)
      replaceElements(
        elements.map((row) => (row.id === id ? { ...row, layout: clamped } : row)),
        recordHistory,
      )
    },
    [elements, replaceElements, contentBoxMm.w, contentBoxMm.h],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent, dropMm?: { x: number; y: number } | null) => {
      e.preventDefault()
      setIsDragOver(false)
      const { w: cw, h: ch } = contentBoxMm
      const varText = e.dataTransfer.getData('variable')
      const elType = e.dataTransfer.getData('element_type') as PaletteElementType
      const label = e.dataTransfer.getData('label')
      if (varText) {
        const varLabel = label || varText
        const pair = createLabelValuePair(
          varLabel,
          varText,
          cw,
          ch,
          elements,
          dropMm ? { xMm: dropMm.x, yMm: dropMm.y } : null,
        )
        replaceElements([...elements, pair.labelEl, pair.valueEl], true)
        setSelectedIds(new Set([pair.labelEl.id, pair.valueEl.id]))
      } else if (elType) {
        const base = createPaletteElement(elType, L)
        const { w: dw, h: dh } = defaultSizeMmForElement(base, cw)
        const layout = dropMm
          ? clampLayoutToContent(
              { xMm: dropMm.x - dw / 2, yMm: dropMm.y - dh / 2, wMm: dw, hMm: dh },
              cw,
              ch,
            )
          : nextStackLayoutMm(elements, base, cw, ch)
        const row: CanvasElement = { ...base, layout }
        replaceElements([...elements, row], true)
        setSelectedIds(selectOnly(row.id))
      }
    },
    [elements, replaceElements, L, contentBoxMm],
  )

  const removeElement = useCallback(
    (id: string) => {
      replaceElements(
        elements.filter((x) => x.id !== id),
        true,
      )
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    },
    [elements, replaceElements],
  )

  const selectedElements = useMemo(
    () => elements.filter((x) => selectedIds.has(x.id)),
    [elements, selectedIds],
  )

  const primarySelectedId = selectedIds.size > 0 ? Array.from(selectedIds)[0] : null

  const tableEditEl = useMemo((): CanvasTableEl | null => {
    if (!tableEditorId) return null
    const row = elements.find((x) => x.id === tableEditorId)
    return row?.type === 'table' ? normalizeTableElement(row as CanvasTableEl) : null
  }, [elements, tableEditorId])

  const totalsEditEl = useMemo((): CanvasTotalsTableEl | null => {
    if (!totalsEditorId) return null
    const row = elements.find((x) => x.id === totalsEditorId)
    return row?.type === 'totals_table' ? normalizeTotalsTableElement(row as CanvasTotalsTableEl) : null
  }, [elements, totalsEditorId])

  const updateElement = useCallback(
    (el: CanvasElement) => {
      const next =
        el.layout != null
          ? { ...el, layout: clampLayoutToContent(el.layout, contentBoxMm.w, contentBoxMm.h) }
          : el
      const saved =
        next.type === 'table'
          ? ({
              ...next,
              columns: (next as CanvasTableEl).columns?.map((c) => ({ ...c })),
            } as CanvasElement)
          : next.type === 'totals_table'
            ? ({
                ...next,
                rows: (next as CanvasTotalsTableEl).rows?.map((r) => ({ ...r })),
              } as CanvasElement)
            : next
      replaceElements(
        (rows) => rows.map((row) => (row.id === saved.id ? saved : row)),
        true,
      )
    },
    [replaceElements, contentBoxMm.w, contentBoxMm.h],
  )

  const handleTableColumnsApply = useCallback(
    (updated: CanvasTableEl) => {
      const row = elementsRef.current.find((x) => x.id === updated.id)
      if (!row || row.type !== 'table') return
      updateElement({
        ...row,
        label: updated.label,
        showTitle: updated.showTitle,
        columns: updated.columns?.map((c) => ({ ...c })) ?? [],
      })
      setTableEditorId(null)
      showToast(L ? 'تم تطبيق أعمدة الجدول' : 'Table columns applied', 'success')
    },
    [updateElement, showToast, L],
  )

  const handleTotalsRowsApply = useCallback(
    (updated: CanvasTotalsTableEl) => {
      const row = elementsRef.current.find((x) => x.id === updated.id)
      if (!row || row.type !== 'totals_table') return
      const n = normalizeTotalsTableElement(updated)
      updateElement({
        ...row,
        label: n.label,
        showTitle: n.showTitle,
        showHeader: n.showHeader,
        anchorBelowItems: n.anchorBelowItems,
        labelColumnTitle: n.labelColumnTitle,
        valueColumnTitle: n.valueColumnTitle,
        rows: n.rows.map((r) => ({ ...r })),
      })
      setTotalsEditorId(null)
      showToast(L ? 'تم تطبيق جدول الإجماليات' : 'Totals table applied', 'success')
    },
    [updateElement, showToast, L],
  )

  const updateElementLayoutWithGroup = useCallback(
    (id: string, layout: CanvasElementLayout, recordHistory: boolean) => {
      const el = elements.find((x) => x.id === id)
      if (!el?.layout) {
        updateElementLayout(id, layout, recordHistory)
        return
      }
      const dx = layout.xMm - el.layout.xMm
      const dy = layout.yMm - el.layout.yMm
      const dw = layout.wMm - el.layout.wMm
      const dh = layout.hMm - el.layout.hMm
      const groupTransform =
        selectedIds.has(id) && selectedIds.size > 1 && (dx !== 0 || dy !== 0 || dw !== 0 || dh !== 0)

      if (groupTransform) {
        replaceElements(
          elements.map((row) => {
            if (!selectedIds.has(row.id) || row.locked || !row.layout) return row
            if (row.id === id) {
              return { ...row, layout: clampLayoutToContent(layout, contentBoxMm.w, contentBoxMm.h) }
            }
            return {
              ...row,
              layout: clampLayoutToContent(
                {
                  xMm: row.layout.xMm + dx,
                  yMm: row.layout.yMm + dy,
                  wMm: row.layout.wMm + dw,
                  hMm: row.layout.hMm + dh,
                },
                contentBoxMm.w,
                contentBoxMm.h,
              ),
            }
          }),
          recordHistory,
        )
      } else {
        updateElementLayout(id, layout, recordHistory)
      }
    },
    [elements, selectedIds, replaceElements, contentBoxMm.w, contentBoxMm.h, updateElementLayout],
  )

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (selectedIds.size === 0) return
      replaceElements(
        elements.map((row) => {
          if (!selectedIds.has(row.id) || row.locked || !row.layout) return row
          return {
            ...row,
            layout: clampLayoutToContent(
              { ...row.layout, xMm: row.layout.xMm + dx, yMm: row.layout.yMm + dy },
              contentBoxMm.w,
              contentBoxMm.h,
            ),
          }
        }),
        true,
      )
    },
    [selectedIds, elements, replaceElements, contentBoxMm.w, contentBoxMm.h],
  )

  const patchSelected = useCallback(
    (patch: Partial<CanvasElement>) => {
      if (selectedIds.size === 0) return
      replaceElements(
        elements.map((row) => (selectedIds.has(row.id) ? ({ ...row, ...patch } as CanvasElement) : row)),
        true,
      )
    },
    [selectedIds, elements, replaceElements],
  )

  const patchSelectedStyle = useCallback(
    (patch: Partial<CanvasElementStyle>) => {
      if (selectedIds.size === 0) return
      replaceElements(
        elements.map((row) => (selectedIds.has(row.id) ? patchElementStyle(row, patch) : row)),
        true,
      )
    },
    [selectedIds, elements, replaceElements],
  )

  const patchSelectedLayout = useCallback(
    (patch: Partial<CanvasElementLayout>) => {
      if (selectedIds.size === 0) return
      replaceElements(
        elements.map((row) => {
          if (!selectedIds.has(row.id) || !row.layout) return row
          return {
            ...row,
            layout: clampLayoutToContent({ ...row.layout, ...patch }, contentBoxMm.w, contentBoxMm.h),
          }
        }),
        true,
      )
    },
    [selectedIds, elements, replaceElements, contentBoxMm.w, contentBoxMm.h],
  )

  const removeSelected = useCallback(() => {
    if (selectedIds.size === 0) return
    replaceElements(
      elements.filter((x) => !selectedIds.has(x.id)),
      true,
    )
    setSelectedIds(new Set())
  }, [selectedIds, elements, replaceElements])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (selectedIds.size === 0) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        removeSelected()
        return
      }

      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
      const movable = elements.some((el) => selectedIds.has(el.id) && !el.locked && el.layout)
      if (!movable) return

      e.preventDefault()
      const step = e.shiftKey ? 5 : 1
      switch (e.key) {
        case 'ArrowUp':
          nudgeSelected(0, -step)
          break
        case 'ArrowDown':
          nudgeSelected(0, step)
          break
        case 'ArrowLeft':
          nudgeSelected(-step, 0)
          break
        case 'ArrowRight':
          nudgeSelected(step, 0)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds, elements, nudgeSelected, removeSelected])

  const handleAddVariable = useCallback(
    (code: string, label: string) => {
      const { w: cw, h: ch } = contentBoxMm
      const pair = createLabelValuePair(label, code, cw, ch, elements, null)
      replaceElements([...elements, pair.labelEl, pair.valueEl], true)
      setSelectedIds(new Set([pair.labelEl.id, pair.valueEl.id]))
    },
    [elements, replaceElements, contentBoxMm],
  )

  const handleAddElement = useCallback(
    (type: PaletteElementType) => {
      const base = createPaletteElement(type, L)
      const { w: cw, h: ch } = contentBoxMm
      const { w: dw, h: dh } = defaultSizeMmForElement(base, cw)
      const layout = nextStackLayoutMm(elements, base, cw, ch)
      const row: CanvasElement = { ...base, layout: clampLayoutToContent({ ...layout, wMm: dw, hMm: dh }, cw, ch), visible: true }
      replaceElements([...elements, row], true)
      setSelectedIds(selectOnly(row.id))
    },
    [elements, replaceElements, L, contentBoxMm],
  )

  const handleCopy = useCallback(() => {
    if (!primarySelectedId) return
    const el = elements.find((x) => x.id === primarySelectedId)
    if (el) clipboardRef.current = el
  }, [elements, primarySelectedId])

  const handlePaste = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip) return
    const row = cloneCanvasElement(clip)
    replaceElements(ensureCanvasLayouts([...elements, row], paperSize, orientation, margins), true)
    setSelectedIds(selectOnly(row.id))
  }, [elements, replaceElements, paperSize, orientation, margins])

  const buildSavePayload = useCallback(
    (saveName: string) => {
      const nextSettings = {
        ...settings,
        canvas_elements: ensureCanvasLayouts(elements, paperSize, orientation, margins),
        designer_show_grid: showGrid,
        designer_show_ruler: showRuler,
      }
      return {
        name: saveName.trim(),
        document_type: docType,
        paper_size: paperSize,
        orientation,
        margins,
        settings: nextSettings,
        sections,
        html_content: outputHtml,
        blocks_json: null as string | null,
      }
    },
    [settings, elements, paperSize, orientation, margins, showGrid, showRuler, docType, sections, outputHtml],
  )

  const saveUpdateMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(L ? 'أدخل اسماً للقالب' : 'Enter a template name')
      if (!Number.isFinite(numericId)) throw new Error(L ? 'احفظ القالب باسم أولاً' : 'Save the template with a name first')
      if (loaded?.is_system) throw new Error(L ? 'قالب النظام لا يُحفظ من هنا' : 'System template cannot be saved here')
      const payload = buildSavePayload(name)
      return updatePrintTemplate(tenantId, numericId, {
        name: payload.name,
        paper_size: payload.paper_size,
        orientation: payload.orientation,
        margins: payload.margins,
        settings: payload.settings,
        sections: payload.sections,
        html_content: payload.html_content,
        blocks_json: payload.blocks_json,
      })
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['print-templates', tenantId] })
      if (saved?.id) qc.invalidateQueries({ queryKey: ['print-template', tenantId, saved.id] })
      if (saved?.name) setName(saved.name)
      showToast(L ? 'تم حفظ التعديلات' : 'Changes saved', 'success')
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : L ? 'خطأ' : 'Error'
      showToast(msg, 'error')
    },
  })

  const saveAsMut = useMutation({
    mutationFn: async (asName: string) => {
      if (!asName.trim()) throw new Error(L ? 'أدخل اسماً للقالب' : 'Enter a template name')
      if (loaded?.is_system) throw new Error(L ? 'قالب النظام لا يُحفظ من هنا' : 'System template cannot be saved here')
      return createPrintTemplate(tenantId, buildSavePayload(asName))
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['print-templates', tenantId] })
      if (saved?.id) qc.invalidateQueries({ queryKey: ['print-template', tenantId, saved.id] })
      setSaveAsOpen(false)
      showToast(L ? `تم الحفظ باسم «${saved?.name ?? saveAsName}»` : `Saved as «${saved?.name ?? saveAsName}»`, 'success')
      if (saved?.id) {
        setName(saved.name)
        setLoaded(saved)
        navigate(`/settings/print-templates/designer/${saved.id}`, { replace: true })
      }
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : L ? 'خطأ' : 'Error'
      showToast(msg, 'error')
    },
  })

  const openSaveAsDialog = useCallback(() => {
    const base = name.trim()
    setSaveAsName(
      base
        ? Number.isFinite(numericId)
          ? `${base}${L ? ' — نسخة' : ' — copy'}`
          : base
        : '',
    )
    setSaveAsOpen(true)
  }, [name, numericId, L])

  const busy = oneLoading && Number.isFinite(numericId)
  const canUndo = canvasHist.past.length > 0
  const canRedo = canvasHist.future.length > 0
  if (!tenantId) {
    return <div className="p-6">{L ? 'اختر شركة' : 'Select a company'}</div>
  }

  return (
    <div
      className="flex flex-col min-h-[calc(100vh-7rem)] -mx-[clamp(6px,1.5vw,10px)] w-[calc(100%+2*clamp(6px,1.5vw,10px))] max-w-none bg-gray-100"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <PrintDesignerTopBar
        isRtl={isRtl}
        templateName={name}
        onNameChange={setName}
        nameReadOnly={!!loaded?.is_system}
        documentType={docType}
        documentTypeOptions={docTypeOptions}
        onDocumentTypeChange={onDocTypeChange}
        documentTypeLocked={Number.isFinite(numericId)}
        presets={presetOptions}
        presetId={presetId}
        onPresetChange={handlePresetChange}
        zoom={zoom}
        onZoomChange={setZoom}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onPreview={() => setShowPreview(true)}
        canSaveChanges={Number.isFinite(numericId)}
        onSaveChanges={() => saveUpdateMut.mutate()}
        onSaveAs={openSaveAsDialog}
        savingChanges={saveUpdateMut.isPending}
        savingAs={saveAsMut.isPending}
        saveDisabled={!!loaded?.is_system}
        onBack={() => navigate('/settings/print-templates')}
        labels={{
          back: L ? 'رجوع' : 'Back',
          presetsPlaceholder: L ? 'قوالب جاهزة — اختر' : 'Presets — pick one',
          preview: L ? 'معاينة' : 'Preview',
          saveChanges: L ? 'حفظ التعديلات' : 'Save changes',
          savingChanges: L ? 'جاري الحفظ…' : 'Saving…',
          saveAs: L ? 'حفظ باسم…' : 'Save as…',
          savingAs: L ? 'جاري الحفظ…' : 'Saving…',
        }}
      />

      <PrintDesignerSaveAsDialog
        open={saveAsOpen}
        isRtl={isRtl}
        langAr={L}
        value={saveAsName}
        onChange={setSaveAsName}
        saving={saveAsMut.isPending}
        onConfirm={() => saveAsMut.mutate(saveAsName)}
        onCancel={() => !saveAsMut.isPending && setSaveAsOpen(false)}
      />

      {busy ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">{L ? 'جاري التحميل…' : 'Loading…'}</div>
      ) : (
        <div
          className={`flex flex-1 min-h-0 overflow-hidden ${isRtl ? 'flex-row' : 'flex-row-reverse'}`}
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <PrintDesignerRightPanel
            isRtl={isRtl}
            langAr={L}
            documentType={docType}
            elements={elements}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onSelectAll={selectAllElements}
            onClearSelection={clearSelection}
            onRemove={removeElement}
            onUpdateElements={(next) => replaceElements(next, true)}
            onAddVariable={handleAddVariable}
            onAddElement={handleAddElement}
          />
          <PrintDesignerCanvas
            isRtl={isRtl}
            langAr={L}
            paperSize={paperSize}
            orientation={orientation}
            margins={margins}
            zoom={zoom}
            showGrid={showGrid}
            showRuler={showRuler}
            isDragOver={isDragOver}
            setIsDragOver={setIsDragOver}
            elements={elements}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onSelectByIds={selectByIds}
            onDrop={handleDrop}
            onUpdateElementLayout={updateElementLayoutWithGroup}
            fontFamily={fontFamily}
            fontSize={fontSize}
            textColor={textColor}
            accentColor={accent}
            formatBold={!!settings.format_bold}
            formatItalic={!!settings.format_italic}
            formatUnderline={!!settings.format_underline}
            onDeselect={clearSelection}
            onEditTableColumns={setTableEditorId}
            onEditTotalsRows={setTotalsEditorId}
            onZoomIn={() => setZoom((z) => clampZoom(z + 10))}
            onZoomOut={() => setZoom((z) => clampZoom(z - 10))}
            onZoomReset={() => setZoom(100)}
          />
          <PrintDesignerSidebar
            isRtl={isRtl}
            langAr={L}
            selectedElements={selectedElements}
            contentMaxW={contentBoxMm.w}
            contentMaxH={contentBoxMm.h}
            onUpdateElement={updateElement}
            onPatchSelected={patchSelected}
            onPatchSelectedStyle={patchSelectedStyle}
            onPatchSelectedLayout={patchSelectedLayout}
            onDeleteSelected={removeSelected}
            onDeselect={clearSelection}
            onNudgeSelected={nudgeSelected}
            onOpenTableColumns={setTableEditorId}
            onOpenTotalsRows={setTotalsEditorId}
            documentType={docType}
            readOnlyMeta={!!loaded?.is_system}
            paperSize={paperSize}
            onPaperSizeChange={setPaperSize}
            orientation={orientation}
            onOrientationChange={setOrientation}
            margins={margins}
            onMarginsChange={setMargins}
            sections={sections}
            onSectionsChange={setSections}
            settings={settings}
            onSettingsChange={setSettings}
            showGrid={showGrid}
            onShowGridChange={setShowGrid}
            showRuler={showRuler}
            onShowRulerChange={setShowRuler}
          />
        </div>
      )}

      {!busy && (
        <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-2 flex items-center gap-3" dir={isRtl ? 'rtl' : 'ltr'}>
          <label className="text-xs text-gray-500 shrink-0">{L ? 'قالب جاهز:' : 'Preset:'}</label>
          <select
            value={presetId}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="flex-1 max-w-md text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="">{L ? '— اختر قالب —' : '— Select preset —'}</option>
            {presetOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-gray-400 hidden sm:inline">
            {L ? 'اسحب العناصر · انقر + للمتغيرات · حرّك بحرية على الصفحة' : 'Drag elements · + for variables · free positioning'}
          </span>
        </div>
      )}

      <PrintDesignerTableColumnsDialog
        open={!!tableEditEl}
        table={tableEditEl}
        isRtl={isRtl}
        langAr={L}
        onClose={() => setTableEditorId(null)}
        onApply={handleTableColumnsApply}
      />

      <PrintDesignerTotalsRowsDialog
        open={!!totalsEditEl}
        table={totalsEditEl}
        isRtl={isRtl}
        langAr={L}
        onClose={() => setTotalsEditorId(null)}
        onApply={handleTotalsRowsApply}
      />

      {showPreview && (
        <TemplatePreviewModal
          open={showPreview}
          onClose={() => setShowPreview(false)}
          template={{
            id: Number.isFinite(numericId) ? numericId : 0,
            name: name.trim() || (L ? 'قالب بدون اسم' : 'Untitled template'),
            document_type: docType,
            paper_size: paperSize,
            orientation,
            margins,
            html_content: outputHtml,
            settings,
          }}
          allTemplates={(previewListData?.data ?? []).filter((t) => t.document_type === docType)}
          isRtl={isRtl}
          langAr={L}
        />
      )}
    </div>
  )
}
