<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoice_lines', function (Blueprint $table) {
            $table->date('expiry_date')->nullable()->after('item_variant_id');
            $table->string('batch_number', 120)->nullable()->after('expiry_date');
            $table->index(['invoice_id', 'expiry_date']);
        });

        Schema::table('inventory_movements', function (Blueprint $table) {
            $table->date('expiry_date')->nullable()->after('item_variant_id');
            $table->string('batch_number', 120)->nullable()->after('expiry_date');
            $table->index(['tenant_id', 'expiry_date']);
            $table->index(['tenant_id', 'warehouse_id', 'expiry_date']);
        });
    }

    public function down(): void
    {
        Schema::table('invoice_lines', function (Blueprint $table) {
            $table->dropIndex(['invoice_id', 'expiry_date']);
            $table->dropColumn(['expiry_date', 'batch_number']);
        });

        Schema::table('inventory_movements', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'expiry_date']);
            $table->dropIndex(['tenant_id', 'warehouse_id', 'expiry_date']);
            $table->dropColumn(['expiry_date', 'batch_number']);
        });
    }
};
