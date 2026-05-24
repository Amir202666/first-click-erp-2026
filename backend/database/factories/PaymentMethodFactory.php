<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\PaymentMethod>
 */
class PaymentMethodFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => 'PM '.fake()->unique()->word(),
            'name_en' => null,
            'type' => 'cash',
            'linked_account_id' => null,
            'is_active' => true,
        ];
    }
}
