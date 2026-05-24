<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hr_administrations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('code', 64)->index();
            $table->string('name', 190);
            $table->string('status', 32)->default('active'); // active, inactive
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'status']);
        });

        Schema::create('hr_departments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('code', 64)->index();
            $table->string('name', 190);
            $table->foreignId('administration_id')->nullable()->constrained('hr_administrations')->nullOnDelete();
            $table->string('status', 32)->default('active'); // active, inactive
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'administration_id']);
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->foreignId('administration_id')->nullable()->after('branch_id')->constrained('hr_administrations')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->after('administration_id')->constrained('hr_departments')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropConstrainedForeignId('department_id');
            $table->dropConstrainedForeignId('administration_id');
        });
        Schema::dropIfExists('hr_departments');
        Schema::dropIfExists('hr_administrations');
    }
};
