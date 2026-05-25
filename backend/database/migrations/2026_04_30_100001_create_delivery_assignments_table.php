<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('delivery_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->foreignId('driver_id')->constrained('delivery_drivers')->restrictOnDelete();
            $table->string('status', 32)->default('assigned'); // assigned | settled | cancelled
            $table->decimal('custody_amount', 18, 3);
            $table->foreignId('custody_transfer_journal_entry_id')->nullable()->constrained('journal_entries', indexName: 'da_custody_je_fk')->nullOnDelete();
            $table->timestamp('assigned_at')->useCurrent();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('settled_at')->nullable();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'driver_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_assignments');
    }
};
