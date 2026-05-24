<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\KitchenTicket>
 */
class KitchenTicketFactory extends Factory
{
    public function definition(): array
    {
        return [
            'branch_id' => null,
            'table_id' => null,
            'invoice_id' => null,
            'restaurant_order_id' => null,
            'status' => 'pending',
        ];
    }
}
