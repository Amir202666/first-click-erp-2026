<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('opening_stock_headers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('reference_number')->nullable();
            $table->text('notes')->nullable();
            $table->string('status', 20)->default('draft'); // draft, approved
            $table->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'status', 'date']);
        });

        Schema::create('opening_stock_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('opening_stock_header_id')->constrained('opening_stock_headers')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->decimal('quantity', 18, 4);
            $table->decimal('unit_cost', 18, 4)->default(0);
            $table->decimal('total_cost', 18, 4)->default(0);
            $table->foreignId('cost_center_id')->nullable()->constrained('cost_centers')->nullOnDelete();
            $table->timestamps();

            $table->unique(['opening_stock_header_id', 'item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('opening_stock_items');
        Schema::dropIfExists('opening_stock_headers');
    }
};
