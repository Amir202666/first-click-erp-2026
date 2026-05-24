<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('installments', function (Blueprint $table) {
            $table->foreignId('invoice_id')->nullable()->after('tenant_id')->constrained('invoices')->nullOnDelete();
            $table->foreignId('vendor_id')->nullable()->after('customer_id')->constrained('vendors')->nullOnDelete();
            $table->foreignId('account_id')->nullable()->after('vendor_id')->constrained('accounts')->nullOnDelete();
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            Schema::table('installments', function (Blueprint $table) {
                $table->dropForeign(['customer_id']);
            });
            DB::statement('ALTER TABLE installments MODIFY customer_id BIGINT UNSIGNED NULL');
            Schema::table('installments', function (Blueprint $table) {
                $table->foreign('customer_id')->references('id')->on('customers')->nullOnDelete();
            });
        }

        Schema::table('installment_lines', function (Blueprint $table) {
            $table->timestamp('paid_at')->nullable()->after('status');
            $table->foreignId('payment_id')->nullable()->after('paid_at')->constrained('payments')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('installment_lines', function (Blueprint $table) {
            $table->dropForeign(['payment_id']);
            $table->dropColumn(['paid_at', 'payment_id']);
        });

        Schema::table('installments', function (Blueprint $table) {
            $table->dropForeign(['invoice_id']);
            $table->dropForeign(['vendor_id']);
            $table->dropForeign(['account_id']);
            $table->dropColumn(['invoice_id', 'vendor_id', 'account_id']);
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            Schema::table('installments', function (Blueprint $table) {
                $table->dropForeign(['customer_id']);
            });
            DB::statement('ALTER TABLE installments MODIFY customer_id BIGINT UNSIGNED NOT NULL');
            Schema::table('installments', function (Blueprint $table) {
                $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
            });
        }
    }
};
