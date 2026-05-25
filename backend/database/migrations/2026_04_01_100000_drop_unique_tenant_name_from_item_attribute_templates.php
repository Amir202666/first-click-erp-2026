<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('item_attribute_templates', function (Blueprint $table) {
            $table->index('tenant_id', 'iat_tenant_id_idx');
            $table->dropUnique(['tenant_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::table('item_attribute_templates', function (Blueprint $table) {
            $table->unique(['tenant_id', 'name']);
            $table->dropIndex('iat_tenant_id_idx');
        });
    }
};
