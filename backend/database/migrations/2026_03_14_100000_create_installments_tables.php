<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('installments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('number', 64)->index();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->decimal('total_amount', 18, 3)->default(0);
            $table->string('currency', 3)->nullable();
            $table->date('start_date');
            $table->unsignedTinyInteger('frequency_months')->default(1); // 1 = monthly
            $table->string('status', 32)->default('draft'); // draft, approved
            $table->foreignId('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'number']);
        });

        Schema::create('installment_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('installment_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('sequence');
            $table->date('due_date');
            $table->decimal('amount', 18, 3)->default(0);
            $table->decimal('paid_amount', 18, 3)->default(0);
            $table->string('status', 32)->default('pending'); // pending, partial, paid, overdue
            $table->timestamps();

            $table->index(['installment_id', 'due_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('installment_lines');
        Schema::dropIfExists('installments');
    }
};
