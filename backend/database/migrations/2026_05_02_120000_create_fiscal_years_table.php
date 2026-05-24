<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fiscal_years', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('year');
            $table->date('start_date');
            $table->date('end_date');
            $table->boolean('is_closed')->default(false);
            $table->timestamp('closed_at')->nullable();
            $table->boolean('is_locked')->default(false);
            $table->timestamp('locked_at')->nullable();
            $table->foreignId('closing_journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->foreignId('opening_journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->json('opening_balances_snapshot')->nullable();
            $table->json('inventory_snapshot')->nullable();
            $table->boolean('inventory_carried_forward')->default(false);
            $table->text('notes')->nullable();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'year']);
            $table->index(['tenant_id', 'is_locked']);
            $table->index(['tenant_id', 'start_date', 'end_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fiscal_years');
    }
};
