<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('warehouses', function (Blueprint $table) {
            $table->boolean('applies_to_all_branches')->default(true)->after('branch_id');
        });

        Schema::create('branch_warehouse', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['warehouse_id', 'branch_id']);
        });

        $rows = DB::table('warehouses')->whereNotNull('branch_id')->get(['id', 'branch_id']);
        foreach ($rows as $row) {
            DB::table('warehouses')->where('id', $row->id)->update(['applies_to_all_branches' => false]);
            DB::table('branch_warehouse')->insert([
                'warehouse_id' => $row->id,
                'branch_id' => $row->branch_id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('branch_warehouse');
        Schema::table('warehouses', function (Blueprint $table) {
            $table->dropColumn('applies_to_all_branches');
        });
    }
};
