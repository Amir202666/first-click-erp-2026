<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Branch;
use App\Models\CostCenter;
use App\Models\Customer;
use App\Models\Installment;
use App\Models\Invoice;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\Payment;
use App\Models\TenantAccountDefault;
use App\Models\Vendor;
use Illuminate\Support\Facades\DB;

/**
 * خدمة القيود المحاسبية: إنشاء وتحديث قيود مزدوجة مع التحقق من توازن المدين والدائن.
 * ربط الفواتير وسندات القبض/الصرف يتم عبر reference_type و reference_id؛
 * كل قيد يُربط بشركة واحدة (tenant_id) لضمان دقة الميزانية العمومية لكل شركة على حدة.
 */
class AccountingService
{
    /** دقة موازنة القيود (مدين/دائن) — متوافقة مع فواتير النظام (3 خانات). */
    public const JOURNAL_AMOUNT_DECIMALS = 3;

    /**
     * تقريب بنود القيد وموازنة فرق التقريب على أكبر بند مدين (أو دائن احتياطياً).
     *
     * @param  array<int, array<string, mixed>>  $lines
     * @return array<int, array<string, mixed>>
     */
    public function normalizeAndBalanceJournalLines(array $lines, int $decimals = self::JOURNAL_AMOUNT_DECIMALS): array
    {
        $out = [];
        foreach ($lines as $line) {
            $out[] = array_merge($line, [
                'debit' => round((float) ($line['debit'] ?? 0), $decimals),
                'credit' => round((float) ($line['credit'] ?? 0), $decimals),
            ]);
        }

        $sumDebit = round(array_sum(array_map(fn ($l) => (float) ($l['debit'] ?? 0), $out)), $decimals);
        $sumCredit = round(array_sum(array_map(fn ($l) => (float) ($l['credit'] ?? 0), $out)), $decimals);
        $diff = round($sumDebit - $sumCredit, $decimals);
        $eps = 10 ** (-$decimals);
        if (abs($diff) < $eps) {
            return $out;
        }

        $debitIdx = -1;
        $maxDebit = 0.0;
        foreach ($out as $i => $l) {
            $d = (float) ($l['debit'] ?? 0);
            if ($d > $maxDebit) {
                $maxDebit = $d;
                $debitIdx = $i;
            }
        }

        if ($debitIdx >= 0 && $maxDebit > 0) {
            $out[$debitIdx]['debit'] = round($maxDebit - $diff, $decimals);

            return $out;
        }

        $creditIdx = -1;
        $maxCredit = 0.0;
        foreach ($out as $i => $l) {
            $c = (float) ($l['credit'] ?? 0);
            if ($c > $maxCredit) {
                $maxCredit = $c;
                $creditIdx = $i;
            }
        }

        if ($creditIdx >= 0 && $maxCredit > 0) {
            $out[$creditIdx]['credit'] = round($maxCredit + $diff, $decimals);
        }

        return $out;
    }

    public function createJournalEntry(array $data, array $lines): JournalEntry
    {
        return DB::transaction(function () use ($data, $lines) {
            $entry = JournalEntry::create($data);

            $lines = $this->normalizeAndBalanceJournalLines($lines, self::JOURNAL_AMOUNT_DECIMALS);

            $totalDebit = 0;
            $totalCredit = 0;

            foreach ($lines as $line) {
                $line['journal_entry_id'] = $entry->id;
                JournalEntryLine::create($line);
                $totalDebit += (float) ($line['debit'] ?? 0);
                $totalCredit += (float) ($line['credit'] ?? 0);
            }

            $totalDebit = round($totalDebit, self::JOURNAL_AMOUNT_DECIMALS);
            $totalCredit = round($totalCredit, self::JOURNAL_AMOUNT_DECIMALS);

            $entry->update([
                'total_debit' => $totalDebit,
                'total_credit' => $totalCredit,
            ]);

            if (bccomp((string) $totalDebit, (string) $totalCredit, self::JOURNAL_AMOUNT_DECIMALS) !== 0) {
                throw new \InvalidArgumentException('القيد غير متوازن: المدين لا يساوي الدائن');
            }

            return $entry->load('lines.account');
        });
    }

    public function updateJournalEntry(JournalEntry $entry, array $validated): JournalEntry
    {
        return DB::transaction(function () use ($entry, $validated) {
            $entry->update([
                'date' => $validated['date'],
                'type' => $validated['type'],
                'description' => $validated['description'] ?? null,
                'customer_id' => $validated['customer_id'] ?? null,
                'vendor_id' => $validated['vendor_id'] ?? null,
                'branch_id' => $validated['branch_id'] ?? null,
            ]);

            $entry->lines()->delete();

            $lines = $this->normalizeAndBalanceJournalLines($validated['lines'], self::JOURNAL_AMOUNT_DECIMALS);

            $totalDebit = 0;
            $totalCredit = 0;
            foreach ($lines as $line) {
                $line['journal_entry_id'] = $entry->id;
                JournalEntryLine::create($line);
                $totalDebit += (float) ($line['debit'] ?? 0);
                $totalCredit += (float) ($line['credit'] ?? 0);
            }

            $totalDebit = round($totalDebit, self::JOURNAL_AMOUNT_DECIMALS);
            $totalCredit = round($totalCredit, self::JOURNAL_AMOUNT_DECIMALS);

            $entry->update([
                'total_debit' => $totalDebit,
                'total_credit' => $totalCredit,
            ]);

            if (bccomp((string) $totalDebit, (string) $totalCredit, self::JOURNAL_AMOUNT_DECIMALS) !== 0) {
                throw new \InvalidArgumentException('القيد غير متوازن: المدين لا يساوي الدائن');
            }

            return $entry->load('lines.account');
        });
    }

    public function getAccountBalance(
        int $accountId,
        ?string $fromDate = null,
        ?string $toDate = null,
        ?int $branchId = null,
        ?int $costCenterId = null,
        ?int $tenantId = null
    ): array {
        $query = JournalEntryLine::where('account_id', $accountId)
            ->whereHas('journalEntry', function ($q) use ($fromDate, $toDate, $branchId, $tenantId) {
                $q->where('status', 'posted');
                if ($tenantId !== null) {
                    $q->where('tenant_id', $tenantId);
                }
                if ($fromDate) {
                    $q->whereDate('date', '>=', $fromDate);
                }
                if ($toDate) {
                    $q->whereDate('date', '<=', $toDate);
                }
                if ($branchId !== null) {
                    $q->where('branch_id', $branchId);
                }
            });
        if ($costCenterId !== null) {
            $query->where('cost_center_id', $costCenterId);
        }

        $debit = (float) $query->sum('debit');
        $credit = (float) $query->sum('credit');

        return [
            'debit' => $debit,
            'credit' => $credit,
            'balance' => $debit - $credit,
        ];
    }

    /**
     * رصيد الحساب حتى تاريخ معين (شامل): إجمالي مدين − إجمالي دائن لجميع القيود حتى toDate.
     * يُستخدم لحساب الرصيد الافتتاحي (toDate = اليوم السابق لبداية الفترة).
     */
    public function getAccountBalanceToDate(
        int $accountId,
        string $toDate,
        ?int $branchId = null,
        ?int $costCenterId = null,
        ?int $tenantId = null
    ): array {
        $query = JournalEntryLine::where('account_id', $accountId)
            ->whereHas('journalEntry', function ($q) use ($toDate, $branchId, $tenantId) {
                $q->where('status', 'posted')->whereDate('date', '<=', $toDate);
                if ($tenantId !== null) {
                    $q->where('tenant_id', $tenantId);
                }
                if ($branchId !== null) {
                    $q->where('branch_id', $branchId);
                }
            });
        if ($costCenterId !== null) {
            $query->where('cost_center_id', $costCenterId);
        }
        $debit = (float) $query->sum('debit');
        $credit = (float) $query->sum('credit');
        $balance = $debit - $credit;

        return [
            'debit' => $debit,
            'credit' => $credit,
            'balance' => $balance,
        ];
    }

    /** ترتيب أنواع الحسابات حسب دليل الحسابات: أصول، خصوم، حقوق ملكية، إيرادات، تكلفة مبيعات، مصروفات */
    private const TRIAL_BALANCE_TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense'];

    public function getTrialBalance(
        int $tenantId,
        ?string $fromDate = null,
        ?string $toDate = null,
        ?int $branchId = null,
        ?int $costCenterId = null,
        bool $includeZeroBalance = false
    ): array {
        $accounts = Account::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->orderBy('code')
            ->get();

        $result = [];
        foreach ($accounts as $account) {
            $balance = $this->getAccountBalance($account->id, $fromDate, $toDate, $branchId, $costCenterId, $tenantId);
            $hasMovement = $balance['debit'] != 0 || $balance['credit'] != 0;
            if ($hasMovement || $includeZeroBalance) {
                $result[] = [
                    'account_id' => $account->id,
                    'parent_id' => $account->parent_id,
                    'code' => $account->code,
                    'name' => $account->name,
                    'type' => $account->type,
                    'level' => (int) $account->level,
                    'debit' => round($balance['debit'], 2),
                    'credit' => round($balance['credit'], 2),
                    'balance' => round($balance['debit'] - $balance['credit'], 2),
                ];
            }
        }

        usort($result, function ($a, $b) {
            $orderA = array_search($a['type'], self::TRIAL_BALANCE_TYPE_ORDER, true);
            $orderB = array_search($b['type'], self::TRIAL_BALANCE_TYPE_ORDER, true);
            $orderA = $orderA === false ? 999 : $orderA;
            $orderB = $orderB === false ? 999 : $orderB;
            if ($orderA !== $orderB) {
                return $orderA <=> $orderB;
            }

            return strcmp($a['code'], $b['code']);
        });

        return $result;
    }

    /**
     * ميزان مراجعة متعدد المستويات: رصيد افتتاحي، حركة الفترة، رصيد نهائي.
     * يدعم تجميع الحسابات حسب المستوى (1–5) وعرض حتى مستوى محدد مع تجميع الأبناء.
     *
     * @param  int  $displayLevel  1–5: عرض الحسابات حتى هذا المستوى مع تجميع ما تحته
     * @param  bool  $includeZeroBalance  تضمين الحسابات ذات الرصيد صفر
     * @param  bool  $mainAccountsOnly  عرض المستوى الأول فقط (الحسابات الرئيسية)
     */
    public function getTrialBalanceMultiLevel(
        int $tenantId,
        string $fromDate,
        string $toDate,
        ?int $branchId = null,
        ?int $costCenterId = null,
        int $displayLevel = 5,
        bool $includeZeroBalance = false,
        bool $mainAccountsOnly = false
    ): array {
        $displayLevel = max(1, min(5, $displayLevel));
        if ($mainAccountsOnly) {
            $displayLevel = 1;
        }

        $accounts = Account::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->orderBy('code')
            ->get();

        $dayBeforeFrom = \Carbon\Carbon::parse($fromDate)->subDay()->format('Y-m-d');

        $byId = [];
        foreach ($accounts as $account) {
            // الحسابات غير القابلة للترحيل (رؤوس) = رصيدها الذاتي 0، والإجمالي من تجميع الأبناء فقط (تفادي تضخيم الإجماليات)
            $isPostable = isset($account->is_postable) ? (bool) $account->is_postable : true;
            if (! $isPostable) {
                $openDebit = 0.0;
                $openCredit = 0.0;
                $periodDebit = 0.0;
                $periodCredit = 0.0;
                $closeDebit = 0.0;
                $closeCredit = 0.0;
            } else {
                $opening = $this->getAccountBalanceToDate($account->id, $dayBeforeFrom, $branchId, $costCenterId, $tenantId);
                $period = $this->getAccountBalance($account->id, $fromDate, $toDate, $branchId, $costCenterId, $tenantId);
                $openBal = $opening['balance'];
                $openDebit = $openBal > 0 ? round($openBal, 2) : 0.0;
                $openCredit = $openBal < 0 ? round(-$openBal, 2) : 0.0;
                $periodDebit = round((float) $period['debit'], 2);
                $periodCredit = round((float) $period['credit'], 2);
                $closingBal = $openBal + $periodDebit - $periodCredit;
                $closeDebit = $closingBal > 0 ? round($closingBal, 2) : 0.0;
                $closeCredit = $closingBal < 0 ? round(-$closingBal, 2) : 0.0;
            }

            $byId[$account->id] = [
                'account_id' => $account->id,
                'parent_id' => $account->parent_id,
                'code' => $account->code,
                'name' => $account->name,
                'type' => $account->type,
                'level' => (int) $account->level,
                'is_postable' => $isPostable,
                'opening_debit' => $openDebit,
                'opening_credit' => $openCredit,
                'period_debit' => $periodDebit,
                'period_credit' => $periodCredit,
                'closing_debit' => $closeDebit,
                'closing_credit' => $closeCredit,
                'children_ids' => [],
            ];
        }

        foreach ($byId as $id => $row) {
            $pid = $row['parent_id'];
            if ($pid && isset($byId[$pid])) {
                $byId[$pid]['children_ids'][] = $id;
            }
        }

        $maxLevel = (int) collect($byId)->max('level');
        for ($lev = $maxLevel; $lev >= 1; $lev--) {
            foreach ($byId as $id => $row) {
                if ((int) $row['level'] !== $lev) {
                    continue;
                }
                foreach ($row['children_ids'] as $cid) {
                    if (! isset($byId[$cid])) {
                        continue;
                    }
                    $ch = &$byId[$cid];
                    $byId[$id]['opening_debit'] += $ch['opening_debit'];
                    $byId[$id]['opening_credit'] += $ch['opening_credit'];
                    $byId[$id]['period_debit'] += $ch['period_debit'];
                    $byId[$id]['period_credit'] += $ch['period_credit'];
                    $byId[$id]['closing_debit'] += $ch['closing_debit'];
                    $byId[$id]['closing_credit'] += $ch['closing_credit'];
                }
            }
        }

        $result = [];
        foreach ($byId as $id => $row) {
            $lev = (int) $row['level'];
            if ($lev > $displayLevel) {
                continue;
            }
            $hasMovement = $row['opening_debit'] != 0 || $row['opening_credit'] != 0
                || $row['period_debit'] != 0 || $row['period_credit'] != 0
                || $row['closing_debit'] != 0 || $row['closing_credit'] != 0;
            if (! $includeZeroBalance && ! $hasMovement) {
                continue;
            }
            unset($row['children_ids']);
            unset($row['is_postable']);
            $result[] = $row;
        }

        usort($result, function ($a, $b) {
            $orderA = array_search($a['type'], self::TRIAL_BALANCE_TYPE_ORDER, true);
            $orderB = array_search($b['type'], self::TRIAL_BALANCE_TYPE_ORDER, true);
            $orderA = $orderA === false ? 999 : $orderA;
            $orderB = $orderB === false ? 999 : $orderB;
            if ($orderA !== $orderB) {
                return $orderA <=> $orderB;
            }

            return strcmp($a['code'], $b['code']);
        });

        // ─── إجماليات الميزان: من الحسابات الفعلية (Leaf) فقط ــــ
        // القاعدة الذهبية: إذا كان للحساب أبناء فلا يدخل في الإجمالي؛ إذا ليس له أبناء فيدخل.
        // لا يُجمع أبداً من الصفوف المعروضة ($result)؛ المصدر هو $byId بعد فلترة الحسابات التي ليس لها أبناء.
        $actualAccounts = array_filter($byId, function (array $row): bool {
            $children = $row['children_ids'] ?? [];

            return is_array($children) && count($children) === 0;
        });
        // إجمالي مدين/دائن = مجموع أرصدة الحسابات الفعلية فقط (لا يُجمع من $result أبداً)
        $totals = [
            'opening_debit' => round(array_sum(array_column($actualAccounts, 'opening_debit')), 2),
            'opening_credit' => round(array_sum(array_column($actualAccounts, 'opening_credit')), 2),
            'period_debit' => round(array_sum(array_column($actualAccounts, 'period_debit')), 2),
            'period_credit' => round(array_sum(array_column($actualAccounts, 'period_credit')), 2),
            'closing_debit' => round(array_sum(array_column($actualAccounts, 'closing_debit')), 2),
            'closing_credit' => round(array_sum(array_column($actualAccounts, 'closing_credit')), 2),
        ];

        $tol = 0.01;
        $balancedOpening = abs($totals['opening_debit'] - $totals['opening_credit']) < $tol;
        $balancedPeriod = abs($totals['period_debit'] - $totals['period_credit']) < $tol;
        $balancedClosing = abs($totals['closing_debit'] - $totals['closing_credit']) < $tol;

        return [
            'accounts' => $result,
            'totals' => $totals,
            'is_balanced_opening' => $balancedOpening,
            'is_balanced_period' => $balancedPeriod,
            'is_balanced_closing' => $balancedClosing,
        ];
    }

    /**
     * قائمة دخل احترافية: إجمالي الإيرادات − تكلفة البضاعة المباعة = إجمالي الربح − المصروفات + إيرادات أخرى = صافي الربح.
     * الحساب على أساس الحسابات الفعلية (الورقية) فقط التي عليها حركة.
     */
    public function getIncomeStatement(int $tenantId, string $fromDate, string $toDate, ?int $branchId = null, ?int $costCenterId = null): array
    {
        $defaults = TenantAccountDefault::firstOrCreate(
            ['tenant_id' => $tenantId],
            array_fill_keys(TenantAccountDefault::requiredKeysForOperations(), null)
        );

        $grossSales = 0.0;
        $salesReturns = 0.0;
        $salesDiscount = 0.0;
        if ($defaults->sales_account_id) {
            $b = $this->getAccountBalance((int) $defaults->sales_account_id, $fromDate, $toDate, $branchId, $costCenterId, $tenantId);
            $grossSales = (float) $b['credit'] - (float) $b['debit'];
        }
        if ($defaults->sales_returns_account_id) {
            $b = $this->getAccountBalance((int) $defaults->sales_returns_account_id, $fromDate, $toDate, $branchId, $costCenterId, $tenantId);
            $salesReturns = (float) $b['debit'] - (float) $b['credit'];
        }
        if ($defaults->discounts_account_id) {
            $b = $this->getAccountBalance((int) $defaults->discounts_account_id, $fromDate, $toDate, $branchId, $costCenterId, $tenantId);
            $salesDiscount = (float) $b['debit'] - (float) $b['credit'];
        }
        $netSales = round($grossSales - $salesReturns - $salesDiscount, 2);
        $grossSales = round($grossSales, 2);
        $salesReturns = round($salesReturns, 2);
        $salesDiscount = round($salesDiscount, 2);

        $accounts = Account::where('tenant_id', $tenantId)->where('is_active', true)->get();
        $byId = [];
        foreach ($accounts as $a) {
            $byId[$a->id] = ['id' => $a->id, 'code' => $a->code, 'name' => $a->name, 'type' => $a->type, 'parent_id' => $a->parent_id];
        }
        foreach ($byId as $id => $row) {
            $pid = $row['parent_id'];
            if ($pid && isset($byId[$pid])) {
                if (! isset($byId[$pid]['children_ids'])) {
                    $byId[$pid]['children_ids'] = [];
                }
                $byId[$pid]['children_ids'][] = $id;
            }
        }
        $isLeaf = function ($id) use ($byId) {
            $row = $byId[$id] ?? null;
            if (! $row) {
                return false;
            }
            $children = $row['children_ids'] ?? [];

            return is_array($children) && count($children) === 0;
        };

        $totalRevenue = 0.0;
        $revenueDetails = [];
        // تكلفة البضاعة المباعة من الحسابات ذات النوع cogs فقط (تُغذى آلياً من ترحيل فواتير المبيعات).
        $totalCogs = 0.0;
        $cogsDetails = [];
        $adminExpense = 0.0;
        $adminDetails = [];
        $sellingExpense = 0.0;
        $sellingDetails = [];
        $otherExpense = 0.0;
        $otherExpenseDetails = [];

        foreach ($byId as $id => $row) {
            if (! $isLeaf($id)) {
                continue;
            }
            $balance = $this->getAccountBalance($id, $fromDate, $toDate, $branchId, $costCenterId, $tenantId);
            $code = $row['code'];
            $name = $row['name'];
            $type = $row['type'];

            if ($type === 'revenue') {
                $amount = round((float) $balance['credit'] - (float) $balance['debit'], 2);
                $totalRevenue += $amount;
                if ($amount != 0) {
                    $revenueDetails[] = ['code' => $code, 'name' => $name, 'amount' => $amount];
                }
            } elseif ($type === 'cogs') {
                $amount = round((float) $balance['debit'] - (float) $balance['credit'], 2);
                $totalCogs += $amount;
                if ($amount != 0) {
                    $cogsDetails[] = ['code' => $code, 'name' => $name, 'amount' => $amount];
                }
            } elseif ($type === 'expense') {
                $amount = round((float) $balance['debit'] - (float) $balance['credit'], 2);
                if ($amount == 0) {
                    continue;
                }
                if (str_starts_with((string) $code, '51')) {
                    $adminExpense += $amount;
                    $adminDetails[] = ['code' => $code, 'name' => $name, 'amount' => $amount];
                } elseif (str_starts_with((string) $code, '52')) {
                    $sellingExpense += $amount;
                    $sellingDetails[] = ['code' => $code, 'name' => $name, 'amount' => $amount];
                } else {
                    $otherExpense += $amount;
                    $otherExpenseDetails[] = ['code' => $code, 'name' => $name, 'amount' => $amount];
                }
            }
        }

        $totalRevenue = round($totalRevenue, 2);
        $totalCogs = round($totalCogs, 2);
        $grossProfit = round($netSales - $totalCogs, 2);
        $adminExpense = round($adminExpense, 2);
        $sellingExpense = round($sellingExpense, 2);
        $otherExpense = round($otherExpense, 2);
        $totalExpenses = round($adminExpense + $sellingExpense + $otherExpense, 2);
        $netIncome = round($grossProfit - $totalExpenses, 2);

        return [
            'period' => ['from' => $fromDate, 'to' => $toDate],
            'gross_sales' => $grossSales,
            'sales_returns' => $salesReturns,
            'sales_discount' => $salesDiscount,
            'net_sales' => $netSales,
            'revenues' => $revenueDetails,
            'total_revenue' => $totalRevenue,
            'cogs' => $cogsDetails,
            'total_cogs' => $totalCogs,
            'gross_profit' => $grossProfit,
            'administrative_expenses' => $adminDetails,
            'total_administrative_expenses' => $adminExpense,
            'selling_marketing_expenses' => $sellingDetails,
            'total_selling_marketing_expenses' => $sellingExpense,
            'other_expenses' => $otherExpenseDetails,
            'total_other_expenses' => $otherExpense,
            'total_expenses' => $totalExpenses,
            'net_income' => $netIncome,
        ];
    }

    /**
     * توزيع شهري لقائمة الدخل (نفس منطق getIncomeStatement لكل شهر ضمن الفترة).
     * يُستخدم لمخطط الأعمدة؛ الأشهر بدون حركة تُرجع أصفاراً.
     */
    public function getIncomeStatementMonthlyBreakdown(
        int $tenantId,
        string $fromDate,
        string $toDate,
        ?int $branchId = null,
        ?int $costCenterId = null,
        int $maxMonths = 36,
    ): array {
        $from = \Carbon\Carbon::parse($fromDate)->format('Y-m-d');
        $to = \Carbon\Carbon::parse($toDate)->format('Y-m-d');
        $start = \Carbon\Carbon::parse($from)->startOfMonth();
        $endMonthStart = \Carbon\Carbon::parse($to)->copy()->startOfMonth();
        $carbonLocale = app()->getLocale() === 'ar' ? 'ar' : 'en';

        $out = [];
        $cursor = $start->copy();
        $count = 0;
        while ($cursor->lte($endMonthStart) && $count < $maxMonths) {
            $monthStart = $cursor->copy()->startOfMonth()->format('Y-m-d');
            $monthEnd = $cursor->copy()->endOfMonth()->format('Y-m-d');
            $rangeFrom = max($from, $monthStart);
            $rangeTo = min($to, $monthEnd);

            if ($rangeFrom <= $rangeTo) {
                $slice = $this->getIncomeStatement($tenantId, $rangeFrom, $rangeTo, $branchId, $costCenterId);
                $label = $cursor->copy()->locale($carbonLocale)->isoFormat('MMM YYYY');
                $out[] = [
                    'month' => $label,
                    'year' => (int) $cursor->year,
                    'month_num' => (int) $cursor->month,
                    'revenue' => round((float) $slice['net_sales'], 3),
                    'cogs' => round((float) $slice['total_cogs'], 3),
                    'expenses' => round((float) $slice['total_expenses'], 3),
                    'profit' => round((float) $slice['net_income'], 3),
                ];
            }

            $cursor->addMonth();
            $count++;
        }

        return $out;
    }

    /**
     * ميزانية عمومية احترافية: أصول = التزامات + حقوق الملكية.
     * - الأرصدة من القيود المرحّلة فقط حتى as_of_date (شامل القيد الافتتاحي).
     * - تصنيف تلقائي: أصول/التزامات متداولة (كود 11/21) وغير متداولة (12+/22+).
     * - حقوق الملكية تتضمن صافي ربح الفترة من قائمة الدخل.
     * - تنبيه توازن إذا الأصول ≠ الالتزامات + حقوق الملكية.
     */
    public function getBalanceSheet(int $tenantId, string $asOfDate, ?int $branchId = null): array
    {
        $accounts = Account::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->whereIn('type', ['asset', 'liability', 'equity'])
            ->orderBy('code')
            ->get();

        $byId = [];
        foreach ($accounts as $a) {
            $isPostable = isset($a->is_postable) ? (bool) $a->is_postable : true;
            $balance = 0.0;
            if ($isPostable) {
                $b = $this->getAccountBalanceToDate($a->id, $asOfDate, $branchId, null, $tenantId);
                $balance = $a->type === 'asset'
                    ? (float) $b['debit'] - (float) $b['credit']
                    : (float) $b['credit'] - (float) $b['debit'];
            }
            $byId[$a->id] = [
                'account_id' => $a->id,
                'parent_id' => $a->parent_id,
                'code' => $a->code,
                'name' => $a->name,
                'type' => $a->type,
                'level' => (int) $a->level,
                'is_postable' => $isPostable,
                'amount' => round($balance, 2),
                'children_ids' => [],
            ];
        }

        foreach ($byId as $id => $row) {
            if ($row['parent_id'] && isset($byId[$row['parent_id']])) {
                $byId[$row['parent_id']]['children_ids'][] = $id;
            }
        }

        $maxLevel = (int) collect($byId)->max('level');
        for ($lev = $maxLevel; $lev >= 1; $lev--) {
            foreach ($byId as $id => $row) {
                if ((int) $row['level'] !== $lev) {
                    continue;
                }
                foreach ($row['children_ids'] as $cid) {
                    if (isset($byId[$cid])) {
                        $byId[$id]['amount'] += $byId[$cid]['amount'];
                    }
                }
                $byId[$id]['amount'] = round($byId[$id]['amount'], 2);
            }
        }

        $classifyAsset = function (string $code): string {
            $prefix = substr(preg_replace('/[^0-9]/', '', $code), 0, 2);

            return ($prefix === '11' || (strlen($prefix) === 1 && $prefix === '1')) ? 'current' : 'non_current';
        };
        $classifyLiability = function (string $code): string {
            $prefix = substr(preg_replace('/[^0-9]/', '', $code), 0, 2);

            return ($prefix === '21' || (strlen($prefix) === 1 && $prefix === '2')) ? 'current' : 'non_current';
        };

        $assetsCurrent = [];
        $assetsNonCurrent = [];
        $liabilitiesCurrent = [];
        $liabilitiesNonCurrent = [];
        $equityItems = [];

        // عرض الحسابات الورقية فقط (بدون أبناء) لتفصيل البنود مثل صندوق كاشير، عملاء، مخزون
        foreach ($byId as $id => $row) {
            $hasChildren = ! empty($row['children_ids']);
            if ($hasChildren) {
                continue;
            }
            if ($row['amount'] == 0) {
                continue;
            }
            $item = ['account_id' => $row['account_id'], 'code' => $row['code'], 'name' => $row['name'], 'amount' => $row['amount']];
            if ($row['type'] === 'asset') {
                if ($classifyAsset($row['code']) === 'current') {
                    $assetsCurrent[] = $item;
                } else {
                    $assetsNonCurrent[] = $item;
                }
            } elseif ($row['type'] === 'liability') {
                if ($classifyLiability($row['code']) === 'current') {
                    $liabilitiesCurrent[] = $item;
                } else {
                    $liabilitiesNonCurrent[] = $item;
                }
            } elseif ($row['type'] === 'equity') {
                $equityItems[] = $item;
            }
        }
        // ترتيب حسب الكود
        $sortByCode = fn ($a, $b) => strcmp($a['code'], $b['code']);
        usort($assetsCurrent, $sortByCode);
        usort($assetsNonCurrent, $sortByCode);
        usort($liabilitiesCurrent, $sortByCode);
        usort($liabilitiesNonCurrent, $sortByCode);
        usort($equityItems, $sortByCode);

        $fiscalStart = \Carbon\Carbon::parse($asOfDate)->startOfYear()->format('Y-m-d');
        $netIncome = 0.0;
        try {
            $incomeData = $this->getIncomeStatement($tenantId, $fiscalStart, $asOfDate, $branchId, null);
            $netIncome = round((float) ($incomeData['net_income'] ?? 0), 2);
        } catch (\Throwable $e) {
            // ignore
        }
        if ($netIncome != 0) {
            $equityItems[] = ['account_id' => null, 'code' => '', 'name' => 'صافي ربح الفترة (من قائمة الدخل)', 'amount' => $netIncome];
        }

        $totalAssets = round(
            array_sum(array_column($assetsCurrent, 'amount')) + array_sum(array_column($assetsNonCurrent, 'amount')),
            2
        );
        $totalLiabilities = round(
            array_sum(array_column($liabilitiesCurrent, 'amount')) + array_sum(array_column($liabilitiesNonCurrent, 'amount')),
            2
        );
        $totalEquity = round(array_sum(array_column($equityItems, 'amount')), 2);
        $totalLiabilitiesEquity = round($totalLiabilities + $totalEquity, 2);
        $diff = abs($totalAssets - $totalLiabilitiesEquity);
        $isBalanced = $diff < 0.02;

        $totalCurrentAssets = round(array_sum(array_column($assetsCurrent, 'amount')), 2);
        $totalCurrentLiabilities = round(array_sum(array_column($liabilitiesCurrent, 'amount')), 2);
        $ratios = [];
        if ($totalCurrentLiabilities > 0) {
            $ratios['current_ratio'] = round($totalCurrentAssets / $totalCurrentLiabilities, 2);
        }
        if ($totalEquity > 0 && ($totalLiabilities + $totalEquity) > 0) {
            $ratios['debt_to_equity'] = round($totalLiabilities / $totalEquity, 2);
        }
        if ($totalAssets > 0) {
            $ratios['equity_ratio'] = round($totalEquity / $totalAssets, 2);
        }

        return [
            'as_of_date' => $asOfDate,
            'assets' => [
                'current' => $assetsCurrent,
                'non_current' => $assetsNonCurrent,
                'total' => $totalAssets,
            ],
            'liabilities' => [
                'current' => $liabilitiesCurrent,
                'non_current' => $liabilitiesNonCurrent,
                'total' => $totalLiabilities,
            ],
            'equity' => [
                'items' => $equityItems,
                'total' => $totalEquity,
            ],
            'total_assets' => $totalAssets,
            'total_liabilities_equity' => $totalLiabilitiesEquity,
            'is_balanced' => $isBalanced,
            'balance_difference' => round($diff, 4),
            'net_income' => $netIncome,
            'ratios' => $ratios,
            'tree' => $this->buildBalanceSheetTree($byId),
        ];
    }

    /**
     * شجرة الحسابات للميزانية (أصول، خصوم، حقوق ملكية) مع الرصيد لكل عقدة.
     */
    private function buildBalanceSheetTree(array $byId): array
    {
        $types = ['asset', 'liability', 'equity'];
        $out = [];
        foreach ($types as $type) {
            $roots = array_filter($byId, fn ($r) => ($r['type'] ?? '') === $type && ($r['parent_id'] ?? null) === null);
            usort($roots, fn ($a, $b) => strcmp($a['code'], $b['code']));
            $out[$type] = array_map(function ($r) use ($byId) {
                return $this->balanceSheetNode($r, $byId);
            }, $roots);
        }

        return $out;
    }

    private function balanceSheetNode(array $row, array $byId): array
    {
        $node = [
            'account_id' => (int) ($row['account_id'] ?? 0),
            'code' => $row['code'],
            'name' => $row['name'],
            'amount' => $row['amount'],
            'children' => [],
        ];
        foreach ($row['children_ids'] ?? [] as $cid) {
            if (isset($byId[$cid])) {
                $node['children'][] = $this->balanceSheetNode($byId[$cid], $byId);
            }
        }

        return $node;
    }

    /**
     * إرجاع ملاحظات السند/الفاتورة كما يظهر للمستخدم (بدون الملخص الآلي للأسطر القديم).
     */
    private function sourceNotesForStatement(?string $notes): string
    {
        if ($notes === null || $notes === '') {
            return '';
        }
        $normalized = str_replace("\r\n", "\n", $notes);
        // فاصل الملخص الآلي: 3+ من شرطات متنوعة أو «تفاصيل الأسطر:»
        if (preg_match('/\n\n(?:[\x{2500}\x{2013}\x{2014}\x{2015}\-]{3,}\n|تفاصيل الأسطر:\n)/u', $normalized, $m, PREG_OFFSET_CAPTURE)) {
            return trim(substr($normalized, 0, $m[0][1]));
        }

        return trim($normalized);
    }

    /**
     * إجمالي مدين/دائن لسطور حساب معيّن مع اختيار تصفية بعميل القيد (للحركات على حساب أقساط مدينة لعميل محدد).
     *
     * @return array{debit: float, credit: float, balance: float}
     */
    private function sumAccountLinesForJournalCustomer(
        int $tenantId,
        int $accountId,
        ?string $toDateInclusive,
        int $journalCustomerId
    ): array {
        $q = JournalEntryLine::query()
            ->where('journal_entry_lines.account_id', $accountId)
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entries.tenant_id', $tenantId)
            ->where('journal_entries.status', 'posted')
            ->where('journal_entries.customer_id', $journalCustomerId);
        if ($toDateInclusive) {
            $q->whereDate('journal_entries.date', '<=', $toDateInclusive);
        }
        $debit = (float) $q->sum('journal_entry_lines.debit');
        $credit = (float) $q->sum('journal_entry_lines.credit');

        return [
            'debit' => $debit,
            'credit' => $credit,
            'balance' => $debit - $credit,
        ];
    }

    /**
     * @deprecated لم يعد اعتماد جدول الأقساط يُنشئ قيد إعادة تصنيف؛ قيود الفاتورة تبقى على ذمة العميل حتى التحصيل بسند القبض.
     *
     * @return list<int>
     */
    private function installmentLinkedInvoiceIdsForCustomer(int $tenantId, int $customerId): array
    {
        unset($tenantId, $customerId);

        return [];
    }

    /**
     * @param  list<int>  $excludedInvoiceIds
     */
    private function shouldHideLineForOrdinaryCustomerReceivable(?JournalEntry $je, array $excludedInvoiceIds): bool
    {
        if (! $je || $je->reference_type === null || $je->reference_id === null) {
            return false;
        }
        if (str_ends_with((string) $je->reference_type, 'Installment')) {
            return true;
        }
        if (str_ends_with((string) $je->reference_type, 'Invoice')) {
            return in_array((int) $je->reference_id, $excludedInvoiceIds, true);
        }

        return false;
    }

    /**
     * رصيد افتتاحي مع استثناء حركات الأقساط (قيد التصنيف + قيود الفواتير المرتبطة بجدول أقساط معتمد) لحساب عميل.
     *
     * @param  list<int>  $excludedInvoiceIds
     */
    private function openingBalanceCustomerOrdinaryWithoutInstallments(
        int $tenantId,
        int $accountId,
        string $openingToDateInclusive,
        array $excludedInvoiceIds
    ): float {
        $lines = JournalEntryLine::query()
            ->where('journal_entry_lines.account_id', $accountId)
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entries.tenant_id', $tenantId)
            ->where('journal_entries.status', 'posted')
            ->whereDate('journal_entries.date', '<=', $openingToDateInclusive)
            ->select('journal_entry_lines.*')
            ->get();

        $jeIds = $lines->pluck('journal_entry_id')->unique()->values()->all();
        $journalEntries = $jeIds ? JournalEntry::whereIn('id', $jeIds)->get()->keyBy('id') : collect();

        $debit = 0.0;
        $credit = 0.0;
        foreach ($lines as $line) {
            $je = $journalEntries->get($line->journal_entry_id);
            if ($this->shouldHideLineForOrdinaryCustomerReceivable($je, $excludedInvoiceIds)) {
                continue;
            }
            $debit += (float) $line->debit;
            $credit += (float) $line->credit;
        }

        return $debit - $credit;
    }

    /**
     * كشف حساب: رصيد افتتاحي + حركات الفترة + رصيد اختتامي
     *
     * @param  int|null  $journalCustomerId  عند التمرير: حركات هذا الحساب المقيدة بقيد يحمل نفس customer_id فقط (كشف أقساط مدينة للعميل)
     * @param  bool  $includeInstallments  عند false وحساب مرتبط بعميل: إخفاء قيود مرجعها Installment فقط (قيود قديمة قبل إلغاء قيد الاعتماد)
     */
    public function getAccountStatement(int $tenantId, int $accountId, string $fromDate, string $toDate, ?int $journalCustomerId = null, bool $includeInstallments = true): array
    {
        $account = Account::where('tenant_id', $tenantId)->findOrFail($accountId);
        $linkedCustomer = Customer::where('tenant_id', $tenantId)->where('account_id', $accountId)->first();
        $openingTo = \Carbon\Carbon::parse($fromDate)->subDay()->format('Y-m-d');

        if ($journalCustomerId !== null) {
            $openingBalanceData = $this->sumAccountLinesForJournalCustomer($tenantId, $accountId, $openingTo, $journalCustomerId);
            $openingBalance = $openingBalanceData['balance'];
        } elseif ($linkedCustomer && ! $includeInstallments) {
            $excludedOpening = $this->installmentLinkedInvoiceIdsForCustomer($tenantId, $linkedCustomer->id);
            $openingBalance = $this->openingBalanceCustomerOrdinaryWithoutInstallments($tenantId, $accountId, $openingTo, $excludedOpening);
        } else {
            $openingBalanceData = $this->getAccountBalance($accountId, null, $openingTo, null, null, $tenantId);
            $openingBalance = $openingBalanceData['debit'] - $openingBalanceData['credit'];
        }

        $lines = JournalEntryLine::where('journal_entry_lines.account_id', $accountId)
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entries.tenant_id', $tenantId)
            ->where('journal_entries.status', 'posted')
            ->when($journalCustomerId !== null, fn ($q) => $q->where('journal_entries.customer_id', $journalCustomerId))
            ->whereDate('journal_entries.date', '>=', $fromDate)
            ->whereDate('journal_entries.date', '<=', $toDate)
            ->select('journal_entry_lines.*')
            ->orderBy('journal_entries.date', 'asc')
            ->orderBy('journal_entry_lines.id', 'asc')
            ->get();

        $jeIds = $lines->pluck('journal_entry_id')->unique()->values()->all();
        $journalEntries = $jeIds ? JournalEntry::whereIn('id', $jeIds)->get()->keyBy('id') : collect();
        foreach ($lines as $line) {
            $line->setRelation('journalEntry', $journalEntries->get($line->journal_entry_id));
        }

        if ($linkedCustomer && ! $includeInstallments && $journalCustomerId === null) {
            $excludedInvoiceIds = $this->installmentLinkedInvoiceIdsForCustomer($tenantId, $linkedCustomer->id);
            $lines = $lines->filter(function (JournalEntryLine $line) use ($excludedInvoiceIds) {
                $je = $line->journalEntry;

                return ! $this->shouldHideLineForOrdinaryCustomerReceivable($je, $excludedInvoiceIds);
            })->values();
            $jeIds = $lines->pluck('journal_entry_id')->unique()->values()->all();
            $journalEntries = $jeIds ? JournalEntry::whereIn('id', $jeIds)->get()->keyBy('id') : collect();
            foreach ($lines as $line) {
                $line->setRelation('journalEntry', $journalEntries->get($line->journal_entry_id));
            }
        }

        // نجمع حركات نفس القيد (نفس الفاتورة/السند) في سطر واحد في كشف الحساب
        $grouped = [];
        $invoiceIds = [];
        $paymentIds = [];
        $installmentIds = [];
        $invoiceNumbers = [];
        $paymentNumbers = [];
        foreach ($journalEntries as $entry) {
            if (! $entry?->reference_type || ! $entry?->reference_id) {
                // بعض القيود القديمة لا تحتوي reference_id لكن تحتوي number (مثل PUR-000005 / PAY-...)
                $entryNumber = trim((string) ($entry?->number ?? ''));
                if ($entry?->reference_type && str_ends_with((string) $entry->reference_type, 'Invoice') && $entryNumber !== '') {
                    $invoiceNumbers[] = $entryNumber;
                } elseif ($entry?->reference_type && str_ends_with((string) $entry->reference_type, 'Payment') && $entryNumber !== '') {
                    $paymentNumbers[] = $entryNumber;
                }

                continue;
            }
            if (str_ends_with((string) $entry->reference_type, 'Invoice')) {
                $invoiceIds[] = (int) $entry->reference_id;
            } elseif (str_ends_with((string) $entry->reference_type, 'Payment')) {
                $paymentIds[] = (int) $entry->reference_id;
            } elseif (str_ends_with((string) $entry->reference_type, 'Installment')) {
                $installmentIds[] = (int) $entry->reference_id;
            }
        }

        $invoicesById = ! empty($invoiceIds)
            ? Invoice::whereIn('id', array_values(array_unique($invoiceIds)))
                ->get(['id', 'number', 'notes', 'type', 'is_return'])
                ->keyBy('id')
            : collect();

        $paymentsById = ! empty($paymentIds)
            ? Payment::whereIn('id', array_values(array_unique($paymentIds)))
                ->get(['id', 'number', 'notes', 'type'])
                ->keyBy('id')
            : collect();

        $invoicesByNumber = ! empty($invoiceNumbers)
            ? Invoice::where('tenant_id', $tenantId)
                ->whereIn('number', array_values(array_unique($invoiceNumbers)))
                ->get(['id', 'number', 'notes', 'type', 'is_return'])
                ->keyBy('number')
            : collect();

        $paymentsByNumber = ! empty($paymentNumbers)
            ? Payment::where('tenant_id', $tenantId)
                ->whereIn('number', array_values(array_unique($paymentNumbers)))
                ->get(['id', 'number', 'notes', 'type'])
                ->keyBy('number')
            : collect();

        $installmentsById = ! empty($installmentIds)
            ? Installment::where('tenant_id', $tenantId)
                ->whereIn('id', array_values(array_unique($installmentIds)))
                ->get(['id', 'number', 'notes'])
                ->keyBy('id')
            : collect();

        foreach ($lines as $line) {
            $je = $line->journalEntry;
            if (! $je) {
                continue;
            }
            $debit = (float) $line->debit;
            $credit = (float) $line->credit;

            $refNumber = $je->number ?? '';
            $operationCode = 'manual';
            $sourceNotes = null;
            if ($je->reference_type && str_ends_with($je->reference_type, 'Invoice')) {
                $inv = $invoicesById->get((int) $je->reference_id);
                if (! $inv) {
                    $inv = $invoicesByNumber->get((string) ($je->number ?? ''));
                }
                $refNumber = $inv ? $inv->number : $je->number;
                $operationCode = $inv ? ($inv->is_return ? ($inv->type === 'sales' ? 'return_sales' : 'return_purchase') : ($inv->type === 'sales' ? 'sales_invoice' : 'purchase_invoice')) : 'manual';
                $sourceNotes = $inv?->notes;
            } elseif ($je->reference_type && str_ends_with($je->reference_type, 'Payment')) {
                $pay = $paymentsById->get((int) $je->reference_id);
                if (! $pay) {
                    $pay = $paymentsByNumber->get((string) ($je->number ?? ''));
                }
                $operationCode = $pay && strtolower((string) $pay->type) === 'receipt' ? 'receipt_voucher' : 'payment_voucher';
                $sourceNotes = $pay?->notes;
            } elseif ($je->reference_type && str_ends_with((string) $je->reference_type, 'Installment')) {
                $inst = $installmentsById->get((int) $je->reference_id);
                $refNumber = $inst ? (string) $inst->number : ($je->number ?? '');
                $operationCode = 'installment_schedule';
                $sourceNotes = $inst?->notes;
            } elseif ($je->type) {
                $operationCode = $je->type === 'sales' ? 'sales_invoice' : ($je->type === 'purchase' ? 'purchase_invoice' : 'other');
            }

            $operationType = $this->mapJournalTypeToOperationLabel($je->type, $je->reference_type);

            // مفتاح التجميع: نفس القيد ونفس كود العملية والمرجع
            $key = $je->id.'|'.$operationCode.'|'.($refNumber ?? '');
            if (! isset($grouped[$key])) {
                // أولوية البيان: ملاحظات السند/الفاتورة الأصلية (بدون ملخص الأسطر الآلي) ثم وصف السطر ثم وصف القيد
                $baseDesc = null;
                if (is_string($sourceNotes) && trim($sourceNotes) !== '') {
                    $clean = $this->sourceNotesForStatement($sourceNotes);
                    if ($clean !== '') {
                        $baseDesc = $clean;
                    }
                }
                if ($baseDesc === null && is_string($line->description) && trim($line->description) !== '') {
                    $baseDesc = trim($line->description);
                }
                if ($baseDesc === null && is_string($je->description) && trim($je->description) !== '') {
                    $baseDesc = trim($je->description);
                }

                $grouped[$key] = [
                    'date' => $je->date?->format('Y-m-d'),
                    'reference_number' => $refNumber,
                    'operation_type' => $operationType,
                    'operation_code' => $operationCode,
                    'description' => $baseDesc,
                    'debit' => 0.0,
                    'credit' => 0.0,
                    'journal_entry_id' => $je->id,
                    'reference_type' => $je->reference_type,
                    'reference_id' => $je->reference_id,
                    'branch_id' => $je->branch_id,
                    'cost_center_id' => $line->cost_center_id,
                ];
            }

            $grouped[$key]['debit'] += $debit;
            $grouped[$key]['credit'] += $credit;
            if (empty($grouped[$key]['cost_center_id']) && $line->cost_center_id) {
                $grouped[$key]['cost_center_id'] = (int) $line->cost_center_id;
            }
        }

        // ترتيب حسب التاريخ ثم رقم المرجع
        $entries = array_values($grouped);
        usort($entries, function (array $a, array $b) {
            $da = $a['date'] ?? '';
            $db = $b['date'] ?? '';
            if ($da !== $db) {
                return strcmp((string) $da, (string) $db);
            }

            return strcmp((string) ($a['reference_number'] ?? ''), (string) ($b['reference_number'] ?? ''));
        });

        $branchIds = collect($entries)->pluck('branch_id')->filter()->unique()->values()->all();
        $costCenterIds = collect($entries)->pluck('cost_center_id')->filter()->unique()->values()->all();

        $branches = ! empty($branchIds)
            ? Branch::where('tenant_id', $tenantId)->whereIn('id', $branchIds)->get(['id', 'name', 'name_en'])->keyBy('id')
            : collect();
        $costCenters = ! empty($costCenterIds)
            ? CostCenter::where('tenant_id', $tenantId)->whereIn('id', $costCenterIds)->get(['id', 'name', 'name_en'])->keyBy('id')
            : collect();

        $runningBalance = $openingBalance;
        $totalDebit = 0.0;
        $totalCredit = 0.0;
        $statementLines = [];

        foreach ($entries as $row) {
            $debit = (float) $row['debit'];
            $credit = (float) $row['credit'];
            $totalDebit += $debit;
            $totalCredit += $credit;
            $runningBalance += ($debit - $credit);

            $bid = $row['branch_id'] ?? null;
            $ccid = $row['cost_center_id'] ?? null;
            $branch = $bid ? $branches->get($bid) : null;
            $cc = $ccid ? $costCenters->get($ccid) : null;

            $row['branch_name'] = $branch?->name;
            $row['branch_name_en'] = $branch?->name_en;
            $row['cost_center_name'] = $cc?->name;
            $row['cost_center_name_en'] = $cc?->name_en;
            $row['branch_id'] = $bid ? (int) $bid : null;
            $row['cost_center_id'] = $ccid ? (int) $ccid : null;
            $row['running_balance'] = round($runningBalance, 4);
            $statementLines[] = $row;
        }

        $closingBalance = $openingBalance + $totalDebit - $totalCredit;

        $openingBalanceAsOf = $openingTo;
        // «منذ البداية» (1970-01-01): لا يُعرض سطر الرصيد السابق في الواجهة
        $showPreviousBalance = $fromDate !== '1970-01-01';

        $customer = $linkedCustomer;
        $vendor = Vendor::where('tenant_id', $tenantId)->where('account_id', $accountId)->first();

        return [
            'linked_customer_id' => $linkedCustomer?->id,
            'installment_lines_included' => $linkedCustomer === null || $journalCustomerId !== null || $includeInstallments,
            'account' => [
                'id' => $account->id,
                'code' => $account->code,
                'name' => $account->name,
                'name_en' => $account->name_en,
                'account_holder' => $customer?->name ?? $vendor?->name ?? $account->name,
                'phone' => $customer?->phone ?? $vendor?->phone,
                'address' => $customer?->address ?? $vendor?->address,
                'tax_number' => $customer?->tax_number ?? $vendor?->tax_number,
            ],
            'period' => ['from' => $fromDate, 'to' => $toDate],
            'opening_balance' => round($openingBalance, 4),
            'opening_balance_as_of' => $openingBalanceAsOf,
            'show_previous_balance' => $showPreviousBalance,
            'lines' => $statementLines,
            'total_debit' => round($totalDebit, 4),
            'total_credit' => round($totalCredit, 4),
            'closing_balance' => round($closingBalance, 4),
            'balance_type' => $closingBalance >= 0 ? 'debit' : 'credit',
        ];
    }

    private function mapJournalTypeToOperationLabel(?string $journalType, ?string $referenceType): string
    {
        if ($referenceType && str_ends_with((string) $referenceType, 'Installment')) {
            return 'جدول أقساط';
        }
        if ($referenceType && str_ends_with($referenceType, 'Invoice')) {
            return 'فاتورة';
        }
        if ($referenceType && str_ends_with($referenceType, 'Payment')) {
            return 'دفعة';
        }
        $map = [
            'manual' => 'قيد يدوي',
            'sales' => 'مبيعات',
            'purchase' => 'مشتريات',
            'payment' => 'سند صرف/قبض',
            'installment' => 'جدول أقساط',
            'expense' => 'مصروف',
            'adjustment' => 'تسوية',
            'opening' => 'رصيد افتتاحي',
            'closing' => 'قيد إقفال',
        ];

        return $map[$journalType ?? ''] ?? ($journalType ?? '—');
    }
}
