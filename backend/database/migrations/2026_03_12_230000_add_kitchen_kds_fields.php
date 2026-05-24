<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('kitchen_ticket_lines', function (Blueprint $table) {
            $table->boolean('is_completed')->default(false)->after('kitchen_note');
        });

        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = OFF');
            DB::statement('CREATE TABLE kitchen_tickets_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                tenant_id INTEGER NOT NULL,
                branch_id INTEGER NULL,
                table_id INTEGER NULL,
                invoice_id INTEGER NULL,
                status VARCHAR(24) NOT NULL DEFAULT \'pending\',
                created_at DATETIME NULL,
                updated_at DATETIME NULL,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
                FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE SET NULL,
                FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
            )');
            DB::statement('INSERT INTO kitchen_tickets_new (id, tenant_id, branch_id, table_id, invoice_id, status, created_at, updated_at) SELECT id, tenant_id, branch_id, table_id, invoice_id, status, created_at, updated_at FROM kitchen_tickets');
            Schema::drop('kitchen_tickets');
            DB::statement('ALTER TABLE kitchen_tickets_new RENAME TO kitchen_tickets');
            DB::statement('PRAGMA foreign_keys = ON');
        } else {
            DB::statement("ALTER TABLE kitchen_tickets MODIFY status VARCHAR(24) NOT NULL DEFAULT 'pending'");
        }
    }

    public function down(): void
    {
        Schema::table('kitchen_ticket_lines', function (Blueprint $table) {
            $table->dropColumn('is_completed');
        });
    }
};
