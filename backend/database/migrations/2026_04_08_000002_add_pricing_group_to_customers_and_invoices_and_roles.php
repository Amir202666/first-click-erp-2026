<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->foreignId('pricing_group_id')
                ->nullable()
                ->after('customer_group_id')
                ->constrained('pricing_groups')
                ->nullOnDelete();
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->foreignId('pricing_group_id')
                ->nullable()
                ->after('payment_method_id')
                ->constrained('pricing_groups')
                ->nullOnDelete();
        });

        Schema::table('roles', function (Blueprint $table) {
            $table->json('pricing_group_ids')->nullable()->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropForeign(['pricing_group_id']);
            $table->dropColumn('pricing_group_id');
        });
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropForeign(['pricing_group_id']);
            $table->dropColumn('pricing_group_id');
        });
        Schema::table('roles', function (Blueprint $table) {
            $table->dropColumn('pricing_group_ids');
        });
    }
};
