<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_account_defaults', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('cash_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('bank_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('customers_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('vendors_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('inventory_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('sales_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('sales_returns_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('cogs_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('purchases_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('discounts_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('tax_payable_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('capital_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->timestamps();

            $table->unique('tenant_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_account_defaults');
    }
};
