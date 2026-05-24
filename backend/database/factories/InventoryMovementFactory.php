<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\InventoryMovement>
 */
class InventoryMovementFactory extends Factory
{
    public function definition(): array
    {
        return [
            'type' => 'adjustment',
            'quantity' => 1,
            'unit_cost' => 0,
            'total_cost' => 0,
            'reference_type' => null,
            'reference_id' => null,
            'date' => now()->toDateString(),
            'notes' => null,
            'created_by' => null,
            // tenant_id, item_id, warehouse_id should be set explicitly in tests
        ];
    }
}
