<?php

namespace App\Enums;

enum InvoiceType: string
{
    case Sales = 'sales';
    case Purchase = 'purchase';

    public function label(): string
    {
        return match ($this) {
            self::Sales => 'فاتورة مبيعات',
            self::Purchase => 'فاتورة مشتريات',
        };
    }
}
