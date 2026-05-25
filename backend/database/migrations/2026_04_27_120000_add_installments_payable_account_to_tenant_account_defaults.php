<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenant_account_defaults', function (Blueprint $table) {
            $table->foreignId('installments_payable_account_id')
                ->nullable()
                ->after('installments_receivable_account_id')
                ->constrained('accounts', indexName: 'tad_inst_pay_fk')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('tenant_account_defaults', function (Blueprint $table) {
            $table->dropForeign('tad_inst_pay_fk');
            $table->dropColumn('installments_payable_account_id');
        });
    }
};
