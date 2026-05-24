<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Warehouse>
 */
class WarehouseFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => 'Warehouse '.fake()->city(),
            'code' => fake()->unique()->bothify('WH-####'),
            'address' => fake()->optional()->address(),
            'phone' => fake()->optional()->phoneNumber(),
            'is_active' => true,
            'branch_id' => null,
            'user_id' => null,
        ];
    }
}
