<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('restaurant_order_lines', function (Blueprint $table) {
            $table->string('kitchen_note', 500)->nullable()->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('restaurant_order_lines', function (Blueprint $table) {
            $table->dropColumn('kitchen_note');
        });
    }
};
