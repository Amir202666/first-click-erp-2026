<?php

namespace App\Services;

use App\Models\HrRequest;
use App\Models\LoanInstallment;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class HrRequestService
{
    private const DECIMALS = 3;

    /**
     * اعتماد طلب (إجازة/سلفة/عهدة/قرض). للقرض: توليد أقساط شهرية.
     */
    public function approve(HrRequest $req): HrRequest
    {
        if ($req->status === 'approved') {
            return $req->load('employee', 'loanInstallments');
        }
        if ($req->status === 'rejected') {
            throw new \InvalidArgumentException('لا يمكن اعتماد طلب مرفوض.');
        }

        return DB::transaction(function () use ($req) {
            $req->update([
                'status' => 'approved',
                'approved_by' => auth()->id(),
                'approved_at' => now(),
                'rejected_by' => null,
                'rejected_at' => null,
                'rejection_reason' => null,
            ]);

            if ($req->type === 'loan') {
                $this->generateLoanInstallments($req);
            }

            return $req->fresh(['employee', 'loanInstallments']);
        });
    }

    public function reject(HrRequest $req, ?string $reason = null): HrRequest
    {
        if ($req->status === 'rejected') {
            return $req->load('employee', 'loanInstallments');
        }
        if ($req->status === 'approved') {
            throw new \InvalidArgumentException('لا يمكن رفض طلب معتمد.');
        }

        return DB::transaction(function () use ($req, $reason) {
            $req->update([
                'status' => 'rejected',
                'rejected_by' => auth()->id(),
                'rejected_at' => now(),
                'rejection_reason' => $reason,
            ]);
            $req->loanInstallments()->delete();

            return $req->fresh(['employee', 'loanInstallments']);
        });
    }

    private function generateLoanInstallments(HrRequest $req): void
    {
        $req->loanInstallments()->delete();

        $total = (float) ($req->amount ?? 0);
        $count = (int) ($req->installments_count ?? 0);
        if ($total <= 0 || $count < 1) {
            return;
        }

        $remaining = round($total, self::DECIMALS);
        $per = round($total / $count, self::DECIMALS);
        $due = ($req->requested_at ? Carbon::parse($req->requested_at) : now())->startOfMonth()->addMonth();

        for ($i = 1; $i <= $count; $i++) {
            $amount = $i === $count ? round($remaining, self::DECIMALS) : $per;
            $remaining = round($remaining - $amount, self::DECIMALS);
            LoanInstallment::create([
                'hr_request_id' => $req->id,
                'sequence' => $i,
                'due_month' => $due->format('Y-m-d'),
                'amount' => $amount,
                'deducted_amount' => 0,
                'status' => 'pending',
            ]);
            $due->addMonth();
        }
    }
}
