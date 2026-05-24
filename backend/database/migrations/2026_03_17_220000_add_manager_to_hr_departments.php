<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hr_departments', function (Blueprint $table) {
            $table->foreignId('manager_employee_id')
                ->nullable()
                ->after('administration_id')
                ->constrained('employees')
                ->nullOnDelete();

            $table->index(['tenant_id', 'manager_employee_id']);
        });
    }

    public function down(): void
    {
        Schema::table('hr_departments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('manager_employee_id');
            $table->dropIndex(['tenant_id', 'manager_employee_id']);
        });
    }
};
