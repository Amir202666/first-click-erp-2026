<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\RestaurantTable>
 */
class RestaurantTableFactory extends Factory
{
    public function definition(): array
    {
        return [
            'branch_id' => null,
            'name' => 'Table '.fake()->unique()->numerify('##'),
            'code' => null,
            'section' => null,
            'capacity' => fake()->numberBetween(2, 10),
            'status' => 'available',
            'sort_order' => 0,
        ];
    }
}
