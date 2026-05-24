<?php

namespace App\Services;

use App\Models\Account;
use App\Models\FiscalYear;
use App\Models\Item;
use App\Models\JournalEntry;
use App\Models\Warehouse;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class FiscalYearClosingService
{
    public function __construct(
        private AccountingService $accounting,
        private TenantSettingsService $settings,
        private InventoryService $inventory,
        private AuditLogService $auditLog,
    ) {}

    /**
     * إقفال السنة: قيد إقفال للإيرادات ومصروفات وتكلفة المبيعات → الأرباح المحتجزة، ولقطة أرصدة افتتاحية، واختيارياً أرشفة مخزون.
     *
     * @return array{closing_journal_entry: ?JournalEntry, fiscal_year: FiscalYear, inventory_snapshot?: list<array<string, mixed>>}
     */
    public function closeYear(
        FiscalYear $fy,
        int $userId,
        bool $archiveInventory = false,
        ?int $retainedEarningsAccountId = null,
    ): array {
        if ($fy->is_closed) {
            throw new \InvalidArgumentException('هذه السنة المالية مقفلة مسبقاً.');
        }

        $tenantId = (int) $fy->tenant_id;
        if ($retainedEarningsAccountId !== null) {
            $reAccount = $this->assertEligibleRetainedEarningsAccount($tenantId, $retainedEarningsAccountId);
            $reId = (int) $reAccount->id;
        } else {
            $reId = (int) $this->settings->get($tenantId, 'retained_earnings_account_id', 0);
            if ($reId < 1) {
                throw new \InvalidArgumentException('يرجى ضبط حساب الأرباح المحتجزة (retained_earnings_account_id) في إعدادات المحاسبة.');
            }

            $reAccount = Account::where('tenant_id', $tenantId)->where('id', $reId)->first();
            if (! $reAccount || ! $reAccount->is_postable) {
                throw new \InvalidArgumentException('حساب الأرباح المحتجزة غير صالح أو غير قابل للترحيل.');
            }
        }

        $endDate = $fy->end_date->format('Y-m-d');

        return DB::transaction(function () use ($fy, $tenantId, $reId, $reAccount, $endDate, $userId, $archiveInventory) {
            $entry = null;
            $lines = [];
            $closingSummary = [
                'total_revenue' => 0.0,
                'total_cogs' => 0.0,
                'total_expenses' => 0.0,
                'net_profit' => 0.0,
                'total_debit_lines' => 0.0,
                'total_credit_lines' => 0.0,
            ];

            FiscalYearLockService::$bypass = true;
            try {
                $lines = $this->buildClosingLines($tenantId, $endDate, $reId);
                if (count($lines) >= 2) {
                    $entry = $this->accounting->createJournalEntry([
                        'tenant_id' => $tenantId,
                        'date' => $endDate,
                        'type' => 'closing',
                        'description' => 'قيد إقفال السنة المالية '.$fy->year,
                        'reference_type' => FiscalYear::class,
                        'reference_id' => $fy->id,
                        'status' => 'posted',
                        'created_by' => $userId,
                        'posted_at' => now(),
                    ], $lines);
                }

                $snapshot = $this->buildBalanceSheetSnapshot($tenantId, $endDate);
                $invSnap = null;
                if ($archiveInventory) {
                    $invSnap = $this->buildInventorySnapshot($fy);
                }

                $closingSummary = $this->buildClosingSummaryFromLines($tenantId, $lines, $reId);

                $fy->update([
                    'is_closed' => true,
                    'closed_at' => now(),
                    'closing_journal_entry_id' => $entry?->id,
                    'retained_earnings_account_id' => $reId,
                    'opening_balances_snapshot' => $snapshot,
                    'inventory_snapshot' => $invSnap,
                    'inventory_carried_forward' => (bool) $archiveInventory,
                    'closed_by' => $userId,
                    'closing_summary' => array_merge($closingSummary, [
                        'retained_earnings_account_id' => $reId,
                        'retained_earnings_account_name' => $reAccount->name,
                    ]),
                ]);

                $fyFresh = $fy->fresh();
                $this->auditLog->log(
                    'fiscal_year_closed',
                    'fiscal_years',
                    $fyFresh,
                    null,
                    array_merge($closingSummary, [
                        'year' => $fyFresh->year,
                        'retained_to' => $reAccount->name,
                        'retained_earnings_account_id' => $reId,
                    ]),
                    $tenantId,
                    $userId
                );

                $this->ensureFiscalYearsExist($tenantId);
            } finally {
                FiscalYearLockService::$bypass = false;
            }

            $fyAfter = $fy->fresh();
            $result = [
                'closing_journal_entry' => $entry ? $entry->load('lines.account') : null,
                'fiscal_year' => $fyAfter,
                'net_profit' => $closingSummary['net_profit'] ?? null,
            ];
            if ($archiveInventory) {
                $result['inventory_snapshot'] = $fyAfter->inventory_snapshot ?? [];
            }

            return $result;
        });
    }

    /**
     * معاينة قيد الإقفال (نفس منطق الإقفال الفعلي) مع أسماء الحسابات والإجماليات.
     *
     * @return array{
     *   lines: list<array<string, mixed>>,
     *   total_revenue: float,
     *   total_cogs: float,
     *   total_expenses: float,
     *   net_profit: float,
     *   retained_earnings_account: ?array{id:int, code:string, name:string}
     * }
     */
    /**
     * @param  int  $retainedEarningsAccountId  حساب حقوق ملكية يقبل الترحيل لصافي الربح/الخسارة
     */
    public function previewClosingEntry(FiscalYear $fy, int $retainedEarningsAccountId): array
    {
        if ($fy->is_closed) {
            throw new \InvalidArgumentException('هذه السنة المالية مقفلة مسبقاً.');
        }

        $tenantId = (int) $fy->tenant_id;
        $reAccount = $this->assertEligibleRetainedEarningsAccount($tenantId, $retainedEarningsAccountId);
        $reId = (int) $reAccount->id;

        $endDate = $fy->end_date->format('Y-m-d');
        $lines = $this->buildClosingLines($tenantId, $endDate, $reId);
        $displayLines = $this->mapLinesToPreview($tenantId, $lines, $reId);
        $summary = $this->buildClosingSummaryFromLines($tenantId, $lines, $reId);

        return [
            'lines' => $displayLines,
            'total_revenue' => $summary['total_revenue'],
            'total_cogs' => $summary['total_cogs'],
            'total_expenses' => $summary['total_expenses'],
            'net_profit' => $summary['net_profit'],
            'is_profit' => $summary['net_profit'] >= 0,
            'retained_earnings_account' => $reAccount->only(['id', 'code', 'name', 'type']),
        ];
    }

    /**
     * حساب حقوق ملكية قابل للترحيل ضمن نفس المستأجر.
     */
    public function assertEligibleRetainedEarningsAccount(int $tenantId, int $accountId): Account
    {
        $acc = Account::where('tenant_id', $tenantId)
            ->where('id', $accountId)
            ->where('is_active', true)
            ->where('is_postable', true)
            ->where('type', 'equity')
            ->first();

        if (! $acc) {
            throw new \InvalidArgumentException('الحساب المحدد غير صالح لترحيل الربح/الخسارة (يجب أن يكون من نوع حقوق ملكية وقابلاً للترحيل).');
        }

        return $acc;
    }

    /**
     * @param  list<array{account_id: int, debit: float|int, credit: float|int, description?: string}>  $lines
     * @return array{total_revenue: float, total_cogs: float, total_expenses: float, net_profit: float, total_debit_lines: float, total_credit_lines: float}
     */
    private function buildClosingSummaryFromLines(int $tenantId, array $lines, int $reId): array
    {
        if ($lines === []) {
            return [
                'total_revenue' => 0.0,
                'total_cogs' => 0.0,
                'total_expenses' => 0.0,
                'net_profit' => 0.0,
                'total_debit_lines' => 0.0,
                'total_credit_lines' => 0.0,
            ];
        }

        $ids = array_unique(array_column($lines, 'account_id'));
        $accounts = Account::where('tenant_id', $tenantId)->whereIn('id', $ids)->get()->keyBy('id');

        $totalRevenue = 0.0;
        $totalCogs = 0.0;
        $totalExpenses = 0.0;
        $totalDebitLines = 0.0;
        $totalCreditLines = 0.0;
        $reDebit = 0.0;
        $reCredit = 0.0;

        foreach ($lines as $line) {
            $aid = (int) $line['account_id'];
            $d = round((float) ($line['debit'] ?? 0), AccountingService::JOURNAL_AMOUNT_DECIMALS);
            $c = round((float) ($line['credit'] ?? 0), AccountingService::JOURNAL_AMOUNT_DECIMALS);
            $totalDebitLines += $d;
            $totalCreditLines += $c;

            if ($aid === $reId) {
                $reDebit += $d;
                $reCredit += $c;

                continue;
            }

            $acc = $accounts->get($aid);
            if (! $acc) {
                continue;
            }
            if ($acc->type === 'revenue') {
                $totalRevenue += $d;
            } elseif ($acc->type === 'cogs') {
                $totalCogs += $c;
            } elseif ($acc->type === 'expense') {
                $totalExpenses += $c;
            }
        }

        $netProfit = round($reCredit - $reDebit, AccountingService::JOURNAL_AMOUNT_DECIMALS);

        return [
            'total_revenue' => round($totalRevenue, AccountingService::JOURNAL_AMOUNT_DECIMALS),
            'total_cogs' => round($totalCogs, AccountingService::JOURNAL_AMOUNT_DECIMALS),
            'total_expenses' => round($totalExpenses, AccountingService::JOURNAL_AMOUNT_DECIMALS),
            'net_profit' => $netProfit,
            'total_debit_lines' => round($totalDebitLines, AccountingService::JOURNAL_AMOUNT_DECIMALS),
            'total_credit_lines' => round($totalCreditLines, AccountingService::JOURNAL_AMOUNT_DECIMALS),
        ];
    }

    /**
     * @param  list<array{account_id: int, debit: float|int, credit: float|int, description?: string}>  $lines
     * @return list<array<string, mixed>>
     */
    private function mapLinesToPreview(int $tenantId, array $lines, int $retainedEarningsAccountId): array
    {
        if ($lines === []) {
            return [];
        }

        $ids = array_unique(array_column($lines, 'account_id'));
        $accounts = Account::where('tenant_id', $tenantId)->whereIn('id', $ids)->get()->keyBy('id');

        $out = [];
        foreach ($lines as $line) {
            $aid = (int) $line['account_id'];
            $acc = $accounts->get($aid);
            $out[] = [
                'account_id' => $aid,
                'account_name' => $acc?->name ?? '',
                'account_code' => $acc?->code ?? '',
                'debit' => round((float) ($line['debit'] ?? 0), AccountingService::JOURNAL_AMOUNT_DECIMALS),
                'credit' => round((float) ($line['credit'] ?? 0), AccountingService::JOURNAL_AMOUNT_DECIMALS),
                'description' => (string) ($line['description'] ?? ''),
                'is_retained_earnings_line' => $aid === $retainedEarningsAccountId,
            ];
        }

        return $out;
    }

    /**
     * @return list<array{account_id: int, debit: float|int, credit: float|int, description?: string}>
     */
    private function buildClosingLines(int $tenantId, string $endDate, int $retainedEarningsId): array
    {
        $accounts = Account::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->where('is_postable', true)
            ->whereIn('type', ['revenue', 'expense', 'cogs'])
            ->orderBy('code')
            ->get();

        $lines = [];
        $totalDebit = 0.0;
        $totalCredit = 0.0;

        foreach ($accounts as $account) {
            if ((int) $account->id === $retainedEarningsId) {
                continue;
            }
            $bal = $this->accounting->getAccountBalanceToDate($account->id, $endDate, null, null, $tenantId);
            $net = round((float) $bal['balance'], AccountingService::JOURNAL_AMOUNT_DECIMALS);

            if ($account->type === 'revenue') {
                $closeDebit = round(-$net, AccountingService::JOURNAL_AMOUNT_DECIMALS);
                if ($closeDebit > 0.0005) {
                    $lines[] = [
                        'account_id' => $account->id,
                        'debit' => $closeDebit,
                        'credit' => 0,
                        'description' => 'إقفال إيرادات — '.$account->name,
                    ];
                    $totalDebit += $closeDebit;
                }
            } elseif (in_array($account->type, ['expense', 'cogs'], true)) {
                $closeCredit = $net > 0 ? $net : 0;
                $closeCredit = round($closeCredit, AccountingService::JOURNAL_AMOUNT_DECIMALS);
                if ($closeCredit > 0.0005) {
                    $lines[] = [
                        'account_id' => $account->id,
                        'debit' => 0,
                        'credit' => $closeCredit,
                        'description' => 'إقفال مصروفات/تكلفة — '.$account->name,
                    ];
                    $totalCredit += $closeCredit;
                }
            }
        }

        $diff = round($totalDebit - $totalCredit, AccountingService::JOURNAL_AMOUNT_DECIMALS);
        if (abs($diff) > 0.0005) {
            if ($diff > 0) {
                $lines[] = [
                    'account_id' => $retainedEarningsId,
                    'debit' => 0,
                    'credit' => $diff,
                    'description' => 'ترحيل صافي الربح إلى الأرباح المحتجزة',
                ];
            } else {
                $lines[] = [
                    'account_id' => $retainedEarningsId,
                    'debit' => -$diff,
                    'credit' => 0,
                    'description' => 'ترحيل صافي الخسارة إلى الأرباح المحتجزة',
                ];
            }
        }

        return $lines;
    }

    /**
     * لقطة أرصدة الميزانية (أصول/خصوم/حقوق) بعد الإقفال — لاستخدامها كمرجع لأرصدة الافتتاح المنطقية.
     *
     * @return list<array<string, mixed>>
     */
    private function buildBalanceSheetSnapshot(int $tenantId, string $endDate): array
    {
        $accounts = Account::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->where('is_postable', true)
            ->whereIn('type', ['asset', 'liability', 'equity'])
            ->orderBy('code')
            ->get();

        $out = [];
        foreach ($accounts as $account) {
            $bal = $this->accounting->getAccountBalanceToDate($account->id, $endDate, null, null, $tenantId);
            $b = round((float) $bal['balance'], AccountingService::JOURNAL_AMOUNT_DECIMALS);
            if (abs($b) < 0.0005) {
                continue;
            }
            $out[] = [
                'account_id' => $account->id,
                'code' => $account->code,
                'name' => $account->name,
                'type' => $account->type,
                'balance' => $b,
                'debit_balance' => $b > 0 ? $b : 0,
                'credit_balance' => $b < 0 ? -$b : 0,
            ];
        }

        return $out;
    }

    /**
     * لقطة مخزون نهاية السنة (بدون حركات مخزنية) لتفادي مضاعفة الكميات مع دفتر حركات مستمر.
     *
     * @return list<array<string, mixed>>
     */
    private function buildInventorySnapshot(FiscalYear $fy): array
    {
        $tenantId = (int) $fy->tenant_id;
        $endDate = $fy->end_date->format('Y-m-d');
        $warehouses = Warehouse::where('tenant_id', $tenantId)->where('is_active', true)->get();
        $out = [];

        foreach ($warehouses as $wh) {
            $itemIds = Item::where('tenant_id', $tenantId)->where('is_active', true)->pluck('id');
            foreach ($itemIds as $itemId) {
                $qty = $this->inventory->getItemStockAsOf((int) $itemId, $endDate, (int) $wh->id);
                if ($qty <= 0.00005) {
                    continue;
                }
                $unitCost = $this->inventory->resolveUnitCostAsOf((int) $itemId, $endDate, (int) $wh->id);
                $out[] = [
                    'warehouse_id' => (int) $wh->id,
                    'warehouse_name' => $wh->name,
                    'branch_id' => $wh->branch_id ? (int) $wh->branch_id : null,
                    'item_id' => (int) $itemId,
                    'quantity' => round($qty, 4),
                    'unit_cost' => round($unitCost, 4),
                    'total_cost' => round($qty * $unitCost, 4),
                    'as_of' => $endDate,
                ];
            }
        }

        return $out;
    }

    public function ensureFiscalYearsExist(int $tenantId, ?int $startMonth = null): void
    {
        $month = $startMonth ?? (int) $this->settings->get($tenantId, 'fiscal_year_start_month', 1);
        $month = max(1, min(12, $month));

        $currentYear = (int) Carbon::now()->year;
        foreach ([$currentYear - 1, $currentYear, $currentYear + 1] as $y) {
            $start = Carbon::createFromDate($y, $month, 1);
            $end = $start->copy()->addYear()->subDay();
            FiscalYear::firstOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'year' => $y,
                ],
                [
                    'start_date' => $start->format('Y-m-d'),
                    'end_date' => $end->format('Y-m-d'),
                    'is_closed' => false,
                    'is_locked' => false,
                ]
            );
        }
    }

    public function setLocked(FiscalYear $fy, bool $locked, ?int $userId = null): FiscalYear
    {
        $fy->update([
            'is_locked' => $locked,
            'locked_at' => $locked ? now() : null,
        ]);

        return $fy->fresh();
    }
}
