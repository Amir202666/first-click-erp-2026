<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A) Create payment_methods table
        Schema::create('payment_methods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('type'); // cash, bank, credit, other
            $table->foreignId('linked_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'name']);
        });

        // B) Create branches table
        Schema::create('branches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('name', 255);
            $table->string('code', 20);
            $table->text('address')->nullable();
            $table->string('phone', 50)->nullable();
            $table->string('manager_name', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'code']);
        });

        // C) Alter currencies table
        Schema::table('currencies', function (Blueprint $table) {
            $table->foreignId('tenant_id')->after('id')->constrained('tenants')->cascadeOnDelete();
            $table->boolean('is_default')->default(false)->after('is_active');

            $table->dropUnique(['code']);
            $table->unique(['tenant_id', 'code']);
        });

        // D) Alter journal_entries table
        Schema::table('journal_entries', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->after('vendor_id')->constrained('branches')->nullOnDelete();
        });

        // E) Alter invoices table
        Schema::table('invoices', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->after('vendor_id')->constrained('branches')->nullOnDelete();
            $table->foreignId('payment_method_id')->nullable()->after('branch_id')->constrained('payment_methods')->nullOnDelete();
        });

        // F) Alter payments table
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->after('vendor_id')->constrained('branches')->nullOnDelete();
            $table->foreignId('payment_method_id')->nullable()->after('branch_id')->constrained('payment_methods')->nullOnDelete();
        });
    }

    public function down(): void
    {
        // Reverse F) payments
        Schema::table('payments', function (Blueprint $table) {
            $table->dropForeign(['payment_method_id']);
            $table->dropColumn('payment_method_id');
            $table->dropForeign(['branch_id']);
            $table->dropColumn('branch_id');
        });

        // Reverse E) invoices
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropForeign(['payment_method_id']);
            $table->dropColumn('payment_method_id');
            $table->dropForeign(['branch_id']);
            $table->dropColumn('branch_id');
        });

        // Reverse D) journal_entries
        Schema::table('journal_entries', function (Blueprint $table) {
            $table->dropForeign(['branch_id']);
            $table->dropColumn('branch_id');
        });

        // Reverse C) currencies
        Schema::table('currencies', function (Blueprint $table) {
            $table->dropUnique(['tenant_id', 'code']);
            $table->string('code', 3)->unique()->change();

            $table->dropColumn('is_default');
            $table->dropForeign(['tenant_id']);
            $table->dropColumn('tenant_id');
        });

        // Reverse B) branches
        Schema::dropIfExists('branches');

        // Reverse A) payment_methods
        Schema::dropIfExists('payment_methods');
    }
};
