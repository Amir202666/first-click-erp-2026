<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('restaurant_menu_settings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->unique();
            $table->string('primary_color', 20)->default('#10b981');
            $table->unsignedTinyInteger('service_charge_percent')->default(10);
            $table->string('cover_image')->nullable();
            $table->boolean('is_published')->default(true);
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
        });

        Schema::create('restaurant_menu_categories', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->string('name');
            $table->string('name_en')->nullable();
            $table->string('icon')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->index(['tenant_id', 'sort_order']);
        });

        Schema::create('restaurant_menu_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('category_id');
            $table->unsignedBigInteger('item_id')->nullable();
            $table->string('name');
            $table->string('name_en')->nullable();
            $table->text('description')->nullable();
            $table->text('description_en')->nullable();
            $table->decimal('price', 12, 2);
            $table->decimal('original_price', 12, 2)->nullable();
            $table->string('image')->nullable();
            $table->string('emoji', 16)->nullable();
            $table->boolean('is_available')->default(true);
            $table->json('allergens')->nullable();
            $table->unsignedSmallInteger('calories')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('category_id')->references('id')->on('restaurant_menu_categories')->onDelete('cascade');
            $table->foreign('item_id')->references('id')->on('items')->nullOnDelete();
            $table->index(['tenant_id', 'category_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('restaurant_menu_items');
        Schema::dropIfExists('restaurant_menu_categories');
        Schema::dropIfExists('restaurant_menu_settings');
    }
};
