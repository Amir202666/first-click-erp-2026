<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_reps', function (Blueprint $table) {
            $table->string('address')->nullable()->after('region');
            $table->string('phone')->nullable()->after('address');
        });

        Schema::create('sales_rep_branch', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_rep_id')->constrained('sales_reps')->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->unique(['sales_rep_id', 'branch_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_rep_branch');
        Schema::table('sales_reps', function (Blueprint $table) {
            $table->dropColumn(['address', 'phone']);
        });
    }
};
