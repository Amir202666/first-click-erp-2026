<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Customer>
 */
class CustomerFactory extends Factory
{
    public function definition(): array
    {
        return [
            // tenant_id should be set explicitly in tests (or auto-set via BelongsToTenant scope runtime)
            'code' => (string) fake()->unique()->numberBetween(1, 999999),
            'name' => fake()->company(),
            'tax_number' => fake()->optional()->numerify('##########'),
            'address' => fake()->optional()->address(),
            'email' => fake()->optional()->companyEmail(),
            'phone' => fake()->optional()->phoneNumber(),
            'payment_terms' => null,
            'credit_limit' => null,
            'currency' => 'SAR',
            'is_active' => true,
            'contacts' => null,
            'notes' => null,
        ];
    }
}
