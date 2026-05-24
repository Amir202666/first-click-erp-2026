<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_adjustment_lines', function (Blueprint $table) {
            // كمية المستخدم حسب الوحدة المختارة (للعرض/التعديل)
            $table->decimal('display_quantity', 18, 6)->nullable()->after('quantity');
            $table->foreignId('unit_id')->nullable()->after('display_quantity')->constrained('item_units')->nullOnDelete();
            // معامل التحويل إلى وحدة الأساس (base_qty = display_qty * conversion_factor)
            $table->decimal('conversion_factor', 18, 6)->nullable()->after('unit_id');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_adjustment_lines', function (Blueprint $table) {
            $table->dropConstrainedForeignId('unit_id');
            $table->dropColumn(['display_quantity', 'conversion_factor']);
        });
    }
};
