<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_adjustment_lines', function (Blueprint $table) {
            // إضافة / خصم لكل سطر بشكل مستقل
            $table->string('action')->nullable()->after('quantity');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_adjustment_lines', function (Blueprint $table) {
            $table->dropColumn('action');
        });
    }
};
