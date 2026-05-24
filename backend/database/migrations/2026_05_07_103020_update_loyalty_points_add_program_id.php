<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('loyalty_points', function (Blueprint $table) {
            $table->foreignId('loyalty_program_id')
                ->nullable()
                ->after('tenant_id')
                ->constrained('loyalty_programs')
                ->nullOnDelete();
            $table->index('loyalty_program_id');
        });

        // Backfill: link existing points to the first program per tenant (previous single-program behavior).
        $programs = DB::table('loyalty_programs')
            ->select(['id', 'tenant_id'])
            ->orderBy('tenant_id')
            ->orderBy('id')
            ->get();

        $firstProgramByTenant = [];
        foreach ($programs as $p) {
            $tid = (int) $p->tenant_id;
            if (! isset($firstProgramByTenant[$tid])) {
                $firstProgramByTenant[$tid] = (int) $p->id;
            }
        }

        foreach ($firstProgramByTenant as $tenantId => $programId) {
            DB::table('loyalty_points')
                ->where('tenant_id', (int) $tenantId)
                ->whereNull('loyalty_program_id')
                ->update(['loyalty_program_id' => (int) $programId, 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        Schema::table('loyalty_points', function (Blueprint $table) {
            $table->dropForeign(['loyalty_program_id']);
            $table->dropIndex(['loyalty_program_id']);
            $table->dropColumn('loyalty_program_id');
        });
    }
};
