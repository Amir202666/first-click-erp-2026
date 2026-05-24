<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pricing_group_branch', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pricing_group_id')->constrained('pricing_groups')->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['pricing_group_id', 'branch_id']);
        });

        Schema::create('pricing_group_tenant_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pricing_group_id')->constrained('pricing_groups')->cascadeOnDelete();
            $table->foreignId('tenant_user_id')->constrained('tenant_users')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['pricing_group_id', 'tenant_user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pricing_group_tenant_user');
        Schema::dropIfExists('pricing_group_branch');
    }
};
