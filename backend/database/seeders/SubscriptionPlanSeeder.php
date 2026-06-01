<?php

namespace Database\Seeders;

use App\Models\SubscriptionPlan;
use Illuminate\Database\Seeder;

class SubscriptionPlanSeeder extends Seeder
{
    public function run(): void
    {
        $plans = [
            [
                'name' => 'أساسي',
                'slug' => 'basic',
                'description' => 'خطة مناسبة للمحلات الصغيرة',
                'price' => 1200,
                'currency' => 'SAR',
                'billing_cycle_months' => 12,
                'max_users' => 3,
                'features' => ['accounting', 'sales'],
                'is_active' => true,
                'sort_order' => 1,
            ],
            [
                'name' => 'متوسط',
                'slug' => 'medium',
                'description' => 'خطة للشركات المتوسطة',
                'price' => 2400,
                'currency' => 'SAR',
                'billing_cycle_months' => 12,
                'max_users' => 10,
                'features' => ['accounting', 'sales', 'purchases', 'inventory'],
                'is_active' => true,
                'sort_order' => 2,
            ],
            [
                'name' => 'متقدم',
                'slug' => 'advanced',
                'description' => 'خطة شاملة للشركات الكبيرة',
                'price' => 4800,
                'currency' => 'SAR',
                'billing_cycle_months' => 12,
                'max_users' => null,
                'features' => ['all_features'],
                'is_active' => true,
                'sort_order' => 3,
            ],
        ];

        foreach ($plans as $plan) {
            SubscriptionPlan::updateOrCreate(
                ['slug' => $plan['slug']],
                $plan
            );
        }
    }
}
