<?php

namespace App\Enums;

enum InvoiceStatus: string
{
    case Draft = 'draft';
    case Sent = 'sent';
    case Partial = 'partial';
    case Paid = 'paid';
    case Overdue = 'overdue';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'مسودة',
            self::Sent => 'مرسلة',
            self::Partial => 'مدفوعة جزئياً',
            self::Paid => 'مدفوعة',
            self::Overdue => 'متأخرة',
            self::Cancelled => 'ملغاة',
        };
    }
}
