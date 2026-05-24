<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\CostCenter>
 */
class CostCenterFactory extends Factory
{
    public function definition(): array
    {
        return [
            'parent_id' => null,
            'code' => fake()->unique()->bothify('CC-####'),
            'name' => 'Cost Center '.fake()->word(),
            'name_en' => null,
            'description' => null,
            'is_active' => true,
        ];
    }
}
