<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\KitchenTicketLine>
 */
class KitchenTicketLineFactory extends Factory
{
    public function definition(): array
    {
        return [
            'ticket_id' => null,
            'invoice_line_id' => null,
            'item_name' => fake()->words(2, true),
            'quantity' => 1,
            'modifiers_text' => null,
            'kitchen_note' => null,
            'is_completed' => false,
        ];
    }
}
