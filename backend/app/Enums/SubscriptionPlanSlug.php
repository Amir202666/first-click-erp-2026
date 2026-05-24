<?php

namespace App\Enums;

enum SubscriptionPlanSlug: string
{
    case Basic = 'basic';
    case Medium = 'medium';
    case Advanced = 'advanced';

    public function label(): string
    {
        return match ($this) {
            self::Basic => 'أساسي',
            self::Medium => 'متوسط',
            self::Advanced => 'متقدم',
        };
    }
}
