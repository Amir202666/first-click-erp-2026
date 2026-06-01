<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('tenant_account_defaults', 'installments_receivable_account_id')) {
            Schema::table('tenant_account_defaults', function (Blueprint $table) {
                $table->unsignedBigInteger('installments_receivable_account_id')->nullable()->after('cash_variance_account_id');
            });
        }

        $shouldAddFk = DB::getDriverName() === 'sqlite';
        if (! $shouldAddFk) {
            $fkExists = DB::selectOne(
                "SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
                 WHERE CONSTRAINT_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'tenant_account_defaults'
                   AND CONSTRAINT_NAME = 'tad_inst_recv_fk'"
            );
            $shouldAddFk = (int) $fkExists->c === 0;
        }

        if ($shouldAddFk) {
            Schema::table('tenant_account_defaults', function (Blueprint $table) {
                $table->foreign('installments_receivable_account_id', 'tad_inst_recv_fk')
                    ->references('id')->on('accounts')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::table('tenant_account_defaults', function (Blueprint $table) {
            $table->dropForeign('tad_inst_recv_fk');
            $table->dropColumn('installments_receivable_account_id');
        });
    }
};
