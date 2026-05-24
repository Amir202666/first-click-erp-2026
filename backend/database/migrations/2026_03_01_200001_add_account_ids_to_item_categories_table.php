<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('item_categories', function (Blueprint $table) {
            $table->foreignId('inventory_account_id')->nullable()->after('is_active')->constrained('accounts')->nullOnDelete();
            $table->foreignId('cost_of_sales_account_id')->nullable()->after('inventory_account_id')->constrained('accounts')->nullOnDelete();
            $table->foreignId('sales_account_id')->nullable()->after('cost_of_sales_account_id')->constrained('accounts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('item_categories', function (Blueprint $table) {
            $table->dropForeign(['inventory_account_id']);
            $table->dropForeign(['cost_of_sales_account_id']);
            $table->dropForeign(['sales_account_id']);
        });
    }
};
