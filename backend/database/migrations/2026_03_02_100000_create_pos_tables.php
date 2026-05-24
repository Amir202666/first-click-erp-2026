<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pos_shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('opened_at');
            $table->timestamp('closed_at')->nullable();
            $table->decimal('opening_cash', 18, 4)->default(0);
            $table->decimal('closing_cash', 18, 4)->nullable();
            $table->decimal('expected_cash', 18, 4)->nullable();
            $table->decimal('difference', 18, 4)->nullable();
            $table->string('status', 20)->default('open'); // open, closed
            $table->foreignId('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->json('x_report_snapshot')->nullable();
            $table->json('z_report_snapshot')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'branch_id', 'status']);
        });

        Schema::create('pos_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('shift_id')->constrained('pos_shifts')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'shift_id']);
        });

        Schema::create('invoice_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payment_method_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 18, 4);
            $table->string('reference')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'invoice_id']);
        });

        Schema::create('pos_held_carts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->json('payload'); // items, customer_id, discount_amount, etc.
            $table->timestamp('resumed_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'branch_id', 'user_id']);
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->foreignId('pos_shift_id')->nullable()->after('branch_id')->constrained('pos_shifts')->nullOnDelete();
            $table->foreignId('pos_session_id')->nullable()->after('pos_shift_id')->constrained('pos_sessions')->nullOnDelete();
            $table->timestamp('printed_at')->nullable()->after('journal_entry_id');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropForeign(['pos_shift_id']);
            $table->dropForeign(['pos_session_id']);
            $table->dropColumn(['pos_shift_id', 'pos_session_id', 'printed_at']);
        });
        Schema::dropIfExists('pos_held_carts');
        Schema::dropIfExists('invoice_payments');
        Schema::dropIfExists('pos_sessions');
        Schema::dropIfExists('pos_shifts');
    }
};
