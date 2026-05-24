<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hr_allowances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('code', 64)->index();
            $table->string('name', 190);
            $table->string('value_type', 32)->default('fixed'); // fixed, percent_basic
            $table->decimal('value', 18, 3)->default(0);
            $table->foreignId('currency_id')->nullable()->constrained('currencies')->nullOnDelete();
            $table->string('apply_to', 32)->default('all'); // all, administration, employee
            $table->foreignId('administration_id')->nullable()->constrained('hr_administrations')->nullOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('status', 32)->default('active'); // active, inactive
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'apply_to']);
            $table->index(['tenant_id', 'administration_id']);
            $table->index(['tenant_id', 'employee_id']);
        });

        Schema::create('hr_deductions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('code', 64)->index();
            $table->string('name', 190);
            $table->string('reason', 32)->default('other'); // absence, late, loan, advance, other
            $table->string('value_type', 32)->default('fixed'); // fixed, percent_basic
            $table->decimal('value', 18, 3)->default(0);
            $table->string('apply_to', 32)->default('employee'); // all, administration, employee
            $table->foreignId('administration_id')->nullable()->constrained('hr_administrations')->nullOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('status', 32)->default('active'); // active, inactive
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'reason']);
            $table->index(['tenant_id', 'apply_to']);
            $table->index(['tenant_id', 'administration_id']);
            $table->index(['tenant_id', 'employee_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hr_deductions');
        Schema::dropIfExists('hr_allowances');
    }
};
