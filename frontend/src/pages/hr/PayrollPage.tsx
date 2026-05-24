import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import HrPageShell from './HrPageShell'
import { approvePayrollRunForTenant, generatePayrollForTenant, getPayrollRunForTenant, listPayrollRuns } from '../../api/hr'
import { fetchAccounts, fetchBranches } from '../../api/tenant'
import type { Account, Branch } from '../../types'
import AccountSearchSelect from '../../components/AccountSearchSelect'
import { CheckCircle, Wand2 } from 'lucide-react'

export default function PayrollPage() {
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const qc = useQueryClient()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [branchId, setBranchId] = useState<number | ''>('')
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)

  const { data: runsData } = useQuery({
    queryKey: ['hr', 'payroll', 'runs', tenantId],
    queryFn: () => listPayrollRuns({ tenant_id: tenantId, paginate: '1', per_page: 24 }),
    enabled: !!tenantId,
  })
  const runs: any[] = Array.isArray(runsData?.data) ? runsData.data : Array.isArray(runsData) ? runsData : []

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId, 'postable'],
    queryFn: () => fetchAccounts(tenantId, { postable_only: '1', active_only: '1' }),
    enabled: !!tenantId,
  })

  const effectiveRunId = selectedRunId ?? (runs[0]?.id ?? null)
  const { data: run } = useQuery({
    queryKey: ['hr', 'payroll', 'run', tenantId, effectiveRunId],
    queryFn: () => getPayrollRunForTenant(tenantId, effectiveRunId!),
    enabled: !!tenantId && !!effectiveRunId,
  })

  const genMut = useMutation({
    mutationFn: () => generatePayrollForTenant(tenantId, { year, month, branch_id: branchId ? branchId : null }),
    onSuccess: async (r: any) => {
      await qc.invalidateQueries({ queryKey: ['hr', 'payroll', 'runs', tenantId] })
      setSelectedRunId(r.id)
    },
  })

  const [salaryExpenseAccountId, setSalaryExpenseAccountId] = useState<number | null>(null)
  const [salaryPayableAccountId, setSalaryPayableAccountId] = useState<number | null>(null)
  const [bankAccountId, setBankAccountId] = useState<number | null>(null)

  const approveMut = useMutation({
    mutationFn: () =>
      approvePayrollRunForTenant(tenantId, effectiveRunId!, {
        salary_expense_account_id: salaryExpenseAccountId!,
        salary_payable_account_id: salaryPayableAccountId!,
        bank_account_id: bankAccountId || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['hr', 'payroll', 'run', tenantId, effectiveRunId] })
      await qc.invalidateQueries({ queryKey: ['hr', 'payroll', 'runs', tenantId] })
    },
  })

  const lines: any[] = run?.lines ?? []

  const totals = useMemo(() => {
    const gross = lines.reduce((s, l) => s + Number(l.basic_salary) + Number(l.housing_allowance) + Number(l.transport_allowance) + Number(l.overtime_amount ?? 0), 0)
    const deductions = lines.reduce((s, l) => s + Number(l.late_deduction) + Number(l.absence_deduction) + Number(l.loan_deduction ?? 0) + Number(l.other_deductions ?? 0), 0)
    const net = lines.reduce((s, l) => s + Number(l.net_pay), 0)
    return { gross, deductions, net }
  }, [lines])

  return (
    <HrPageShell
      title={t.hr?.payrollTitle ?? (isRtl ? 'الرواتب والمستحقات' : 'Payroll')}
      subtitle={t.hr?.payrollSubtitle ?? (isRtl ? 'توليد مسير الرواتب واعتماده مع قيد محاسبي تلقائي.' : 'Generate and approve payroll with automatic journal entry.')}
    >
      <div className="card-app">
        <div className="card-padding">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-xs text-slate-500">{isRtl ? 'السنة' : 'Year'}</label>
              <input dir="ltr" className="input-app mt-1 text-left" value={year} onChange={(e) => setYear(+e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">{isRtl ? 'الشهر' : 'Month'}</label>
              <input dir="ltr" className="input-app mt-1 text-left" value={month} onChange={(e) => setMonth(+e.target.value)} />
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs text-slate-500">{t.hr?.selectBranch ?? (isRtl ? 'اختر الفرع' : 'Select branch')}</label>
              <select className="input-app mt-1" value={branchId} onChange={(e) => setBranchId(e.target.value ? +e.target.value : '')}>
                <option value="">{t.all}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} - {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end">
              <button className="btn btn-md btn-primary" onClick={() => genMut.mutate()} disabled={genMut.isPending}>
                <Wand2 size={18} />
                {genMut.isPending ? (isRtl ? 'جاري التوليد...' : 'Generating...') : (isRtl ? 'توليد كشف الرواتب' : 'Generate')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-app lg:col-span-1">
          <div className="card-padding">
            <div className="text-sm font-semibold text-slate-800">{isRtl ? 'المسيرات' : 'Runs'}</div>
          </div>
          <div className="divide-y divide-slate-200">
            {runs.length === 0 && <div className="p-4 text-sm text-slate-500">{t.noData}</div>}
            {runs.map((r) => {
              const active = (effectiveRunId ?? 0) === r.id
              return (
                <button
                  key={r.id}
                  className={`w-full px-4 py-3 text-sm text-start transition-colors ${active ? 'bg-primary-50' : 'hover:bg-slate-50'}`}
                  onClick={() => setSelectedRunId(r.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {r.number} — {r.year}-{String(r.month).padStart(2, '0')}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{r.status === 'approved' ? (isRtl ? 'معتمد' : 'Approved') : (isRtl ? 'مسودة' : 'Draft')}</div>
                    </div>
                    {r.status === 'approved' && <CheckCircle size={18} className="text-emerald-600 shrink-0" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card-app lg:col-span-2">
          <div className="card-padding space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">{isRtl ? 'تفاصيل المسير' : 'Run details'}</div>
                {run?.number && <div className="text-xs text-slate-500">{run.number}</div>}
              </div>
              {run?.status !== 'approved' && (
                <button
                  className="btn btn-md btn-success"
                  disabled={!salaryExpenseAccountId || !salaryPayableAccountId || approveMut.isPending || !run}
                  onClick={() => approveMut.mutate()}
                  title={isRtl ? 'يعتمد المسير ويولّد قيد محاسبي تلقائياً' : 'Approve and create journal entry'}
                >
                  <CheckCircle size={18} />
                  {approveMut.isPending ? (isRtl ? 'جاري الاعتماد...' : 'Approving...') : (isRtl ? 'اعتماد الرواتب' : 'Approve')}
                </button>
              )}
            </div>

            {run?.status !== 'approved' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-1">
                  <label className="text-xs text-slate-500">{isRtl ? 'حساب مصروف الرواتب' : 'Salary expense account'}</label>
                  <div className="mt-1">
                    <AccountSearchSelect value={salaryExpenseAccountId} accounts={accounts} onChange={(v) => setSalaryExpenseAccountId(v)} placeholder={isRtl ? 'اختر حساب' : 'Select account'} />
                  </div>
                </div>
                <div className="lg:col-span-1">
                  <label className="text-xs text-slate-500">{isRtl ? 'حساب الرواتب المستحقة' : 'Salary payable account'}</label>
                  <div className="mt-1">
                    <AccountSearchSelect value={salaryPayableAccountId} accounts={accounts} onChange={(v) => setSalaryPayableAccountId(v)} placeholder={isRtl ? 'اختر حساب' : 'Select account'} />
                  </div>
                </div>
                <div className="lg:col-span-1">
                  <label className="text-xs text-slate-500">{isRtl ? 'حساب البنك (اختياري)' : 'Bank account (optional)'}</label>
                  <div className="mt-1">
                    <AccountSearchSelect value={bankAccountId} accounts={accounts} onChange={(v) => setBankAccountId(v)} placeholder={isRtl ? 'اختر حساب' : 'Select account'} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="table-responsive-wrap">
            <table className="w-full table-zebra">
              <thead>
                <tr>
                  <th className={isRtl ? 'text-right' : 'text-left'} style={{ width: 180 }}>
                    {isRtl ? 'الموظف' : 'Employee'}
                  </th>
                  <th className="text-center" style={{ width: 120 }}>
                    {isRtl ? 'أساسي' : 'Basic'}
                  </th>
                  <th className="text-center" style={{ width: 120 }}>
                    {isRtl ? 'سكن' : 'Housing'}
                  </th>
                  <th className="text-center" style={{ width: 120 }}>
                    {isRtl ? 'انتقال' : 'Transport'}
                  </th>
                  <th className="text-center" style={{ width: 120 }}>
                    {isRtl ? 'إضافي' : 'Overtime'}
                  </th>
                  <th className="text-center" style={{ width: 140 }}>
                    {isRtl ? 'خصومات' : 'Deductions'}
                  </th>
                  <th className="text-center" style={{ width: 140 }}>
                    {isRtl ? 'صافي' : 'Net'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-slate-500">
                      {t.noData}
                    </td>
                  </tr>
                )}
                {lines.map((l) => {
                  const deductions = Number(l.late_deduction) + Number(l.absence_deduction) + Number(l.loan_deduction ?? 0) + Number(l.other_deductions ?? 0)
                  return (
                    <tr key={l.id}>
                      <td className="cell-ellipsis">
                        {l.employee?.code} — {l.employee?.name}
                      </td>
                      <td className="text-center tabular-nums">{Number(l.basic_salary).toFixed(2)}</td>
                      <td className="text-center tabular-nums">{Number(l.housing_allowance).toFixed(2)}</td>
                      <td className="text-center tabular-nums">{Number(l.transport_allowance).toFixed(2)}</td>
                      <td className="text-center tabular-nums">{Number(l.overtime_amount ?? 0).toFixed(2)}</td>
                      <td className="text-center tabular-nums">{deductions.toFixed(2)}</td>
                      <td className="text-center tabular-nums font-semibold">{Number(l.net_pay).toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                {/* إجماليات بمحاذاة مباشرة تحت الأعمدة */}
                <tr className="bg-slate-50">
                  <td className={isRtl ? 'text-right font-bold' : 'text-left font-bold'}>{isRtl ? 'الإجمالي' : 'Total'}</td>
                  <td className="text-center tabular-nums font-bold">—</td>
                  <td className="text-center tabular-nums font-bold">—</td>
                  <td className="text-center tabular-nums font-bold">—</td>
                  <td className="text-center tabular-nums font-bold">{totals.gross.toFixed(2)}</td>
                  <td className="text-center tabular-nums font-bold">{totals.deductions.toFixed(2)}</td>
                  <td className="text-center tabular-nums font-bold">{totals.net.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </HrPageShell>
  )
}

