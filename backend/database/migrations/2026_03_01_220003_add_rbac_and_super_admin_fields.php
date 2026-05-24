<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_super_admin')->default(false)->after('remember_token');
        });

        Schema::table('tenant_users', function (Blueprint $table) {
            $table->foreignId('role_id')->nullable()->after('user_id')->constrained()->nullOnDelete();
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->string('table_name')->nullable()->after('model_type');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_super_admin');
        });
        Schema::table('tenant_users', function (Blueprint $table) {
            $table->dropForeign(['role_id']);
        });
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropColumn('table_name');
        });
    }
};
