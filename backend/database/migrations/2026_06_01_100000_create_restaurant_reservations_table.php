<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('restaurant_reservations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('branch_id')->nullable();
            $table->unsignedBigInteger('table_id')->nullable();
            $table->string('section')->nullable();
            $table->string('customer_name');
            $table->string('customer_phone')->nullable();
            $table->date('reservation_date');
            $table->time('reservation_time');
            $table->unsignedInteger('guests_count')->default(2);
            $table->string('status', 20)->default('confirmed'); // pending, confirmed, cancelled, completed
            $table->text('notes')->nullable();
            $table->timestamp('seated_at')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('branch_id')->references('id')->on('branches')->nullOnDelete();
            $table->foreign('table_id')->references('id')->on('restaurant_tables')->nullOnDelete();
            $table->index(['tenant_id', 'reservation_date', 'status'], 'rr_tenant_date_status_idx');
            $table->index(['tenant_id', 'table_id', 'reservation_date'], 'rr_tenant_table_date_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('restaurant_reservations');
    }
};
