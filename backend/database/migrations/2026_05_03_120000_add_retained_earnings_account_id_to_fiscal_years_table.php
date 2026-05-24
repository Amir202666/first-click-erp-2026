<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fiscal_years', function (Blueprint $table) {
            $table->foreignId('retained_earnings_account_id')
                ->nullable()
                ->after('closing_journal_entry_id')
                ->constrained('accounts')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('fiscal_years', function (Blueprint $table) {
            $table->dropForeign(['retained_earnings_account_id']);
            $table->dropColumn('retained_earnings_account_id');
        });
    }
};
