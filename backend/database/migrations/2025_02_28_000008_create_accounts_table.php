<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->string('code', 20);
            $table->string('name');
            $table->string('type'); // asset, liability, equity, revenue, expense
            $table->text('description')->nullable();
            $table->boolean('is_system')->default(false); // حسابات النظام لا تُحذف
            $table->boolean('is_active')->default(true);
            $table->integer('level')->default(1);
            $table->string('currency', 3)->nullable();
            $table->boolean('allow_manual_entry')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'type']);
            $table->foreign('parent_id')->references('id')->on('accounts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('accounts');
    }
};
