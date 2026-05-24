import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

/** تحويل /payments/:id/edit → /payments/create-voucher?id= (نفس نموذج الإنشاء) */
export default function PaymentVoucherEditRedirect() {
  const { voucherId } = useParams<{ voucherId: string }>()
  const navigate = useNavigate()
  const n = Number(voucherId)

  useEffect(() => {
    if (Number.isFinite(n) && n > 0) {
      navigate(`/payments/create-voucher?id=${n}`, { replace: true })
    } else {
      navigate('/payments', { replace: true })
    }
  }, [navigate, n])

  return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
    </div>
  )
}
