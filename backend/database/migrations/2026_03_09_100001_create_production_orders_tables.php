<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('production_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('number', 50);
            $table->date('order_date');
            $table->foreignId('finished_item_id')->constrained('items')->cascadeOnDelete();
            $table->decimal('quantity', 18, 4)->default(1);
            $table->foreignId('bill_of_material_id')->constrained()->cascadeOnDelete();
            $table->string('status', 20)->default('draft'); // draft, approved, completed
            $table->foreignId('raw_warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->foreignId('finished_warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('cost_center_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('total_cost', 18, 4)->default(0);
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('journal_entry_id')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'status']);
            $table->unique(['tenant_id', 'number']);
        });

        Schema::create('production_order_materials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('production_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->decimal('quantity_required', 18, 4)->default(0);
            $table->decimal('quantity_consumed', 18, 4)->default(0);
            $table->decimal('unit_cost', 18, 4)->default(0);
            $table->decimal('total_cost', 18, 4)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('production_order_materials');
        Schema::dropIfExists('production_orders');
    }
};
