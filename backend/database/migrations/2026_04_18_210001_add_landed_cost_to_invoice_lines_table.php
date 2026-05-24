<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoice_lines', function (Blueprint $table) {
            $table->decimal('landed_cost_allocated', 18, 3)->default(0)->after('total');
            $table->decimal('distribution_weight', 18, 4)->nullable()->after('landed_cost_allocated');
        });
    }

    public function down(): void
    {
        Schema::table('invoice_lines', function (Blueprint $table) {
            $table->dropColumn(['landed_cost_allocated', 'distribution_weight']);
        });
    }
};
