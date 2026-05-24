<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('loyalty_points', function (Blueprint $table) {
            $table->index(['tenant_id', 'source_type', 'source_id'], 'loyalty_points_tenant_source_idx');
        });
    }

    public function down(): void
    {
        Schema::table('loyalty_points', function (Blueprint $table) {
            $table->dropIndex('loyalty_points_tenant_source_idx');
        });
    }
};
