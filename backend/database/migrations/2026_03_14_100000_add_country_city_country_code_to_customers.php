<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('country', 100)->nullable()->after('address');
            $table->string('city', 100)->nullable()->after('country');
            $table->string('country_code', 10)->nullable()->after('phone'); // كود الهاتف مثل 965
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['country', 'city', 'country_code']);
        });
    }
};
