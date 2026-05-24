<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hr_job_titles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('code', 64)->index();
            $table->string('name', 190);
            $table->string('name_en', 190)->nullable();
            $table->string('status', 32)->default('active'); // active, inactive
            $table->text('notes')->nullable();
            $table->text('description_ar')->nullable();
            $table->text('description_en')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'status']);
        });

        Schema::create('hr_leave_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('code', 64)->index();
            $table->string('name', 190);
            $table->string('name_en', 190)->nullable();
            $table->string('status', 32)->default('active'); // active, inactive
            $table->text('notes')->nullable();
            $table->text('description_ar')->nullable();
            $table->text('description_en')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hr_leave_types');
        Schema::dropIfExists('hr_job_titles');
    }
};
