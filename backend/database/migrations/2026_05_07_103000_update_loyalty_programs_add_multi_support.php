<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('loyalty_programs', function (Blueprint $table) {
            // Drop single-program-per-tenant constraint.
            $table->dropUnique(['tenant_id']);

            $table->string('code')->nullable()->after('name');
            $table->text('description')->nullable()->after('code');
            $table->string('color', 20)->default('#f59e0b')->after('description');
            $table->string('icon', 10)->default('⭐')->after('color');

            $table->boolean('apply_on_restaurant')->default(false)->after('apply_on_delivery');
            $table->json('applicable_customer_ids')->nullable()->after('apply_on_restaurant');
            $table->integer('sort_order')->default(0)->after('applicable_customer_ids');

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'is_active']);
        });

        // Backfill "code" for existing rows so the new unique (tenant_id, code) is satisfied.
        $rows = DB::table('loyalty_programs')->select(['id', 'tenant_id', 'code'])->orderBy('id')->get();
        $used = [];
        foreach ($rows as $row) {
            $tenantId = (int) $row->tenant_id;
            $code = (string) ($row->code ?? '');
            if ($code === '') {
                $code = 'GENERAL';
            }
            $code = strtoupper(preg_replace('/[^A-Z0-9_\\-]/', '_', $code) ?: 'GENERAL');

            $key = $tenantId.':'.$code;
            if (isset($used[$key])) {
                // Ensure uniqueness per tenant.
                $code = $code.'_'.$row->id;
            }
            $used[$tenantId.':'.$code] = true;

            DB::table('loyalty_programs')->where('id', (int) $row->id)->update([
                'code' => $code,
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('loyalty_programs', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'is_active']);
            $table->dropUnique(['tenant_id', 'code']);

            $table->dropColumn([
                'code',
                'description',
                'color',
                'icon',
                'apply_on_restaurant',
                'applicable_customer_ids',
                'sort_order',
            ]);

            $table->unique('tenant_id');
        });
    }
};
