import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { RestaurantReservation, RestaurantSection, RestaurantTableFloor } from '../../../types'
import { getLocalizedName } from '../../../utils/localizedName'

export type ReservationFormValues = {
  id?: number
  customer_name: string
  customer_phone: string
  reservation_date: string
  reservation_time: string
  guests_count: number
  table_id: number | null
  section: string
  status: 'pending' | 'confirmed'
  notes: string
}

type Props = {
  open: boolean
  lang: 'ar' | 'en'
  sections: RestaurantSection[]
  availableTables: RestaurantTableFloor[]
  initial?: Partial<ReservationFormValues>
  presetTableId?: number | null
  saving?: boolean
  onClose: () => void
  onSubmit: (values: ReservationFormValues) => void
}

const emptyForm = (): ReservationFormValues => ({
  customer_name: '',
  customer_phone: '',
  reservation_date: new Date().toISOString().slice(0, 10),
  reservation_time: '19:00',
  guests_count: 2,
  table_id: null,
  section: '',
  status: 'confirmed',
  notes: '',
})

export default function ReservationFormModal({
  open,
  lang,
  sections,
  availableTables,
  initial,
  presetTableId,
  saving,
  onClose,
  onSubmit,
}: Props) {
  const isAr = lang === 'ar'
  const [form, setForm] = useState<ReservationFormValues>(emptyForm)

  useEffect(() => {
    if (!open) return
    setForm({
      ...emptyForm(),
      ...initial,
      table_id: presetTableId ?? initial?.table_id ?? null,
    })
  }, [open, initial, presetTableId])

  const tablesForPicker = useMemo(() => {
    return availableTables.filter(
      (t) =>
        t.display_status === 'available' ||
        (form.table_id != null && t.id === form.table_id),
    )
  }, [availableTables, form.table_id])

  if (!open) return null

  const inputCls =
    'w-full h-10 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl my-4"
        onClick={(e) => e.stopPropagation()}
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {form.id ? (isAr ? 'تعديل حجز' : 'Edit reservation') : isAr ? 'حجز جديد' : 'New reservation'}
          </h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <X size={18} />
          </button>
        </div>
        <form
          className="p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit(form)
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'اسم العميل' : 'Customer name'} *
              </label>
              <input
                required
                value={form.customer_name}
                onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'رقم الجوال' : 'Phone'}
              </label>
              <input
                type="tel"
                dir="ltr"
                value={form.customer_phone}
                onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'التاريخ' : 'Date'} *
              </label>
              <input
                type="date"
                required
                value={form.reservation_date}
                onChange={(e) => setForm((f) => ({ ...f, reservation_date: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'الوقت' : 'Time'} *
              </label>
              <input
                type="time"
                required
                value={form.reservation_time}
                onChange={(e) => setForm((f) => ({ ...f, reservation_time: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'عدد الأشخاص' : 'Guests'}
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={form.guests_count}
                onChange={(e) => setForm((f) => ({ ...f, guests_count: Number(e.target.value) || 1 }))}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {isAr ? 'القسم' : 'Section'}
            </label>
            <select
              value={form.section}
              onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
              className={inputCls}
            >
              <option value="">{isAr ? '— الكل —' : '— All —'}</option>
              {sections.map((s) => (
                <option key={s.id} value={getLocalizedName(s, lang)}>
                  {getLocalizedName(s, lang)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              {isAr ? 'اختر الطاولة' : 'Select table'}
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-40 overflow-y-auto">
              {tablesForPicker.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, table_id: t.id, section: t.section ?? f.section }))}
                  className={`rounded-lg border-2 px-2 py-2 text-sm font-medium transition-colors ${
                    form.table_id === t.id
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30'
                      : 'border-slate-200 dark:border-slate-600 hover:border-primary-300'
                  }`}
                >
                  {t.number}
                  <div className="text-[10px] text-slate-500">👤 {t.capacity}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {isAr ? 'ملاحظات' : 'Notes'}
            </label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder={isAr ? 'حساسية غذائية، مناسبة...' : 'Allergies, occasion...'}
              className={`${inputCls} h-auto py-2`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {isAr ? 'حالة الحجز' : 'Status'}
            </label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'pending' | 'confirmed' }))}
              className={inputCls}
            >
              <option value="confirmed">{isAr ? 'مؤكدة' : 'Confirmed'}</option>
              <option value="pending">{isAr ? 'قيد الانتظار' : 'Pending'}</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-primary-600 text-white py-2.5 text-sm font-medium hover:bg-primary-500 disabled:opacity-50">
              💾 {saving ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : isAr ? 'حفظ الحجز' : 'Save reservation'}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 dark:border-slate-600 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
