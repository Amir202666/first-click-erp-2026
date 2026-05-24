<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('item_categories', function (Blueprint $table) {
            $table->boolean('show_in_pos')->default(true)->after('is_active');
            $table->boolean('show_in_restaurant_pos')->default(true)->after('show_in_pos');
        });
    }

    public function down(): void
    {
        Schema::table('item_categories', function (Blueprint $table) {
            $table->dropColumn(['show_in_pos', 'show_in_restaurant_pos']);
        });
    }
};
