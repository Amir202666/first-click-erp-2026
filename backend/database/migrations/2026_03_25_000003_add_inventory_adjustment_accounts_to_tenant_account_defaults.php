<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenant_account_defaults', function (Blueprint $table) {
            $table->unsignedBigInteger('inventory_adjustment_gain_account_id')->nullable()->after('installments_receivable_account_id');
            $table->unsignedBigInteger('inventory_adjustment_loss_account_id')->nullable()->after('inventory_adjustment_gain_account_id');
        });
    }

    public function down(): void
    {
        Schema::table('tenant_account_defaults', function (Blueprint $table) {
            $table->dropColumn(['inventory_adjustment_gain_account_id', 'inventory_adjustment_loss_account_id']);
        });
    }
};
