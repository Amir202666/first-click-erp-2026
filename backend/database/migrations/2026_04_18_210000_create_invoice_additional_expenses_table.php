<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoice_additional_expenses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->string('description', 200)->nullable();
            $table->foreignId('expense_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('creditor_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->decimal('amount_net', 18, 3)->default(0);
            $table->decimal('tax_amount', 18, 3)->default(0);
            $table->decimal('total_amount', 18, 3)->default(0);
            $table->string('allocation_method', 20)->default('none'); // quantity | weight | none
            $table->json('distribution_snapshot')->nullable();
            $table->timestamps();

            $table->index(['invoice_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_additional_expenses');
    }
};
