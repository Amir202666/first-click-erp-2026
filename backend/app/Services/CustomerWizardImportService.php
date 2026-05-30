<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Customer;
use App\Support\SqlHelper;
use Illuminate\Support\Facades\DB;

class CustomerWizardImportService
{
    public function __construct(
        private AccountingService $accountingService,
        private TenantSettingsService $settings,
    ) {}

    /**
     * @param  array<int, array<string, mixed>>  $customers
     * @return array{imported: int, skipped: int, accounts_opened: int, errors: array<int, array{row: int, name: string, reason: string}>}
     */
    public function import(
        int $tenantId,
        array $customers,
        int $parentAccountId,
        bool $skipDuplicates,
        bool $updateExisting,
        bool $importOpeningBalance,
    ): array {
        $parentAccount = Account::where('tenant_id', $tenantId)->findOrFail($parentAccountId);

        $imported = 0;
        $skipped = 0;
        $accountsOpened = 0;
        $errors = [];

        foreach ($customers as $index => $row) {
            $line = $index + 2;
            $name = trim((string) ($row['name'] ?? ''));

            try {
                if ($name === '') {
                    throw new \InvalidArgumentException('اسم العميل مطلوب');
                }

                $existing = Customer::where('tenant_id', $tenantId)
                    ->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($name)])
                    ->first();

                if ($existing && $skipDuplicates && ! $updateExisting) {
                    $skipped++;

                    continue;
                }

                $payload = $this->mapRowToCustomerPayload($row);

                if ($existing && $updateExisting) {
                    $customer = $existing;
                    $customer->fill($payload);
                    $customer->save();

                    if ($customer->account_id) {
                        Account::where('id', $customer->account_id)->update([
                            'name' => $customer->name,
                        ]);
                    }
                } else {
                    $accountCreated = false;
                    if (empty($payload['account_id'])) {
                        $account = $this->createCustomerAccount($tenantId, $parentAccount, $payload['name']);
                        $payload['account_id'] = $account->id;
                        $accountCreated = true;
                    }

                    if (empty($payload['code'])) {
                        $payload['code'] = $this->nextCustomerCode($tenantId);
                    }

                    $payload['tenant_id'] = $tenantId;
                    $customer = Customer::create($payload);

                    if ($accountCreated) {
                        $accountsOpened++;
                    }
                }

                if ($importOpeningBalance && ! empty($row['opening_balance'])) {
                    $amount = (float) $row['opening_balance'];
                    if (abs($amount) >= 0.0001 && $customer->account_id) {
                        $this->createOpeningBalanceEntry(
                            $tenantId,
                            $customer,
                            $amount,
                            isset($row['opening_balance_date']) ? (string) $row['opening_balance_date'] : null,
                        );
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

        return [
            'imported' => $imported,
            'skipped' => $skipped,
            'accounts_opened' => $accountsOpened,
            'errors' => $errors,
        ];
    }

    /** @param  array<string, mixed>  $row */
    private function mapRowToCustomerPayload(array $row): array
    {
        $payload = [
            'name' => trim((string) ($row['name'] ?? '')),
            'company_name' => $this->nullableString($row['company_name'] ?? null),
            'tax_number' => $this->nullableString($row['tax_number'] ?? null),
            'phone' => $this->nullableString($row['phone'] ?? ($row['mobile'] ?? null)),
            'email' => $this->nullableString($row['email'] ?? null),
            'address' => $this->nullableString($row['address'] ?? null),
            'city' => $this->nullableString($row['city'] ?? null),
            'country' => $this->nullableString($row['country'] ?? null),
            'currency' => $this->nullableString($row['currency'] ?? null),
            'notes' => $this->nullableString($row['notes'] ?? null),
            'is_active' => true,
        ];

        if (isset($row['credit_limit']) && $row['credit_limit'] !== '') {
            $payload['credit_limit'] = (float) $row['credit_limit'];
        }

        if (isset($row['payment_terms']) && $row['payment_terms'] !== '') {
            $payload['payment_terms'] = (string) $row['payment_terms'];
        }

        if (! empty($row['customer_group_id'])) {
            $payload['customer_group_id'] = (int) $row['customer_group_id'];
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

    private function nextCustomerCode(int $tenantId): string
    {
        $maxCode = Customer::where('tenant_id', $tenantId)
            ->selectRaw("MAX(CAST(COALESCE(NULLIF(TRIM(code),''),'0') AS UNSIGNED)) as m")
            ->value('m');

        return (string) (($maxCode ?? 0) + 1);
    }

    private function createCustomerAccount(int $tenantId, Account $parentAccount, string $name): Account
    {
        $lastChild = Account::where('tenant_id', $tenantId)
            ->where('parent_id', $parentAccount->id)
            ->orderByRaw(SqlHelper::orderByNumericDesc('code'))
            ->first();

        $nextCode = $lastChild
            ? (string) ((int) $lastChild->code + 1)
            : $parentAccount->code.'01';

        return Account::create([
            'tenant_id' => $tenantId,
            'parent_id' => $parentAccount->id,
            'code' => $nextCode,
            'name' => $name,
            'type' => $parentAccount->type ?: 'asset',
            'level' => ($parentAccount->level ?? 0) + 1,
            'is_active' => true,
            'is_postable' => true,
        ]);
    }

    private function createOpeningBalanceEntry(
        int $tenantId,
        Customer $customer,
        float $amount,
        ?string $dateRaw,
    ): void {
        $offsetId = (int) $this->settings->get($tenantId, 'retained_earnings_account_id', 0);
        if ($offsetId < 1) {
            throw new \InvalidArgumentException('يرجى ضبط حساب الأرباح المحتجزة في إعدادات المحاسبة قبل استيراد الأرصدة الافتتاحية.');
        }

        $date = $dateRaw && strtotime($dateRaw) !== false
            ? date('Y-m-d', strtotime($dateRaw))
            : now()->toDateString();

        $abs = round(abs($amount), AccountingService::JOURNAL_AMOUNT_DECIMALS);
        if ($abs < 0.0001) {
            return;
        }

        $customerLine = [
            'account_id' => $customer->account_id,
            'debit' => $amount > 0 ? $abs : 0,
            'credit' => $amount < 0 ? $abs : 0,
            'description' => 'رصيد افتتاحي - '.$customer->name,
        ];

        $offsetLine = [
            'account_id' => $offsetId,
            'debit' => $amount < 0 ? $abs : 0,
            'credit' => $amount > 0 ? $abs : 0,
            'description' => 'رصيد افتتاحي - '.$customer->name,
        ];

        $this->accountingService->createJournalEntry([
            'tenant_id' => $tenantId,
            'date' => $date,
            'type' => 'opening',
            'description' => 'رصيد افتتاحي عميل - '.$customer->name,
            'customer_id' => $customer->id,
            'reference_type' => Customer::class,
            'reference_id' => $customer->id,
            'status' => 'posted',
            'posted_at' => now(),
            'created_by' => auth()->id(),
        ], [$customerLine, $offsetLine]);
    }
}
