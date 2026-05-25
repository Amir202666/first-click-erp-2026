import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface DangerConfirmDialogProps {
  open: boolean
  tenantName: string
  totalRecords: number
  isAr: boolean
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function DangerConfirmDialog({
  open,
  tenantName,
  totalRecords,
  isAr,
  loading,
  onCancel,
  onConfirm,
}: DangerConfirmDialogProps) {
  const [nameInput, setNameInput] = useState('')
  const [confirmInput, setConfirmInput] = useState('')

  if (!open) return null

  const canConfirm =
    nameInput.trim() === tenantName && confirmInput.trim() === (isAr ? 'تصفير' : 'reset')

  const resetWord = isAr ? 'تصفير' : 'reset'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-lg rounded-xl border border-red-200 bg-white shadow-xl dark:border-red-900 dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-5 py-4 dark:border-red-900 dark:bg-red-950/40">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <h3 className="flex-1 text-lg font-semibold text-red-900 dark:text-red-100">
            {isAr ? 'تأكيد التصفير النهائي' : 'Final reset confirmation'}
          </h3>
          <button type="button" onClick={onCancel} className="rounded p-1 hover:bg-red-100 dark:hover:bg-red-900/50">
            <X className="h-5 w-5 text-red-700" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {isAr
              ? `أنت على وشك حذف ${totalRecords.toLocaleString('ar-EG')} سجل من بيانات «${tenantName}».`
              : `You are about to delete ${totalRecords.toLocaleString()} records from «${tenantName}».`}
          </p>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {isAr ? `اكتب اسم العميل بالضبط: «${tenantName}»` : `Type the tenant name exactly: «${tenantName}»`}
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              dir="auto"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {isAr ? `ثم اكتب كلمة «${resetWord}»:` : `Then type «${resetWord}»:`}
            </label>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              dir="auto"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={!canConfirm || loading}
              onClick={onConfirm}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? (isAr ? 'جاري التنفيذ...' : 'Executing...') : isAr ? 'تنفيذ التصفير' : 'Execute reset'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
