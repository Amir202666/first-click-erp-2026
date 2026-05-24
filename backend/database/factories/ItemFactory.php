<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Item>
 */
class ItemFactory extends Factory
{
    public function definition(): array
    {
        return [
            'code' => 'ITM-'.fake()->unique()->numerify('######'),
            'name' => fake()->words(3, true),
            'description' => null,
            'unit' => 'pcs',
            'type' => 'inventory',
            'cost_price' => 0,
            'selling_price' => 0,
            'min_quantity' => 0,
            'max_quantity' => null,
            'currency' => 'SAR',
            'is_active' => true,
            'track_quantity' => true,
            'barcode' => null,
            'sku' => null,
        ];
    }
}
