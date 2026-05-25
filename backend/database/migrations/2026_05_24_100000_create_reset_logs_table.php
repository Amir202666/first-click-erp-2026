<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reset_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->string('tenant_name');
            $table->json('modules');
            $table->json('deleted_counts');
            $table->string('confirmed_by');
            $table->timestamp('executed_at');
            $table->timestamps();

            $table->index('tenant_id');
            $table->index('executed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reset_logs');
    }
};
