<?php

namespace App\Services;

use App\Models\Invoice;
use Carbon\Carbon;

/**
 * فصل حالة المستند (مسودة / مُرحّل / ملغاة) عن حالة التحصيل (غير منطبق / غير مدفوع / جزئي / مدفوع / مؤجل / متأخر).
 * لا تُسجَّل payment_status = paid إلا عند document_status = posted و balance منعدم.
 */
final class InvoiceStatusResolver
{
    public static function resolve(Invoice $invoice): array
    {
        $document = self::documentStatus($invoice);
        $payment = self::paymentStatus($invoice, $document);
        $legacy = self::legacyStatus($document, $payment);

        return [
            'document_status' => $document,
            'payment_status' => $payment,
            'status' => $legacy,
        ];
    }

    public static function documentStatus(Invoice $invoice): string
    {
        $doc = (string) ($invoice->document_status ?? '');
        if ($doc === 'cancelled' || ($invoice->status ?? '') === 'cancelled') {
            return 'cancelled';
        }
        if ($invoice->journal_entry_id) {
            return 'posted';
        }

        return 'draft';
    }

    public static function paymentStatus(Invoice $invoice, string $document): string
    {
        if (in_array($document, ['draft', 'cancelled'], true)) {
            return 'na';
        }

        $total = (float) ($invoice->total ?? 0);
        $paid = (float) ($invoice->amount_paid ?? 0);
        $balance = (float) ($invoice->balance ?? max(0, $total - $paid));

        if ($balance <= 0.00001 && $total >= 0) {
            return 'paid';
        }
        if ($paid > 0.00001) {
            return 'partial';
        }

        $due = $invoice->due_date;
        if ($due && Carbon::parse($due)->lt(Carbon::today())) {
            return 'overdue';
        }
        if (($invoice->payment_timing ?? '') === 'deferred') {
            return 'deferred';
        }

        return 'unpaid';
    }

    public static function legacyStatus(string $document, string $payment): string
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
            'deferred', 'unpaid', 'na' => 'sent',
            default => 'sent',
        };
    }

    public static function applyToModel(Invoice $invoice, bool $save = true): void
    {
        $r = self::resolve($invoice);
        $invoice->document_status = $r['document_status'];
        $invoice->payment_status = $r['payment_status'];
        $invoice->status = $r['status'];
        if ($save) {
            $invoice->saveQuietly();
        }
    }
}
