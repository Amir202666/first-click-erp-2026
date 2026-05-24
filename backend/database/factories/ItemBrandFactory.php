<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\ItemBrand>
 */
class ItemBrandFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => 'Brand '.fake()->unique()->company(),
            'name_en' => null,
            'description' => null,
            'is_active' => true,
        ];
    }
}
