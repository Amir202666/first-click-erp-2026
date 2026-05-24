<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hr_administrations', function (Blueprint $table) {
            $table->string('name_en', 190)->nullable()->after('name');
            $table->foreignId('manager_employee_id')
                ->nullable()
                ->after('name_en')
                ->constrained('employees')
                ->nullOnDelete();
            $table->text('description_ar')->nullable()->after('notes');
            $table->text('description_en')->nullable()->after('description_ar');

            $table->index(['tenant_id', 'manager_employee_id']);
        });
    }

    public function down(): void
    {
        Schema::table('hr_administrations', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'manager_employee_id']);
            $table->dropConstrainedForeignId('manager_employee_id');
            $table->dropColumn(['name_en', 'description_ar', 'description_en']);
        });
    }
};
