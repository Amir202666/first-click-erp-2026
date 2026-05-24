<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('name', 150);
            $table->string('doc_type', 50)->index(); // مثال: invoice, receipt, payment
            $table->string('format', 30)->default('a4'); // a4, pos, custom...
            $table->boolean('is_active')->default(true);
            $table->boolean('is_system')->default(false); // لقوالب النظام الجاهزة (إن وُجدت)
            $table->longText('content'); // HTML مع متغيّرات مثل {{invoice.number}}
            $table->json('meta')->nullable(); // معلومات إضافية: حجم الصفحة، الهوامش، الخ
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'doc_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_templates');
    }
};
