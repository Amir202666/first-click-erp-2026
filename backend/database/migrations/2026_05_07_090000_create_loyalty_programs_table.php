<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loyalty_programs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name')->default('نقاط الولاء');
            $table->boolean('is_active')->default(false);
            $table->decimal('points_per_currency', 10, 4)->default(1);
            $table->decimal('point_value', 10, 4)->default(0.01);
            $table->integer('min_redeem_points')->default(100);
            $table->integer('max_redeem_percent')->default(20);
            $table->integer('points_expiry_days')->default(365);
            $table->boolean('apply_on_invoices')->default(true);
            $table->boolean('apply_on_pos')->default(true);
            $table->boolean('apply_on_delivery')->default(false);
            $table->timestamps();

            $table->unique('tenant_id');
        });

        // Ensure each existing tenant has a default (inactive) loyalty program row.
        $tenantIds = DB::table('tenants')->pluck('id')->map(fn ($id) => (int) $id)->all();
        foreach ($tenantIds as $tenantId) {
            DB::table('loyalty_programs')->updateOrInsert(
                ['tenant_id' => $tenantId],
                [
                    'name' => 'نقاط الولاء',
                    'is_active' => false,
                    'points_per_currency' => 1,
                    'point_value' => 0.01,
                    'min_redeem_points' => 100,
                    'max_redeem_percent' => 20,
                    'points_expiry_days' => 365,
                    'apply_on_invoices' => true,
                    'apply_on_pos' => true,
                    'apply_on_delivery' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_programs');
    }
};
