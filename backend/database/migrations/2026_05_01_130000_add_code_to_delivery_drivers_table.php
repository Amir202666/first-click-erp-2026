<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('delivery_drivers', function (Blueprint $table) {
            $table->string('code', 30)->nullable()->after('tenant_id');
        });

        // Backfill existing drivers with sequential codes per tenant
        $tenantIds = DB::table('delivery_drivers')->select('tenant_id')->distinct()->pluck('tenant_id');
        foreach ($tenantIds as $tenantId) {
            $rows = DB::table('delivery_drivers')
                ->where('tenant_id', $tenantId)
                ->orderBy('id')
                ->select('id')
                ->get();

            $seq = 1;
            foreach ($rows as $r) {
                DB::table('delivery_drivers')->where('id', $r->id)->update(['code' => (string) $seq]);
                $seq++;
            }
        }

        // SQLite (and some environments) cannot safely ALTER column nullability without DBAL / table rebuild.
        // We keep it nullable here, but ensure it's populated for existing rows above.
        // The application will always generate a code for new drivers.
        Schema::table('delivery_drivers', function (Blueprint $table) {
            $table->unique(['tenant_id', 'code']);
        });
    }

    public function down(): void
    {
        Schema::table('delivery_drivers', function (Blueprint $table) {
            $table->dropUnique(['tenant_id', 'code']);
            $table->dropColumn('code');
        });
    }
};
