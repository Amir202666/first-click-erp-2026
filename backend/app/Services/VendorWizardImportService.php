<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Vendor;
use App\Models\VendorGroup;

class VendorWizardImportService
{
    /**
     * @param  array<int, array<string, mixed>>  $vendors
     * @return array{imported: int, skipped: int, accounts_opened: int, errors: array<int, array{row: int, name: string, reason: string}>}
     */
    public function import(
        int $tenantId,
        array $vendors,
        int $parentAccountId,
        bool $skipDuplicates,
        bool $updateExisting,
    ): array {
        $parentAccount = Account::where('tenant_id', $tenantId)->findOrFail($parentAccountId);

        $imported = 0;
        $skipped = 0;
        $accountsOpened = 0;
        $errors = [];

        foreach ($vendors as $index => $row) {
            $line = $index + 2;
            $name = trim((string) ($row['name'] ?? ''));

            try {
                if ($name === '') {
                    throw new \InvalidArgumentException('اسم المورد مطلوب');
                }

                $existing = Vendor::where('tenant_id', $tenantId)
                    ->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($name)])
                    ->first();

                if ($existing && $skipDuplicates && ! $updateExisting) {
                    $skipped++;

                    continue;
                }

                $payload = $this->mapRowToVendorPayload($tenantId, $row);

                if ($existing && $updateExisting) {
                    $vendor = $existing;
                    $vendor->fill($payload);
                    $vendor->save();

                    if ($vendor->account_id) {
                        Account::where('id', $vendor->account_id)->update([
                            'name' => $vendor->name,
                            'name_en' => $vendor->name_en,
                        ]);
                    }
                } else {
                    $accountCreated = false;
                    if (empty($payload['account_id'])) {
                        $account = $this->createVendorAccount(
                            $tenantId,
                            $parentAccount,
                            $payload['name'],
                            $payload['name_en'] ?? null,
                        );
                        $payload['account_id'] = $account->id;
                        $accountCreated = true;
                    }

                    if (empty($payload['code'])) {
                        $payload['code'] = $this->nextVendorCode($tenantId);
                    }

                    $payload['tenant_id'] = $tenantId;
                    $vendor = Vendor::create($payload);

                    if ($accountCreated) {
                        $accountsOpened++;
                    }
                }

                $imported++;
            } catch (\Throwable $e) {
                $errors[] = [
                    'row' => $line,
                    'name' => $name,
                    'reason' => $e->getMessage(),
                ];
            }
        }

        return compact('imported', 'skipped', 'accountsOpened', 'errors');
    }

    /** @param  array<string, mixed>  $row */
    private function mapRowToVendorPayload(int $tenantId, array $row): array
    {
        $payload = [
            'name' => trim((string) ($row['name'] ?? '')),
            'name_en' => $this->nullableString($row['name_en'] ?? null),
            'company_name' => $this->nullableString($row['company_name'] ?? null),
            'tax_number' => $this->nullableString($row['tax_number'] ?? null),
            'phone' => $this->nullableString($row['phone'] ?? ($row['mobile'] ?? null)),
            'email' => $this->nullableString($row['email'] ?? null),
            'address' => $this->nullableString($row['address'] ?? null),
            'city' => $this->nullableString($row['city'] ?? null),
            'country' => $this->nullableString($row['country'] ?? null),
            'country_code' => $this->nullableString($row['country_code'] ?? null),
            'currency' => $this->nullableString($row['currency'] ?? null),
            'notes' => $this->nullableString($row['notes'] ?? null),
            'is_active' => true,
        ];

        if (isset($row['payment_terms']) && $row['payment_terms'] !== '') {
            $payload['payment_terms'] = (string) $row['payment_terms'];
        }

        if (! empty($row['vendor_group_id'])) {
            $gid = (int) $row['vendor_group_id'];
            $ok = VendorGroup::where('tenant_id', $tenantId)->where('id', $gid)->exists();
            if (! $ok) {
                throw new \InvalidArgumentException('فئة المورد غير صحيحة');
            }
            $payload['vendor_group_id'] = $gid;
        }

        return array_filter(
            $payload,
            fn ($v) => $v !== null && $v !== '',
        );
    }

    private function nullableString(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $s = trim((string) $value);

        return $s === '' ? null : $s;
    }

    private function nextVendorCode(int $tenantId): string
    {
        $maxCode = Vendor::where('tenant_id', $tenantId)
            ->selectRaw("MAX(CAST(COALESCE(NULLIF(TRIM(code),''),'0') AS UNSIGNED)) as m")
            ->value('m');

        return (string) (($maxCode ?? 0) + 1);
    }

    private function createVendorAccount(
        int $tenantId,
        Account $parentAccount,
        string $name,
        ?string $nameEn,
    ): Account {
        $lastChild = Account::where('tenant_id', $tenantId)
            ->where('parent_id', $parentAccount->id)
            ->orderByRaw('CAST(code AS INTEGER) DESC')
            ->first();

        $nextCode = $lastChild
            ? (string) ((int) $lastChild->code + 1)
            : $parentAccount->code.'01';

        return Account::create([
            'tenant_id' => $tenantId,
            'parent_id' => $parentAccount->id,
            'code' => $nextCode,
            'name' => $name,
            'name_en' => $nameEn,
            'type' => 'liability',
            'level' => ($parentAccount->level ?? 0) + 1,
            'is_active' => true,
        ]);
    }
}
