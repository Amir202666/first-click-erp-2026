<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * وحدات القياس المتعددة لكل صنف: وحدة كبرى/متوسطة/صغرى + معامل تحويل + أسعار وباركود لكل وحدة.
     */
    public function up(): void
    {
        Schema::create('item_unit_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->foreignId('unit_id')->constrained('item_units')->cascadeOnDelete();
            $table->decimal('conversion_factor', 18, 6)->default(1)->comment('كم وحدة صغرى في هذه الوحدة (مثلاً 12 = كرتون فيه 12 قطعة)');
            $table->boolean('is_base')->default(false)->comment('الوحدة الصغرى التي يُخزّن بها الرصيد');
            $table->unsignedTinyInteger('sort_order')->default(0)->comment('ترتيب العرض (0=الأصغر)');
            $table->decimal('selling_price', 18, 4)->nullable()->comment('سعر البيع لهذه الوحدة');
            $table->decimal('cost_price', 18, 4)->nullable()->comment('سعر الشراء لهذه الوحدة');
            $table->string('barcode', 100)->nullable()->comment('باركود خاص بهذه الوحدة');
            $table->timestamps();

            $table->unique(['item_id', 'unit_id']);
            $table->index(['item_id', 'is_base']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_unit_options');
    }
};
