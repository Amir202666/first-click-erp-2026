#!/bin/bash
# Fix MySQL identifier names > 64 chars and run pending migrations
set -e
cd /var/www/erp/backend

echo "🔧 Applying MySQL migration fixes..."

php artisan tinker --execute="
  Schema::dropIfExists('invoice_manufacturing_frozen_components');
  Schema::dropIfExists('invoice_manufacturing_frozen_batches');
" 2>/dev/null || true

# Full fix: invoice_manufacturing_frozen_tables
cat > database/migrations/2026_04_13_100000_create_invoice_manufacturing_frozen_tables.php << 'ENDPHP'
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoice_manufacturing_frozen_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained(indexName: 'imfb_tenant_fk')->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained(indexName: 'imfb_invoice_fk')->cascadeOnDelete();
            $table->foreignId('invoice_line_id')->constrained('invoice_lines', indexName: 'imfb_inv_line_fk')->cascadeOnDelete();
            $table->foreignId('bill_of_material_id')->nullable()->constrained('bill_of_materials', indexName: 'imfb_bom_fk')->nullOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches', indexName: 'imfb_branch_fk')->nullOnDelete();
            $table->foreignId('raw_warehouse_id')->constrained('warehouses', indexName: 'imfb_raw_wh_fk');
            $table->foreignId('finished_warehouse_id')->constrained('warehouses', indexName: 'imfb_fin_wh_fk');
            $table->foreignId('finished_item_id')->constrained('items', indexName: 'imfb_fin_item_fk');
            $table->decimal('finished_quantity', 18, 4);
            $table->foreignId('finished_unit_id')->nullable()->constrained('item_units', indexName: 'imfb_fin_unit_fk')->nullOnDelete();
            $table->decimal('finished_qty_base', 18, 6);
            $table->decimal('wip_total_cost_invoice', 18, 3)->default(0);
            $table->decimal('wip_total_cost_base', 18, 3)->default(0);
            $table->timestamps();
            $table->unique(['invoice_id', 'invoice_line_id'], 'imfb_inv_line_uq');
            $table->index(['tenant_id', 'invoice_id'], 'imfb_tenant_inv_idx');
        });

        Schema::create('invoice_manufacturing_frozen_components', function (Blueprint $table) {
            $table->id();
            $table->foreignId('batch_id')->constrained('invoice_manufacturing_frozen_batches', indexName: 'imfc_batch_fk')->cascadeOnDelete();
            $table->foreignId('component_item_id')->constrained('items', indexName: 'imfc_comp_item_fk');
            $table->string('component_name', 512);
            $table->foreignId('component_unit_id')->nullable()->constrained('item_units', indexName: 'imfc_comp_unit_fk')->nullOnDelete();
            $table->decimal('qty_in_component_unit', 18, 6);
            $table->decimal('qty_base', 18, 6);
            $table->decimal('unit_cost', 18, 4)->default(0);
            $table->decimal('total_cost', 18, 3)->default(0);
            $table->unsignedInteger('sort_order')->default(0);
            $table->unsignedBigInteger('inventory_movement_out_id')->nullable();
            $table->timestamps();
            $table->index(['batch_id', 'sort_order'], 'imfc_batch_sort_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_manufacturing_frozen_components');
        Schema::dropIfExists('invoice_manufacturing_frozen_batches');
    }
};
ENDPHP

MIG_DIR="database/migrations"

EXPIRY="$MIG_DIR/2026_04_23_120000_add_expiry_and_batch_to_invoice_lines_and_inventory_movements.php"
if [ -f "$EXPIRY" ]; then
  sed -i "s/\$table->index(\['tenant_id', 'warehouse_id', 'expiry_date'\]);/\$table->index(['tenant_id', 'warehouse_id', 'expiry_date'], 'im_wh_exp_idx');/" "$EXPIRY"
  sed -i "s/\$table->dropIndex(\['tenant_id', 'warehouse_id', 'expiry_date'\]);/\$table->dropIndex('im_wh_exp_idx');/" "$EXPIRY"
fi

MENU="$MIG_DIR/2026_05_24_100000_create_restaurant_menu_tables.php"
if [ -f "$MENU" ]; then
  sed -i "s/\$table->index(\['tenant_id', 'sort_order'\]);/\$table->index(['tenant_id', 'sort_order'], 'rmcat_tenant_sort_idx');/" "$MENU"
  sed -i "s/\$table->index(\['tenant_id', 'category_id', 'sort_order'\]);/\$table->index(['tenant_id', 'category_id', 'sort_order'], 'rmitem_tnt_cat_sort_idx');/" "$MENU"
fi

DELIVERY="$MIG_DIR/2026_04_30_100001_create_delivery_assignments_table.php"
if [ -f "$DELIVERY" ]; then
  sed -i "s/->constrained('journal_entries')->nullOnDelete();/->constrained('journal_entries', indexName: 'da_custody_je_fk')->nullOnDelete();/" "$DELIVERY"
fi

PAYABLE="$MIG_DIR/2026_04_27_120000_add_installments_payable_account_to_tenant_account_defaults.php"
if [ -f "$PAYABLE" ]; then
  sed -i "s/->constrained('accounts')/->constrained('accounts', indexName: 'tad_inst_pay_fk')/" "$PAYABLE"
  sed -i "s/dropForeign(\['installments_payable_account_id'\])/dropForeign('tad_inst_pay_fk')/" "$PAYABLE"
fi

echo "🗄️ Running migrations..."
export COMPOSER_ALLOW_SUPERUSER=1
php artisan migrate --force

echo "✅ Migrations done."

echo "🏗️ Building frontend..."
cd /var/www/erp/frontend
npm ci --prefer-offline
npm run build

echo "⚡ Laravel caches..."
cd /var/www/erp/backend
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan storage:link 2>/dev/null || true
chown -R www-data:www-data storage bootstrap/cache
chmod -R 755 storage bootstrap/cache

systemctl reload nginx
systemctl reload php8.4-fpm 2>/dev/null || systemctl reload php8.2-fpm 2>/dev/null || true

echo "✅ All done! Open: http://firstclickerp.top"
