<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            if (! Schema::hasColumn('invoices', 'delivery_driver_id')) {
                $table->foreignId('delivery_driver_id')
                    ->nullable()
                    ->after('table_id')
                    ->constrained('delivery_drivers')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            if (Schema::hasColumn('invoices', 'delivery_driver_id')) {
                $table->dropConstrainedForeignId('delivery_driver_id');
            }
        });
    }
};
