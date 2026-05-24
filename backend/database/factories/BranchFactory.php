<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Branch>
 */
class BranchFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => fake()->city().' Branch',
            'name_en' => null,
            'code' => fake()->unique()->bothify('BR-####'),
            'address' => fake()->optional()->address(),
            'phone' => fake()->optional()->phoneNumber(),
            'manager_name' => fake()->optional()->name(),
            'is_active' => true,
        ];
    }
}
