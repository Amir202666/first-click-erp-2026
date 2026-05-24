<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kitchen_tickets', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('branch_id')->nullable();
            $table->unsignedBigInteger('table_id')->nullable();
            $table->unsignedBigInteger('invoice_id')->nullable();
            $table->enum('status', ['pending', 'in_progress', 'done'])->default('pending');
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('branch_id')->references('id')->on('branches')->nullOnDelete();
            $table->foreign('table_id')->references('id')->on('restaurant_tables')->nullOnDelete();
            $table->foreign('invoice_id')->references('id')->on('invoices')->nullOnDelete();
        });

        Schema::create('kitchen_ticket_lines', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('ticket_id');
            $table->unsignedBigInteger('invoice_line_id')->nullable();
            $table->string('item_name');
            $table->decimal('quantity', 12, 3);
            $table->text('modifiers_text')->nullable();
            $table->string('kitchen_note')->nullable();
            $table->timestamps();

            $table->foreign('ticket_id')->references('id')->on('kitchen_tickets')->onDelete('cascade');
            $table->foreign('invoice_line_id')->references('id')->on('invoice_lines')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kitchen_ticket_lines');
        Schema::dropIfExists('kitchen_tickets');
    }
};
