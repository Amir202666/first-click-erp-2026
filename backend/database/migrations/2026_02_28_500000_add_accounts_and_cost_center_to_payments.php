<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('cost_center_id')->nullable()->after('branch_id')->constrained('cost_centers')->nullOnDelete();
            $table->foreignId('cash_bank_account_id')->nullable()->after('cost_center_id')->constrained('accounts')->nullOnDelete();
            $table->foreignId('counterpart_account_id')->nullable()->after('cash_bank_account_id')->constrained('accounts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropForeign(['cost_center_id']);
            $table->dropForeign(['cash_bank_account_id']);
            $table->dropForeign(['counterpart_account_id']);
        });
    }
};
