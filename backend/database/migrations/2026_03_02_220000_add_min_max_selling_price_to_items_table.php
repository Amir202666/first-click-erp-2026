<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->decimal('min_selling_price', 18, 4)->nullable()->after('selling_price');
            $table->decimal('max_selling_price', 18, 4)->nullable()->after('min_selling_price');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['min_selling_price', 'max_selling_price']);
        });
    }
};
