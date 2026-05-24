<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\TransferHeader>
 */
class TransferHeaderFactory extends Factory
{
    public function definition(): array
    {
        return [
            'number' => 'TR-'.fake()->unique()->numerify('######'),
            'status' => 'draft',
            'date' => now()->toDateString(),
            'notes' => null,
            'created_by' => null,
            // tenant_id, from_warehouse_id, to_warehouse_id set in tests
        ];
    }
}
