<?php

require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$id = (int) ($argv[1] ?? 261);
$t = \App\Models\PrintTemplate::findOrFail($id);
$path = __DIR__ . '/../storage/app/test-canvas-template.html';
file_put_contents($path, (string) $t->html_content);
echo 'written ' . strlen(file_get_contents($path)) . ' bytes to ' . $path . PHP_EOL;
