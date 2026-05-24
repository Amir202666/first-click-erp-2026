<?php

require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$id = (int) ($argv[1] ?? 0);
$q = \App\Models\PrintTemplate::where('document_type', 'invoice');
if ($id > 0) {
    $q->where('id', $id);
}
foreach ($q->get() as $t) {
    $h = (string) ($t->html_content ?? '');
    echo $t->id . ' | ' . $t->name . ' | default=' . (int) $t->is_default
        . ' | len=' . strlen($h)
        . ' | canvas=' . (str_contains($h, 'print-doc-abs-root') ? 'yes' : 'no')
        . ' | tenant=' . $t->tenant_id . PHP_EOL;
}
