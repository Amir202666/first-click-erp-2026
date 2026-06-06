<?php

namespace App\Services;

use App\Enums\AccountType;
use App\Models\Account;
use App\Models\JournalEntryLine;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class AccountService
{
    public function create(int $tenantId, array $data): Account
    {
        return DB::transaction(function () use ($tenantId, $data) {
            $parent = ! empty($data['parent_id'])
                ? Account::where('tenant_id', $tenantId)->findOrFail($data['parent_id'])
                : null;

            $code = trim((string) ($data['code'] ?? ''));
            if ($code === '') {
                $code = $this->generateCode($tenantId, $parent);
            }

            if (Account::where('tenant_id', $tenantId)->where('code', $code)->exists()) {
                throw new \InvalidArgumentException("الكود {$code} مستخدم مسبقاً");
            }

            $type = $data['type'] ?? $parent?->type ?? AccountType::Asset->value;
            $isGroup = (bool) ($data['is_group'] ?? false);
            $isPostable = array_key_exists('is_postable', $data)
                ? (bool) $data['is_postable']
                : ! $isGroup;

            $level = $parent ? $parent->level + 1 : 1;
            $path = $parent ? $parent->path.'/'.$code : $code;

            $account = Account::create([
                'tenant_id' => $tenantId,
                'parent_id' => $parent?->id,
                'code' => $code,
                'name' => $data['name'],
                'name_en' => $data['name_en'] ?? null,
                'type' => $type,
                'normal_balance' => $data['normal_balance'] ?? $this->defaultNormalBalance($type),
                'description' => $data['description'] ?? $data['notes'] ?? null,
                'level' => $level,
                'path' => $path,
                'is_group' => $isGroup,
                'is_postable' => $isPostable,
                'allow_manual_entry' => $isPostable,
                'is_system' => (bool) ($data['is_system'] ?? false),
                'is_active' => (bool) ($data['is_active'] ?? true),
                'currency' => $data['currency'] ?? $data['currency_code'] ?? 'SAR',
                'opening_balance' => $data['opening_balance'] ?? 0,
                'sort_order' => (int) ($data['sort_order'] ?? 0),
            ]);

            if ($parent && $parent->is_postable) {
                $parent->update([
                    'is_group' => true,
                    'is_postable' => false,
                    'allow_manual_entry' => false,
                ]);
            }

            $fresh = $account->fresh();

            app(VendorChartSyncService::class)->ensureVendorForAccount($fresh);

            return $fresh;
        });
    }

    public function moveAccount(Account $account, Account $newParent): Account
    {
        if (! $account->canMoveTo($newParent)) {
            throw new \InvalidArgumentException('لا يمكن نقل الحساب لهذا الموقع');
        }

        return DB::transaction(function () use ($account, $newParent) {
            $oldParentId = $account->parent_id;
            $oldPath = $account->path ?? $account->code;
            $newPath = ($newParent->path ?? $newParent->code).'/'.$account->code;

            $account->update([
                'parent_id' => $newParent->id,
                'level' => $newParent->level + 1,
                'path' => $newPath,
                'type' => $newParent->type,
            ]);

            $this->updateChildrenPaths($account->tenant_id, $oldPath, $newPath, $newParent->level + 1, $newParent->type);

            if ($newParent->is_postable) {
                $newParent->update([
                    'is_group' => true,
                    'is_postable' => false,
                    'allow_manual_entry' => false,
                ]);
            }

            if ($oldParentId && ! Account::where('tenant_id', $account->tenant_id)->where('parent_id', $oldParentId)->exists()) {
                Account::where('id', $oldParentId)->update([
                    'is_postable' => true,
                    'is_group' => false,
                    'allow_manual_entry' => true,
                ]);
            }

            return $account->fresh();
        });
    }

    public function reparentAccount(Account $account, ?Account $newParent): Account
    {
        if ($newParent === null) {
            if ($account->parent_id === null) {
                return $account->fresh();
            }

            if ($account->is_system) {
                throw new \InvalidArgumentException('لا يمكن نقل حسابات النظام');
            }

            return DB::transaction(function () use ($account) {
                $oldParentId = $account->parent_id;
                $oldPath = $account->path ?? $account->code;
                $newPath = $account->code;

                $account->update([
                    'parent_id' => null,
                    'level' => 1,
                    'path' => $newPath,
                ]);

                $this->updateChildrenPaths($account->tenant_id, $oldPath, $newPath, 1, $account->type);

                if ($oldParentId && ! Account::where('tenant_id', $account->tenant_id)->where('parent_id', $oldParentId)->exists()) {
                    Account::where('id', $oldParentId)->update([
                        'is_postable' => true,
                        'is_group' => false,
                        'allow_manual_entry' => true,
                    ]);
                }

                return $account->fresh();
            });
        }

        return $this->moveAccount($account, $newParent);
    }

    public function generateCode(int $tenantId, ?Account $parent): string
    {
        if (! $parent) {
            $last = Account::where('tenant_id', $tenantId)
                ->whereNull('parent_id')
                ->orderByRaw('LENGTH(code) DESC')
                ->orderByDesc('code')
                ->value('code');

            return $last && is_numeric($last) ? (string) ((int) $last + 1) : '1';
        }

        $parentCode = $parent->code;
        $lastChild = Account::where('tenant_id', $tenantId)
            ->where('parent_id', $parent->id)
            ->orderByRaw('LENGTH(code) DESC')
            ->orderByDesc('code')
            ->value('code');

        if (! $lastChild) {
            return $parentCode.'1';
        }

        $suffix = substr($lastChild, strlen($parentCode));
        $num = is_numeric($suffix) ? (int) $suffix : 0;

        return $parentCode.($num + 1);
    }

    public function getTree(int $tenantId, ?string $type = null): array
    {
        $query = Account::where('tenant_id', $tenantId)
            ->orderBy('sort_order')
            ->orderBy('code');

        if ($type) {
            $query->where('type', $type);
        }

        $accounts = $query->get();
        $byParent = [];
        foreach ($accounts as $account) {
            $key = $account->parent_id ?? 'root';
            $byParent[$key][] = $account;
        }

        return $this->buildTreeBranch($byParent, 'root');
    }

    public function search(int $tenantId, string $query, int $limit = 50): Collection
    {
        $q = trim($query);
        if ($q === '') {
            return collect();
        }

        return Account::where('tenant_id', $tenantId)
            ->where(function ($builder) use ($q) {
                $builder->where('name', 'like', "%{$q}%")
                    ->orWhere('name_en', 'like', "%{$q}%")
                    ->orWhere('code', 'like', "%{$q}%")
                    ->orWhere('path', 'like', "%{$q}%");
            })
            ->orderBy('code')
            ->limit($limit)
            ->get();
    }

    public function delete(Account $account): void
    {
        if ($account->is_system) {
            throw new \InvalidArgumentException('لا يمكن حذف حسابات النظام');
        }

        if ($account->children()->exists()) {
            throw new \InvalidArgumentException('لا يمكن حذف حساب له أبناء');
        }

        if (JournalEntryLine::where('account_id', $account->id)->exists()) {
            throw new \InvalidArgumentException('لا يمكن حذف حساب له قيود محاسبية');
        }

        $parentId = $account->parent_id;
        $tenantId = $account->tenant_id;
        $account->delete();

        if ($parentId && ! Account::where('tenant_id', $tenantId)->where('parent_id', $parentId)->exists()) {
            Account::where('id', $parentId)->update([
                'is_postable' => true,
                'is_group' => false,
                'allow_manual_entry' => true,
            ]);
        }
    }

    public function reCodeAll(int $tenantId): void
    {
        DB::transaction(function () use ($tenantId) {
            $roots = Account::where('tenant_id', $tenantId)
                ->whereNull('parent_id')
                ->orderBy('sort_order')
                ->orderBy('code')
                ->get();

            $counter = 1;
            foreach ($roots as $root) {
                $this->reCodeBranch($root, (string) $counter, null, 1);
                $counter++;
            }
        });
    }

    public function backfillPaths(int $tenantId): void
    {
        $accounts = Account::where('tenant_id', $tenantId)->orderBy('level')->orderBy('code')->get();
        $byId = $accounts->keyBy('id');

        foreach ($accounts as $account) {
            $path = $this->resolvePath($account, $byId);
            $hasChildren = $accounts->contains(fn (Account $a) => $a->parent_id === $account->id);
            $account->update([
                'path' => $path,
                'is_group' => $hasChildren || ! $account->is_postable,
            ]);
        }
    }

    private function reCodeBranch(Account $account, string $newCode, ?string $parentPath, int $level): void
    {
        $newPath = $parentPath ? $parentPath.'/'.$newCode : $newCode;

        $account->update([
            'code' => $newCode,
            'path' => $newPath,
            'level' => $level,
        ]);

        $children = $account->children()->orderBy('sort_order')->orderBy('code')->get();
        $i = 1;
        foreach ($children as $child) {
            $childCode = $newCode.$i;
            $this->reCodeBranch($child, $childCode, $newPath, $level + 1);
            $i++;
        }
    }

    private function updateChildrenPaths(
        int $tenantId,
        string $oldPath,
        string $newPath,
        int $baseLevel,
        string $type
    ): void {
        Account::where('tenant_id', $tenantId)
            ->where('path', 'like', $oldPath.'/%')
            ->orderBy('level')
            ->each(function (Account $child) use ($oldPath, $newPath, $baseLevel, $type) {
                $suffix = substr((string) $child->path, strlen($oldPath));
                $newChildPath = $newPath.$suffix;
                $depth = substr_count(trim($suffix, '/'), '/') + 1;
                $child->update([
                    'path' => $newChildPath,
                    'level' => $baseLevel + $depth,
                    'type' => $type,
                ]);
            });
    }

    private function buildTreeBranch(array $byParent, string|int $parentKey): array
    {
        if (! isset($byParent[$parentKey])) {
            return [];
        }

        $nodes = [];
        foreach ($byParent[$parentKey] as $account) {
            $node = $account->toArray();
            $node['allow_transactions'] = $account->is_postable;
            $node['children'] = $this->buildTreeBranch($byParent, $account->id);
            $nodes[] = $node;
        }

        return $nodes;
    }

    private function resolvePath(Account $account, Collection $byId): string
    {
        $segments = [$account->code];
        $parentId = $account->parent_id;

        while ($parentId && $byId->has($parentId)) {
            $parent = $byId->get($parentId);
            array_unshift($segments, $parent->code);
            $parentId = $parent->parent_id;
        }

        return implode('/', $segments);
    }

    private function defaultNormalBalance(string $type): string
    {
        try {
            return AccountType::from($type)->normalBalance();
        } catch (\ValueError) {
            return in_array($type, ['asset', 'expense', 'cogs'], true) ? 'debit' : 'credit';
        }
    }
}
