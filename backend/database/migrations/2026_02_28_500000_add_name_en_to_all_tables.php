<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $tables = [
            'accounts',
            'items',
            'item_categories',
            'item_units',
            'item_brands',
            'customers',
            'vendors',
            'branches',
            'cost_centers',
            'payment_methods',
            'currencies',
        ];

        foreach ($tables as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->string('name_en', 255)->nullable()->after('name');
            });
        }
    }

    public function down(): void
    {
        $tables = [
            'accounts',
            'items',
            'item_categories',
            'item_units',
            'item_brands',
            'customers',
            'vendors',
            'branches',
            'cost_centers',
            'payment_methods',
            'currencies',
        ];

        foreach ($tables as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropColumn('name_en');
            });
        }
    }
};
