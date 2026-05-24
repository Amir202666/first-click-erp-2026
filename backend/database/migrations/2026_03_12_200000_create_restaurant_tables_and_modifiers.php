<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Restaurant tables (physical tables in dining area)
        Schema::create('restaurant_tables', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('branch_id')->nullable();
            $table->string('name');
            $table->string('code')->nullable();
            $table->string('section')->nullable(); // e.g. Hall A, Terrace
            $table->unsignedInteger('capacity')->nullable();
            $table->enum('status', ['available', 'occupied', 'cleaning'])->default('available');
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('branch_id')->references('id')->on('branches')->nullOnDelete();
        });

        // Modifier groups (e.g. Size, Extras)
        Schema::create('product_modifier_groups', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->string('name');
            $table->boolean('is_required')->default(false);
            $table->unsignedInteger('max_select')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
        });

        // Modifier options (e.g. Extra cheese, Large)
        Schema::create('product_modifier_options', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('group_id');
            $table->string('name');
            $table->decimal('price_delta', 12, 2)->default(0);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('group_id')->references('id')->on('product_modifier_groups')->onDelete('cascade');
        });

        // Pivot table: which items use which modifier groups
        Schema::create('item_modifier_group', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('item_id');
            $table->unsignedBigInteger('group_id');
            $table->timestamps();

            $table->foreign('item_id')->references('id')->on('items')->onDelete('cascade');
            $table->foreign('group_id')->references('id')->on('product_modifier_groups')->onDelete('cascade');
        });

        // Invoice line modifiers snapshot
        Schema::create('invoice_line_modifiers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('invoice_line_id');
            $table->unsignedBigInteger('modifier_option_id')->nullable();
            $table->string('name_snapshot');
            $table->decimal('price_delta', 12, 2)->default(0);
            $table->string('kitchen_note')->nullable();
            $table->timestamps();

            $table->foreign('invoice_line_id')->references('id')->on('invoice_lines')->onDelete('cascade');
            $table->foreign('modifier_option_id')->references('id')->on('product_modifier_options')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('invoice_line_modifiers');
        Schema::dropIfExists('item_modifier_group');
        Schema::dropIfExists('product_modifier_options');
        Schema::dropIfExists('product_modifier_groups');
        Schema::dropIfExists('restaurant_tables');
    }
};
