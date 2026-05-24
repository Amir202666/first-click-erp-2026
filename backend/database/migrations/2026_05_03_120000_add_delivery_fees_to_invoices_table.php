<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->json('delivery_fees')->nullable()->after('notes');
            $table->decimal('delivery_fees_total', 15, 3)->default(0)->after('delivery_fees');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropColumn(['delivery_fees', 'delivery_fees_total']);
        });
    }
};
