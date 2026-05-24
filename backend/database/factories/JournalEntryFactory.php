<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\JournalEntry>
 */
class JournalEntryFactory extends Factory
{
    public function definition(): array
    {
        return [
            'number' => 'JE-'.fake()->unique()->numerify('######'),
            'date' => now()->toDateString(),
            'type' => 'manual',
            'description' => null,
            'currency' => 'SAR',
            'total_debit' => 0,
            'total_credit' => 0,
            'status' => 'draft',
            'posted_at' => null,
            'created_by' => null,
            'reference_type' => null,
            'reference_id' => null,
            'customer_id' => null,
            'vendor_id' => null,
            'branch_id' => null,
        ];
    }
}
