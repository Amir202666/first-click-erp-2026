<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenant_account_defaults', function (Blueprint $table) {
            $table->foreignId('pos_cash_custody_account_id')->nullable()->after('capital_account_id')->constrained('accounts')->nullOnDelete();
            $table->foreignId('cash_variance_account_id')->nullable()->after('pos_cash_custody_account_id')->constrained('accounts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('tenant_account_defaults', function (Blueprint $table) {
            $table->dropForeign(['pos_cash_custody_account_id']);
            $table->dropForeign(['cash_variance_account_id']);
        });
    }
};
