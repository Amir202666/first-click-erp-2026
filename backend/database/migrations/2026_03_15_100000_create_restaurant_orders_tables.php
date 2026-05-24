<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('restaurant_orders', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('branch_id');
            $table->unsignedBigInteger('warehouse_id');
            $table->unsignedBigInteger('table_id')->nullable();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('order_type', 20)->default('dine_in');
            $table->string('status', 20)->default('sent'); // sent, ready, paid
            $table->unsignedBigInteger('invoice_id')->nullable();
            $table->date('date');
            $table->decimal('subtotal', 18, 3)->default(0);
            $table->decimal('tax_amount', 18, 3)->default(0);
            $table->decimal('total', 18, 3)->default(0);
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('branch_id')->references('id')->on('branches')->nullOnDelete();
            $table->foreign('warehouse_id')->references('id')->on('warehouses')->nullOnDelete();
            $table->foreign('table_id')->references('id')->on('restaurant_tables')->nullOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->nullOnDelete();
            $table->foreign('invoice_id')->references('id')->on('invoices')->nullOnDelete();
        });

        Schema::create('restaurant_order_lines', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('restaurant_order_id');
            $table->unsignedBigInteger('item_id');
            $table->string('description')->nullable();
            $table->decimal('quantity', 18, 3);
            $table->decimal('unit_price', 18, 3);
            $table->decimal('discount_percent', 8, 3)->default(0);
            $table->decimal('tax_percent', 8, 3)->default(0);
            $table->decimal('amount', 18, 3)->default(0);
            $table->decimal('tax_amount', 18, 3)->default(0);
            $table->decimal('total', 18, 3)->default(0);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('restaurant_order_id')->references('id')->on('restaurant_orders')->onDelete('cascade');
            $table->foreign('item_id')->references('id')->on('items')->nullOnDelete();
        });

        Schema::table('kitchen_tickets', function (Blueprint $table) {
            $table->unsignedBigInteger('restaurant_order_id')->nullable()->after('invoice_id');
            $table->foreign('restaurant_order_id')->references('id')->on('restaurant_orders')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('kitchen_tickets', function (Blueprint $table) {
            $table->dropForeign(['restaurant_order_id']);
        });
        Schema::dropIfExists('restaurant_order_lines');
        Schema::dropIfExists('restaurant_orders');
    }
};
