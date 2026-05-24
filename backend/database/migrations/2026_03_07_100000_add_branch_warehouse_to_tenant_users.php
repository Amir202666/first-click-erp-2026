<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenant_users', function (Blueprint $table) {
            $table->foreignId('default_branch_id')->nullable()->after('is_active')->constrained('branches')->nullOnDelete();
            $table->foreignId('default_warehouse_id')->nullable()->after('default_branch_id')->constrained('warehouses')->nullOnDelete();
            $table->boolean('restrict_to_branch_warehouse')->default(false)->after('default_warehouse_id');
        });
    }

    public function down(): void
    {
        Schema::table('tenant_users', function (Blueprint $table) {
            $table->dropForeign(['default_branch_id']);
            $table->dropForeign(['default_warehouse_id']);
            $table->dropColumn(['default_branch_id', 'default_warehouse_id', 'restrict_to_branch_warehouse']);
        });
    }
};
