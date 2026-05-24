import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'
export type ToastPosition = 'top' | 'center'

interface ToastProps {
  message: string
  type: ToastType
  onClose: () => void
  duration?: number
  position?: ToastPosition
  dir?: 'rtl' | 'ltr'
}

const icons: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const styles: Record<ToastType, string> = {
  success: 'bg-emerald-50 border-emerald-300 text-emerald-800',
  error: 'bg-red-50 border-red-300 text-red-800',
  warning: 'bg-amber-50 border-amber-300 text-amber-800',
  info: 'bg-blue-50 border-blue-300 text-blue-800',
}

const iconStyles: Record<ToastType, string> = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
}

export default function Toast({ message, type, onClose, duration = 4000, position = 'top', dir = 'ltr' }: ToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  const Icon = icons[type]

  const baseToast = (
    <div
      dir={dir}
      className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border shadow-lg min-w-[320px] max-w-[560px] ${styles[type]} ${
        dir === 'rtl' ? 'flex-row-reverse' : ''
      }`}
    >
      <Icon size={20} className={`shrink-0 ${iconStyles[type]}`} />
      <span className={`text-sm font-medium flex-1 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{message}</span>
      <button onClick={() => { setVisible(false); setTimeout(onClose, 300) }} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
        <X size={16} />
      </button>
    </div>
  )

  return (
    position === 'center' ? (
      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => { setVisible(false); setTimeout(onClose, 300) }}
      >
        <div className="absolute inset-0 bg-black/20" />
        <div
          className={`relative transition-all duration-300 ${visible ? 'translate-y-0 scale-100' : 'translate-y-2 scale-[0.98]'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {baseToast}
        </div>
      </div>
    ) : (
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        {baseToast}
      </div>
    )
  )
}
