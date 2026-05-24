<?php

namespace App\Enums;

enum AccountType: string
{
    case Asset = 'asset';
    case Liability = 'liability';
    case Equity = 'equity';
    case Revenue = 'revenue';
    case COGS = 'cogs';
    case Expense = 'expense';

    public function label(): string
    {
        return match ($this) {
            self::Asset => 'الأصول',
            self::Liability => 'الخصوم',
            self::Equity => 'حقوق الملكية',
            self::Revenue => 'الإيرادات',
            self::COGS => 'تكلفة البضاعة المباعة',
            self::Expense => 'المصروفات',
        };
    }

    public function normalBalance(): string
    {
        return match ($this) {
            self::Asset, self::Expense, self::COGS => 'debit',
            self::Liability, self::Equity, self::Revenue => 'credit',
        };
    }
}
