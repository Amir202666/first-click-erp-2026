import React, { useId } from 'react'
import type { PaymentMethod } from '../../types'
import { useLanguage } from '../../contexts/LanguageContext'

export interface PartialPaymentState {
  enabled: boolean
  amount: number
  method_id: number | null
  date: string
}

interface Props {
  grandTotal: number
  paymentMethods: PaymentMethod[]
  partial: PartialPaymentState
  onChange: (p: PartialPaymentState) => void
  disabled?: boolean
  /** يُمرَّر مثلاً `mt-2` عندما يلي مباشرةً بطاقة «بالآجل» لتقليل فراغ عمودي */
  wrapperClassName?: string
}

export const PartialPaymentSection: React.FC<Props> = ({
  grandTotal,
  paymentMethods,
  partial,
  onChange,
  disabled = false,
  wrapperClassName,
}) => {
  const { lang } = useLanguage()
  const partialCheckId = useId()
  const remaining = grandTotal - (partial.amount || 0)
  const pmRow = paymentMethods.find((m) => m.id === partial.method_id)
  const methodName = pmRow ? (lang === 'ar' ? pmRow.name : pmRow.name_en || pmRow.name || '') : ''

  return (
    <div className={wrapperClassName ?? 'mt-4'} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <label
        htmlFor={partialCheckId}
        className={`flex items-center gap-3 px-4 py-3 bg-amber-50 border-2 border-amber-200 rounded-xl cursor-pointer mb-4 select-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <input
          type="checkbox"
          id={partialCheckId}
          checked={partial.enabled}
          disabled={disabled}
          onChange={(e) => onChange({ ...partial, enabled: e.target.checked })}
          className="w-4 h-4 accent-amber-500 cursor-pointer flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-800">
            <span aria-hidden>💰 </span>
            {lang === 'ar' ? 'دفع جزئي (دفعة مقدمة)' : 'Partial payment (down payment)'}
          </p>
          <p className="text-[10px] text-amber-600 mt-0.5">
            {lang === 'ar'
              ? 'دفع جزء الآن والباقي في ذمة العميل'
              : 'Pay part now; the remainder stays on customer account'}
          </p>
        </div>
        {partial.enabled && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold flex-shrink-0">
            <span aria-hidden>📄 </span>
            {lang === 'ar' ? 'سند قبض' : 'Receipt'}
          </span>
        )}
      </label>

      {partial.enabled && !disabled && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
          <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wide mb-3">تفاصيل الدفعة المقدمة</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-[10px] text-slate-600 font-semibold block mb-1">
                المبلغ المدفوع الآن <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                max={grandTotal}
                value={partial.amount || ''}
                onChange={(e) => onChange({ ...partial, amount: parseFloat(e.target.value) || 0 })}
                placeholder="0.000"
                className="w-full border-2 border-amber-300 rounded-xl px-3 py-2.5 text-base font-bold text-emerald-700 focus:border-amber-400 focus:outline-none bg-white tabular-nums"
              />
              {partial.amount > grandTotal + 1e-9 && (
                <p className="text-[10px] text-red-500 mt-1">المبلغ أكبر من إجمالي الفاتورة</p>
              )}
            </div>

            <div>
              <label className="text-[10px] text-slate-600 font-semibold block mb-1">
                طريقة الدفع <span className="text-red-500">*</span>
              </label>
              <select
                value={partial.method_id ?? ''}
                onChange={(e) =>
                  onChange({ ...partial, method_id: e.target.value ? parseInt(e.target.value, 10) : null })
                }
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-amber-400 focus:outline-none"
              >
                <option value="">اختر طريقة الدفع</option>
                {paymentMethods
                  .filter((m) => m.is_active)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="text-[10px] text-slate-600 font-semibold block mb-1">تاريخ الدفع</label>
              <input
                type="date"
                value={partial.date}
                onChange={(e) => onChange({ ...partial, date: e.target.value })}
                className="w-full max-w-xs border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-white border border-amber-200 rounded-xl p-4">
            <p className="text-[11px] font-bold text-amber-800 mb-3">معاينة سند القبض</p>
            <div className="space-y-2">
              {(
                [
                  { label: 'إجمالي الفاتورة', value: grandTotal.toFixed(3), color: '' },
                  { label: 'المبلغ المحصّل', value: (partial.amount || 0).toFixed(3), color: 'text-emerald-600 font-bold' },
                  { label: 'طريقة الدفع', value: methodName || '—', color: '' },
                  {
                    label: 'الرصيد المتبقي في الذمة',
                    value: Math.max(0, remaining).toFixed(3),
                    color: remaining > 0.0005 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold',
                  },
                ] as { label: string; value: string; color: string }[]
              ).map((row) => (
                <div
                  key={row.label}
                  className="flex justify-between text-xs py-1.5 border-b border-amber-50 last:border-0 gap-2"
                >
                  <span className="text-slate-500">{row.label}</span>
                  <span className={`tabular-nums ${row.color || 'text-slate-800'}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
