<?php

namespace App\Enums;

enum JournalEntryType: string
{
    case Manual = 'manual';
    case Sales = 'sales';
    case Purchase = 'purchase';
    case Expense = 'expense';
    case Payment = 'payment';
    case Adjustment = 'adjustment';

    public function label(): string
    {
        return match ($this) {
            self::Manual => 'يدوي',
            self::Sales => 'مبيعات',
            self::Purchase => 'مشتريات',
            self::Expense => 'مصروفات',
            self::Payment => 'مدفوعات',
            self::Adjustment => 'تسوية',
        };
    }
}
