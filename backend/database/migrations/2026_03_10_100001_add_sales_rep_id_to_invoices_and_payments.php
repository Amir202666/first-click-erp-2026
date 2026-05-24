<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->foreignId('sales_rep_id')->nullable()->after('created_by')->constrained('sales_reps')->nullOnDelete();
        });
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('sales_rep_id')->nullable()->after('created_by')->constrained('sales_reps')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropForeign(['sales_rep_id']);
        });
        Schema::table('payments', function (Blueprint $table) {
            $table->dropForeign(['sales_rep_id']);
        });
    }
};
