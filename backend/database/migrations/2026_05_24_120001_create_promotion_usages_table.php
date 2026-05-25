<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promotion_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->string('source_type');
            $table->unsignedBigInteger('source_id');
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('channel');
            $table->decimal('original_amount', 15, 3);
            $table->decimal('discount_amount', 15, 3);
            $table->decimal('final_amount', 15, 3);
            $table->json('applied_items')->nullable();
            $table->timestamp('used_at');
            $table->foreignId('used_by')->constrained('users');
            $table->timestamps();

            $table->index(['tenant_id', 'promotion_id']);
            $table->index(['source_type', 'source_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotion_usages');
    }
};
