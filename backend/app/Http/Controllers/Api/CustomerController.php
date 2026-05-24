<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Installment;
use App\Models\JournalEntryLine;
use App\Models\TenantAccountDefault;
use App\Support\PartySearchTerms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerController extends Controller
{
    /**
     * عند تمرير branch_id: يظهر العميل إن لم يُقيّد بفروع أو كان مرتبطاً بهذا الفرع.
     */
    public function index(Request $request): JsonResponse
    {
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;

        $customers = Customer::where('tenant_id', $request->tenant_id)
            ->with(['account', 'customerGroup', 'pricingGroup', 'branches:id,name,name_en'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $raw = trim((string) $request->search);
                if ($raw === '') {
                    return;
                }
                PartySearchTerms::applyCustomerColumns($q, $raw);
            })
            ->when($request->has('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->when($branchId !== null, function ($q) use ($branchId) {
                $q->where(function ($w) use ($branchId) {
                    $w->whereDoesntHave('branches')
                        ->orWhereHas('branches', fn ($b) => $b->where('branches.id', $branchId));
                });
            })
            ->orderBy('name')
            ->paginate($request->per_page ?? 20);

        return response()->json($customers);
    }

    /**
     * بحث عملاء لرأس جدول الفواتير: جسم JSON (UTF-8) يتفادى مشاكل ترميز العربية في query string.
     */
    public function partySearch(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => 'required|string|min:1|max:200',
            'per_page' => 'sometimes|integer|min:1|max:100',
        ]);

        $raw = trim($validated['q']);
        $perPage = (int) ($validated['per_page'] ?? 30);
        $perPage = $perPage < 1 ? 30 : min($perPage, 100);

        $query = Customer::where('tenant_id', $request->tenant_id)
            ->with(['account', 'customerGroup', 'pricingGroup', 'branches:id,name,name_en']);

        PartySearchTerms::applyCustomerColumns($query, $raw);

        $customers = $query
            ->where('is_active', true)
            ->orderBy('name')
            ->paginate($perPage);

        return response()->json($customers);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => 'nullable|string|max:20',
            'name' => 'required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'company_name' => 'nullable|string|max:255',
            'tax_number' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'country' => 'nullable|string|max:100',
            'city' => 'nullable|string|max:100',
            'email' => 'nullable|email',
            'phone' => 'nullable|string|max:30',
            'country_code' => 'nullable|string|max:10',
            'account_id' => 'nullable|exists:accounts,id',
            'customer_group_id' => 'nullable|exists:customer_groups,id',
            'pricing_group_id' => 'nullable|exists:pricing_groups,id',
            'auto_create_account' => 'nullable|boolean',
            'payment_terms' => 'nullable|string',
            'credit_limit' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|max:3',
            'contacts' => 'nullable|array',
            'notes' => 'nullable|string',
            'all_branches' => 'nullable|boolean',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => 'integer|exists:branches,id',
        ]);

        $validated['tenant_id'] = $request->tenant_id;
        $allBranches = $request->boolean('all_branches', true);
        $branchIds = $request->input('branch_ids', []);
        unset($validated['all_branches'], $validated['branch_ids']);

        if (! $allBranches && (! is_array($branchIds) || count($branchIds) < 1)) {
            return response()->json([
                'message' => 'يجب اختيار فرع واحد على الأقل عند تقييد العميل بفروع محددة.',
            ], 422);
        }

        // توليد الكود تلقائياً إذا لم يُرسل
        if (empty(trim($validated['code'] ?? ''))) {
            $maxCode = Customer::where('tenant_id', $request->tenant_id)
                ->selectRaw("MAX(CAST(COALESCE(NULLIF(TRIM(code),''),'0') AS UNSIGNED)) as m")
                ->value('m');
            $validated['code'] = (string) (($maxCode ?? 0) + 1);
        }

        $customer = DB::transaction(function () use ($validated, $request) {
            $autoCreate = $validated['auto_create_account'] ?? true;
            unset($validated['auto_create_account']);

            if ($autoCreate && empty($validated['account_id'])) {
                // حدد حساب العملاء الأب من إعدادات الحسابات الأساسية (customers_account_id)
                $defaults = TenantAccountDefault::firstOrCreate(
                    ['tenant_id' => $request->tenant_id],
                    array_fill_keys(TenantAccountDefault::requiredKeysForOperations(), null)
                );

                $parentAccount = null;
                if ($defaults->customers_account_id) {
                    $parentAccount = Account::where('tenant_id', $request->tenant_id)
                        ->where('id', $defaults->customers_account_id)
                        ->first();
                }

                // في حال لم يتم ضبط الإعدادات بعد، نرجع للاعتماد على كود ثابت قديم (إن وجد)
                if (! $parentAccount) {
                    $parentAccount = Account::where('tenant_id', $request->tenant_id)
                        ->where('code', '113')
                        ->first();
                }

                if ($parentAccount) {
                    $lastChild = Account::where('tenant_id', $request->tenant_id)
                        ->where('parent_id', $parentAccount->id)
                        ->orderByRaw('CAST(code AS INTEGER) DESC')
                        ->first();

                    $nextCode = $lastChild
                        ? (string) ((int) $lastChild->code + 1)
                        : $parentAccount->code.'01';

                    $account = Account::create([
                        'tenant_id' => $request->tenant_id,
                        'parent_id' => $parentAccount->id,
                        'code' => $nextCode,
                        'name' => $validated['name'],
                        'name_en' => $validated['name_en'] ?? null,
                        'type' => 'asset',
                        'level' => $parentAccount->level + 1,
                        'is_active' => true,
                    ]);

                    $validated['account_id'] = $account->id;
                }
            }

            return Customer::create($validated);
        });

        $this->syncCustomerBranches($customer, $request->tenant_id, $allBranches, is_array($branchIds) ? $branchIds : []);

        return response()->json($customer->load(['account', 'customerGroup', 'branches:id,name,name_en']), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $customer = Customer::where('tenant_id', $request->tenant_id)
            ->with(['account', 'customerGroup', 'pricingGroup', 'branches:id,name,name_en'])
            ->findOrFail($id);

        return response()->json($customer);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $customer = Customer::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'code' => 'nullable|string|max:20',
            'name' => 'sometimes|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'company_name' => 'nullable|string|max:255',
            'tax_number' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'country' => 'nullable|string|max:100',
            'city' => 'nullable|string|max:100',
            'email' => 'nullable|email',
            'phone' => 'nullable|string|max:30',
            'country_code' => 'nullable|string|max:10',
            'account_id' => 'nullable|exists:accounts,id',
            'customer_group_id' => 'nullable|exists:customer_groups,id',
            'pricing_group_id' => 'nullable|exists:pricing_groups,id',
            'payment_terms' => 'nullable|string',
            'credit_limit' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|max:3',
            'contacts' => 'nullable|array',
            'notes' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
            'all_branches' => 'nullable|boolean',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => 'integer|exists:branches,id',
        ]);

        $allBranches = null;
        $branchIds = null;
        if ($request->has('all_branches') || $request->has('branch_ids')) {
            $allBranches = $request->boolean('all_branches', true);
            $branchIds = $request->input('branch_ids', []);
            unset($validated['all_branches'], $validated['branch_ids']);
            if ($allBranches === false && (! is_array($branchIds) || count($branchIds) < 1)) {
                return response()->json([
                    'message' => 'يجب اختيار فرع واحد على الأقل عند تقييد العميل بفروع محددة.',
                ], 422);
            }
        }

        $customer->update($validated);

        if ($allBranches !== null) {
            $this->syncCustomerBranches($customer, $request->tenant_id, $allBranches, is_array($branchIds) ? $branchIds : []);
        }

        return response()->json($customer->load(['account', 'customerGroup', 'pricingGroup', 'branches:id,name,name_en']));
    }

    /**
     * @param  array<int, int|string>  $branchIds
     */
    private function syncCustomerBranches(Customer $customer, int $tenantId, bool $allBranches, array $branchIds): void
    {
        if ($allBranches || count($branchIds) === 0) {
            $customer->branches()->detach();

            return;
        }

        $ids = array_values(array_unique(array_map('intval', $branchIds)));
        $allowed = Branch::where('tenant_id', $tenantId)->whereIn('id', $ids)->pluck('id')->all();
        $customer->branches()->sync($allowed);
    }

    /**
     * حذف العميل: يُمنع إذا وُجدت عليه أي حركة (فواتير، مدفوعات، أقساط، أو قيود على حسابه).
     * إن لم توجد حركات يُحذف العميل ثم الحساب المرتبط به في دليل الحسابات إن وُجد.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $customer = Customer::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $hasInvoices = $customer->invoices()->exists();
        $hasPayments = $customer->payments()->exists();
        $hasInstallments = Installment::where('customer_id', $customer->id)->exists();
        $hasAccountMovements = false;
        if ($customer->account_id) {
            $hasAccountMovements = JournalEntryLine::where('account_id', $customer->account_id)->exists();
        }

        if ($hasInvoices || $hasPayments || $hasInstallments || $hasAccountMovements) {
            $reasons = array_filter([
                $hasInvoices ? 'فواتير' : null,
                $hasPayments ? 'مدفوعات' : null,
                $hasInstallments ? 'أقساط' : null,
                $hasAccountMovements ? 'قيود على حسابه' : null,
            ]);
            $message = 'لا يمكن حذف العميل لأنه تمت عليه حركات في النظام ('.implode('، ', $reasons).'). يرجى عدم الحذف أو استخدام عميل غير نشط.';

            return response()->json([
                'message' => $message,
                'has_movements' => true,
            ], 422);
        }

        $accountId = $customer->account_id;
        $customer->delete();

        if ($accountId) {
            Account::where('tenant_id', $request->tenant_id)->where('id', $accountId)->delete();
        }

        return response()->json(['message' => 'تم حذف العميل والحساب المرتبط به بنجاح']);
    }
}
