<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\OpeningStockItem>
 */
class OpeningStockItemFactory extends Factory
{
    public function definition(): array
    {
        $qty = fake()->randomFloat(4, 0.1, 100);
        $cost = fake()->randomFloat(4, 0, 1000);

        return [
            'quantity' => $qty,
            'unit_cost' => $cost,
            'total_cost' => $qty * $cost,
            'cost_center_id' => null,
            // opening_stock_header_id, item_id should be set explicitly
        ];
    }
}
