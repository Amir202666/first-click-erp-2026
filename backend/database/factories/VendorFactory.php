<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Vendor>
 */
class VendorFactory extends Factory
{
    public function definition(): array
    {
        return [
            'code' => (string) fake()->unique()->numberBetween(1, 999999),
            'name' => fake()->company(),
            'tax_number' => fake()->optional()->numerify('##########'),
            'address' => fake()->optional()->address(),
            'email' => fake()->optional()->companyEmail(),
            'phone' => fake()->optional()->phoneNumber(),
            'payment_terms' => null,
            'currency' => 'SAR',
            'is_active' => true,
            'contacts' => null,
            'notes' => null,
        ];
    }
}
