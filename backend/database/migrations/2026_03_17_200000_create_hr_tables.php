<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('code', 64)->index();

            // Personal
            $table->string('name', 190);
            $table->string('national_id', 64)->nullable();
            $table->date('birth_date')->nullable();
            $table->string('phone', 64)->nullable();
            $table->string('email', 190)->nullable();
            $table->string('address', 255)->nullable();

            // Job
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->string('department', 190)->nullable();
            $table->string('job_title', 190)->nullable();
            $table->date('hire_date')->nullable();
            $table->string('status', 32)->default('active'); // active, inactive

            // Payroll defaults
            $table->decimal('basic_salary', 18, 3)->default(0);
            $table->decimal('housing_allowance', 18, 3)->default(0);
            $table->decimal('transport_allowance', 18, 3)->default(0);

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
        });

        Schema::create('employee_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->string('type', 32); // passport, contract, residency, other
            $table->string('file_url', 512);
            $table->string('file_path', 512)->nullable();
            $table->date('issued_at')->nullable();
            $table->date('expires_at')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['tenant_id', 'employee_id', 'type']);
            $table->index(['tenant_id', 'expires_at']);
        });

        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->date('work_date')->index();
            $table->dateTime('check_in')->nullable();
            $table->dateTime('check_out')->nullable();
            $table->string('source', 16)->default('manual'); // device, manual
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'employee_id', 'work_date']);
        });

        Schema::create('payroll_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('number', 64)->index();
            $table->unsignedSmallInteger('year')->index();
            $table->unsignedTinyInteger('month')->index();
            $table->string('status', 32)->default('draft'); // draft, approved
            $table->timestamp('generated_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();

            // Accounting targets snapshot (can be null; enforced on approve)
            $table->foreignId('salary_expense_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('salary_payable_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('bank_account_id')->nullable()->constrained('accounts')->nullOnDelete();

            $table->decimal('total_gross', 18, 3)->default(0);
            $table->decimal('total_deductions', 18, 3)->default(0);
            $table->decimal('total_net', 18, 3)->default(0);

            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'year', 'month']);
            $table->unique(['tenant_id', 'number']);
        });

        Schema::create('payroll_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payroll_run_id')->constrained('payroll_runs')->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();

            $table->decimal('basic_salary', 18, 3)->default(0);
            $table->decimal('housing_allowance', 18, 3)->default(0);
            $table->decimal('transport_allowance', 18, 3)->default(0);

            $table->decimal('overtime_hours', 10, 2)->default(0);
            $table->unsignedInteger('late_minutes')->default(0);
            $table->decimal('absence_days', 10, 2)->default(0);

            $table->decimal('overtime_amount', 18, 3)->default(0);
            $table->decimal('late_deduction', 18, 3)->default(0);
            $table->decimal('absence_deduction', 18, 3)->default(0);
            $table->decimal('loan_deduction', 18, 3)->default(0);
            $table->decimal('other_deductions', 18, 3)->default(0);

            $table->decimal('net_pay', 18, 3)->default(0);
            $table->timestamps();

            $table->unique(['payroll_run_id', 'employee_id']);
        });

        Schema::create('hr_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('number', 64)->index();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->string('type', 32); // leave, loan, advance, custody
            $table->string('status', 32)->default('pending'); // pending, approved, rejected
            $table->date('requested_at')->nullable();

            // Leave
            $table->date('from_date')->nullable();
            $table->date('to_date')->nullable();

            // Money requests
            $table->decimal('amount', 18, 3)->nullable();
            $table->unsignedSmallInteger('installments_count')->nullable(); // for loans

            $table->text('reason')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'number']);
            $table->index(['tenant_id', 'type', 'status']);
        });

        Schema::create('loan_installments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('hr_request_id')->constrained('hr_requests')->cascadeOnDelete();
            $table->unsignedSmallInteger('sequence');
            $table->date('due_month'); // first day of month
            $table->decimal('amount', 18, 3)->default(0);
            $table->decimal('deducted_amount', 18, 3)->default(0);
            $table->string('status', 32)->default('pending'); // pending, paid
            $table->foreignId('payroll_line_id')->nullable()->constrained('payroll_lines')->nullOnDelete();
            $table->timestamps();

            $table->index(['hr_request_id', 'due_month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loan_installments');
        Schema::dropIfExists('hr_requests');
        Schema::dropIfExists('payroll_lines');
        Schema::dropIfExists('payroll_runs');
        Schema::dropIfExists('attendances');
        Schema::dropIfExists('employee_documents');
        Schema::dropIfExists('employees');
    }
};
