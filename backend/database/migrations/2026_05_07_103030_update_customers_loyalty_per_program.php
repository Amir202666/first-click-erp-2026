<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->json('loyalty_balances')->nullable()->after('loyalty_tier_id');
        });

        // Backfill JSON balances for existing customers based on legacy columns and the first program per tenant.
        $programs = DB::table('loyalty_programs')->select(['id', 'tenant_id'])->orderBy('tenant_id')->orderBy('id')->get();
        $firstProgramByTenant = [];
        foreach ($programs as $p) {
            $tid = (int) $p->tenant_id;
            if (! isset($firstProgramByTenant[$tid])) {
                $firstProgramByTenant[$tid] = (int) $p->id;
            }
        }

        foreach ($firstProgramByTenant as $tenantId => $programId) {
            $customers = DB::table('customers')
                ->where('tenant_id', (int) $tenantId)
                ->select(['id', 'loyalty_points_balance', 'loyalty_points_total_earned', 'loyalty_points_total_redeemed', 'loyalty_tier_id'])
                ->get();

            foreach ($customers as $c) {
                $balances = [
                    (string) $programId => [
                        'balance' => (float) ($c->loyalty_points_balance ?? 0),
                        'total_earned' => (float) ($c->loyalty_points_total_earned ?? 0),
                        'total_redeemed' => (float) ($c->loyalty_points_total_redeemed ?? 0),
                        'tier_id' => $c->loyalty_tier_id ? (int) $c->loyalty_tier_id : null,
                    ],
                ];

                DB::table('customers')->where('id', (int) $c->id)->update([
                    'loyalty_balances' => json_encode($balances, JSON_UNESCAPED_UNICODE),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('loyalty_balances');
        });
    }
};
