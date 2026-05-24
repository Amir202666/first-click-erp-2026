<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shipping_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->foreignId('driver_id')->constrained('delivery_drivers')->restrictOnDelete();
            $table->string('status', 40)->default('out_for_delivery');
            $table->foreignId('delivery_assignment_id')->nullable()->constrained('delivery_assignments')->nullOnDelete();
            $table->timestamps();

            $table->unique('invoice_id');
            $table->index(['tenant_id', 'driver_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipping_orders');
    }
};
