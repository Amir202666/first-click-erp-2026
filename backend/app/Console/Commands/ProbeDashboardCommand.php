<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\DashboardController;
use Illuminate\Console\Command;
use Illuminate\Http\Request;

class ProbeDashboardCommand extends Command
{
    protected $signature = 'dashboard:probe {tenant_id : Tenant ID}';

    protected $description = 'Run dashboard API logic and print any exception (for production debugging)';

    public function handle(): int
    {
        $tenantId = (int) $this->argument('tenant_id');
        $tenant = \App\Models\Tenant::find($tenantId);
        if (! $tenant) {
            $this->error("Tenant {$tenantId} not found.");

            return self::FAILURE;
        }

        app()->instance('current_tenant', $tenant);
        $req = Request::create('/api/dashboard?period=month', 'GET');
        $req->headers->set('X-Tenant-ID', (string) $tenantId);
        $req->merge(['tenant_id' => $tenantId]);

        try {
            $response = app(DashboardController::class)->index($req);
            $this->info('OK HTTP '.$response->getStatusCode());

            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error($e->getMessage());
            $this->line($e->getFile().':'.$e->getLine());

            return self::FAILURE;
        }
    }
}
