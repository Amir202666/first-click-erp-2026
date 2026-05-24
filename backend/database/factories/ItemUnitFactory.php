<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\ItemUnit>
 */
class ItemUnitFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => fake()->unique()->randomElement(['Piece', 'Kg', 'Box', 'Pack', 'Liter']).' '.fake()->unique()->numerify('##'),
            'name_en' => null,
            'symbol' => fake()->randomElement(['pcs', 'kg', 'bx', 'pk', 'l']),
            'is_active' => true,
        ];
    }
}
