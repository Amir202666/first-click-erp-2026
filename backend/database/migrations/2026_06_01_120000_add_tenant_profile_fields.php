<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            if (! Schema::hasColumn('tenants', 'name_en')) {
                $table->string('name_en')->nullable()->after('name');
            }
            if (! Schema::hasColumn('tenants', 'country')) {
                $table->string('country', 100)->nullable()->after('address');
            }
            if (! Schema::hasColumn('tenants', 'city')) {
                $table->string('city', 100)->nullable()->after('country');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            if (Schema::hasColumn('tenants', 'city')) {
                $table->dropColumn('city');
            }
            if (Schema::hasColumn('tenants', 'country')) {
                $table->dropColumn('country');
            }
            if (Schema::hasColumn('tenants', 'name_en')) {
                $table->dropColumn('name_en');
            }
        });
    }
};
