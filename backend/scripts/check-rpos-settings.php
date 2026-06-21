<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$svc = app(\App\Services\TenantSettingsService::class);
$tenantId = 1;

$keys = [
    'rpos_use_default_branch',
    'rpos_default_branch_id',
    'rpos_use_default_warehouse',
    'rpos_default_warehouse_id',
    'rpos_use_default_customer',
    'rpos_default_customer_id',
];

foreach ($keys as $key) {
    $val = $svc->get($tenantId, $key);
    echo $key.'='.json_encode($val).' ('.gettype($val).')'.PHP_EOL;
}

$branch = \App\Models\Branch::find(1);
echo 'branch1='.json_encode($branch ? ['id' => $branch->id, 'name' => $branch->name, 'is_active' => $branch->is_active] : null).PHP_EOL;

$wh = \App\Models\Warehouse::find(1);
echo 'warehouse1='.json_encode($wh ? ['id' => $wh->id, 'name' => $wh->name, 'is_active' => $wh->is_active] : null).PHP_EOL;

$customer = \App\Models\Customer::find(1);
echo 'customer1='.json_encode($customer ? ['id' => $customer->id, 'name' => $customer->name] : null).PHP_EOL;
