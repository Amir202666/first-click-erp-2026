<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loyalty_tiers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('icon')->nullable();
            $table->string('color')->nullable();
            $table->integer('min_points')->default(0);
            $table->integer('max_points')->nullable();
            $table->decimal('points_multiplier', 5, 2)->default(1.00);
            $table->decimal('extra_discount_percent', 5, 2)->default(0);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index(['tenant_id', 'min_points']);
        });

        // Create 4 default tiers per tenant (if not already created).
        $tenantIds = DB::table('tenants')->pluck('id')->map(fn ($id) => (int) $id)->all();
        foreach ($tenantIds as $tenantId) {
            $exists = DB::table('loyalty_tiers')->where('tenant_id', $tenantId)->exists();
            if ($exists) {
                continue;
            }

            DB::table('loyalty_tiers')->insert([
                [
                    'tenant_id' => $tenantId,
                    'name' => 'برونزي',
                    'icon' => '🥉',
                    'color' => '#cd7f32',
                    'min_points' => 0,
                    'max_points' => 999,
                    'points_multiplier' => 1.00,
                    'extra_discount_percent' => 0,
                    'sort_order' => 1,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'tenant_id' => $tenantId,
                    'name' => 'فضي',
                    'icon' => '🥈',
                    'color' => '#c0c0c0',
                    'min_points' => 1000,
                    'max_points' => 4999,
                    'points_multiplier' => 1.50,
                    'extra_discount_percent' => 0,
                    'sort_order' => 2,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'tenant_id' => $tenantId,
                    'name' => 'ذهبي',
                    'icon' => '🥇',
                    'color' => '#d4af37',
                    'min_points' => 5000,
                    'max_points' => 14999,
                    'points_multiplier' => 2.00,
                    'extra_discount_percent' => 0,
                    'sort_order' => 3,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'tenant_id' => $tenantId,
                    'name' => 'بلاتيني',
                    'icon' => '💎',
                    'color' => '#7fdbff',
                    'min_points' => 15000,
                    'max_points' => null,
                    'points_multiplier' => 3.00,
                    'extra_discount_percent' => 0,
                    'sort_order' => 4,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_tiers');
    }
};
