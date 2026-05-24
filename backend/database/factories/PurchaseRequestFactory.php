<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\PurchaseRequest>
 */
class PurchaseRequestFactory extends Factory
{
    public function definition(): array
    {
        return [
            'number' => 'PR-'.fake()->unique()->numerify('######'),
            'date' => now()->toDateString(),
            'vendor_id' => null,
            'branch_id' => null,
            'warehouse_id' => null,
            'reference_number' => null,
            'subtotal' => 0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 0,
            'notes' => null,
            'created_by' => null,
        ];
    }
}
