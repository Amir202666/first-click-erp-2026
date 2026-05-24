<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\JournalEntryLine;
use App\Services\AccountingService;
use App\Services\ChartOfAccountsWizardImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AccountController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $accounts = Account::where('tenant_id', $request->tenant_id)
            ->with(['branches', 'costCenters', 'allowedUsers'])
            ->when($request->boolean('active_only'), fn ($q) => $q->where('is_active', true))
            ->when($request->type, fn ($q, $type) => $q->where('type', $type))
            ->when($request->parent_id, fn ($q, $pid) => $q->where('parent_id', $pid))
            ->when($request->boolean('root_only'), fn ($q) => $q->whereNull('parent_id'))
            ->when($request->boolean('postable_only'), fn ($q) => $q->where('is_postable', true))
            ->when($request->boolean('cash_bank_only'), fn ($q) => $q->where('is_active', true)->where(function ($q2) {
                $q2->where('code', 'like', '111%')->orWhere('code', 'like', '112%');
            }))
            ->orderBy('code')
            ->get();

        $currentUserId = $request->user()?->id;
        if ($currentUserId) {
            $visibleIds = $this->visibleAccountIdsForUser($accounts, $currentUserId);
            $accounts = $accounts->filter(fn ($a) => $visibleIds->contains($a->id))->values();
        }

        return response()->json($accounts->map(fn ($a) => $this->accountWithMappings($a)));
    }

    public function tree(Request $request): JsonResponse
    {
        $tenantId = $request->tenant_id;
        $accounts = Account::where('tenant_id', $tenantId)
            ->with(['branches', 'costCenters', 'allowedUsers'])
            ->when($request->boolean('active_only'), fn ($q) => $q->where('is_active', true))
            ->orderByRaw('CAST(code AS INTEGER)')
            ->get();

        $currentUserId = $request->user()?->id;
        if ($currentUserId) {
            $visibleIds = $this->visibleAccountIdsForUser($accounts, $currentUserId);
            $accounts = $accounts->filter(fn ($a) => $visibleIds->contains($a->id));
        }

        $tree = $this->buildTreeWithMappingsFast($accounts->values()->all());

        return response()->json($tree);
    }

    public function nextCode(Request $request): JsonResponse
    {
        $parentId = $request->query('parent_id');
        $tenantId = $request->tenant_id;

        if ($parentId) {
            $parent = Account::where('tenant_id', $tenantId)->findOrFail($parentId);
            $parentCode = $parent->code;
            $childCodeLen = strlen($parentCode) + 1;

            $lastChild = Account::where('tenant_id', $tenantId)
                ->where('parent_id', $parentId)
                ->orderByRaw('CAST(code AS INTEGER) DESC')
                ->first();

            if ($lastChild) {
                $suffix = (int) substr($lastChild->code, strlen($parentCode));
                $nextCode = $parentCode.($suffix + 1);
            } else {
                $nextCode = $parentCode.'1';
            }
        } else {
            $lastRoot = Account::where('tenant_id', $tenantId)
                ->whereNull('parent_id')
                ->orderByRaw('CAST(code AS INTEGER) DESC')
                ->first();

            $nextCode = $lastRoot ? (string) ((int) $lastRoot->code + 1) : '1';
        }

        return response()->json(['code' => $nextCode]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'parent_id' => 'nullable|exists:accounts,id',
            'code' => 'required|string|max:20',
            'name' => 'required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'type' => 'required|in:asset,liability,equity,revenue,cogs,expense',
            'normal_balance' => 'nullable|in:debit,credit',
            'description' => 'nullable|string',
            'currency' => 'nullable|string|max:3',
            'is_active' => 'nullable|boolean',
            'is_postable' => 'nullable|boolean',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => ['integer', Rule::exists('branches', 'id')->where('tenant_id', $request->tenant_id)],
            'cost_center_ids' => 'nullable|array',
            'cost_center_ids.*' => ['integer', Rule::exists('cost_centers', 'id')->where('tenant_id', $request->tenant_id)],
            'user_ids' => 'nullable|array',
            'user_ids.*' => ['integer', Rule::exists('tenant_users', 'user_id')->where('tenant_id', $request->tenant_id)],
        ]);

        $validated['tenant_id'] = $request->tenant_id;
        $validated['level'] = 1;
        $validated['is_postable'] = array_key_exists('is_postable', $validated) ? $validated['is_postable'] : true;
        $validated['is_active'] = array_key_exists('is_active', $validated) ? $validated['is_active'] : true;

        $branchIds = $validated['branch_ids'] ?? [];
        $costCenterIds = $validated['cost_center_ids'] ?? [];
        $userIds = $validated['user_ids'] ?? [];
        unset($validated['branch_ids'], $validated['cost_center_ids'], $validated['user_ids']);

        if ($validated['parent_id']) {
            $parent = Account::where('tenant_id', $request->tenant_id)->findOrFail($validated['parent_id']);
            $validated['level'] = $parent->level + 1;
        }

        $account = Account::create($validated);

        $this->syncAccountMappings($account, $branchIds, $costCenterIds, $userIds);

        // عند إضافة حساب فرعي، الحساب الأب يصبح غير قابل للترحيل (رأس فقط)
        if ($account->parent_id) {
            Account::where('id', $account->parent_id)->update(['is_postable' => false]);
        }

        return response()->json($this->accountWithMappings($account->fresh()), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $account = Account::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $account->load('children', 'parent', 'branches', 'costCenters', 'allowedUsers');

        $accountingService = app(AccountingService::class);
        $balance = $accountingService->getAccountBalance($account->id, null, null, null, null, $account->tenant_id);
        $account->setAttribute('balance_info', $balance);

        return response()->json($this->accountWithMappings($account));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $account = Account::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'normal_balance' => 'nullable|in:debit,credit',
            'description' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
            'currency' => 'nullable|string|max:3',
            'is_postable' => 'sometimes|boolean',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => ['integer', Rule::exists('branches', 'id')->where('tenant_id', $request->tenant_id)],
            'cost_center_ids' => 'nullable|array',
            'cost_center_ids.*' => ['integer', Rule::exists('cost_centers', 'id')->where('tenant_id', $request->tenant_id)],
            'user_ids' => 'nullable|array',
            'user_ids.*' => ['integer', Rule::exists('tenant_users', 'user_id')->where('tenant_id', $request->tenant_id)],
        ]);

        $branchIds = $validated['branch_ids'] ?? null;
        $costCenterIds = $validated['cost_center_ids'] ?? null;
        $userIds = $validated['user_ids'] ?? null;
        unset($validated['branch_ids'], $validated['cost_center_ids'], $validated['user_ids']);

        $account->update($validated);

        if ($branchIds !== null) {
            $account->branches()->sync($branchIds);
        }
        if ($costCenterIds !== null) {
            $account->costCenters()->sync($costCenterIds);
        }
        if ($userIds !== null) {
            $account->allowedUsers()->sync($userIds);
        }

        return response()->json($this->accountWithMappings($account->fresh()));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $tenantId = $request->tenant_id;
        $account = Account::where('tenant_id', $tenantId)->findOrFail($id);

        $idsToDelete = $this->collectDescendantIdsFast($account->id, $tenantId);

        $hasMovement = JournalEntryLine::whereIn('account_id', $idsToDelete)->exists();
        if ($hasMovement) {
            return response()->json(['message' => 'لا يمكن الحذف: يوجد حركات محاسبية على الحساب أو أحد الحسابات الفرعية'], 422);
        }

        $linked = $this->getAccountReferences($idsToDelete);
        if ($linked !== '') {
            return response()->json(['message' => 'لا يمكن الحذف: الحساب مرتبط بـ '.$linked], 422);
        }

        $parentId = $account->parent_id;

        try {
            DB::transaction(function () use ($tenantId, $idsToDelete, $parentId) {
                $accountsToDelete = Account::where('tenant_id', $tenantId)
                    ->whereIn('id', $idsToDelete)
                    ->orderByDesc('level')
                    ->get();

                foreach ($accountsToDelete as $acc) {
                    $acc->delete();
                }

                if ($parentId && ! Account::where('tenant_id', $tenantId)->where('parent_id', $parentId)->exists()) {
                    Account::where('id', $parentId)->update(['is_postable' => true]);
                }
            });
        } catch (\Throwable $e) {
            return response()->json(['message' => 'لا يمكن الحذف: '.$e->getMessage()], 422);
        }

        return response()->json(['message' => 'تم الحذف بنجاح']);
    }

    /** التحقق من ربط الحسابات بعملاء أو موردين أو طرق دفع أو أصناف أو مدفوعات */
    private function getAccountReferences(array $accountIds): string
    {
        $parts = [];
        if (\App\Models\Customer::whereIn('account_id', $accountIds)->exists()) {
            $parts[] = 'عملاء';
        }
        if (\App\Models\Vendor::whereIn('account_id', $accountIds)->exists()) {
            $parts[] = 'موردين';
        }
        if (\App\Models\PaymentMethod::whereIn('linked_account_id', $accountIds)->exists()) {
            $parts[] = 'طرق دفع';
        }
        if (\App\Models\Item::where(function ($q) use ($accountIds) {
            $q->whereIn('inventory_account_id', $accountIds)
                ->orWhereIn('cost_of_sales_account_id', $accountIds)
                ->orWhereIn('sales_account_id', $accountIds);
        })->exists()) {
            $parts[] = 'أصناف';
        }
        if (\App\Models\Payment::where(function ($q) use ($accountIds) {
            $q->whereIn('cash_bank_account_id', $accountIds)->orWhereIn('counterpart_account_id', $accountIds);
        })->exists()) {
            $parts[] = 'مدفوعات';
        }

        return implode('، ', $parts);
    }

    /**
     * جمع معرّفات الحساب وجميع فروعه بـ O(n) — استعلام واحد فقط لقاعدة البيانات.
     *
     * @return int[]
     */
    private function collectDescendantIdsFast(int $rootId, int $tenantId): array
    {
        $allAccounts = Account::where('tenant_id', $tenantId)
            ->select(['id', 'parent_id'])
            ->get();

        $childrenMap = [];
        foreach ($allAccounts as $acc) {
            if ($acc->parent_id !== null) {
                $childrenMap[$acc->parent_id][] = $acc->id;
            }
        }

        $ids = [];
        $queue = [$rootId];
        while (! empty($queue)) {
            $current = array_shift($queue);
            $ids[] = $current;
            if (isset($childrenMap[$current])) {
                foreach ($childrenMap[$current] as $childId) {
                    $queue[] = $childId;
                }
            }
        }

        return $ids;
    }

    /** تصدير دليل الحسابات CSV */
    public function export(Request $request): StreamedResponse
    {
        $tenantId = $request->tenant_id;
        $accounts = Account::where('tenant_id', $tenantId)->orderBy('code')->get();
        $parentCodes = Account::where('tenant_id', $tenantId)->get()->keyBy('id');

        $headers = [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="chart-of-accounts-'.date('Y-m-d').'.csv"',
        ];

        return response()->streamDownload(function () use ($accounts, $parentCodes) {
            $out = fopen('php://output', 'w');
            fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));
            fputcsv($out, ['code', 'name', 'name_en', 'type', 'parent_code', 'level', 'is_postable', 'description']);
            foreach ($accounts as $a) {
                $parentCode = $a->parent_id ? ($parentCodes->get($a->parent_id)?->code ?? '') : '';
                fputcsv($out, [
                    $a->code,
                    $a->name,
                    $a->name_en ?? '',
                    $a->type,
                    $parentCode,
                    $a->level,
                    $a->is_postable ? '1' : '0',
                    $a->description ?? '',
                ]);
            }
            fclose($out);
        }, 'chart-of-accounts-'.date('Y-m-d').'.csv', $headers);
    }

    /** استيراد دليل الحسابات من CSV */
    public function import(Request $request): JsonResponse
    {
        $request->validate(['file' => 'required|file|mimes:csv,txt|max:2048']);

        $tenantId = $request->tenant_id;
        $file = $request->file('file');
        $path = $file->getRealPath();
        $rows = array_map('str_getcsv', file($path));
        $header = array_map(function ($c) {
            return trim(str_replace("\xEF\xBB\xBF", '', $c));
        }, array_shift($rows) ?? []);
        $codeIdx = array_search('code', $header, true);
        $nameIdx = array_search('name', $header, true);
        if ($codeIdx === false || $nameIdx === false) {
            return response()->json(['message' => 'الملف يجب أن يحتوي على أعمدة: code, name'], 422);
        }

        $nameEnIdx = array_search('name_en', $header, true);
        $typeIdx = array_search('type', $header, true);
        $parentCodeIdx = array_search('parent_code', $header, true);
        $levelIdx = array_search('level', $header, true);
        $isPostableIdx = array_search('is_postable', $header, true);
        $descIdx = array_search('description', $header, true);

        $validTypes = ['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense'];
        $created = 0;
        $updated = 0;
        $errors = [];

        try {
            DB::transaction(function () use (
                $rows,
                $tenantId,
                $validTypes,
                $codeIdx,
                $nameIdx,
                $nameEnIdx,
                $typeIdx,
                $parentCodeIdx,
                $levelIdx,
                $isPostableIdx,
                $descIdx,
                &$created,
                &$updated,
                &$errors
            ) {
                $idByCode = Account::where('tenant_id', $tenantId)->get()->keyBy('code');

                foreach ($rows as $i => $row) {
                    $line = $i + 2;
                    $code = isset($row[$codeIdx]) ? trim($row[$codeIdx]) : '';
                    $name = isset($row[$nameIdx]) ? trim($row[$nameIdx]) : '';
                    if ($code === '' || $name === '') {
                        continue;
                    }
                    $type = ($typeIdx !== false && isset($row[$typeIdx]) && in_array(trim($row[$typeIdx]), $validTypes, true))
                        ? trim($row[$typeIdx]) : 'asset';
                    $parentCode = ($parentCodeIdx !== false && isset($row[$parentCodeIdx])) ? trim($row[$parentCodeIdx]) : '';
                    $level = ($levelIdx !== false && isset($row[$levelIdx]) && is_numeric($row[$levelIdx])) ? (int) $row[$levelIdx] : 1;
                    $isPostable = $isPostableIdx !== false && isset($row[$isPostableIdx]) && in_array(strtolower($row[$isPostableIdx]), ['1', 'true', 'yes', 'نعم'], true);
                    $nameEn = ($nameEnIdx !== false && isset($row[$nameEnIdx])) ? trim($row[$nameEnIdx]) : null;
                    $description = ($descIdx !== false && isset($row[$descIdx])) ? trim($row[$descIdx]) : null;

                    $parentId = null;
                    if ($parentCode !== '') {
                        $parent = $idByCode->get($parentCode);
                        if (! $parent) {
                            $errors[] = "سطر {$line}: الحساب الأب بالرمز «{$parentCode}» غير موجود.";

                            continue;
                        }
                        $parentId = $parent->id;
                        $level = $parent->level + 1;
                    }

                    $existing = $idByCode->get($code);
                    if ($existing) {
                        $existing->update([
                            'name' => $name,
                            'name_en' => $nameEn,
                            'type' => $type,
                            'parent_id' => $parentId,
                            'level' => $level,
                            'is_postable' => $isPostable,
                            'description' => $description,
                        ]);
                        $updated++;
                    } else {
                        $account = Account::create([
                            'tenant_id' => $tenantId,
                            'parent_id' => $parentId,
                            'code' => $code,
                            'name' => $name,
                            'name_en' => $nameEn,
                            'type' => $type,
                            'level' => $level,
                            'is_postable' => $isPostable,
                            'description' => $description,
                            'is_active' => true,
                        ]);
                        $idByCode->put($code, $account);
                        $created++;
                    }
                }

                if ($created > 0 || $updated > 0) {
                    $parentsWithChildren = Account::where('tenant_id', $tenantId)
                        ->whereNotNull('parent_id')
                        ->pluck('parent_id')
                        ->unique();
                    Account::whereIn('id', $parentsWithChildren)->update(['is_postable' => false]);
                }
            });
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'فشل الاستيراد بسبب خطأ في قاعدة البيانات. لم يُحفظ أي شيء.',
                'error' => $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'message' => 'تم الاستيراد بنجاح',
            'created' => $created,
            'updated' => $updated,
            'errors' => $errors,
        ]);
    }

    /** استيراد دليل الحسابات (معالج): JSON + إدراج مجمع، بدون تحديث الحسابات الموجودة. */
    public function importWizard(Request $request, ChartOfAccountsWizardImportService $wizard): JsonResponse
    {
        $validated = $request->validate([
            'rows' => 'required|array',
            'rows.*.code' => 'required|string|max:20',
            'rows.*.name' => 'required|string|max:255',
            'rows.*.name_en' => 'nullable|string|max:255',
            'rows.*.type' => 'nullable|string|max:20',
            'rows.*.parent_code' => 'nullable|string|max:20',
            'rows.*.level' => 'nullable|integer|min:1|max:99',
            'rows.*.is_postable' => 'nullable|boolean',
            'rows.*.description' => 'nullable|string',
            'rows.*.normal_balance' => 'nullable|in:debit,credit',
            'rows.*.line' => 'nullable|integer|min:1|max:999999',
        ]);

        $result = $wizard->import((int) $request->tenant_id, $validated['rows']);

        return response()->json([
            'inserted' => $result['inserted'],
            'failed' => $result['failed'],
            'success_count' => $result['inserted'],
            'failures' => $result['failed'],
        ]);
    }

    private function buildTree($accounts, $parentId = null): array
    {
        $tree = [];
        foreach ($accounts as $account) {
            if ($account->parent_id == $parentId) {
                $node = $account->toArray();
                $node['children'] = $this->buildTree($accounts, $account->id);
                $tree[] = $node;
            }
        }

        return $tree;
    }

    /**
     * بناء الشجرة بـ O(n) باستخدام HashMap بدلاً من O(n²).
     * الطريقة القديمة كانت تمر على كل الحسابات لكل عقدة لإيجاد أبنائها.
     */
    private function buildTreeWithMappingsFast(array $accounts): array
    {
        $byParent = [];
        foreach ($accounts as $account) {
            $parentKey = $account->parent_id ?? 'root';
            $byParent[$parentKey][] = $account;
        }

        return $this->buildBranch($byParent, 'root');
    }

    private function buildBranch(array &$byParent, $parentKey): array
    {
        if (! isset($byParent[$parentKey])) {
            return [];
        }
        $nodes = [];
        foreach ($byParent[$parentKey] as $account) {
            $node = $this->accountWithMappings($account);
            $node['children'] = $this->buildBranch($byParent, $account->id);
            $nodes[] = $node;
        }

        return $nodes;
    }

    private function syncAccountMappings(Account $account, array $branchIds, array $costCenterIds, array $userIds): void
    {
        $account->branches()->sync($branchIds);
        $account->costCenters()->sync($costCenterIds);
        $account->allowedUsers()->sync($userIds);
    }

    private function accountWithMappings(Account $account): array
    {
        $arr = $account->toArray();
        $arr['branch_ids'] = $account->branches->pluck('id')->values()->all();
        $arr['cost_center_ids'] = $account->costCenters->pluck('id')->values()->all();
        $arr['user_ids'] = $account->allowedUsers->pluck('id')->values()->all();

        return $arr;
    }

    /** الحسابات الظاهرة للمستخدم: إذا الحساب له مستخدمون محددون، يظهر فقط لهؤلاء؛ وإلا يظهر للجميع. */
    private function visibleAccountIdsForUser($accounts, int $userId): \Illuminate\Support\Collection
    {
        $collection = $accounts instanceof \Illuminate\Support\Collection ? $accounts : collect($accounts);

        return $collection->filter(function (Account $a) use ($userId) {
            $allowed = $a->allowedUsers->pluck('id');
            if ($allowed->isEmpty()) {
                return true;
            }

            return $allowed->contains($userId);
        })->pluck('id');
    }
}
