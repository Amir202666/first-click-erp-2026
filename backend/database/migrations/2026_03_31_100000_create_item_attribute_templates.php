<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('item_attribute_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->timestamps();

            $table->unique(['tenant_id', 'name']);
        });

        Schema::create('item_attribute_template_values', function (Blueprint $table) {
            $table->id();
            $table->foreignId('template_id')->constrained('item_attribute_templates')->cascadeOnDelete();
            $table->string('value');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_attribute_template_values');
        Schema::dropIfExists('item_attribute_templates');
    }
};
