<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            if (! Schema::hasColumn('invoices', 'promotion_id')) {
                $table->foreignId('promotion_id')
                    ->nullable()
                    ->after('pricing_group_id')
                    ->constrained('promotions')
                    ->nullOnDelete();
            }
            if (! Schema::hasColumn('invoices', 'promotion_discount')) {
                $table->decimal('promotion_discount', 15, 3)->default(0)->after('promotion_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            if (Schema::hasColumn('invoices', 'promotion_id')) {
                $table->dropForeign(['promotion_id']);
                $table->dropColumn('promotion_id');
            }
            if (Schema::hasColumn('invoices', 'promotion_discount')) {
                $table->dropColumn('promotion_discount');
            }
        });
    }
};
