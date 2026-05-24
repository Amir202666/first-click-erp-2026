<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('opening_stock_headers', function (Blueprint $table) {
            $table->foreignId('warehouse_id')->nullable()->after('branch_id')->constrained('warehouses')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('opening_stock_headers', function (Blueprint $table) {
            $table->dropForeign(['warehouse_id']);
        });
    }
};
