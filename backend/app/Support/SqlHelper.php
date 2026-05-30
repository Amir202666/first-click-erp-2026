<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

final class SqlHelper
{
    /** ترتيب رقمي متوافق مع MySQL و SQLite */
    public static function castNumeric(string $expression): string
    {
        $driver = DB::connection()->getDriverName();

        return $driver === 'sqlite'
            ? "CAST({$expression} AS INTEGER)"
            : "CAST({$expression} AS UNSIGNED)";
    }

    public static function orderByNumericDesc(string $expression): string
    {
        return self::castNumeric($expression).' DESC';
    }
}
