import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Save } from 'lucide-react'
import { getModalContainer } from '../../../utils/modalContainer'

type Props = {
  open: boolean
  isRtl: boolean
  langAr: boolean
  value: string
  onChange: (v: string) => void
  saving: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function PrintDesignerSaveAsDialog({
  open,
  isRtl,
  langAr: L,
  value,
  onChange,
  saving,
  onConfirm,
  onCancel,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const overlay = (
    <div
      className="absolute inset-0 z-[60] flex min-h-0 items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4 pointer-events-auto"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5"
        dir={isRtl ? 'rtl' : 'ltr'}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-as-title"
      >
        <h3 id="save-as-title" className="text-base font-bold text-gray-900 mb-1">
          {L ? 'حفظ القالب باسم' : 'Save template as'}
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          {L ? 'سيُنشأ قالب جديد بالاسم الذي تدخله.' : 'A new template will be created with this name.'}
        </p>
        <label className="text-xs font-medium text-gray-600 block mb-1.5">
          {L ? 'اسم القالب' : 'Template name'}
        </label>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) onConfirm()
            if (e.key === 'Escape') onCancel()
          }}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
          placeholder={L ? 'مثال: فاتورة مبيعات — فرع الرياض' : 'e.g. Sales invoice — Riyadh branch'}
        />
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {L ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || !value.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            <Save size={15} />
            {saving ? (L ? 'جاري الحفظ…' : 'Saving…') : L ? 'حفظ' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, getModalContainer())
}
