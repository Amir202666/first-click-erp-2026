<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->boolean('is_postable')->default(true)->after('allow_manual_entry');
        });

        // الحسابات التي لها أبناء = غير قابلة للترحيل (رؤوس فقط)
        $idsWithChildren = \DB::table('accounts')
            ->select('parent_id')
            ->whereNotNull('parent_id')
            ->distinct()
            ->pluck('parent_id');
        if ($idsWithChildren->isNotEmpty()) {
            \DB::table('accounts')->whereIn('id', $idsWithChildren)->update(['is_postable' => false]);
        }
    }

    public function down(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->dropColumn('is_postable');
        });
    }
};
