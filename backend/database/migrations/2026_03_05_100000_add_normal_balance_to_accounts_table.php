<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->string('normal_balance', 10)->nullable()->after('type')->comment('debit|credit - إذا null يُستنتج من نوع الحساب. للحسابات المقابلة (مردودات، خصم) نضع مدين.');
        });
    }

    public function down(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->dropColumn('normal_balance');
        });
    }
};
