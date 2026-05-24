<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\ItemCategory>
 */
class ItemCategoryFactory extends Factory
{
    public function definition(): array
    {
        return [
            'parent_id' => null,
            'code' => 'CAT-'.fake()->unique()->numerify('###'),
            'name' => 'Category '.fake()->unique()->word(),
            'name_en' => null,
            'description' => null,
            'image' => null,
            'is_active' => true,
            'inventory_account_id' => null,
            'cost_of_sales_account_id' => null,
            'sales_account_id' => null,
        ];
    }
}
