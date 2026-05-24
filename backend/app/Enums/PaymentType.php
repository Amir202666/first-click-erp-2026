<?php

namespace App\Enums;

enum PaymentType: string
{
    case Receipt = 'receipt';
    case Payment = 'payment';
    case Transfer = 'transfer';
    case Refund = 'refund';

    public function label(): string
    {
        return match ($this) {
            self::Receipt => 'سند قبض',
            self::Payment => 'سند صرف',
            self::Transfer => 'تحويل',
            self::Refund => 'مرتجع',
        };
    }
}
