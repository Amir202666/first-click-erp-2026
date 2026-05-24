<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->foreignId('cost_center_id')->nullable()->after('payment_method_id')->constrained('cost_centers')->nullOnDelete();
            $table->string('receipt_status', 20)->nullable()->after('status'); // received, pending
            $table->string('payment_timing', 20)->nullable()->after('payment_terms'); // paid, deferred
        });

        Schema::table('invoice_lines', function (Blueprint $table) {
            $table->foreignId('unit_id')->nullable()->after('item_id')->constrained('item_units')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropForeign(['cost_center_id']);
            $table->dropColumn(['receipt_status', 'payment_timing']);
        });
        Schema::table('invoice_lines', function (Blueprint $table) {
            $table->dropForeign(['unit_id']);
        });
    }
};
