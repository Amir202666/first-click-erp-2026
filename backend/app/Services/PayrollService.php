<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\HrAllowance;
use App\Models\HrDeduction;
use App\Models\HrRequest;
use App\Models\LoanInstallment;
use App\Models\PayrollLine;
use App\Models\PayrollRun;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Support\Facades\DB;

class PayrollService
{
    private const DECIMALS = 3;

    public function __construct(
        private TenantSettingsService $settings,
        private AccountingService $accountingService
    ) {}

    /**
     * توليد مسير رواتب لشهر محدد (Draft).
     * - يحسب التأخير والإضافي من سجل الحضور (بناءً على إعدادات الدوام).
     * - يحسب خصم الغياب/التأخير حسب إعدادات الموديول.
     * - يخصم أقساط السلف/القروض المستحقة في نفس الشهر.
     */
    public function generate(int $tenantId, int $year, int $month, ?int $branchId = null): PayrollRun
    {
        $month = max(1, min(12, $month));
        $start = Carbon::create($year, $month, 1)->startOfMonth();
        $end = $start->copy()->endOfMonth();

        return DB::transaction(function () use ($tenantId, $year, $month, $start, $end, $branchId) {
            $run = PayrollRun::query()->where('tenant_id', $tenantId)->where('year', $year)->where('month', $month)->first();
            if ($run && $run->status === 'approved') {
                return $run->load('lines.employee', 'journalEntry');
            }
            if (! $run) {
                $run = PayrollRun::create([
                    'tenant_id' => $tenantId,
                    'year' => $year,
                    'month' => $month,
                    'status' => 'draft',
                    'generated_at' => now(),
                    'branch_id' => $branchId,
                    'created_by' => auth()->id(),
                ]);
            } else {
                $run->lines()->delete();
                $run->update(['generated_at' => now(), 'status' => 'draft']);
            }

            $employees = Employee::query()
                ->where('tenant_id', $tenantId)
                ->where('status', 'active')
                ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
                ->orderBy('name')
                ->get();

            $shiftStart = (string) ($this->settings->get($tenantId, 'hr_shift_start', '09:00') ?? '09:00');
            $shiftEnd = (string) ($this->settings->get($tenantId, 'hr_shift_end', '17:00') ?? '17:00');
            $weekendDaysRaw = $this->settings->get($tenantId, 'hr_weekend_days', [5, 6]);
            $weekendDays = is_array($weekendDaysRaw)
                ? array_map('intval', $weekendDaysRaw)
                : array_map('intval', array_filter(explode(',', (string) $weekendDaysRaw), fn ($x) => $x !== ''));

            $lateDeductionPerMinute = (float) ($this->settings->get($tenantId, 'hr_late_deduction_per_minute', 0) ?? 0);
            $absenceDeductionPerDay = (float) ($this->settings->get($tenantId, 'hr_absence_deduction_per_day', 0) ?? 0);
            $overtimeRatePerHour = (float) ($this->settings->get($tenantId, 'hr_overtime_rate_per_hour', 0) ?? 0);
            $lateGraceMinutes = (int) ($this->settings->get($tenantId, 'hr_late_grace_minutes', 0) ?? 0);

            $requiredMinutesPerDay = $this->diffMinutes($shiftStart, $shiftEnd);
            $period = CarbonPeriod::create($start, $end);
            $workDates = [];
            foreach ($period as $d) {
                $dow = (int) $d->dayOfWeek; // 0=Sun .. 6=Sat
                if (in_array($dow, $weekendDays, true)) {
                    continue;
                }
                $workDates[] = $d->format('Y-m-d');
            }

            $dueMonth = $start->copy()->startOfMonth()->format('Y-m-d');

            $totalGross = 0.0;
            $totalDeductions = 0.0;
            $totalNet = 0.0;

            foreach ($employees as $emp) {
                $basic = round((float) $emp->basic_salary, self::DECIMALS);
                $fixedAllow = round((float) $emp->housing_allowance + (float) $emp->transport_allowance, self::DECIMALS);
                $otherAllowances = $this->calculateOtherAllowances($tenantId, $emp);
                $otherDeductions = $this->calculateOtherDeductions($tenantId, $emp);

                $gross = round($basic + $fixedAllow + $otherAllowances, self::DECIMALS);
                $totalGross += $gross;

                $attendance = Attendance::query()
                    ->where('tenant_id', $tenantId)
                    ->where('employee_id', $emp->id)
                    ->whereBetween('work_date', [$start->format('Y-m-d'), $end->format('Y-m-d')])
                    ->get()
                    ->keyBy(fn ($a) => $a->work_date->format('Y-m-d'));

                $lateMinutes = 0;
                $overtimeHours = 0.0;
                $absenceDays = 0.0;

                foreach ($workDates as $dateStr) {
                    $rec = $attendance->get($dateStr);
                    if (! $rec || ! $rec->check_in || ! $rec->check_out) {
                        $absenceDays += 1.0;

                        continue;
                    }

                    $checkIn = Carbon::parse($rec->check_in);
                    $checkOut = Carbon::parse($rec->check_out);
                    if ($checkOut->lessThanOrEqualTo($checkIn)) {
                        $absenceDays += 1.0;

                        continue;
                    }

                    $startAt = Carbon::parse($dateStr.' '.$shiftStart.':00');
                    $endAt = Carbon::parse($dateStr.' '.$shiftEnd.':00');
                    $workedMinutes = max(0, $checkOut->diffInMinutes($checkIn));

                    $late = max(0, $checkIn->diffInMinutes($startAt, false));
                    if ($late > 0) {
                        $late = max(0, $late - $lateGraceMinutes);
                        $lateMinutes += $late;
                    }

                    $required = max(0, $endAt->diffInMinutes($startAt));
                    $overtime = max(0, $workedMinutes - $required);
                    $overtimeHours += round($overtime / 60, 2);
                }

                $lateDeduction = round($lateMinutes * $lateDeductionPerMinute, self::DECIMALS);
                $absenceDeduction = $absenceDeductionPerDay > 0
                    ? round($absenceDays * $absenceDeductionPerDay, self::DECIMALS)
                    : round($absenceDays * $this->fallbackAbsenceRate($emp), self::DECIMALS);
                $overtimeAmount = round($overtimeHours * $overtimeRatePerHour, self::DECIMALS);

                $loanDeduction = $this->calculateLoanDeduction($tenantId, $emp->id, $dueMonth);

                $deductions = round($lateDeduction + $absenceDeduction + $loanDeduction + $otherDeductions, self::DECIMALS);
                $net = round($gross + $overtimeAmount - $deductions, self::DECIMALS);

                $totalDeductions += $deductions;
                $totalNet += $net;

                PayrollLine::create([
                    'payroll_run_id' => $run->id,
                    'employee_id' => $emp->id,
                    'basic_salary' => $basic,
                    'housing_allowance' => round((float) $emp->housing_allowance, self::DECIMALS),
                    'transport_allowance' => round((float) $emp->transport_allowance, self::DECIMALS),
                    'other_allowances' => $otherAllowances,
                    'overtime_hours' => round($overtimeHours, 2),
                    'late_minutes' => (int) $lateMinutes,
                    'absence_days' => round($absenceDays, 2),
                    'overtime_amount' => $overtimeAmount,
                    'late_deduction' => $lateDeduction,
                    'absence_deduction' => $absenceDeduction,
                    'loan_deduction' => $loanDeduction,
                    'other_deductions' => $otherDeductions,
                    'net_pay' => $net,
                ]);
            }

            $run->update([
                'total_gross' => round($totalGross, self::DECIMALS),
                'total_deductions' => round($totalDeductions, self::DECIMALS),
                'total_net' => round($totalNet, self::DECIMALS),
            ]);

            return $run->fresh(['lines.employee', 'branch']);
        });
    }

    public function approve(PayrollRun $run, array $accounts): PayrollRun
    {
        if ($run->status === 'approved') {
            return $run->load('lines.employee', 'journalEntry');
        }

        return DB::transaction(function () use ($run, $accounts) {
            $salaryExpenseAccountId = (int) ($accounts['salary_expense_account_id'] ?? 0);
            $salaryPayableAccountId = (int) ($accounts['salary_payable_account_id'] ?? 0);
            $bankAccountId = isset($accounts['bank_account_id']) ? (int) $accounts['bank_account_id'] : null;

            if ($salaryExpenseAccountId < 1 || $salaryPayableAccountId < 1) {
                throw new \InvalidArgumentException('يجب تحديد حساب مصروف الرواتب وحساب الرواتب المستحقة.');
            }

            $totalNet = round((float) $run->total_net, self::DECIMALS);
            if ($totalNet <= 0) {
                throw new \InvalidArgumentException('إجمالي الصافي يجب أن يكون أكبر من صفر.');
            }

            $creditAccountId = $bankAccountId && $bankAccountId > 0 ? $bankAccountId : $salaryPayableAccountId;
            $desc = "اعتماد مسير الرواتب #{$run->number} ({$run->year}-".str_pad((string) $run->month, 2, '0', STR_PAD_LEFT).')';

            $entry = $this->accountingService->createJournalEntry([
                'tenant_id' => $run->tenant_id,
                'date' => Carbon::create($run->year, $run->month, 1)->endOfMonth()->format('Y-m-d'),
                'type' => 'payroll',
                'description' => $desc,
                'branch_id' => $run->branch_id,
                'reference_type' => PayrollRun::class,
                'reference_id' => $run->id,
                'status' => 'posted',
                'created_by' => auth()->id(),
                'posted_at' => now(),
            ], [
                [
                    'account_id' => $salaryExpenseAccountId,
                    'debit' => $totalNet,
                    'credit' => 0,
                    'description' => $desc,
                    'cost_center_id' => null,
                ],
                [
                    'account_id' => $creditAccountId,
                    'debit' => 0,
                    'credit' => $totalNet,
                    'description' => $desc,
                    'cost_center_id' => null,
                ],
            ]);

            $run->update([
                'status' => 'approved',
                'approved_at' => now(),
                'journal_entry_id' => $entry->id,
                'salary_expense_account_id' => $salaryExpenseAccountId,
                'salary_payable_account_id' => $salaryPayableAccountId,
                'bank_account_id' => $bankAccountId,
            ]);

            return $run->fresh(['lines.employee', 'journalEntry.lines.account', 'branch']);
        });
    }

    private function diffMinutes(string $start, string $end): int
    {
        try {
            $s = Carbon::createFromFormat('H:i', $start);
            $e = Carbon::createFromFormat('H:i', $end);

            return max(0, $e->diffInMinutes($s));
        } catch (\Throwable) {
            return 480;
        }
    }

    private function fallbackAbsenceRate(Employee $emp): float
    {
        $daily = (float) $emp->basic_salary / 30.0;

        return round($daily, self::DECIMALS);
    }

    private function calculateLoanDeduction(int $tenantId, int $employeeId, string $dueMonth): float
    {
        $loanRequests = HrRequest::query()
            ->where('tenant_id', $tenantId)
            ->where('employee_id', $employeeId)
            ->where('type', 'loan')
            ->where('status', 'approved')
            ->pluck('id')
            ->all();

        if (empty($loanRequests)) {
            return 0.0;
        }

        $installments = LoanInstallment::query()
            ->whereIn('hr_request_id', $loanRequests)
            ->where('due_month', $dueMonth)
            ->where('status', 'pending')
            ->get();

        $sum = 0.0;
        foreach ($installments as $inst) {
            $remaining = (float) $inst->amount - (float) $inst->deducted_amount;
            if ($remaining > 0) {
                $sum += $remaining;
            }
        }

        return round($sum, self::DECIMALS);
    }

    private function calculateOtherAllowances(int $tenantId, Employee $emp): float
    {
        $basic = round((float) $emp->basic_salary, self::DECIMALS);
        $allowances = HrAllowance::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->where(function ($q) use ($emp) {
                $q->where('apply_to', 'all')
                    ->orWhere(function ($x) use ($emp) {
                        $x->where('apply_to', 'administration')->where('administration_id', $emp->administration_id);
                    })
                    ->orWhere(function ($x) use ($emp) {
                        $x->where('apply_to', 'employee')->where('employee_id', $emp->id);
                    });
            })
            ->get();

        $sum = 0.0;
        foreach ($allowances as $a) {
            $val = (float) $a->value;
            $sum += $a->value_type === 'percent_basic' ? ($basic * $val / 100.0) : $val;
        }

        return round($sum, self::DECIMALS);
    }

    private function calculateOtherDeductions(int $tenantId, Employee $emp): float
    {
        $basic = round((float) $emp->basic_salary, self::DECIMALS);
        $deductions = HrDeduction::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->where(function ($q) use ($emp) {
                $q->where('apply_to', 'all')
                    ->orWhere(function ($x) use ($emp) {
                        $x->where('apply_to', 'administration')->where('administration_id', $emp->administration_id);
                    })
                    ->orWhere(function ($x) use ($emp) {
                        $x->where('apply_to', 'employee')->where('employee_id', $emp->id);
                    });
            })
            ->get();

        $sum = 0.0;
        foreach ($deductions as $d) {
            $val = (float) $d->value;
            $sum += $d->value_type === 'percent_basic' ? ($basic * $val / 100.0) : $val;
        }

        return round($sum, self::DECIMALS);
    }
}
