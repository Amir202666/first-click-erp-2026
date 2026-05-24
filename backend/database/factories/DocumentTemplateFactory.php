<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\DocumentTemplate>
 */
class DocumentTemplateFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => 'Template '.fake()->unique()->word(),
            'doc_type' => 'invoice',
            'format' => 'a4',
            'is_active' => true,
            'is_system' => false,
            'content' => '<div>{{invoice.number}}</div>',
            'meta' => null,
        ];
    }
}
