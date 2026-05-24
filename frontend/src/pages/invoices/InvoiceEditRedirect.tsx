import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { fetchInvoice } from '../../api/tenant'

/**
 * يحوّل الروابط القديمة /invoices/edit/:id إلى نفس واجهة الإنشاء مع ?id= لتوحيد التجربة.
 */
export default function InvoiceEditRedirect() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? 0
  const invoiceId = Number(id)

  const { data, isError } = useQuery({
    queryKey: ['invoice', tenantId, invoiceId],
    queryFn: () => fetchInvoice(tenantId, invoiceId),
    enabled: !!tenantId && Number.isFinite(invoiceId) && invoiceId > 0,
  })

  useEffect(() => {
    if (!data?.type) return
    navigate(`/invoices/create?type=${data.type}&id=${invoiceId}`, { replace: true })
  }, [data, navigate, invoiceId])

  if (!tenantId || !Number.isFinite(invoiceId) || invoiceId <= 0) {
    return (
      <div className="p-6 text-sm text-slate-600">
        معرّف الفاتورة غير صالح.
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-6 text-sm text-red-600">
        تعذّر تحميل الفاتورة.
      </div>
    )
  }

  return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
    </div>
  )
}
