import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import HrPageShell from './HrPageShell'
import { getHrSettingsForTenant, updateHrSettings } from '../../api/hr'
import { Save } from 'lucide-react'

export default function HrSettingsPage() {
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0

  const { data } = useQuery({
    queryKey: ['hr', 'settings', tenantId],
    queryFn: () => getHrSettingsForTenant(tenantId),
    enabled: !!tenantId,
  })

  const initial = useMemo(
    () =>
      data ?? {
        hr_shift_start: '09:00',
        hr_shift_end: '17:00',
        hr_weekend_days: [5, 6],
        hr_late_grace_minutes: 0,
        hr_late_deduction_per_minute: 0,
        hr_absence_deduction_per_day: 0,
        hr_overtime_rate_per_hour: 0,
        hr_doc_expiry_warning_days: 30,
      },
    [data]
  )

  const [form, setForm] = useState<any>(initial)
  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const saveMut = useMutation({
    mutationFn: () => updateHrSettings({ tenant_id: tenantId, ...form }),
    onSuccess: (d) => setForm(d),
  })

  return (
    <HrPageShell
      title={t.hr?.settingsTitle ?? (isRtl ? 'إعدادات الموارد البشرية' : 'HR Settings')}
      subtitle={t.hr?.settingsSubtitle ?? (isRtl ? 'إعدادات تُحفظ لكل شركة (Tenant) بشكل منفصل.' : 'Settings are saved per company (tenant).')}
      actions={
        <button className="btn btn-md btn-primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          <Save size={18} />
          {saveMut.isPending ? t.saving : t.save}
        </button>
      }
    >
      <div className="card-app">
        <div className="card-padding">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500">{isRtl ? 'بداية الدوام' : 'Shift start'}</label>
              <input
                className="input-app mt-1"
                value={form.hr_shift_start ?? '09:00'}
                onChange={(e) => setForm({ ...form, hr_shift_start: e.target.value })}
                placeholder="09:00"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">{isRtl ? 'نهاية الدوام' : 'Shift end'}</label>
              <input
                className="input-app mt-1"
                value={form.hr_shift_end ?? '17:00'}
                onChange={(e) => setForm({ ...form, hr_shift_end: e.target.value })}
                placeholder="17:00"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">{isRtl ? 'دقائق السماح للتأخير' : 'Late grace minutes'}</label>
              <input
                className="input-app mt-1 text-left"
                value={form.hr_late_grace_minutes ?? 0}
                onChange={(e) => setForm({ ...form, hr_late_grace_minutes: Number(e.target.value) })}
                dir="ltr"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500">{isRtl ? 'حسم التأخير لكل دقيقة' : 'Late deduction / minute'}</label>
              <input
                className="input-app mt-1 text-left"
                value={form.hr_late_deduction_per_minute ?? 0}
                onChange={(e) => setForm({ ...form, hr_late_deduction_per_minute: Number(e.target.value) })}
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">{isRtl ? 'حسم الغياب لكل يوم' : 'Absence deduction / day'}</label>
              <input
                className="input-app mt-1 text-left"
                value={form.hr_absence_deduction_per_day ?? 0}
                onChange={(e) => setForm({ ...form, hr_absence_deduction_per_day: Number(e.target.value) })}
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">{isRtl ? 'سعر الإضافي لكل ساعة' : 'Overtime rate / hour'}</label>
              <input
                className="input-app mt-1 text-left"
                value={form.hr_overtime_rate_per_hour ?? 0}
                onChange={(e) => setForm({ ...form, hr_overtime_rate_per_hour: Number(e.target.value) })}
                dir="ltr"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="text-xs text-slate-500">{isRtl ? 'تنبيه صلاحية المستندات قبل (يوم)' : 'Document expiry warning (days)'}</label>
              <input
                className="input-app mt-1 text-left"
                value={form.hr_doc_expiry_warning_days ?? 30}
                onChange={(e) => setForm({ ...form, hr_doc_expiry_warning_days: Number(e.target.value) })}
                dir="ltr"
              />
            </div>
          </div>
        </div>
      </div>
    </HrPageShell>
  )
}

