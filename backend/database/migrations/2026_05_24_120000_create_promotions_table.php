<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('code')->nullable();
            $table->text('description')->nullable();

            $table->enum('type', ['percentage', 'fixed', 'bogo', 'min_purchase']);
            $table->decimal('value', 10, 3)->default(0);
            $table->decimal('min_purchase_amount', 15, 3)->default(0);
            $table->decimal('max_discount_amount', 15, 3)->nullable();

            $table->integer('buy_quantity')->nullable();
            $table->integer('get_quantity')->nullable();
            $table->decimal('get_discount_percent', 5, 2)->default(100);

            $table->json('channels')->nullable();
            $table->json('customer_tiers')->nullable();
            $table->json('customer_ids')->nullable();
            $table->json('item_ids')->nullable();
            $table->json('category_ids')->nullable();

            $table->integer('max_uses')->nullable();
            $table->integer('max_uses_per_day')->nullable();
            $table->integer('max_uses_per_customer')->nullable();
            $table->integer('current_uses')->default(0);

            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->json('active_days')->nullable();
            $table->time('active_from')->nullable();
            $table->time('active_to')->nullable();

            $table->enum('status', ['active', 'inactive', 'draft'])->default('active');
            $table->boolean('is_combinable')->default(false);
            $table->integer('priority')->default(0);
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'start_date', 'end_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotions');
    }
};
