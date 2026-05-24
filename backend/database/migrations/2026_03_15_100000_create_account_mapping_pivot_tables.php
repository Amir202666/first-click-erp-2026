<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // الربط المتقدم: حساب ↔ فروع (Many-to-Many)
        Schema::create('account_branch', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->constrained('accounts')->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['account_id', 'branch_id']);
        });

        // الربط المتقدم: حساب ↔ مراكز التكلفة (Many-to-Many)
        Schema::create('account_cost_center', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->constrained('accounts')->cascadeOnDelete();
            $table->foreignId('cost_center_id')->constrained('cost_centers')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['account_id', 'cost_center_id']);
        });

        // الربط المتقدم: حساب ↔ مستخدمين مسموح لهم بالقيود (Many-to-Many)
        Schema::create('account_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->constrained('accounts')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['account_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_user');
        Schema::dropIfExists('account_cost_center');
        Schema::dropIfExists('account_branch');
    }
};
