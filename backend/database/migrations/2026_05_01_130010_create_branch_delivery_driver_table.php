<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branch_delivery_driver', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->foreignId('delivery_driver_id')->constrained('delivery_drivers')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['branch_id', 'delivery_driver_id']);
            $table->index(['delivery_driver_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('branch_delivery_driver');
    }
};
