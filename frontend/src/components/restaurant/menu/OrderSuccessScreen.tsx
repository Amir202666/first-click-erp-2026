import { CheckCircle2 } from 'lucide-react'
import type { Lang } from '../../../types/menu'

interface OrderSuccessScreenProps {
  lang: Lang
  orderNumber: string
  estimatedMinutes: number
  primaryColor: string
  onNewOrder: () => void
}

export default function OrderSuccessScreen({
  lang,
  orderNumber,
  estimatedMinutes,
  primaryColor,
  onNewOrder,
}: OrderSuccessScreenProps) {
  const isAr = lang === 'ar'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 py-12 text-center">
      <CheckCircle2 className="h-20 w-20 text-emerald-500" style={{ color: primaryColor }} />
      <h1 className="mt-6 text-2xl text-neutral-900">
        {isAr ? 'تم إرسال طلبك!' : 'Order placed!'}
      </h1>
      <p className="mt-2 text-neutral-600">
        {isAr ? 'رقم الطلب' : 'Order number'}:{' '}
        <span className="text-neutral-900">{orderNumber}</span>
      </p>
      <p className="mt-1 text-neutral-600">
        {isAr
          ? `الوقت المتوقع للتحضير: ${estimatedMinutes} دقيقة`
          : `Estimated prep time: ${estimatedMinutes} min`}
      </p>
      <button
        type="button"
        onClick={onNewOrder}
        className="mt-8 rounded-app px-8 py-3 text-sm text-white shadow-md"
        style={{ backgroundColor: primaryColor }}
      >
        {isAr ? 'طلب جديد' : 'New order'}
      </button>
    </div>
  )
}
