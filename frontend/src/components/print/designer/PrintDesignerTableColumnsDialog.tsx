import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Columns3, GripVertical, Trash2, X } from 'lucide-react'
import type { CanvasTableColumn, CanvasTableEl } from '../../../utils/printDesignerTypes'
import {
  CANVAS_TABLE_COLUMN_CATALOG,
  catalogEntry,
  columnField,
  createColumnFromCatalog,
  normalizeTableElement,
} from '../../../utils/printDesignerTable'

export type TableColumnsModalProps = {
  open: boolean
  table: CanvasTableEl | null
  isRtl: boolean
  langAr: boolean
  onApply: (table: CanvasTableEl) => void
  onClose: () => void
}

export default function PrintDesignerTableColumnsDialog({
  open,
  table,
  isRtl,
  langAr: L,
  onApply,
  onClose,
}: TableColumnsModalProps) {
  const [localColumns, setLocalColumns] = useState<CanvasTableColumn[]>([])
  const [localTitle, setLocalTitle] = useState('')
  const [showTitle, setShowTitle] = useState(true)
  const [addKey, setAddKey] = useState('')
  const initializedForId = useRef<string | null>(null)

  useEffect(() => {
    if (!open || !table) {
      if (!open) initializedForId.current = null
      return
    }
    if (initializedForId.current === table.id) return
    initializedForId.current = table.id
    const n = normalizeTableElement(table)
    setLocalColumns((n.columns ?? []).map((c) => ({ ...c })))
    setLocalTitle(n.label ?? '')
    setShowTitle(n.showTitle !== false)
    setAddKey('')
  }, [open, table])

  const availableToAdd = useMemo(() => {
    const used = new Set(localColumns.map((c) => c.key))
    return CANVAS_TABLE_COLUMN_CATALOG.filter((c) => !used.has(c.key))
  }, [localColumns])

  const updateColumn = useCallback((index: number, patch: Partial<CanvasTableColumn>) => {
    setLocalColumns((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }, [])

  const moveColumn = useCallback((index: number, direction: 'up' | 'down') => {
    setLocalColumns((prev) => {
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= prev.length) return prev
      const copy = [...prev]
      ;[copy[index], copy[target]] = [copy[target], copy[index]]
      return copy
    })
  }, [])

  const removeColumn = useCallback((index: number) => {
    setLocalColumns((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }, [])

  const addColumn = useCallback(
    (key: string) => {
      const col = createColumnFromCatalog(key, L)
      if (!col) return
      setLocalColumns((prev) => [...prev, col])
      setAddKey('')
    },
    [L],
  )

  const handleApply = useCallback(() => {
    if (!table || localColumns.length === 0) return
    onApply({
      ...table,
      label: localTitle.trim() || table.label,
      showTitle,
      columns: localColumns.map((c) => ({ ...c })),
    })
  }, [table, localColumns, localTitle, showTitle, onApply])

  const handleCancel = useCallback(() => {
    onClose()
  }, [onClose])

  if (!open || !table) return null

  return (
    <div
      className="fixed inset-0 flex min-h-0 items-center justify-center bg-slate-900/55 backdrop-blur-[2px] p-4"
      style={{ zIndex: 2147483646, pointerEvents: 'auto' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleCancel()
      }}
      role="presentation"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        dir={isRtl ? 'rtl' : 'ltr'}
        style={{ pointerEvents: 'auto' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-cols-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 bg-gradient-to-l from-indigo-50 to-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Columns3 size={18} />
            </div>
            <div className="min-w-0">
              <h3 id="table-cols-title" className="text-base font-bold text-gray-900 truncate">
                {L ? 'أعمدة الجدول' : 'Table columns'}
              </h3>
              <p className="text-[11px] text-gray-500 truncate">
                {L ? 'اختر الأعمدة ورتّبها — تُطبَّق التنسيقات على كل الأعمدة' : 'Choose columns and order — styles apply to all columns'}
              </p>
            </div>
          </div>
          <button type="button" onClick={handleCancel} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">{L ? 'عنوان الجدول' : 'Table title'}</span>
              <input
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 mt-5 sm:mt-6 cursor-pointer">
              <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} className="rounded" />
              <span className="text-sm text-gray-700">{L ? 'إظهار العنوان فوق الجدول' : 'Show title above table'}</span>
            </label>
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-3 py-2 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase">
              <span />
              <span>{L ? 'عنوان العمود' : 'Column label'}</span>
              <span className="w-14 text-center">{L ? 'العرض %' : 'Width %'}</span>
              <span className="w-20 text-center">{L ? 'محاذاة' : 'Align'}</span>
              <span className="w-8" />
            </div>
            <ul className="divide-y divide-gray-100">
              {localColumns.map((col, idx) => (
                <li key={`${col.key}-${idx}`} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center px-3 py-2.5 bg-white hover:bg-slate-50/80">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveColumn(idx, 'up')}
                      className="p-0.5 text-gray-400 hover:text-indigo-600 disabled:opacity-30"
                      aria-label="up"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <GripVertical size={14} className="text-gray-300 mx-auto" aria-hidden />
                    <button
                      type="button"
                      disabled={idx === localColumns.length - 1}
                      onClick={() => moveColumn(idx, 'down')}
                      className="p-0.5 text-gray-400 hover:text-indigo-600 disabled:opacity-30"
                      aria-label="down"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                  <div className="min-w-0">
                    <input
                      value={col.label}
                      onChange={(e) => updateColumn(idx, { label: e.target.value })}
                      className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5"
                    />
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate" dir="ltr">
                      {columnField(col)}
                    </p>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={col.widthPercent ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '')
                      updateColumn(idx, { widthPercent: raw ? Number(raw) : undefined })
                    }}
                    className="w-14 text-xs border border-gray-200 rounded-md px-1 py-1.5 text-center"
                  />
                  <select
                    value={col.align ?? catalogEntry(col.key)?.defaultAlign ?? 'right'}
                    onChange={(e) => updateColumn(idx, { align: e.target.value as CanvasTableColumn['align'] })}
                    className="w-20 text-xs border border-gray-200 rounded-md px-1 py-1.5"
                  >
                    <option value="right">{L ? 'يمين' : 'Right'}</option>
                    <option value="center">{L ? 'وسط' : 'Center'}</option>
                    <option value="left">{L ? 'يسار' : 'Left'}</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeColumn(idx)}
                    disabled={localColumns.length <= 1}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-md disabled:opacity-30"
                    title={L ? 'حذف العمود' : 'Remove column'}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {availableToAdd.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={addKey}
                onChange={(e) => {
                  const k = e.target.value
                  if (k) addColumn(k)
                }}
                className="flex-1 min-w-[140px] text-sm border border-dashed border-indigo-300 rounded-lg px-3 py-2 bg-indigo-50/50 text-indigo-900"
              >
                <option value="">{L ? '+ إضافة عمود…' : '+ Add column…'}</option>
                {availableToAdd.map((c) => (
                  <option key={c.key} value={c.key}>
                    {L ? c.labelAr : c.labelEn}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 overflow-x-auto">
            <p className="text-[10px] text-gray-500 mb-2">{L ? 'معاينة الرأس' : 'Header preview'}</p>
            <table className="w-full border-collapse text-xs min-w-[280px]">
              <thead>
                <tr className="bg-indigo-600 text-white">
                  {localColumns.map((c) => (
                    <th key={c.key} className="px-2 py-1.5 font-semibold" style={{ textAlign: c.align ?? 'right' }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white border-t border-gray-200">
                  {localColumns.map((c) => (
                    <td key={c.key} className="px-2 py-1 text-gray-500 font-mono text-[10px]" style={{ textAlign: c.align ?? 'right' }} dir="ltr">
                      {columnField(c)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div
          className="flex gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50/80 shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-white"
          >
            {L ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleApply()
            }}
            disabled={localColumns.length === 0}
            className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {L ? 'تطبيق' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
