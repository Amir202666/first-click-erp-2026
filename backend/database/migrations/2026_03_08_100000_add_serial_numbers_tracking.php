<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->boolean('use_serial_number')->default(false)->after('track_quantity');
        });

        Schema::create('item_serials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();
            $table->string('serial_number', 120);
            $table->string('status', 20)->default('available'); // available, sold, reserved, returned, damaged
            $table->string('reference_type', 100)->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'item_id', 'serial_number']);
            $table->index(['tenant_id', 'warehouse_id', 'status']);
        });

        Schema::create('invoice_line_serials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_line_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_serial_id')->constrained('item_serials')->cascadeOnDelete();
            $table->timestamps();

            $table->unique('item_serial_id');
            $table->index('invoice_line_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_line_serials');
        Schema::dropIfExists('item_serials');
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('use_serial_number');
        });
    }
};
