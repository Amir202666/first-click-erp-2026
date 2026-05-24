<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->unsignedBigInteger('manufacturing_journal_entry_id')->nullable()->after('journal_entry_id');
            $table->foreign('manufacturing_journal_entry_id')
                ->references('id')
                ->on('journal_entries')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropForeign(['manufacturing_journal_entry_id']);
            $table->dropColumn('manufacturing_journal_entry_id');
        });
    }
};
