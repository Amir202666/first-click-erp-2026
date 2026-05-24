import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical, X } from 'lucide-react'
import type { CanvasTotalsRow, CanvasTotalsTableEl } from '../../../utils/printDesignerTypes'
import { DEFAULT_TOTALS_TABLE_ROWS, normalizeTotalsTableElement } from '../../../utils/printDesignerTotalsTable'

export type TotalsRowsModalProps = {
  open: boolean
  table: CanvasTotalsTableEl | null
  isRtl: boolean
  langAr: boolean
  onApply: (table: CanvasTotalsTableEl) => void
  onClose: () => void
}

export default function PrintDesignerTotalsRowsDialog({
  open,
  table,
  isRtl,
  langAr: L,
  onApply,
  onClose,
}: TotalsRowsModalProps) {
  const [localRows, setLocalRows] = useState<CanvasTotalsRow[]>([])
  const [localTitle, setLocalTitle] = useState('')
  const [showTitle, setShowTitle] = useState(false)
  const [showHeader, setShowHeader] = useState(true)
  const [anchorBelowItems, setAnchorBelowItems] = useState(true)
  const [labelCol, setLabelCol] = useState('البيان')
  const [valueCol, setValueCol] = useState('القيمة')
  const initializedForId = useRef<string | null>(null)

  useEffect(() => {
    if (!open || !table) {
      if (!open) initializedForId.current = null
      return
    }
    if (initializedForId.current === table.id) return
    initializedForId.current = table.id
    const n = normalizeTotalsTableElement(table)
    setLocalRows((n.rows ?? []).map((r) => ({ ...r })))
    setLocalTitle(n.label ?? '')
    setShowTitle(n.showTitle === true)
    setShowHeader(n.showHeader !== false)
    setAnchorBelowItems(n.anchorBelowItems !== false)
    setLabelCol(n.labelColumnTitle ?? 'البيان')
    setValueCol(n.valueColumnTitle ?? 'القيمة')
  }, [open, table])

  const updateRow = useCallback((index: number, patch: Partial<CanvasTotalsRow>) => {
    setLocalRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }, [])

  const moveRow = useCallback((index: number, direction: 'up' | 'down') => {
    setLocalRows((prev) => {
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= prev.length) return prev
      const copy = [...prev]
      ;[copy[index], copy[target]] = [copy[target], copy[index]]
      return copy
    })
  }, [])

  const removeRow = useCallback((index: number) => {
    setLocalRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }, [])

  const addRow = useCallback(() => {
    setLocalRows((prev) => [
      ...prev,
      { key: `row_${prev.length + 1}`, label: L ? 'بند جديد' : 'New row', field: '{{formatNumber 0}}', visible: true },
    ])
  }, [L])

  const resetDefaults = useCallback(() => {
    setLocalRows(DEFAULT_TOTALS_TABLE_ROWS.map((r) => ({ ...r })))
  }, [])

  const handleApply = () => {
    if (!table) return
    onApply({
      ...table,
      label: localTitle,
      rows: localRows,
      showTitle,
      showHeader,
      anchorBelowItems,
      labelColumnTitle: labelCol,
      valueColumnTitle: valueCol,
    })
    onClose()
  }

  if (!open || !table) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{L ? 'إعداد جدول الإجماليات' : 'Totals table settings'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">{L ? 'عمود البيان' : 'Label column'}</label>
              <input value={labelCol} onChange={(e) => setLabelCol(e.target.value)} className="w-full text-xs border rounded-lg px-2 py-1.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">{L ? 'عمود القيمة' : 'Value column'}</label>
              <input value={valueCol} onChange={(e) => setValueCol(e.target.value)} className="w-full text-xs border rounded-lg px-2 py-1.5" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={showHeader} onChange={(e) => setShowHeader(e.target.checked)} />
            {L ? 'إظهار ترويسة الجدول (البيان / القيمة)' : 'Show table header'}
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={anchorBelowItems} onChange={(e) => setAnchorBelowItems(e.target.checked)} />
            {L ? 'ملاصق لجدول الأصناف (موصى به)' : 'Anchor below items table (recommended)'}
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} />
            {L ? 'عنوان فوق الجدول' : 'Title above table'}
          </label>
          {showTitle && (
            <input
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              className="w-full text-xs border rounded-lg px-2 py-1.5"
              placeholder={L ? 'عنوان الجدول' : 'Table title'}
            />
          )}

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-gray-600">{L ? 'صفوف الإجماليات' : 'Total rows'}</p>
            <div className="flex gap-2">
              <button type="button" onClick={resetDefaults} className="text-[10px] px-2 py-1 border rounded-lg hover:bg-gray-50">
                {L ? 'افتراضي' : 'Defaults'}
              </button>
              <button type="button" onClick={addRow} className="text-[10px] px-2 py-1 bg-teal-600 text-white rounded-lg">
                + {L ? 'صف' : 'Row'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {localRows.map((row, index) => (
              <div key={`${row.key}-${index}`} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50/50">
                <div className="flex items-center gap-2">
                  <GripVertical size={14} className="text-gray-400 shrink-0" />
                  <label className="flex items-center gap-1.5 text-xs shrink-0">
                    <input
                      type="checkbox"
                      checked={row.visible !== false}
                      onChange={(e) => updateRow(index, { visible: e.target.checked })}
                    />
                    {L ? 'ظاهر' : 'Visible'}
                  </label>
                  <div className="flex gap-1 ms-auto">
                    <button type="button" onClick={() => moveRow(index, 'up')} className="p-1 border rounded hover:bg-white">
                      <ChevronUp size={14} />
                    </button>
                    <button type="button" onClick={() => moveRow(index, 'down')} className="p-1 border rounded hover:bg-white">
                      <ChevronDown size={14} />
                    </button>
                    <button type="button" onClick={() => removeRow(index)} className="p-1 border rounded text-red-500 hover:bg-red-50 text-xs">
                      ✕
                    </button>
                  </div>
                </div>
                <input
                  value={row.label}
                  onChange={(e) => updateRow(index, { label: e.target.value })}
                  className="w-full text-xs border rounded-lg px-2 py-1.5"
                  placeholder={L ? 'التسمية' : 'Label'}
                />
                <input
                  value={row.field}
                  onChange={(e) => updateRow(index, { field: e.target.value })}
                  className="w-full text-xs border rounded-lg px-2 py-1.5 font-mono"
                  dir="ltr"
                  placeholder="{{formatNumber subtotal}}"
                />
                <label className="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <input
                    type="checkbox"
                    checked={!!row.hideWhenZero}
                    onChange={(e) => updateRow(index, { hideWhenZero: e.target.checked })}
                  />
                  {L ? 'إخفاء إذا كانت القيمة صفراً' : 'Hide when value is zero'}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button type="button" onClick={handleApply} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">
            {L ? 'تطبيق' : 'Apply'}
          </button>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">
            {L ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
