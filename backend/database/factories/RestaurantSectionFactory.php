<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\RestaurantSection>
 */
class RestaurantSectionFactory extends Factory
{
    public function definition(): array
    {
        return [
            'branch_id' => null,
            'name' => 'Section '.fake()->unique()->word(),
            'name_en' => null,
            'code' => null,
            'sort_order' => 0,
        ];
    }
}
