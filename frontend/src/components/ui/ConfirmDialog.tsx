import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { getModalContainer } from '../../utils/modalContainer'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  /** عرض زر الإلغاء */
  showCancel?: boolean
  /** تمييز نص الرسالة داخل صندوق تحذيري */
  highlightMessage?: boolean
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** طبقة فوق الشريط الجانبي (z-50) والمودالات العادية */
  overlayZClass?: string
}

export default function ConfirmDialog({
  title, message, confirmLabel, cancelLabel,
  variant = 'danger', isLoading = false, onConfirm, onCancel,
  showCancel = true,
  highlightMessage = false,
  overlayZClass,
}: ConfirmDialogProps) {
  const { t } = useLanguage()

  const confirmBtnClass = variant === 'danger'
    ? 'btn-danger flex-1'
    : 'flex-1 px-4 py-2.5 rounded-app text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 focus:ring-2 focus:ring-inset focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50'

  const iconClass = variant === 'danger' ? 'text-danger-600 bg-danger-50' : 'text-amber-600 bg-amber-100'

  const overlay = (
    <div
      className={`absolute inset-0 flex min-h-0 min-w-0 items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4 sm:p-6 pointer-events-auto ${overlayZClass ?? 'z-10'}`}
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="card-app shadow-2xl w-full max-w-sm overflow-hidden modal-content-padding"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="text-center">
          <div className={`w-14 h-14 rounded-app-lg ${iconClass} flex items-center justify-center mx-auto mb-4`}>
            <AlertTriangle size={28} />
          </div>
          <h3 id="confirm-dialog-title" className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
          {highlightMessage ? (
            <div className={`mt-3 rounded-lg border px-3 py-2 text-sm leading-relaxed text-right ${
              variant === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-800'
            }`}>
              {message}
            </div>
          ) : (
            <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
          )}
        </div>
        <div className="flex gap-2 mt-6">
          {showCancel && (
            <button type="button" onClick={onCancel} disabled={isLoading} className="btn-secondary flex-1">
              {cancelLabel || t.cancel}
            </button>
          )}
          <button type="button" onClick={onConfirm} disabled={isLoading} className={confirmBtnClass}>
            {isLoading ? t.loading : (confirmLabel || t.confirm)}
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(overlay, getModalContainer())
}
