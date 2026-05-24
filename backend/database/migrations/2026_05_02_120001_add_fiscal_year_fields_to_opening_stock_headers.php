<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('opening_stock_headers', function (Blueprint $table) {
            $table->string('source', 32)->default('manual')->after('status');
            $table->foreignId('fiscal_year_id')->nullable()->after('source')->constrained('fiscal_years')->nullOnDelete();
            $table->index(['tenant_id', 'source']);
        });
    }

    public function down(): void
    {
        Schema::table('opening_stock_headers', function (Blueprint $table) {
            $table->dropForeign(['fiscal_year_id']);
            $table->dropIndex(['tenant_id', 'source']);
            $table->dropColumn(['source', 'fiscal_year_id']);
        });
    }
};
