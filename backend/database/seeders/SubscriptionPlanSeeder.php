<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;

class SubscriptionPlanSeeder extends Seeder
{
    public function run(): void
    {
        Artisan::call('plans:setup-official');
    }
}
