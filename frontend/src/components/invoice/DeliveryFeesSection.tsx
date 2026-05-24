import React, { useState } from 'react'

export interface DeliveryFeeLine {
  id: string
  type: string
  label: string
  amount: number
  account_id?: number | null
}

const FEE_TYPES = [
  { value: 'delivery', label: 'رسوم توصيل' },
  { value: 'shipping', label: 'رسوم شحن' },
  { value: 'transport', label: 'رسوم نقل' },
  { value: 'handling', label: 'رسوم مناولة' },
  { value: 'insurance', label: 'رسوم تأمين' },
  { value: 'custom', label: 'أخرى' },
]

interface Props {
  fees: DeliveryFeeLine[]
  onChange: (fees: DeliveryFeeLine[]) => void
  /** داخل صندوق الإجماليات بين الخصم والوعاء الضريبي */
  variant?: 'standalone' | 'embedded'
}

export const DeliveryFeesSection: React.FC<Props> = ({ fees, onChange, variant = 'standalone' }) => {
  const [feeType, setFeeType] = useState('')
  const [feeAmount, setFeeAmount] = useState('')

  const addFee = () => {
    if (!feeType || !parseFloat(feeAmount)) return
    const typeLabel = FEE_TYPES.find((t) => t.value === feeType)?.label ?? 'رسوم أخرى'
    onChange([
      ...fees,
      {
        id: `fee-${Date.now()}`,
        type: feeType,
        label: typeLabel,
        amount: parseFloat(feeAmount),
      },
    ])
    setFeeType('')
    setFeeAmount('')
  }

  const removeFee = (id: string) => onChange(fees.filter((f) => f.id !== id))

  const additionsTotal = Math.round(fees.reduce((s, f) => s + f.amount, 0) * 1000) / 1000

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p
            className={
              variant === 'embedded'
                ? 'text-xs font-semibold text-slate-600'
                : 'text-[11px] font-bold text-slate-500 uppercase tracking-wide'
            }
          >
            الإضافات
          </p>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
            إيراد إضافي
          </span>
        </div>
        {fees.length > 0 && (
          <span className="text-xs font-bold text-emerald-700 tabular-nums">+ {additionsTotal.toFixed(3)}</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-3 items-end mb-2">
        <div>
          <label className="text-[10px] text-slate-500 font-semibold block mb-1">نوع الرسوم</label>
          <select
            value={feeType}
            onChange={(e) => setFeeType(e.target.value)}
            className={`w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none ${
              variant === 'embedded' ? 'bg-white' : 'bg-slate-50'
            }`}
          >
            <option value="">اختر نوع الرسوم</option>
            {FEE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-slate-500 font-semibold block mb-1">المبلغ</label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={feeAmount}
            onChange={(e) => setFeeAmount(e.target.value)}
            placeholder="0.000"
            className={`w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none tabular-nums ${
              variant === 'embedded' ? 'bg-white' : 'bg-slate-50'
            }`}
          />
        </div>
        <button
          type="button"
          onClick={addFee}
          disabled={!feeType || !parseFloat(feeAmount)}
          className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + إضافة
        </button>
      </div>

      {fees.length > 0 && (
        <div className="space-y-2">
          {fees.map((fee) => (
            <div
              key={fee.id}
              className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl"
            >
              <span className="text-xs sm:text-sm font-medium text-slate-800 flex-1 min-w-0">{fee.label}</span>
              <span className="text-xs sm:text-sm font-bold text-emerald-600 tabular-nums shrink-0">
                + {fee.amount.toFixed(3)}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0">
                إيراد
              </span>
              <button
                type="button"
                onClick={() => removeFee(fee.id)}
                className="w-7 h-7 rounded-lg bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 flex items-center justify-center text-xs transition-colors shrink-0"
                aria-label="حذف"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )

  if (variant === 'embedded') {
    return (
      <div className="w-full py-2" dir="rtl">
        {inner}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-4" dir="rtl">
      {inner}
    </div>
  )
}
