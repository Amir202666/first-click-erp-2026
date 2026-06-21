<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('disassembly_order_source_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('disassembly_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->decimal('quantity', 18, 4);
            $table->decimal('unit_cost', 18, 4)->default(0);
            $table->decimal('total_cost', 18, 4)->default(0);
            $table->foreignId('unit_id')->nullable()->constrained('item_units')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        if (Schema::hasTable('disassembly_orders')) {
            $orders = DB::table('disassembly_orders')->whereNotNull('item_id')->get(['id', 'item_id', 'quantity', 'unit_cost', 'total_cost']);
            foreach ($orders as $order) {
                $qty = (float) $order->quantity;
                $unitCost = (float) ($order->unit_cost ?? 0);
                $totalCost = (float) ($order->total_cost ?? ($qty * $unitCost));
                DB::table('disassembly_order_source_lines')->insert([
                    'disassembly_order_id' => $order->id,
                    'item_id' => $order->item_id,
                    'quantity' => $qty,
                    'unit_cost' => $unitCost,
                    'total_cost' => $totalCost,
                    'sort_order' => 0,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('disassembly_order_source_lines');
    }
};
