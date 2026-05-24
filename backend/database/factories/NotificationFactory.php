<?php

namespace Database\Factories;

use App\Models\Notification;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Notification>
 */
class NotificationFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => null,
            'type' => Notification::TYPE_STOCK_LOW,
            'title_ar' => 'تنبيه',
            'title_en' => 'Alert',
            'body_ar' => 'نص',
            'body_en' => 'Text',
            'link_path' => null,
            'link_params' => null,
            'severity' => Notification::SEVERITY_INFO,
            'read_at' => null,
            'related_entity_type' => null,
            'related_entity_id' => null,
            'branch_id' => null,
        ];
    }
}
