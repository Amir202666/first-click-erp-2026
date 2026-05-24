<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Currency>
 */
class CurrencyFactory extends Factory
{
    public function definition(): array
    {
        return [
            'code' => fake()->unique()->currencyCode(),
            'name' => fake()->currencyCode(),
            'name_en' => null,
            'symbol' => null,
            'decimal_places' => 2,
            'exchange_rate' => 1,
            'base_currency' => 'SAR',
            'rate_date' => now()->toDateString(),
            'is_active' => true,
            'is_default' => false,
        ];
    }
}
