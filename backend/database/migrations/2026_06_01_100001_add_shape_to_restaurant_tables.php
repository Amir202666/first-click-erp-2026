<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('restaurant_tables', function (Blueprint $table) {
            if (! Schema::hasColumn('restaurant_tables', 'shape')) {
                $table->string('shape', 20)->default('square')->after('capacity');
            }
            if (! Schema::hasColumn('restaurant_tables', 'closed_at')) {
                $table->timestamp('closed_at')->nullable()->after('sort_order');
            }
            if (! Schema::hasColumn('restaurant_tables', 'occupied_at')) {
                $table->timestamp('occupied_at')->nullable()->after('closed_at');
            }
        });

        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE restaurant_tables MODIFY status VARCHAR(30) NOT NULL DEFAULT 'available'");
        }
    }

    public function down(): void
    {
        Schema::table('restaurant_tables', function (Blueprint $table) {
            $table->dropColumn(['shape', 'closed_at', 'occupied_at']);
        });
    }
};
