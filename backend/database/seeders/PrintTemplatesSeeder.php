<?php

namespace Database\Seeders;

use App\Models\Tenant;
use App\Services\PrintTemplateService;
use Illuminate\Database\Seeder;

class PrintTemplatesSeeder extends Seeder
{
    public function run(): void
    {
        $service = app(PrintTemplateService::class);

        $tenants = Tenant::query()->pluck('id');
        if ($tenants->isEmpty()) {
            $this->command?->warn('PrintTemplatesSeeder: no tenants found; skip.');

            return;
        }

        foreach ($tenants as $tenantId) {
            $n = $service->seedDefaultTemplates((int) $tenantId);
            $this->command?->info("Print templates seeded for tenant {$tenantId}: {$n} rows.");
        }
    }
}
