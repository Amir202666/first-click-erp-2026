<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoice_lines', function (Blueprint $table) {
            if (! Schema::hasColumn('invoice_lines', 'discount_amount')) {
                $table->decimal('discount_amount', 15, 3)->default(0)->after('discount_percent');
            }
        });
    }

    public function down(): void
    {
        Schema::table('invoice_lines', function (Blueprint $table) {
            if (Schema::hasColumn('invoice_lines', 'discount_amount')) {
                $table->dropColumn('discount_amount');
            }
        });
    }
};
