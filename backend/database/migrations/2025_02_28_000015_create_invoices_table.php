<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('number')->unique();
            $table->string('type'); // sales, purchase
            $table->string('status')->default('draft'); // draft, sent, partial, paid, overdue, cancelled
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('vendor_id')->nullable()->constrained()->nullOnDelete();
            $table->date('date');
            $table->date('due_date')->nullable();
            $table->string('payment_terms')->nullable();
            $table->decimal('subtotal', 18, 4)->default(0);
            $table->decimal('tax_amount', 18, 4)->default(0);
            $table->decimal('discount_amount', 18, 4)->default(0);
            $table->decimal('total', 18, 4)->default(0);
            $table->decimal('amount_paid', 18, 4)->default(0);
            $table->decimal('balance', 18, 4)->default(0);
            $table->string('currency', 3)->nullable();
            $table->decimal('exchange_rate', 18, 8)->default(1);
            $table->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $table->text('notes')->nullable();
            $table->json('metadata')->nullable(); // للفواتير الجزئية، المؤجلة
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['tenant_id', 'type', 'date']);
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
