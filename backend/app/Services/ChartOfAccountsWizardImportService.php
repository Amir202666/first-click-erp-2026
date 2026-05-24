<?php

namespace App\Services;

use App\Models\Account;
use Illuminate\Support\Facades\DB;

class ChartOfAccountsWizardImportService
{
    private const VALID_TYPES = ['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense'];

    private const MAX_ROWS = 12000;

    private const INSERT_CHUNK = 450;

    /**
     * استيراد دفعة حسابات جديدة فقط (لا تحديث للموجود)، مع ترتيب الآباء قبل الأبناء وإدراج مجمع.
     *
     * @param  array<int, array<string, mixed>>  $rows  كل عنصر: code, name, (+ حقول اختيارية)، واختياري line لرقم السطر في التقرير
     * @return array{inserted: int, failed: array<int, array{line: int, code: string, reason: string}>}
     */
    public function import(int $tenantId, array $rows): array
    {
        if (count($rows) > self::MAX_ROWS) {
            return [
                'inserted' => 0,
                'failed' => [['line' => 0, 'code' => '', 'reason' => 'تجاوز الحد الأقصى لعدد الأسطر ('.self::MAX_ROWS.').']],
            ];
        }

        $idByCode = Account::where('tenant_id', $tenantId)->pluck('id', 'code')->all();
        $levelByCode = Account::where('tenant_id', $tenantId)->pluck('level', 'code')->all();
        $failed = [];

        $codesInFile = [];
        foreach ($rows as $idx => $raw) {
            $code = isset($raw['code']) ? trim((string) $raw['code']) : '';
            $name = isset($raw['name']) ? trim((string) $raw['name']) : '';
            if ($code !== '' && $name !== '') {
                $codesInFile[$code] = true;
            }
        }

        $normalized = [];
        $firstLineByCode = [];

        foreach ($rows as $idx => $raw) {
            $line = isset($raw['line']) && is_numeric($raw['line']) ? (int) $raw['line'] : $idx + 1;
            $code = isset($raw['code']) ? trim((string) $raw['code']) : '';
            $name = isset($raw['name']) ? trim((string) $raw['name']) : '';
            $parentCode = isset($raw['parent_code']) ? trim((string) $raw['parent_code']) : '';

            if ($code === '' || $name === '') {
                $failed[] = ['line' => $line, 'code' => $code, 'reason' => 'الرمز أو الاسم فارغ.'];

                continue;
            }

            if (isset($idByCode[$code])) {
                $failed[] = ['line' => $line, 'code' => $code, 'reason' => 'رمز الحساب موجود مسبقاً في الدليل.'];

                continue;
            }

            if (isset($firstLineByCode[$code])) {
                $failed[] = ['line' => $line, 'code' => $code, 'reason' => 'تكرار الكود في الملف (أول ظهور في السطر '.$firstLineByCode[$code].').'];

                continue;
            }

            if ($parentCode !== '' && $parentCode === $code) {
                $failed[] = ['line' => $line, 'code' => $code, 'reason' => 'لا يمكن أن يكون الحساب أباً لنفسه.'];

                continue;
            }

            $type = isset($raw['type']) ? trim((string) $raw['type']) : '';
            if ($type === '' || ! in_array($type, self::VALID_TYPES, true)) {
                $type = 'asset';
            }

            $nameEn = isset($raw['name_en']) ? trim((string) $raw['name_en']) : '';
            $nameEn = $nameEn === '' ? null : $nameEn;

            $description = isset($raw['description']) ? trim((string) $raw['description']) : '';
            $description = $description === '' ? null : $description;

            $nb = isset($raw['normal_balance']) ? trim((string) $raw['normal_balance']) : '';
            $normalBalance = in_array($nb, ['debit', 'credit'], true) ? $nb : null;

            $isPostable = true;
            if (array_key_exists('is_postable', $raw)) {
                $v = $raw['is_postable'];
                if (is_bool($v)) {
                    $isPostable = $v;
                } elseif (is_string($v)) {
                    $isPostable = in_array(strtolower($v), ['1', 'true', 'yes', 'نعم'], true);
                } elseif (is_numeric($v)) {
                    $isPostable = (int) $v === 1;
                }
            }

            $levelFromFile = null;
            if (isset($raw['level']) && is_numeric($raw['level'])) {
                $levelFromFile = max(1, (int) $raw['level']);
            }

            if ($parentCode !== '' && ! isset($idByCode[$parentCode]) && ! isset($codesInFile[$parentCode])) {
                $failed[] = ['line' => $line, 'code' => $code, 'reason' => 'الحساب الأب بالرمز «'.$parentCode.'» غير موجود في الدليل ولا في الملف.'];

                continue;
            }

            $firstLineByCode[$code] = $line;

            $normalized[] = [
                'line' => $line,
                'code' => $code,
                'name' => $name,
                'name_en' => $nameEn,
                'type' => $type,
                'parent_code' => $parentCode,
                'level_from_file' => $levelFromFile,
                'is_postable' => $isPostable,
                'description' => $description,
                'normal_balance' => $normalBalance,
            ];
        }

        if ($normalized === []) {
            return ['inserted' => 0, 'failed' => $failed];
        }

        $codesToInsert = array_column($normalized, 'code');
        $codeSet = array_flip($codesToInsert);

        $inDegree = [];
        $children = [];
        foreach ($normalized as $r) {
            $c = $r['code'];
            $p = $r['parent_code'];
            $inDegree[$c] = $inDegree[$c] ?? 0;
            if ($p !== '' && isset($codeSet[$p])) {
                $inDegree[$c]++;
                $children[$p][] = $c;
            }
        }

        $queue = [];
        foreach ($normalized as $r) {
            if (($inDegree[$r['code']] ?? 0) === 0) {
                $queue[] = $r['code'];
            }
        }

        $sortedCodes = [];
        while ($queue !== []) {
            $u = array_shift($queue);
            $sortedCodes[] = $u;
            foreach ($children[$u] ?? [] as $v) {
                $inDegree[$v]--;
                if ($inDegree[$v] === 0) {
                    $queue[] = $v;
                }
            }
        }

        if (count($sortedCodes) !== count($normalized)) {
            $sortedSet = array_flip($sortedCodes);
            foreach ($normalized as $r) {
                if (! isset($sortedSet[$r['code']])) {
                    $failed[] = ['line' => $r['line'], 'code' => $r['code'], 'reason' => 'تعذر ترتيب الحسابات (دائرة في الاعتمادية بين الحساب الأب والابن).'];
                }
            }

            return ['inserted' => 0, 'failed' => $failed];
        }

        $byCode = [];
        foreach ($normalized as $r) {
            $byCode[$r['code']] = $r;
        }

        $ordered = [];
        foreach ($sortedCodes as $c) {
            $ordered[] = $byCode[$c];
        }

        $now = now();
        $inserted = 0;

        DB::transaction(function () use ($tenantId, $ordered, &$idByCode, &$levelByCode, $now, &$inserted) {
            foreach (array_chunk($ordered, self::INSERT_CHUNK) as $chunk) {
                $batch = [];
                $codeLevels = [];
                foreach ($chunk as $r) {
                    $parentId = null;
                    $level = 1;
                    if ($r['parent_code'] !== '') {
                        $parentId = $idByCode[$r['parent_code']] ?? null;
                        if ($parentId === null) {
                            throw new \RuntimeException('parent_missing:'.$r['code']);
                        }
                        $parentLevel = (int) ($levelByCode[$r['parent_code']] ?? 1);
                        $level = $parentLevel + 1;
                    }
                    if ($r['level_from_file'] !== null) {
                        $level = $r['level_from_file'];
                    }

                    $codeLevels[$r['code']] = $level;

                    $batch[] = [
                        'tenant_id' => $tenantId,
                        'parent_id' => $parentId,
                        'code' => $r['code'],
                        'name' => $r['name'],
                        'name_en' => $r['name_en'],
                        'type' => $r['type'],
                        'normal_balance' => $r['normal_balance'],
                        'description' => $r['description'],
                        'is_system' => false,
                        'is_active' => true,
                        'level' => $level,
                        'currency' => null,
                        'allow_manual_entry' => true,
                        'is_postable' => $r['is_postable'] ? 1 : 0,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }

                Account::insert($batch);
                $codes = array_column($batch, 'code');
                $newIds = Account::where('tenant_id', $tenantId)->whereIn('code', $codes)->pluck('id', 'code')->all();
                foreach ($newIds as $code => $id) {
                    $idByCode[$code] = $id;
                    $levelByCode[$code] = $codeLevels[$code] ?? 1;
                }
                $inserted += count($batch);
            }

            $parentsWithChildren = Account::where('tenant_id', $tenantId)
                ->whereNotNull('parent_id')
                ->distinct()
                ->pluck('parent_id');
            if ($parentsWithChildren->isNotEmpty()) {
                Account::whereIn('id', $parentsWithChildren)->update(['is_postable' => false]);
            }
        });

        return ['inserted' => $inserted, 'failed' => $failed];
    }
}
