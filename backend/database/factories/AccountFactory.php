<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Account>
 */
class AccountFactory extends Factory
{
    public function definition(): array
    {
        return [
            'parent_id' => null,
            'code' => (string) fake()->unique()->numberBetween(1, 999999),
            'name' => fake()->words(3, true),
            'name_en' => null,
            'type' => 'asset',
            'normal_balance' => 'debit',
            'description' => null,
            'currency' => 'SAR',
            'is_system' => false,
            'is_active' => true,
            'is_postable' => true,
            'allow_manual_entry' => true,
            'level' => 1,
        ];
    }
}
