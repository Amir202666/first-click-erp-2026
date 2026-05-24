import { AlertTriangle } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'

interface AlertDialogProps {
  title: string
  message: string
  confirmLabel?: string
  variant?: 'warning' | 'info' | 'error'
  onClose: () => void
}

export default function AlertDialog({
  title,
  message,
  confirmLabel,
  variant = 'warning',
  onClose,
}: AlertDialogProps) {
  const { isRtl } = useLanguage()
  const styles = {
    warning: {
      icon: 'text-amber-600 bg-amber-100',
      btn: 'bg-amber-600 hover:bg-amber-500 text-white focus:ring-amber-500',
    },
    info: {
      icon: 'text-blue-600 bg-blue-100',
      btn: 'bg-primary-600 hover:bg-primary-500 text-white focus:ring-primary-500',
    },
    error: {
      icon: 'text-red-600 bg-red-100',
      btn: 'bg-red-600 hover:bg-red-500 text-white focus:ring-red-500',
    },
  }
  const s = styles[variant]

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-dialog-title"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="p-6 sm:p-8">
          <div className={`w-14 h-14 rounded-xl ${s.icon} flex items-center justify-center mb-5`}>
            <AlertTriangle size={28} />
          </div>
          <h2 id="alert-dialog-title" className="text-lg font-bold text-slate-900 mb-2">
            {title}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
            {message}
          </p>
        </div>
        <div className="px-6 sm:px-8 pb-6 sm:pb-8">
          <button
            type="button"
            onClick={onClose}
            className={`w-full py-3 px-4 rounded-xl text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-offset-2 ${s.btn}`}
          >
            {confirmLabel ?? (isRtl ? 'حسناً' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  )
}
