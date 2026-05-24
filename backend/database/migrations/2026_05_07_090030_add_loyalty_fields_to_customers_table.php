<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->decimal('loyalty_points_balance', 10, 3)->default(0)->after('credit_limit');
            $table->decimal('loyalty_points_total_earned', 10, 3)->default(0)->after('loyalty_points_balance');
            $table->decimal('loyalty_points_total_redeemed', 10, 3)->default(0)->after('loyalty_points_total_earned');
            $table->foreignId('loyalty_tier_id')
                ->nullable()
                ->after('loyalty_points_total_redeemed')
                ->constrained('loyalty_tiers')
                ->nullOnDelete();

            $table->index('loyalty_tier_id');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropForeign(['loyalty_tier_id']);
            $table->dropIndex(['loyalty_tier_id']);
            $table->dropColumn([
                'loyalty_points_balance',
                'loyalty_points_total_earned',
                'loyalty_points_total_redeemed',
                'loyalty_tier_id',
            ]);
        });
    }
};
