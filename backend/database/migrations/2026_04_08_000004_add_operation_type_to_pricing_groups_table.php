<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pricing_groups', function (Blueprint $table) {
            $table->string('operation_type', 30)->default('discount_percent')->after('name');
        });

        // ترحيل القيم القديمة:
        // - percent كان يُستخدم كزيادة في الكود السابق، لكن المطلوب افتراضه كخصم في أغلب الحالات.
        // - fixed كان يُستخدم كزيادة ثابتة؛ نجعله "سعر ثابت" لتلبية السيناريو الجديد (يمكن تعديله لاحقاً من الواجهة).
        DB::table('pricing_groups')->where('pricing_type', 'percent')->update(['operation_type' => 'discount_percent']);
        DB::table('pricing_groups')->where('pricing_type', 'fixed')->update(['operation_type' => 'fixed_price']);
    }

    public function down(): void
    {
        Schema::table('pricing_groups', function (Blueprint $table) {
            $table->dropColumn('operation_type');
        });
    }
};
