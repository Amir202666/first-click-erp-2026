<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\LoyaltyPoint;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyTier;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class LoyaltyService
{
    public function getProgram(int $tenantId, ?int $programId = null): ?LoyaltyProgram
    {
        $q = LoyaltyProgram::where('tenant_id', $tenantId);
        if ($programId) {
            $q->where('id', $programId);
        }

        return $q->with(['tiers' => fn ($t) => $t->orderBy('min_points')])->orderBy('sort_order')->orderBy('id')->first();
    }

    public function getPrograms(int $tenantId, ?string $module = null): Collection
    {
        $q = LoyaltyProgram::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->with(['tiers' => fn ($t) => $t->orderBy('min_points')])
            ->orderBy('sort_order')
            ->orderBy('id');

        if ($module) {
            $col = 'apply_on_'.$module;
            $q->where($col, true);
        }

        return $q->get();
    }

    public function getEligiblePrograms(int $tenantId, int $customerId, string $module): Collection
    {
        return $this->getPrograms($tenantId, $module)
            ->filter(fn (LoyaltyProgram $p) => $p->isEligibleFor($customerId))
            ->values();
    }

    /**
     * @return array{balance: float, total_earned: float, total_redeemed: float, tier_id: int|null}
     */
    public function getCustomerBalance(int $tenantId, int $customerId, int $programId): array
    {
        $customer = Customer::where('tenant_id', $tenantId)->find($customerId);
        $balances = is_array($customer?->loyalty_balances) ? $customer->loyalty_balances : [];
        $key = (string) $programId;
        $row = is_array($balances[$key] ?? null) ? $balances[$key] : null;

        $jsonBalance = (float) ($row['balance'] ?? 0);
        $totalEarned = (float) ($row['total_earned'] ?? 0);
        $totalRedeemed = (float) ($row['total_redeemed'] ?? 0);
        $tierId = isset($row['tier_id']) ? (int) $row['tier_id'] : null;

        // مصدر الحقيقة: مجموع حركات loyalty_points للبرنامج (يصلح تعارض JSON مع الدفتر)
        $ledgerForProgram = round(max(0, (float) LoyaltyPoint::query()
            ->where('tenant_id', $tenantId)
            ->where('customer_id', $customerId)
            ->where('loyalty_program_id', $programId)
            ->sum('points')), 3);

        $balance = max($jsonBalance, $ledgerForProgram);

        // نقاط قديمة بلا loyalty_program_id: تُعرض كرصيد لأوّل برنامج نشط في المستأجر (سلوك الترحيل السابق)
        $orphanSum = round(max(0, (float) LoyaltyPoint::query()
            ->where('tenant_id', $tenantId)
            ->where('customer_id', $customerId)
            ->whereNull('loyalty_program_id')
            ->sum('points')), 3);

        if ($orphanSum > 0.0005) {
            $firstProgramId = LoyaltyProgram::query()
                ->where('tenant_id', $tenantId)
                ->where('is_active', true)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->value('id');
            if ($firstProgramId !== null && (int) $firstProgramId === (int) $programId) {
                $balance = max($balance, $orphanSum);
            }
        }

        if ($totalEarned < 0.0005 && $totalRedeemed < 0.0005 && $customer !== null && $balance > 0.0005) {
            $totalEarned = (float) ($customer->loyalty_points_total_earned ?? 0);
            $totalRedeemed = (float) ($customer->loyalty_points_total_redeemed ?? 0);
        }

        return [
            'balance' => round(max(0, $balance), 3),
            'total_earned' => round(max(0, $totalEarned), 3),
            'total_redeemed' => round(max(0, $totalRedeemed), 3),
            'tier_id' => $tierId,
        ];
    }

    public function getCustomerTier(int $tenantId, int $customerId, int $programId): ?LoyaltyTier
    {
        $balance = $this->getCustomerBalance($tenantId, $customerId, $programId);
        $tierId = $balance['tier_id'] ?? null;
        if (! $tierId) {
            return null;
        }

        return LoyaltyTier::where('tenant_id', $tenantId)->where('loyalty_program_id', $programId)->find($tierId);
    }

    /**
     * @return array{points: float, multiplier: float, base_points?: float, tier?: string|null}
     */
    public function calculatePointsToEarn(int $tenantId, int $customerId, float $amount, ?int $programId = null): array
    {
        $program = $this->getProgram($tenantId, $programId);
        if (! $program || ! $program->is_active) {
            return ['points' => 0.0, 'multiplier' => 1.0];
        }

        if (! $program->isEligibleFor($customerId)) {
            return ['points' => 0.0, 'multiplier' => 1.0];
        }

        $tier = $this->getCustomerTier($tenantId, $customerId, (int) $program->id);
        $multiplier = (float) ($tier?->points_multiplier ?? 1);

        $basePoints = (float) $amount * (float) $program->points_per_currency;
        $earnedPts = round($basePoints * $multiplier, 3);

        return [
            'points' => $earnedPts,
            'multiplier' => $multiplier,
            'base_points' => $basePoints,
            'tier' => $tier?->name,
        ];
    }

    /**
     * @return array{max_points: int, max_value: float, reason?: string, available_points?: float, point_value?: float, max_percent?: int, min_redeem_points?: int}
     */
    public function calculateMaxRedeem(int $tenantId, int $customerId, float $invoiceAmount, ?int $programId = null): array
    {
        $program = $this->getProgram($tenantId, $programId);

        if (! $program || ! $program->is_active) {
            return ['max_points' => 0, 'max_value' => 0.0];
        }

        if (! $program->isEligibleFor($customerId)) {
            return ['max_points' => 0, 'max_value' => 0.0];
        }

        $bal = $this->getCustomerBalance($tenantId, $customerId, (int) $program->id);
        $availablePoints = (float) ($bal['balance'] ?? 0);
        if ($availablePoints < (int) $program->min_redeem_points) {
            return [
                'max_points' => 0,
                'max_value' => 0.0,
                'reason' => 'below_minimum',
                'available_points' => $availablePoints,
                'min_redeem_points' => (int) $program->min_redeem_points,
            ];
        }

        $maxValueByPercent = (float) $invoiceAmount * ((int) $program->max_redeem_percent / 100);
        $maxValueByPoints = $availablePoints * (float) $program->point_value;
        $maxValue = min($maxValueByPercent, $maxValueByPoints);

        $pointValue = (float) $program->point_value;
        $maxPoints = $pointValue > 0 ? (int) floor($maxValue / $pointValue) : 0;

        return [
            'max_points' => max(0, $maxPoints),
            'max_value' => round(max(0, $maxValue), 3),
            'available_points' => $availablePoints,
            'point_value' => $pointValue,
            'max_percent' => (int) $program->max_redeem_percent,
            'min_redeem_points' => (int) $program->min_redeem_points,
        ];
    }

    public function awardPoints(
        int $tenantId,
        int $customerId,
        float $amount,
        string $sourceType,
        int $sourceId,
        ?string $reference,
        ?int $createdBy,
        ?int $programId = null
    ): ?LoyaltyPoint {
        $program = $this->getProgram($tenantId, $programId);
        if (! $program || ! $program->is_active) {
            return null;
        }

        if (! $program->isEligibleFor($customerId)) {
            return null;
        }

        $calc = $this->calculatePointsToEarn($tenantId, $customerId, $amount, (int) $program->id);
        $points = (float) ($calc['points'] ?? 0);
        if ($points <= 0.0005) {
            return null;
        }

        $expiresAt = (int) $program->points_expiry_days > 0
            ? now()->addDays((int) $program->points_expiry_days)->toDateString()
            : null;

        return DB::transaction(function () use (
            $tenantId,
            $customerId,
            $program,
            $points,
            $amount,
            $sourceType,
            $sourceId,
            $reference,
            $expiresAt,
            $createdBy
        ) {
            $lp = LoyaltyPoint::create([
                'tenant_id' => $tenantId,
                'loyalty_program_id' => (int) $program->id,
                'customer_id' => $customerId,
                'type' => 'earned',
                'points' => $points,
                'amount' => $amount,
                'source_type' => $sourceType,
                'source_id' => $sourceId,
                'reference' => $reference,
                'expires_at' => $expiresAt,
                'processed_at' => now(),
                'created_by' => $createdBy,
            ]);

            $this->updateCustomerBalance($tenantId, $customerId, (int) $program->id, $points, 0);
            $this->updateCustomerTier($tenantId, $customerId, (int) $program->id);

            return $lp;
        });
    }

    /**
     * @return array{points_redeemed: float, redeem_value: float}
     */
    public function redeemPoints(
        int $tenantId,
        int $customerId,
        float $pointsToRedeem,
        string $sourceType,
        int $sourceId,
        ?string $reference,
        ?int $createdBy,
        ?int $programId = null
    ): array {
        $program = $this->getProgram($tenantId, $programId);

        if (! $program || ! $program->is_active) {
            throw new \RuntimeException('برنامج الولاء غير مفعّل');
        }
        if (! $program->isEligibleFor($customerId)) {
            throw new \RuntimeException('العميل غير مؤهل لهذا البرنامج');
        }

        $pointsToRedeem = round(max(0, $pointsToRedeem), 3);
        if ($pointsToRedeem <= 0.0005) {
            return ['points_redeemed' => 0.0, 'redeem_value' => 0.0];
        }

        $bal = $this->getCustomerBalance($tenantId, $customerId, (int) $program->id);
        if ((float) ($bal['balance'] ?? 0) < $pointsToRedeem - 0.0005) {
            throw new \RuntimeException('رصيد النقاط غير كافٍ');
        }
        if ($pointsToRedeem + 0.0005 < (int) $program->min_redeem_points) {
            throw new \RuntimeException('الحد الأدنى للاسترداد '.(int) $program->min_redeem_points.' نقطة');
        }

        $redeemValue = round($pointsToRedeem * (float) $program->point_value, 3);

        DB::transaction(function () use (
            $tenantId,
            $customerId,
            $program,
            $pointsToRedeem,
            $redeemValue,
            $sourceType,
            $sourceId,
            $reference,
            $createdBy
        ) {
            LoyaltyPoint::create([
                'tenant_id' => $tenantId,
                'loyalty_program_id' => (int) $program->id,
                'customer_id' => $customerId,
                'type' => 'redeemed',
                'points' => -$pointsToRedeem,
                'redeem_value' => $redeemValue,
                'source_type' => $sourceType,
                'source_id' => $sourceId,
                'reference' => $reference,
                'processed_at' => now(),
                'created_by' => $createdBy,
            ]);

            $this->updateCustomerBalance($tenantId, $customerId, (int) $program->id, -$pointsToRedeem, $pointsToRedeem);
            $this->updateCustomerTier($tenantId, $customerId, (int) $program->id);
        });

        return [
            'points_redeemed' => $pointsToRedeem,
            'redeem_value' => $redeemValue,
        ];
    }

    public function updateCustomerBalance(int $tenantId, int $customerId, int $programId, float $pointsDelta, float $redeemedDelta): void
    {
        $customer = Customer::where('tenant_id', $tenantId)->find($customerId);
        if (! $customer) {
            return;
        }

        $balances = is_array($customer->loyalty_balances) ? $customer->loyalty_balances : [];
        $key = (string) $programId;
        $current = is_array($balances[$key] ?? null) ? $balances[$key] : [
            'balance' => 0,
            'total_earned' => 0,
            'total_redeemed' => 0,
            'tier_id' => null,
        ];

        $pointsDelta = round((float) $pointsDelta, 3);
        $redeemedDelta = round(max(0, (float) $redeemedDelta), 3);

        $current['balance'] = max(0, (float) ($current['balance'] ?? 0) + $pointsDelta);
        if ($pointsDelta > 0) {
            $current['total_earned'] = (float) ($current['total_earned'] ?? 0) + $pointsDelta;
        }
        if ($redeemedDelta > 0) {
            $current['total_redeemed'] = (float) ($current['total_redeemed'] ?? 0) + $redeemedDelta;
        }

        $balances[$key] = $current;

        $sumBalance = 0.0;
        $sumEarned = 0.0;
        $sumRedeemed = 0.0;
        foreach ($balances as $row) {
            if (! is_array($row)) {
                continue;
            }
            $sumBalance += (float) ($row['balance'] ?? 0);
            $sumEarned += (float) ($row['total_earned'] ?? 0);
            $sumRedeemed += (float) ($row['total_redeemed'] ?? 0);
        }

        $customer->update([
            'loyalty_balances' => $balances,
            // Backward-compat aggregate columns.
            'loyalty_points_balance' => round($sumBalance, 3),
            'loyalty_points_total_earned' => round($sumEarned, 3),
            'loyalty_points_total_redeemed' => round($sumRedeemed, 3),
        ]);
    }

    public function updateCustomerTier(int $tenantId, int $customerId, ?int $programId = null): void
    {
        $customer = Customer::where('tenant_id', $tenantId)->find($customerId);
        if (! $customer) {
            return;
        }

        if ($programId) {
            $balance = $this->getCustomerBalance($tenantId, $customerId, $programId);
            $totalEarned = (float) ($balance['total_earned'] ?? 0);
        } else {
            $totalEarned = (float) ($customer->loyalty_points_total_earned ?? 0);
        }

        $tierQuery = LoyaltyTier::where('tenant_id', $tenantId);
        if ($programId) {
            $tierQuery->where('loyalty_program_id', $programId);
        }

        $tier = $tierQuery
            ->where('min_points', '<=', $totalEarned)
            ->where(function ($q) use ($totalEarned) {
                $q->whereNull('max_points')->orWhere('max_points', '>=', $totalEarned);
            })
            ->orderByDesc('min_points')
            ->first();

        if ($tier) {
            if ($programId) {
                $balances = is_array($customer->loyalty_balances) ? $customer->loyalty_balances : [];
                $key = (string) $programId;
                $row = is_array($balances[$key] ?? null) ? $balances[$key] : [
                    'balance' => 0,
                    'total_earned' => 0,
                    'total_redeemed' => 0,
                    'tier_id' => null,
                ];
                $row['tier_id'] = (int) $tier->id;
                $balances[$key] = $row;
                $customer->update([
                    'loyalty_balances' => $balances,
                    // keep legacy pointer to last computed tier
                    'loyalty_tier_id' => (int) $tier->id,
                ]);

                return;
            }

            if ((int) $customer->loyalty_tier_id !== (int) $tier->id) {
                $customer->update(['loyalty_tier_id' => $tier->id]);
            }
        }
    }

    /**
     * عكس كل سجلات الولاء النشطة المرتبطة بفاتورة (كسب/استرداد/يدوي على نفس المصدر)
     * قبل إعادة تطبيق الولاء بعد تعديل الفاتورة. تُنشأ صفوف type=reversed للمراجعة.
     */
    public function reverseInvoiceLoyaltyActivity(int $tenantId, int $invoiceId, int $userId): void
    {
        $rows = LoyaltyPoint::query()
            ->where('tenant_id', $tenantId)
            ->where('source_type', Invoice::class)
            ->where('source_id', $invoiceId)
            ->whereIn('type', ['earned', 'redeemed', 'manual'])
            ->orderBy('id')
            ->get();

        foreach ($rows as $lp) {
            LoyaltyPoint::create([
                'tenant_id' => $tenantId,
                'loyalty_program_id' => $lp->loyalty_program_id,
                'customer_id' => $lp->customer_id,
                'type' => 'reversed',
                'points' => -((float) $lp->points),
                'amount' => $lp->amount !== null ? -((float) $lp->amount) : null,
                'redeem_value' => $lp->redeem_value !== null ? -((float) $lp->redeem_value) : null,
                'source_type' => Invoice::class,
                'source_id' => $invoiceId,
                'reference' => $lp->reference,
                'notes' => 'عكس ولاء بسبب تعديل الفاتورة · سجل #'.(int) $lp->id,
                'processed_at' => now(),
                'created_by' => $userId,
            ]);

            $this->applyLedgerReversalToCustomerBalance($tenantId, $lp);
        }
    }

    /**
     * عكس أثر السجل الأصلي على رصيد العميل (بدون الاعتماد على updateCustomerBalance لأنها لا تخصم total_earned عند delta سالب).
     */
    private function applyLedgerReversalToCustomerBalance(int $tenantId, LoyaltyPoint $lp): void
    {
        $pid = $lp->loyalty_program_id !== null ? (int) $lp->loyalty_program_id : 0;
        $pts = (float) $lp->points;

        if ($pid < 1) {
            $balDelta = round(-$pts, 3);
            if (abs($balDelta) > 0.0005) {
                Customer::where('tenant_id', $tenantId)->where('id', (int) $lp->customer_id)->update([
                    'loyalty_points_balance' => DB::raw('GREATEST(0, loyalty_points_balance + ('.$balDelta.'))'),
                ]);
            }

            return;
        }

        $customer = Customer::where('tenant_id', $tenantId)->find((int) $lp->customer_id);
        if (! $customer) {
            return;
        }

        $balances = is_array($customer->loyalty_balances) ? $customer->loyalty_balances : [];
        $key = (string) $pid;
        $current = is_array($balances[$key] ?? null) ? $balances[$key] : [
            'balance' => 0,
            'total_earned' => 0,
            'total_redeemed' => 0,
            'tier_id' => null,
        ];

        $balanceAdj = round(-$pts, 3);
        $current['balance'] = max(0, (float) ($current['balance'] ?? 0) + $balanceAdj);

        if ($lp->type === 'earned' || ($lp->type === 'manual' && $pts > 0.0005)) {
            $current['total_earned'] = max(0, (float) ($current['total_earned'] ?? 0) - $pts);
        } elseif ($lp->type === 'redeemed' || ($lp->type === 'manual' && $pts < -0.0005)) {
            $current['total_redeemed'] = max(0, (float) ($current['total_redeemed'] ?? 0) - abs($pts));
        }

        $balances[$key] = $current;

        $sumBalance = 0.0;
        $sumEarned = 0.0;
        $sumRedeemed = 0.0;
        foreach ($balances as $row) {
            if (! is_array($row)) {
                continue;
            }
            $sumBalance += (float) ($row['balance'] ?? 0);
            $sumEarned += (float) ($row['total_earned'] ?? 0);
            $sumRedeemed += (float) ($row['total_redeemed'] ?? 0);
        }

        $customer->update([
            'loyalty_balances' => $balances,
            'loyalty_points_balance' => round($sumBalance, 3),
            'loyalty_points_total_earned' => round($sumEarned, 3),
            'loyalty_points_total_redeemed' => round($sumRedeemed, 3),
        ]);

        $this->updateCustomerTier($tenantId, (int) $lp->customer_id, $pid);
    }

    public function expirePoints(int $tenantId): int
    {
        $today = now()->toDateString();

        $earnedExpired = LoyaltyPoint::query()
            ->where('tenant_id', $tenantId)
            ->where('type', 'earned')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', $today)
            ->whereNotExists(function ($q) {
                $q->selectRaw('1')
                    ->from('loyalty_points as lp2')
                    ->whereColumn('lp2.tenant_id', 'loyalty_points.tenant_id')
                    ->whereColumn('lp2.customer_id', 'loyalty_points.customer_id')
                    ->where('lp2.type', 'expired')
                    ->whereRaw("lp2.reference = CONCAT('EXP-', loyalty_points.id)");
            })
            ->get();

        $count = 0;
        foreach ($earnedExpired as $row) {
            DB::transaction(function () use ($row, &$count) {
                $pts = (float) $row->points;
                if ($pts <= 0.0005) {
                    return;
                }

                LoyaltyPoint::create([
                    'tenant_id' => (int) $row->tenant_id,
                    'loyalty_program_id' => (int) ($row->loyalty_program_id ?? null),
                    'customer_id' => (int) $row->customer_id,
                    'type' => 'expired',
                    'points' => -$pts,
                    'reference' => 'EXP-'.(int) $row->id,
                    'notes' => 'انتهت صلاحية النقاط',
                    'processed_at' => now(),
                ]);

                $programId = (int) ($row->loyalty_program_id ?? 0);
                if ($programId > 0) {
                    $this->updateCustomerBalance((int) $row->tenant_id, (int) $row->customer_id, $programId, -$pts, 0);
                    $this->updateCustomerTier((int) $row->tenant_id, (int) $row->customer_id, $programId);
                } else {
                    Customer::where('tenant_id', (int) $row->tenant_id)->where('id', (int) $row->customer_id)->update([
                        'loyalty_points_balance' => DB::raw('loyalty_points_balance - '.$pts),
                    ]);
                }

                $count++;
            });
        }

        return $count;
    }

    /**
     * إعادة حساب حقول العميل (loyalty_balances + الأعمدة المجمّعة) من سجلات loyalty_points.
     * يُستخدم لإصلاح البيانات بعد أعطال أو عندما يُمنح الكسب عند الترحيل فقط.
     *
     * @return int عدد العملاء المُحدَّثين
     */
    public function recalculateCustomerAggregatesFromPoints(int $tenantId, ?int $customerId = null): int
    {
        $q = Customer::query()->where('tenant_id', $tenantId);
        if ($customerId !== null) {
            $q->where('id', $customerId);
        }

        $updated = 0;
        $q->orderBy('id')->chunkById(100, function ($customers) use ($tenantId, &$updated): void {
            foreach ($customers as $customer) {
                $this->recalculateSingleCustomerBalancesFromPoints($tenantId, $customer);
                $updated++;
            }
        });

        return $updated;
    }

    private function recalculateSingleCustomerBalancesFromPoints(int $tenantId, Customer $customer): void
    {
        $rows = LoyaltyPoint::query()
            ->where('tenant_id', $tenantId)
            ->where('customer_id', $customer->id)
            ->whereNotNull('loyalty_program_id')
            ->get();

        $oldBalances = is_array($customer->loyalty_balances) ? $customer->loyalty_balances : [];
        $balances = [];

        foreach ($rows->groupBy('loyalty_program_id') as $pid => $group) {
            $key = (string) $pid;
            $balance = 0.0;
            $totalEarned = 0.0;
            $totalRedeemed = 0.0;

            foreach ($group as $lp) {
                $pv = (float) $lp->points;
                $balance += $pv;

                if ($lp->type === 'earned') {
                    $totalEarned += $pv;
                } elseif ($lp->type === 'manual' && $pv > 0) {
                    $totalEarned += $pv;
                } elseif ($lp->type === 'reversed') {
                    if ($pv < -0.0005) {
                        $totalEarned += $pv;
                    } elseif ($pv > 0.0005) {
                        $totalRedeemed = max(0, $totalRedeemed - $pv);
                    }
                } elseif ($lp->type === 'redeemed') {
                    $totalRedeemed += abs($pv);
                }
            }

            $balance = max(0, round($balance, 3));
            $prevTier = is_array($oldBalances[$key] ?? null) ? ($oldBalances[$key]['tier_id'] ?? null) : null;

            $balances[$key] = [
                'balance' => $balance,
                'total_earned' => round(max(0, $totalEarned), 3),
                'total_redeemed' => round($totalRedeemed, 3),
                'tier_id' => $prevTier,
            ];
        }

        $sumBalance = 0.0;
        $sumEarned = 0.0;
        $sumRedeemed = 0.0;
        foreach ($balances as $row) {
            if (! is_array($row)) {
                continue;
            }
            $sumBalance += (float) ($row['balance'] ?? 0);
            $sumEarned += (float) ($row['total_earned'] ?? 0);
            $sumRedeemed += (float) ($row['total_redeemed'] ?? 0);
        }

        $legacySum = (float) LoyaltyPoint::query()
            ->where('tenant_id', $tenantId)
            ->where('customer_id', $customer->id)
            ->whereNull('loyalty_program_id')
            ->sum('points');

        $sumBalance = max(0, round($sumBalance + $legacySum, 3));
        $sumRedeemed += $this->legacyProgramlessRedeemedTotal($tenantId, (int) $customer->id);

        $customer->update([
            'loyalty_balances' => $balances,
            'loyalty_points_balance' => $sumBalance,
            'loyalty_points_total_earned' => round($sumEarned, 3),
            'loyalty_points_total_redeemed' => round($sumRedeemed, 3),
        ]);

        $customer->refresh();

        foreach (array_keys($balances) as $key) {
            $this->updateCustomerTier($tenantId, (int) $customer->id, (int) $key);
        }
    }

    /**
     * إجمالي النقاط المستردة (كمية موجبة) لسجلات بدون loyalty_program_id (بيانات قديمة).
     */
    private function legacyProgramlessRedeemedTotal(int $tenantId, int $customerId): float
    {
        $total = 0.0;
        $rows = LoyaltyPoint::query()
            ->where('tenant_id', $tenantId)
            ->where('customer_id', $customerId)
            ->whereNull('loyalty_program_id')
            ->orderBy('id')
            ->get(['type', 'points']);

        foreach ($rows as $lp) {
            $pv = (float) $lp->points;
            if ($lp->type === 'redeemed') {
                $total += abs($pv);
            } elseif ($lp->type === 'reversed' && $pv > 0.0005) {
                $total = max(0, $total - $pv);
            }
        }

        return round($total, 3);
    }
}
