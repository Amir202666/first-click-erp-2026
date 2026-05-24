<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use App\Models\Tenant;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RolesSeeder extends Seeder
{
    public function run(): void
    {
        $allPermissionKeys = Permission::pluck('id', 'key')->toArray();

        // دور على مستوى النظام: Super Admin (tenant_id = null)
        $superAdmin = Role::updateOrCreate(
            ['tenant_id' => null, 'slug' => 'super_admin'],
            [
                'name' => 'المسؤول العام',
                'description' => 'صلاحيات كاملة على النظام',
                'is_system' => true,
                'sort_order' => 0,
            ]
        );
        $superAdmin->permissions()->sync(array_values($allPermissionKeys));

        // أدوار افتراضية لكل شركة (يتم إنشاؤها عند إنشاء شركة أو عبر استدعاء seed للشركات الحالية)
        $tenantIds = Tenant::pluck('id');
        $defaultRoles = [
            ['slug' => 'admin', 'name' => 'مدير النظام', 'name_en' => 'Admin', 'permissions' => ['*']],
            ['slug' => 'accountant', 'name' => 'محاسب', 'name_en' => 'Accountant', 'permissions' => [
                'accounts.view', 'accounts.create', 'accounts.edit', 'accounts.delete',
                'journal.view', 'journal.create', 'journal.edit',
                'fiscal_years.view', 'fiscal_years.close', 'fiscal_years.lock',
                'invoices.view', 'invoices.create', 'invoices.edit',
                'payments.view', 'payments.create', 'payments.edit',
                'reports.view', 'customers.view', 'vendors.view', 'audit.view',
                'pos.sell', 'pos.hold_resume', 'pos.apply_discount', 'pos.close_shift', 'pos.view_reports',
            ]],
            ['slug' => 'sales', 'name' => 'مبيعات', 'name_en' => 'Sales', 'permissions' => [
                'invoices.view', 'invoices.create',
                'customers.view', 'customers.create', 'customers.edit',
                'items.view', 'payments.view', 'payments.create',
                'pos.sell', 'pos.hold_resume', 'pos.apply_discount', 'pos.view_reports',
            ]],
            ['slug' => 'warehouse', 'name' => 'مخازن', 'name_en' => 'Warehouse', 'permissions' => [
                'items.view', 'items.create', 'items.edit',
                'inventory.view', 'inventory.create',
            ]],
            ['slug' => 'cashier', 'name' => 'كاشير', 'name_en' => 'Cashier', 'permissions' => [
                'pos.sell', 'pos.hold_resume', 'pos.apply_discount', 'pos.view_reports',
                'invoices.view', 'items.view', 'customers.view', 'payments.view', 'payments.create',
            ]],
        ];

        foreach ($tenantIds as $tenantId) {
            foreach ($defaultRoles as $idx => $def) {
                $role = Role::updateOrCreate(
                    ['tenant_id' => $tenantId, 'slug' => $def['slug']],
                    [
                        'name' => $def['name'],
                        'description' => $def['name_en'] ?? $def['slug'],
                        'is_system' => true,
                        'sort_order' => $idx + 1,
                    ]
                );
                if ($def['permissions'] === ['*']) {
                    $role->permissions()->sync(Permission::pluck('id'));
                } else {
                    $role->permissions()->sync(
                        Permission::whereIn('key', $def['permissions'])->pluck('id')
                    );
                }
            }
        }

        // ربط tenant_users.role_id من الأدوار الحالية حسب role (slug)
        $roleByTenantSlug = [];
        foreach (Tenant::all() as $t) {
            foreach (Role::where('tenant_id', $t->id)->get() as $r) {
                $roleByTenantSlug[$t->id][$r->slug] = $r->id;
            }
        }
        $pivot = DB::table('tenant_users')->get();
        foreach ($pivot as $row) {
            $slug = $row->role ?? null;
            if ($slug && isset($roleByTenantSlug[$row->tenant_id][$slug])) {
                DB::table('tenant_users')
                    ->where('tenant_id', $row->tenant_id)
                    ->where('user_id', $row->user_id)
                    ->update(['role_id' => $roleByTenantSlug[$row->tenant_id][$slug] ?? null]);
            }
        }
    }
}
