<?php

namespace App\Enums;

enum PaymentMethod: string
{
    case Cash = 'cash';
    case Bank = 'bank';
    case Card = 'card';
    case Check = 'check';

    public function label(): string
    {
        return match ($this) {
            self::Cash => 'نقدي',
            self::Bank => 'تحويل بنكي',
            self::Card => 'بطاقة',
            self::Check => 'شيك',
        };
    }
}
