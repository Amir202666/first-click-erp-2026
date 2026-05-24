<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'sqlite') {
            $groups = DB::table('bill_of_materials')
                ->select('tenant_id', 'finished_item_id', DB::raw('MIN(id) as keep_id'))
                ->groupBy('tenant_id', 'finished_item_id')
                ->get();

            foreach ($groups as $g) {
                DB::table('bill_of_materials')
                    ->where('tenant_id', $g->tenant_id)
                    ->where('finished_item_id', $g->finished_item_id)
                    ->where('id', '!=', $g->keep_id)
                    ->delete();
            }
        } else {
            DB::statement('
                DELETE b1 FROM bill_of_materials b1
                INNER JOIN bill_of_materials b2
                  ON b1.tenant_id = b2.tenant_id
                 AND b1.finished_item_id = b2.finished_item_id
                 AND b1.id > b2.id
            ');
        }

        Schema::table('bill_of_materials', function (Blueprint $table) {
            $table->unique(['tenant_id', 'finished_item_id'], 'bill_of_materials_tenant_finished_unique');
        });
    }

    public function down(): void
    {
        Schema::table('bill_of_materials', function (Blueprint $table) {
            $table->dropUnique('bill_of_materials_tenant_finished_unique');
        });
    }
};
