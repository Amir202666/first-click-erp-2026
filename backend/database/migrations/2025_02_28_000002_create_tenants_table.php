<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('address')->nullable();
            $table->string('activity')->nullable(); // تجاري، صناعي، خدمي
            $table->string('tax_registration_number')->nullable();
            $table->json('contacts')->nullable(); // [{name, phone, email, role}]
            $table->string('email');
            $table->string('phone')->nullable();
            $table->string('logo')->nullable();
            $table->string('domain')->nullable(); // للوصول عبر subdomain
            $table->string('database_name')->nullable(); // للـ database-per-tenant
            $table->string('schema_name')->nullable(); // للـ schema-per-tenant
            $table->string('default_currency', 3)->default('SAR');
            $table->string('fiscal_year_start', 5)->default('01-01'); // MM-DD
            $table->string('inventory_method')->default('average'); // average, fifo, lifo
            $table->boolean('vat_enabled')->default(true);
            $table->decimal('vat_rate', 5, 2)->default(15.00);
            $table->boolean('is_active')->default(true);
            $table->json('settings')->nullable(); // إعدادات إضافية
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenants');
    }
};
