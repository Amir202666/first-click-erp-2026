<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\PosHeldCart>
 */
class PosHeldCartFactory extends Factory
{
    public function definition(): array
    {
        return [
            'branch_id' => null,
            'user_id' => null,
            'payload' => ['items' => []],
            'resumed_at' => null,
        ];
    }
}
