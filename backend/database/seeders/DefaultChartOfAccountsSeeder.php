<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Tenant;
use Illuminate\Database\Seeder;

/**
 * دليل حسابات افتراضي احترافي: 6 أنواع (أصول، خصوم، حقوق ملكية، إيرادات، مصروفات، تكلفة مبيعات)
 * مع هيكل شجري ومنطق is_postable (الرؤوس غير قابلة للترحيل، النهائية فقط قابلة).
 * التشغيل: php artisan db:seed --class=DefaultChartOfAccountsSeeder
 * أو لشريك معين: tenant_id=1 في الكود أو عبر استدعاء من سيدر آخر.
 */
class DefaultChartOfAccountsSeeder extends Seeder
{
    public function run(): void
    {
        $tenantId = 1;
        if (! Tenant::find($tenantId)) {
            $this->command?->warn("Tenant {$tenantId} not found. Skipping chart of accounts seed.");

            return;
        }

        $rows = $this->getStructure();
        $idByCode = [];
        foreach ($rows as $row) {
            $parentId = null;
            if ($row['parent_code'] !== null) {
                $parentId = $idByCode[$row['parent_code']] ?? null;
            }
            $account = Account::updateOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'code' => $row['code'],
                ],
                [
                    'parent_id' => $parentId,
                    'name' => $row['name'],
                    'type' => $row['type'],
                    'level' => $row['level'],
                    'is_system' => false,
                    'is_active' => true,
                    'is_postable' => $row['is_postable'],
                ]
            );
            $idByCode[$row['code']] = $account->id;
        }

        // تحديث is_postable للحسابات التي لها أبناء
        $parentsWithChildren = Account::where('tenant_id', $tenantId)
            ->whereIn('id', Account::where('tenant_id', $tenantId)->whereNotNull('parent_id')->pluck('parent_id'))
            ->pluck('id');
        Account::whereIn('id', $parentsWithChildren)->update(['is_postable' => false]);

        $this->command?->info('Default chart of accounts applied for tenant '.$tenantId);
    }

    /** هيكل الدليل: code, name, type, parent_code, level, is_postable */
    private function getStructure(): array
    {
        return [
            ['code' => '1', 'name' => 'الأصول', 'type' => 'asset', 'parent_code' => null, 'level' => 1, 'is_postable' => false],
            ['code' => '11', 'name' => 'أصول متداولة', 'type' => 'asset', 'parent_code' => '1', 'level' => 2, 'is_postable' => false],
            ['code' => '111', 'name' => 'النقدية وما في حكمها', 'type' => 'asset', 'parent_code' => '11', 'level' => 3, 'is_postable' => false],
            ['code' => '1111', 'name' => 'الصندوق', 'type' => 'asset', 'parent_code' => '111', 'level' => 4, 'is_postable' => true],
            ['code' => '1112', 'name' => 'البنك', 'type' => 'asset', 'parent_code' => '111', 'level' => 4, 'is_postable' => true],
            ['code' => '112', 'name' => 'العملاء', 'type' => 'asset', 'parent_code' => '11', 'level' => 3, 'is_postable' => true],
            ['code' => '113', 'name' => 'المخزون', 'type' => 'asset', 'parent_code' => '11', 'level' => 3, 'is_postable' => true],
            ['code' => '12', 'name' => 'أصول ثابتة', 'type' => 'asset', 'parent_code' => '1', 'level' => 2, 'is_postable' => false],
            ['code' => '121', 'name' => 'مباني', 'type' => 'asset', 'parent_code' => '12', 'level' => 3, 'is_postable' => true],
            ['code' => '122', 'name' => 'سيارات', 'type' => 'asset', 'parent_code' => '12', 'level' => 3, 'is_postable' => true],
            ['code' => '123', 'name' => 'أجهزة', 'type' => 'asset', 'parent_code' => '12', 'level' => 3, 'is_postable' => true],

            ['code' => '2', 'name' => 'الخصوم', 'type' => 'liability', 'parent_code' => null, 'level' => 1, 'is_postable' => false],
            ['code' => '21', 'name' => 'خصوم متداولة', 'type' => 'liability', 'parent_code' => '2', 'level' => 2, 'is_postable' => false],
            ['code' => '211', 'name' => 'الموردين', 'type' => 'liability', 'parent_code' => '21', 'level' => 3, 'is_postable' => true],
            ['code' => '212', 'name' => 'مصروفات مستحقة', 'type' => 'liability', 'parent_code' => '21', 'level' => 3, 'is_postable' => true],
            ['code' => '213', 'name' => 'ضرائب مستحقة', 'type' => 'liability', 'parent_code' => '21', 'level' => 3, 'is_postable' => true],
            ['code' => '22', 'name' => 'خصوم طويلة الأجل', 'type' => 'liability', 'parent_code' => '2', 'level' => 2, 'is_postable' => false],
            ['code' => '221', 'name' => 'قروض طويلة الأجل', 'type' => 'liability', 'parent_code' => '22', 'level' => 3, 'is_postable' => true],

            ['code' => '3', 'name' => 'حقوق الملكية', 'type' => 'equity', 'parent_code' => null, 'level' => 1, 'is_postable' => false],
            ['code' => '31', 'name' => 'رأس المال', 'type' => 'equity', 'parent_code' => '3', 'level' => 2, 'is_postable' => true],
            ['code' => '32', 'name' => 'أرباح محتجزة', 'type' => 'equity', 'parent_code' => '3', 'level' => 2, 'is_postable' => true],
            ['code' => '33', 'name' => 'صافي الربح / الخسارة', 'type' => 'equity', 'parent_code' => '3', 'level' => 2, 'is_postable' => true],

            ['code' => '4', 'name' => 'الإيرادات', 'type' => 'revenue', 'parent_code' => null, 'level' => 1, 'is_postable' => false],
            ['code' => '41', 'name' => 'المبيعات', 'type' => 'revenue', 'parent_code' => '4', 'level' => 2, 'is_postable' => true],
            ['code' => '42', 'name' => 'إيرادات أخرى', 'type' => 'revenue', 'parent_code' => '4', 'level' => 2, 'is_postable' => true],

            ['code' => '5', 'name' => 'المصروفات', 'type' => 'expense', 'parent_code' => null, 'level' => 1, 'is_postable' => false],
            ['code' => '51', 'name' => 'مصروفات إدارية وعمومية', 'type' => 'expense', 'parent_code' => '5', 'level' => 2, 'is_postable' => false],
            ['code' => '511', 'name' => 'رواتب', 'type' => 'expense', 'parent_code' => '51', 'level' => 3, 'is_postable' => true],
            ['code' => '512', 'name' => 'إيجار', 'type' => 'expense', 'parent_code' => '51', 'level' => 3, 'is_postable' => true],
            ['code' => '513', 'name' => 'كهرباء', 'type' => 'expense', 'parent_code' => '51', 'level' => 3, 'is_postable' => true],
            ['code' => '514', 'name' => 'مصروفات إدارية', 'type' => 'expense', 'parent_code' => '51', 'level' => 3, 'is_postable' => true],
            ['code' => '52', 'name' => 'مصروفات بيعية وتسويقية', 'type' => 'expense', 'parent_code' => '5', 'level' => 2, 'is_postable' => false],
            ['code' => '521', 'name' => 'إعلانات وتسويق', 'type' => 'expense', 'parent_code' => '52', 'level' => 3, 'is_postable' => true],
            ['code' => '522', 'name' => 'عمولات مبيعات', 'type' => 'expense', 'parent_code' => '52', 'level' => 3, 'is_postable' => true],
            ['code' => '523', 'name' => 'مصروفات توزيع', 'type' => 'expense', 'parent_code' => '52', 'level' => 3, 'is_postable' => true],

            ['code' => '6', 'name' => 'تكلفة البضاعة المباعة', 'type' => 'cogs', 'parent_code' => null, 'level' => 1, 'is_postable' => false],
            ['code' => '61', 'name' => 'تكلفة المبيعات', 'type' => 'cogs', 'parent_code' => '6', 'level' => 2, 'is_postable' => true],
            ['code' => '62', 'name' => 'مشتريات', 'type' => 'cogs', 'parent_code' => '6', 'level' => 2, 'is_postable' => true],
            ['code' => '63', 'name' => 'مردودات المشتريات', 'type' => 'cogs', 'parent_code' => '6', 'level' => 2, 'is_postable' => true],
            ['code' => '64', 'name' => 'خصم مكتسب', 'type' => 'cogs', 'parent_code' => '6', 'level' => 2, 'is_postable' => true],
            ['code' => '65', 'name' => 'مصاريف نقل المشتريات', 'type' => 'cogs', 'parent_code' => '6', 'level' => 2, 'is_postable' => true],
        ];
    }
}
