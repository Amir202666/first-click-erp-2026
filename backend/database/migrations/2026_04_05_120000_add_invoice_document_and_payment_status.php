<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->string('document_status', 32)->default('draft')->after('status');
            $table->string('payment_status', 32)->default('na')->after('document_status');
            $table->index(['tenant_id', 'document_status']);
            $table->index(['tenant_id', 'payment_status']);
        });

        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'sqlite') {
            $rows = DB::table('invoices')->select('id', 'status', 'journal_entry_id', 'amount_paid', 'balance', 'total', 'due_date', 'payment_timing')->get();
            foreach ($rows as $row) {
                $this->backfillRow($row);
            }
        } else {
            DB::table('invoices')->orderBy('id')->chunkById(200, function ($rows) {
                foreach ($rows as $row) {
                    $this->backfillRow($row);
                }
            });
        }
    }

    private function backfillRow(object $row): void
    {
        $status = (string) ($row->status ?? 'draft');
        $journalId = $row->journal_entry_id ?? null;

        if ($status === 'cancelled') {
            $document = 'cancelled';
            $payment = 'na';
        } elseif ($journalId) {
            $document = 'posted';
            $payment = $this->derivePaymentFromRow($row, $status);
        } else {
            $document = 'draft';
            $payment = 'na';
        }

        $legacy = $this->legacyFromDual($document, $payment, $status);

        DB::table('invoices')->where('id', $row->id)->update([
            'document_status' => $document,
            'payment_status' => $payment,
            'status' => $legacy,
        ]);
    }

    private function derivePaymentFromRow(object $row, string $legacyStatus): string
    {
        $total = (float) ($row->total ?? 0);
        $paid = (float) ($row->amount_paid ?? 0);
        $balance = isset($row->balance) ? (float) $row->balance : max(0, $total - $paid);

        if ($balance <= 0.00001 && $total >= 0) {
            return 'paid';
        }
        if ($paid > 0.00001) {
            return 'partial';
        }
        if ($legacyStatus === 'overdue') {
            return 'overdue';
        }
        if (($row->payment_timing ?? '') === 'deferred') {
            return 'deferred';
        }

        return 'unpaid';
    }

    private function legacyFromDual(string $document, string $payment, string $currentStatus): string
    {
        if ($document === 'cancelled') {
            return 'cancelled';
        }
        if ($document === 'draft') {
            return 'draft';
        }

        return match ($payment) {
            'paid' => 'paid',
            'partial' => 'partial',
            'overdue' => 'overdue',
            default => 'sent',
        };
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropColumn(['document_status', 'payment_status']);
        });
    }
};
