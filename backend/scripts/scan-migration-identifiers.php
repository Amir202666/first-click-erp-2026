<?php

$dir = __DIR__ . '/../database/migrations';
$issues = [];

foreach (glob("$dir/*.php") as $file) {
    $c = file_get_contents($file);
    if (! preg_match_all("/Schema::(create|table)\('([^']+)'/", $c, $tables)) {
        continue;
    }
    foreach ($tables[2] as $table) {
        if (preg_match_all("/foreignId\('([^']+)'\)/", $c, $cols)) {
            foreach ($cols[1] as $col) {
                $name = "{$table}_{$col}_foreign";
                if (strlen($name) > 64) {
                    $issues[] = [basename($file), 'fk', $name, strlen($name), $table, $col];
                }
            }
        }
        if (preg_match_all("/->unique\(\[([^\]]+)\](?:,\s*'([^']+)')?/", $c, $u, PREG_SET_ORDER)) {
            foreach ($u as $m) {
                if (! empty($m[2])) {
                    continue;
                }
                $cols = preg_replace("/['\"\s]/", '', $m[1]);
                $name = "{$table}_{$cols}_unique";
                if (strlen($name) > 64) {
                    $issues[] = [basename($file), 'unique', $name, strlen($name), $table, $m[1]];
                }
            }
        }
        if (preg_match_all("/->index\(\[([^\]]+)\](?:,\s*'([^']+)')?/", $c, $i, PREG_SET_ORDER)) {
            foreach ($i as $m) {
                if (! empty($m[2])) {
                    continue;
                }
                $cols = preg_replace("/['\"\s,]/", '_', $m[1]);
                $name = "{$table}_{$cols}_index";
                if (strlen($name) > 64) {
                    $issues[] = [basename($file), 'index', $name, strlen($name), $table, $m[1]];
                }
            }
        }
    }
}

foreach ($issues as $i) {
    echo implode(' | ', $i) . PHP_EOL;
}
echo 'Total: ' . count($issues) . PHP_EOL;
