<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('installment_periods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('code', 32);
            $table->unsignedSmallInteger('months'); // 1,3,6,12
            $table->string('name', 80);
            $table->string('name_en', 80)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
            $table->unique(['tenant_id', 'months']);
        });

        // Global defaults (tenant_id = null)
        DB::table('installment_periods')->insert([
            [
                'tenant_id' => null,
                'code' => 'monthly',
                'months' => 1,
                'name' => 'شهري',
                'name_en' => 'Monthly',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'tenant_id' => null,
                'code' => 'quarterly',
                'months' => 3,
                'name' => 'ربع سنوي',
                'name_en' => 'Quarterly',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'tenant_id' => null,
                'code' => 'semi_annually',
                'months' => 6,
                'name' => 'نصف سنوي',
                'name_en' => 'Semi-Annually',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'tenant_id' => null,
                'code' => 'annually',
                'months' => 12,
                'name' => 'سنوي',
                'name_en' => 'Annually',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('installment_periods');
    }
};
