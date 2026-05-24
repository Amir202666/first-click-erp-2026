<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payroll_lines', function (Blueprint $table) {
            $table->decimal('other_allowances', 18, 3)->default(0)->after('transport_allowance');
        });
    }

    public function down(): void
    {
        Schema::table('payroll_lines', function (Blueprint $table) {
            $table->dropColumn('other_allowances');
        });
    }
};
