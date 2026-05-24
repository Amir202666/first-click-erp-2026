import { useState } from 'react'
import type { Invoice, PaymentMethod } from '../../types'
import { toLocalDateString } from '../../utils/date'

export default function AddPaymentModal({
  invoice,
  paymentMethods,
  onClose,
  onSubmit,
  isLoading,
  fmt,
  t,
}: {
  invoice: Invoice
  paymentMethods: PaymentMethod[]
  onClose: () => void
  onSubmit: (data: { amount: number; date: string; payment_method_id: number | null; notes: string }) => void
  isLoading: boolean
  fmt: (n: number) => string
  t: { invoices: Record<string, string>; cancel: string; notes: string; save: string; msg?: { saving?: string } }
}) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => toLocalDateString(new Date()))
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const balance = Number(invoice.balance) || 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const num = parseFloat(amount)
    if (Number.isNaN(num) || num <= 0 || num > balance) return
    onSubmit({
      amount: num,
      date,
      payment_method_id: paymentMethodId,
      notes: notes.trim(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">{t.invoices.addPaymentTitle} — {invoice.number}</h3>
        <p className="text-sm text-slate-500 mb-4">
          {t.invoices.balance}: {fmt(balance)}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.invoices.paymentAmount}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={balance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.invoices.paymentDate}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.invoices.paymentMethod}</label>
            <select
              value={paymentMethodId ?? ''}
              onChange={(e) => setPaymentMethodId(e.target.value ? +e.target.value : null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
            >
              <option value="">—</option>
              {paymentMethods.map((pm) => (
                <option key={pm.id} value={pm.id}>{pm.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.notes}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm">
              {t.cancel}
            </button>
            <button type="submit" disabled={isLoading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-500 disabled:opacity-50">
              {isLoading ? t.msg?.saving : t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
