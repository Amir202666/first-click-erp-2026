import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

interface ErrorBoundaryFallbackProps {
  backHref?: string
  backLabel?: string
  message?: string
  isRtl?: boolean
}

export function ErrorBoundaryFallback({
  backHref = '/invoices/sales',
  backLabel = 'العودة',
  message,
  isRtl = true,
}: ErrorBoundaryFallbackProps) {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center p-6 bg-slate-50">
      <p className="text-slate-600 mb-4 text-center">
        {message ?? 'حدث خطأ غير متوقع. يرجى العودة والمحاولة مرة أخرى.'}
      </p>
      <Link
        to={backHref}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500"
      >
        <ArrowRight size={18} className={isRtl ? 'rotate-180' : ''} />
        {backLabel}
      </Link>
    </div>
  )
}
