<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_adjustments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->string('number')->nullable()->index();
            $table->enum('adjustment_type', ['in', 'out'])->index(); // إضافة / صرف
            $table->unsignedBigInteger('warehouse_id')->nullable()->index();
            $table->unsignedBigInteger('branch_id')->nullable()->index();
            $table->unsignedBigInteger('cost_center_id')->nullable()->index();
            $table->date('date')->index();
            $table->text('notes')->nullable();

            $table->string('status')->default('posted')->index(); // posted (فوري) — قابل للتوسعة لاحقاً
            $table->unsignedBigInteger('journal_entry_id')->nullable()->index();

            $table->string('attachment')->nullable(); // ملف واحد (محضر/صور) مثل الفاتورة
            $table->unsignedBigInteger('created_by')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_adjustments');
    }
};
