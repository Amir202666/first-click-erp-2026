<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('user_id')->nullable(); // null = visible to all with permission
            $table->string('type', 64); // stock_low, installment_due_today, installment_overdue, expiry_soon, kitchen_ready
            $table->string('title_ar');
            $table->string('title_en')->nullable();
            $table->text('body_ar')->nullable();
            $table->text('body_en')->nullable();
            $table->string('link_path')->nullable();
            $table->json('link_params')->nullable();
            $table->string('severity', 16)->default('info'); // info, warning, danger, success
            $table->timestamp('read_at')->nullable();
            $table->string('related_entity_type', 64)->nullable();
            $table->unsignedBigInteger('related_entity_id')->nullable();
            $table->unsignedBigInteger('branch_id')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->index(['tenant_id', 'created_at']);
            $table->index(['tenant_id', 'type', 'read_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
