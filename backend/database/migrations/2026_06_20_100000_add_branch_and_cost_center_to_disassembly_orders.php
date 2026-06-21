<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('disassembly_orders', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->after('warehouse_id')->constrained()->nullOnDelete();
            $table->foreignId('cost_center_id')->nullable()->after('branch_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('disassembly_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('cost_center_id');
            $table->dropConstrainedForeignId('branch_id');
        });
    }
};
