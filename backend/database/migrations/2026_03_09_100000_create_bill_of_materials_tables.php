<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bill_of_materials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('finished_item_id')->constrained('items')->cascadeOnDelete();
            $table->string('name')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index(['tenant_id', 'finished_item_id']);
        });

        Schema::create('bill_of_material_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bill_of_material_id')->constrained()->cascadeOnDelete();
            $table->foreignId('component_item_id')->constrained('items')->cascadeOnDelete();
            $table->decimal('quantity', 18, 4)->default(1);
            $table->foreignId('unit_id')->nullable()->constrained('item_units')->nullOnDelete();
            $table->decimal('unit_cost', 18, 4)->nullable();
            $table->integer('sort_order')->default(0);
            $table->timestamps();
            $table->unique(['bill_of_material_id', 'component_item_id'], 'bom_lines_bom_component_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bill_of_material_lines');
        Schema::dropIfExists('bill_of_materials');
    }
};
