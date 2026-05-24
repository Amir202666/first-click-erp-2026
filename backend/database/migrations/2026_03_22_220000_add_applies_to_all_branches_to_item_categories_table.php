<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('item_categories', function (Blueprint $table) {
            $table->boolean('applies_to_all_branches')->default(true)->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('item_categories', function (Blueprint $table) {
            $table->dropColumn('applies_to_all_branches');
        });
    }
};
