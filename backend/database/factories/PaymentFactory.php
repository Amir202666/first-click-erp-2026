<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Payment>
 */
class PaymentFactory extends Factory
{
    public function definition(): array
    {
        return [
            'number' => 'PAY-'.fake()->unique()->numerify('######'),
            'type' => 'receipt',
            'date' => now()->toDateString(),
            'amount' => 10,
            'currency' => 'SAR',
            'payment_method' => 'cash',
            'reference' => null,
            'status' => 'draft',
            'notes' => null,
        ];
    }
}
