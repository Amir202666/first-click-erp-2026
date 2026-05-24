<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('company_name', 255)->nullable()->after('name_en');
        });
        Schema::table('vendors', function (Blueprint $table) {
            $table->string('company_name', 255)->nullable()->after('name_en');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('company_name');
        });
        Schema::table('vendors', function (Blueprint $table) {
            $table->dropColumn('company_name');
        });
    }
};
