<?php

namespace App\Services;

use App\Models\PrintTemplate;
use App\Support\PrintTemplateLibrary;

class PrintTemplateService
{
    /**
     * Replace all print templates for the tenant with the rich library (14 templates).
     */
    public function clearAllTemplates(int $tenantId): int
    {
        return PrintTemplate::forTenant($tenantId)->delete();
    }

    public function seedDefaultTemplates(int $tenantId): int
    {
        PrintTemplate::forTenant($tenantId)->delete();

        $definitions = PrintTemplateLibrary::definitions();
        foreach ($definitions as $i => $def) {
            PrintTemplate::create(array_merge($def, [
                'tenant_id' => $tenantId,
                'margins' => $def['margins'] ?? PrintTemplate::defaultMargins(),
                'sort_order' => $def['sort_order'] ?? $i,
            ]));
        }

        return count($definitions);
    }
}
