<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('print_templates', function (Blueprint $table) {
            $table->longText('blocks_json')->nullable()->after('html_content');
            if (! Schema::hasColumn('print_templates', 'layout')) {
                $table->string('layout', 32)->nullable()->after('document_type');
            }
        });
    }

    public function down(): void
    {
        Schema::table('print_templates', function (Blueprint $table) {
            $table->dropColumn('blocks_json');
            if (Schema::hasColumn('print_templates', 'layout')) {
                $table->dropColumn('layout');
            }
        });
    }
};
