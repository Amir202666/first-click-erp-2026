<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\OpeningStockHeader>
 */
class OpeningStockHeaderFactory extends Factory
{
    public function definition(): array
    {
        return [
            'date' => now()->toDateString(),
            'reference_number' => null,
            'notes' => null,
            'status' => 'draft',
            'journal_entry_id' => null,
            'created_by' => null,
            'approved_by' => null,
            'approved_at' => null,
            // tenant_id, branch_id, warehouse_id should be set explicitly
        ];
    }
}
