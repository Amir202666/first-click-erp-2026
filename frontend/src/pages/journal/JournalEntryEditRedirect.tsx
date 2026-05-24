import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

/** تحويل /journal-entries/edit/:id → نفس شاشة الإنشاء مع ?id= */
export default function JournalEntryEditRedirect() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const n = Number(id)

  useEffect(() => {
    if (Number.isFinite(n) && n > 0) {
      navigate(`/journal-entries/create?id=${n}`, { replace: true })
    } else {
      navigate('/journal-entries', { replace: true })
    }
  }, [navigate, n])

  return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
    </div>
  )
}
