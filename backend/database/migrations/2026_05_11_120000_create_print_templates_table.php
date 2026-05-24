<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('print_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();

            $table->string('name', 150);
            $table->string('document_type', 32)->index();

            $table->string('paper_size', 24)->default('A4');
            $table->string('orientation', 16)->default('portrait');

            $table->json('margins')->nullable();
            $table->json('settings')->nullable();
            $table->json('sections')->nullable();

            $table->longText('html_content')->nullable();

            $table->boolean('is_default')->default(false);
            $table->boolean('is_system')->default(false);

            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index(['tenant_id', 'document_type']);
            $table->index(['tenant_id', 'document_type', 'is_default']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('print_templates');
    }
};
