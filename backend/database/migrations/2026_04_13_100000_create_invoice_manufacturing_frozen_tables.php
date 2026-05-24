<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * لقطة تكوين التصنيع عند ترحيل فاتورة المبيعات (BOM لحظة البيع) — لا تتأثر بتعديلات BOM لاحقاً.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoice_manufacturing_frozen_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_line_id')->constrained('invoice_lines')->cascadeOnDelete();
            $table->foreignId('bill_of_material_id')->nullable()->constrained('bill_of_materials')->nullOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->foreignId('raw_warehouse_id')->constrained('warehouses');
            $table->foreignId('finished_warehouse_id')->constrained('warehouses');
            $table->foreignId('finished_item_id')->constrained('items');
            $table->decimal('finished_quantity', 18, 4);
            $table->foreignId('finished_unit_id')->nullable()->constrained('item_units')->nullOnDelete();
            $table->decimal('finished_qty_base', 18, 6);
            /** مجموع تكلفة المكوّنات بعملة الفاتورة قبل تحويل العملة — يُستخدم للتحقق والحركات */
            $table->decimal('wip_total_cost_invoice', 18, 3)->default(0);
            /** مجموع بنود WIP بعملة الأساس (مطابقة القيد المحاسبي) */
            $table->decimal('wip_total_cost_base', 18, 3)->default(0);
            $table->timestamps();

            $table->unique(['invoice_id', 'invoice_line_id']);
            $table->index(['tenant_id', 'invoice_id']);
        });

        Schema::create('invoice_manufacturing_frozen_components', function (Blueprint $table) {
            $table->id();
            $table->foreignId('batch_id')->constrained('invoice_manufacturing_frozen_batches')->cascadeOnDelete();
            $table->foreignId('component_item_id')->constrained('items');
            $table->string('component_name', 512);
            $table->foreignId('component_unit_id')->nullable()->constrained('item_units')->nullOnDelete();
            /** الكمية بوحدة الـ BOM للكمية المباعة من التام (مثل bom_line.quantity × كمية الفاتورة) */
            $table->decimal('qty_in_component_unit', 18, 6);
            $table->decimal('qty_base', 18, 6);
            $table->decimal('unit_cost', 18, 4)->default(0);
            $table->decimal('total_cost', 18, 3)->default(0);
            $table->unsignedInteger('sort_order')->default(0);
            $table->unsignedBigInteger('inventory_movement_out_id')->nullable();
            $table->timestamps();

            $table->index(['batch_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_manufacturing_frozen_components');
        Schema::dropIfExists('invoice_manufacturing_frozen_batches');
    }
};
