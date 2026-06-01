<?php

namespace App\Console\Commands;

use App\Models\SubscriptionPlan;
use Illuminate\Console\Command;

/**
 * إعداد باقات الاشتراك الرسمية (متوافقة مع فلترة القوائم والـ API).
 *
 * على السيرفر:
 *   cd /var/www/erp/backend
 *   php artisan plans:setup-official
 */
class SetupSubscriptionPlans extends Command
{
    protected $signature = 'plans:setup-official
                            {--dry-run : عرض الباقات دون الحفظ}';

    protected $description = 'إنشاء/تحديث باقات الاشتراك الأربع (أساسية، متقدمة، متكاملة، احترافية)';

    public function handle(): int
    {
        $plans = [
            [
                'slug' => 'basic',
                'name' => 'الباقة الأساسية',
                'description' => 'للشركات الناشئة والصغيرة — مبيعات ومشتريات وتقارير أساسية',
                'price' => 99,
                'currency' => 'SAR',
                'billing_cycle_months' => 1,
                'max_users' => 3,
                'features' => ['accounting', 'sales', 'purchases'],
                'is_active' => true,
                'sort_order' => 1,
            ],
            [
                'slug' => 'advanced',
                'name' => 'الباقة المتقدمة',
                'description' => 'للشركات المتوسطة — مخزون ونقاط بيع',
                'price' => 249,
                'currency' => 'SAR',
                'billing_cycle_months' => 1,
                'max_users' => 5,
                'features' => ['accounting', 'sales', 'purchases', 'inventory', 'pos'],
                'is_active' => true,
                'sort_order' => 2,
            ],
            [
                'slug' => 'integrated',
                'name' => 'الباقة المتكاملة',
                'description' => 'محاسبة كاملة، موارد بشرية، مناديب، وتصنيع',
                'price' => 499,
                'currency' => 'SAR',
                'billing_cycle_months' => 1,
                'max_users' => 15,
                'features' => ['accounting', 'sales', 'purchases', 'inventory', 'pos', 'manufacturing', 'hr', 'sales_reps'],
                'is_active' => true,
                'sort_order' => 3,
            ],
            [
                'slug' => 'professional',
                'name' => 'الباقة الاحترافية',
                'description' => 'جميع مميزات النظام — مستخدمون غير محدود',
                'price' => 999,
                'currency' => 'SAR',
                'billing_cycle_months' => 1,
                'max_users' => null,
                'features' => ['all_features'],
                'is_active' => true,
                'sort_order' => 4,
            ],
        ];

        if ($this->option('dry-run')) {
            $this->table(
                ['slug', 'name', 'price', 'max_users', 'features'],
                array_map(fn ($p) => [
                    $p['slug'],
                    $p['name'],
                    $p['price'].' '.$p['currency'],
                    $p['max_users'] === null ? '∞' : (string) $p['max_users'],
                    implode(', ', $p['features']),
                ], $plans)
            );

            return self::SUCCESS;
        }

        foreach ($plans as $plan) {
            SubscriptionPlan::updateOrCreate(
                ['slug' => $plan['slug']],
                $plan
            );
            $this->line("  ✓ {$plan['name']} ({$plan['slug']})");
        }

        $this->newLine();
        $this->info('تم حفظ '.count($plans).' باقات.');
        $this->comment('تعديل لاحقاً من: الإدارة → الباقات');

        return self::SUCCESS;
    }
}
