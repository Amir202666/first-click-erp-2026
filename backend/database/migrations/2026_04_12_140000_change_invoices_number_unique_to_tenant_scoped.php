<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * الرقم كان فريداً على عمود number فقط، بينما التوليد قد يقيّد بالفرع (per_branch)
     * inُنتج نفس الرقم لفروع مختلفة → انتهاك UNIQUE.
     * التفرد الصحيح: (tenant_id, number) لكل مستأجر.
     */
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropUnique(['number']);
        });
        Schema::table('invoices', function (Blueprint $table) {
            $table->unique(['tenant_id', 'number']);
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropUnique(['tenant_id', 'number']);
        });
        Schema::table('invoices', function (Blueprint $table) {
            $table->unique('number');
        });
    }
};
