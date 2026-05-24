<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            if (! Schema::hasColumn('invoices', 'order_type')) {
                $table->enum('order_type', ['dine_in', 'takeaway', 'delivery'])->nullable()->after('type');
            }
            if (! Schema::hasColumn('invoices', 'table_id')) {
                $table->unsignedBigInteger('table_id')->nullable()->after('order_type');
                $table->foreign('table_id')->references('id')->on('restaurant_tables')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            if (Schema::hasColumn('invoices', 'table_id')) {
                $table->dropForeign(['table_id']);
                $table->dropColumn('table_id');
            }
            if (Schema::hasColumn('invoices', 'order_type')) {
                $table->dropColumn('order_type');
            }
        });
    }
};
