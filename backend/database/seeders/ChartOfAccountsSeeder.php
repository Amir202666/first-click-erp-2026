<?php

namespace Database\Seeders;

use App\Enums\AccountType;
use App\Models\Account;
use App\Models\Tenant;
use Illuminate\Database\Seeder;

class ChartOfAccountsSeeder extends Seeder
{
    public function run(?int $tenantId = null): void
    {
        $tenantId = $tenantId ?? Tenant::first()?->id;
        if (! $tenantId) {
            return;
        }

        $accounts = [
            // ──── 1 الأصول ────
            ['code' => '1', 'name' => 'الأصول', 'type' => AccountType::Asset, 'parent' => null, 'level' => 1, 'is_system' => true],

            ['code' => '11', 'name' => 'أصول متداولة', 'type' => AccountType::Asset, 'parent' => '1', 'level' => 2, 'is_system' => true],
            ['code' => '111', 'name' => 'النقدية وما يعادلها', 'type' => AccountType::Asset, 'parent' => '11', 'level' => 3, 'is_system' => true],
            ['code' => '112', 'name' => 'البنك', 'type' => AccountType::Asset, 'parent' => '11', 'level' => 3, 'is_system' => true],
            ['code' => '113', 'name' => 'العملاء (مدينون)', 'type' => AccountType::Asset, 'parent' => '11', 'level' => 3, 'is_system' => true],
            ['code' => '114', 'name' => 'المخزون', 'type' => AccountType::Asset, 'parent' => '11', 'level' => 3, 'is_system' => true],
            ['code' => '115', 'name' => 'مدينون آخرون', 'type' => AccountType::Asset, 'parent' => '11', 'level' => 3, 'is_system' => true],
            ['code' => '116', 'name' => 'مصروفات مدفوعة مقدماً', 'type' => AccountType::Asset, 'parent' => '11', 'level' => 3, 'is_system' => true],

            ['code' => '12', 'name' => 'أصول ثابتة', 'type' => AccountType::Asset, 'parent' => '1', 'level' => 2, 'is_system' => true],
            ['code' => '121', 'name' => 'الأراضي والمباني', 'type' => AccountType::Asset, 'parent' => '12', 'level' => 3, 'is_system' => true],
            ['code' => '122', 'name' => 'الآلات والمعدات', 'type' => AccountType::Asset, 'parent' => '12', 'level' => 3, 'is_system' => true],
            ['code' => '123', 'name' => 'الأثاث والتجهيزات', 'type' => AccountType::Asset, 'parent' => '12', 'level' => 3, 'is_system' => true],
            ['code' => '124', 'name' => 'وسائل النقل', 'type' => AccountType::Asset, 'parent' => '12', 'level' => 3, 'is_system' => true],
            ['code' => '125', 'name' => 'مجمع الإهلاك', 'type' => AccountType::Asset, 'parent' => '12', 'level' => 3, 'is_system' => true],

            // ──── 2 الخصوم وحقوق الملكية ────
            ['code' => '2', 'name' => 'الخصوم وحقوق الملكية', 'type' => AccountType::Liability, 'parent' => null, 'level' => 1, 'is_system' => true],

            ['code' => '21', 'name' => 'حقوق الملكية', 'type' => AccountType::Equity, 'parent' => '2', 'level' => 2, 'is_system' => true],
            ['code' => '211', 'name' => 'رأس المال', 'type' => AccountType::Equity, 'parent' => '21', 'level' => 3, 'is_system' => true],
            ['code' => '212', 'name' => 'الأرباح المحتجزة', 'type' => AccountType::Equity, 'parent' => '21', 'level' => 3, 'is_system' => true],
            ['code' => '213', 'name' => 'أرباح / خسائر العام', 'type' => AccountType::Equity, 'parent' => '21', 'level' => 3, 'is_system' => true],
            ['code' => '214', 'name' => 'احتياطيات', 'type' => AccountType::Equity, 'parent' => '21', 'level' => 3, 'is_system' => true],

            ['code' => '22', 'name' => 'خصوم متداولة', 'type' => AccountType::Liability, 'parent' => '2', 'level' => 2, 'is_system' => true],
            ['code' => '221', 'name' => 'الموردون (دائنون)', 'type' => AccountType::Liability, 'parent' => '22', 'level' => 3, 'is_system' => true],
            ['code' => '222', 'name' => 'ضريبة القيمة المضافة المستحقة', 'type' => AccountType::Liability, 'parent' => '22', 'level' => 3, 'is_system' => true],
            ['code' => '223', 'name' => 'رواتب مستحقة', 'type' => AccountType::Liability, 'parent' => '22', 'level' => 3, 'is_system' => true],
            ['code' => '224', 'name' => 'دائنون آخرون', 'type' => AccountType::Liability, 'parent' => '22', 'level' => 3, 'is_system' => true],
            ['code' => '225', 'name' => 'إيرادات مقبوضة مقدماً', 'type' => AccountType::Liability, 'parent' => '22', 'level' => 3, 'is_system' => true],

            ['code' => '23', 'name' => 'خصوم طويلة الأجل', 'type' => AccountType::Liability, 'parent' => '2', 'level' => 2, 'is_system' => true],
            ['code' => '231', 'name' => 'قروض طويلة الأجل', 'type' => AccountType::Liability, 'parent' => '23', 'level' => 3, 'is_system' => true],

            // ──── 3 الإيرادات ────
            ['code' => '3', 'name' => 'الإيرادات', 'type' => AccountType::Revenue, 'parent' => null, 'level' => 1, 'is_system' => true],
            ['code' => '31', 'name' => 'مبيعات', 'type' => AccountType::Revenue, 'parent' => '3', 'level' => 2, 'is_system' => true],
            ['code' => '32', 'name' => 'مردودات المبيعات', 'type' => AccountType::Revenue, 'parent' => '3', 'level' => 2, 'is_system' => true],
            ['code' => '33', 'name' => 'خصم مسموح به', 'type' => AccountType::Revenue, 'parent' => '3', 'level' => 2, 'is_system' => true],
            ['code' => '34', 'name' => 'إيرادات أخرى', 'type' => AccountType::Revenue, 'parent' => '3', 'level' => 2, 'is_system' => true],

            // ──── 4 المصروفات ────
            ['code' => '4', 'name' => 'المصروفات', 'type' => AccountType::Expense, 'parent' => null, 'level' => 1, 'is_system' => true],

            ['code' => '41', 'name' => 'مصروفات تشغيلية', 'type' => AccountType::Expense, 'parent' => '4', 'level' => 2, 'is_system' => true],
            ['code' => '411', 'name' => 'رواتب وأجور', 'type' => AccountType::Expense, 'parent' => '41', 'level' => 3, 'is_system' => true],
            ['code' => '412', 'name' => 'إيجارات', 'type' => AccountType::Expense, 'parent' => '41', 'level' => 3, 'is_system' => true],
            ['code' => '413', 'name' => 'كهرباء ومياه', 'type' => AccountType::Expense, 'parent' => '41', 'level' => 3, 'is_system' => true],
            ['code' => '414', 'name' => 'اتصالات وإنترنت', 'type' => AccountType::Expense, 'parent' => '41', 'level' => 3, 'is_system' => true],
            ['code' => '415', 'name' => 'صيانة وإصلاحات', 'type' => AccountType::Expense, 'parent' => '41', 'level' => 3, 'is_system' => true],
            ['code' => '416', 'name' => 'مصاريف نقل وانتقالات', 'type' => AccountType::Expense, 'parent' => '41', 'level' => 3, 'is_system' => true],

            ['code' => '42', 'name' => 'مصروفات إدارية', 'type' => AccountType::Expense, 'parent' => '4', 'level' => 2, 'is_system' => true],
            ['code' => '421', 'name' => 'مستلزمات مكتبية', 'type' => AccountType::Expense, 'parent' => '42', 'level' => 3, 'is_system' => true],
            ['code' => '422', 'name' => 'رسوم حكومية', 'type' => AccountType::Expense, 'parent' => '42', 'level' => 3, 'is_system' => true],
            ['code' => '423', 'name' => 'تأمينات', 'type' => AccountType::Expense, 'parent' => '42', 'level' => 3, 'is_system' => true],
            ['code' => '424', 'name' => 'إهلاك', 'type' => AccountType::Expense, 'parent' => '42', 'level' => 3, 'is_system' => true],

            ['code' => '43', 'name' => 'مصروفات بيعية وتسويقية', 'type' => AccountType::Expense, 'parent' => '4', 'level' => 2, 'is_system' => true],
            ['code' => '431', 'name' => 'دعاية وإعلان', 'type' => AccountType::Expense, 'parent' => '43', 'level' => 3, 'is_system' => true],
            ['code' => '432', 'name' => 'عمولات مبيعات', 'type' => AccountType::Expense, 'parent' => '43', 'level' => 3, 'is_system' => true],

            ['code' => '44', 'name' => 'مصروفات مالية', 'type' => AccountType::Expense, 'parent' => '4', 'level' => 2, 'is_system' => true],
            ['code' => '441', 'name' => 'فوائد بنكية', 'type' => AccountType::Expense, 'parent' => '44', 'level' => 3, 'is_system' => true],
            ['code' => '442', 'name' => 'عمولات بنكية', 'type' => AccountType::Expense, 'parent' => '44', 'level' => 3, 'is_system' => true],

            ['code' => '45', 'name' => 'مصروفات أخرى', 'type' => AccountType::Expense, 'parent' => '4', 'level' => 2, 'is_system' => true],

            // ──── 5 تكلفة البضاعة المباعة ────
            ['code' => '5', 'name' => 'تكلفة البضاعة المباعة', 'type' => AccountType::COGS, 'parent' => null, 'level' => 1, 'is_system' => true],
            ['code' => '51', 'name' => 'تكلفة المبيعات', 'type' => AccountType::COGS, 'parent' => '5', 'level' => 2, 'is_system' => true],
            ['code' => '52', 'name' => 'مشتريات', 'type' => AccountType::COGS, 'parent' => '5', 'level' => 2, 'is_system' => true],
            ['code' => '53', 'name' => 'مردودات المشتريات', 'type' => AccountType::COGS, 'parent' => '5', 'level' => 2, 'is_system' => true],
            ['code' => '54', 'name' => 'خصم مكتسب', 'type' => AccountType::COGS, 'parent' => '5', 'level' => 2, 'is_system' => true],
            ['code' => '55', 'name' => 'مصاريف نقل المشتريات', 'type' => AccountType::COGS, 'parent' => '5', 'level' => 2, 'is_system' => true],
        ];

        $parentIds = [];
        foreach ($accounts as $data) {
            $parentId = null;
            if ($data['parent']) {
                $parentId = $parentIds[$data['parent']] ?? null;
            }

            $account = Account::updateOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'code' => $data['code'],
                ],
                [
                    'parent_id' => $parentId,
                    'name' => $data['name'],
                    'type' => $data['type']->value,
                    'level' => $data['level'],
                    'is_system' => $data['is_system'],
                    'is_active' => true,
                ]
            );

            $parentIds[$data['code']] = $account->id;
        }
    }
}
