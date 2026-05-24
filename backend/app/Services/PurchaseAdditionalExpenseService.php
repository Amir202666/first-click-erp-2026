<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\InvoiceAdditionalExpense;
use App\Models\InvoiceLine;
use Illuminate\Support\Facades\DB;

class PurchaseAdditionalExpenseService
{
    /**
     * مزامنة مصاريف الشراء الإضافية وإعادة حساب landed_cost_allocated لكل سطر.
     *
     * @param  array<int, array<string, mixed>>  $expensesPayload
     */
    public function sync(Invoice $invoice, array $expensesPayload): void
    {
        if ($invoice->type !== 'purchase' || $invoice->is_return) {
            return;
        }

        DB::transaction(function () use ($invoice, $expensesPayload) {
            InvoiceAdditionalExpense::where('invoice_id', $invoice->id)->delete();

            InvoiceLine::where('invoice_id', $invoice->id)->update([
                'landed_cost_allocated' => 0,
            ]);

            $lines = $invoice->lines()->orderBy('sort_order')->orderBy('id')->get();
            if ($lines->isEmpty()) {
                return;
            }

            $landedByLineId = [];
            foreach ($lines as $l) {
                $landedByLineId[(int) $l->id] = 0.0;
            }

            foreach (array_values($expensesPayload) as $idx => $row) {
                $creditorId = isset($row['creditor_account_id']) ? (int) $row['creditor_account_id'] : 0;
                if ($creditorId <= 0) {
                    continue;
                }
                $amountNet = round((float) ($row['amount_net'] ?? 0), 3);
                $taxAmount = round((float) ($row['tax_amount'] ?? 0), 3);
                $totalAmount = isset($row['total_amount'])
                    ? round((float) $row['total_amount'], 3)
                    : round($amountNet + $taxAmount, 3);
                $expenseAccountId = ! empty($row['expense_account_id']) ? (int) $row['expense_account_id'] : null;
                /** التوزيع دائماً حسب الكمية (بالوحدة الأساسية) — الكمية المدخلة قد تمثل الوزن أو العدد حسب عمل المستخدم. */
                $exp = InvoiceAdditionalExpense::create([
                    'invoice_id' => $invoice->id,
                    'sort_order' => $idx,
                    'description' => isset($row['description']) ? (string) $row['description'] : null,
                    'expense_account_id' => $expenseAccountId > 0 ? $expenseAccountId : null,
                    'creditor_account_id' => $creditorId,
                    'amount_net' => $amountNet,
                    'tax_amount' => $taxAmount,
                    'total_amount' => $totalAmount,
                    'allocation_method' => 'quantity',
                    'distribution_snapshot' => null,
                ]);

                if ($amountNet <= 0) {
                    continue;
                }

                $basesByLineId = [];
                foreach ($lines as $line) {
                    if (! $line->item_id || ! $line->item) {
                        continue;
                    }
                    if (! $line->item->track_quantity) {
                        continue;
                    }
                    $qty = (float) $line->quantity;
                    if ($qty <= 0) {
                        continue;
                    }
                    $qtyBase = $line->item->quantityToBase($qty, $line->unit_id);
                    $base = (float) $qtyBase;
                    if ($base > 0) {
                        $basesByLineId[(int) $line->id] = $base;
                    }
                }

                if ($basesByLineId === []) {
                    continue;
                }

                $shares = PurchaseLandedCostAllocator::allocate($amountNet, $basesByLineId, 3);
                $exp->update(['distribution_snapshot' => $shares]);

                foreach ($shares as $lineId => $amt) {
                    $lid = (int) $lineId;
                    if (! array_key_exists($lid, $landedByLineId)) {
                        continue;
                    }
                    $landedByLineId[$lid] = round($landedByLineId[$lid] + (float) $amt, 3);
                }
            }

            foreach ($landedByLineId as $lineId => $amt) {
                InvoiceLine::where('id', $lineId)->update(['landed_cost_allocated' => $amt]);
            }
        });
    }
}
