<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Branch;
use App\Models\TenantAccountDefault;
use App\Models\Vendor;
use App\Models\VendorGroup;
use App\Services\VendorChartSyncService;
use App\Support\PartySearchTerms;
use App\Support\SqlHelper;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VendorController extends Controller
{
    public function __construct(private VendorChartSyncService $vendorChartSync) {}

    public function index(Request $request): JsonResponse
    {
        // حسابات الموردين في الدليل بدون سجل vendors → إنشاء الربط تلقائياً
        $this->vendorChartSync->syncMissingVendorsFromChart((int) $request->tenant_id);

        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;

        $vendors = Vendor::where('tenant_id', $request->tenant_id)
            ->with(['account', 'vendorGroup:id,tenant_id,name,name_en,is_active', 'branches:id,name,name_en'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $raw = trim((string) $request->search);
                if ($raw === '') {
                    return;
                }
                PartySearchTerms::applyVendorColumns($q, $raw);
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

        return response()->json($vendors);
    }

    /**
     * بحث موردين لرأس جدول الفواتير (جسم JSON UTF-8).
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

        $query = Vendor::where('tenant_id', $request->tenant_id)
            ->with(['account', 'vendorGroup:id,tenant_id,name,name_en,is_active', 'branches:id,name,name_en']);

        PartySearchTerms::applyVendorColumns($query, $raw);

        $vendors = $query
            ->where('is_active', true)
            ->orderBy('name')
            ->paginate($perPage);

        return response()->json($vendors);
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
            'vendor_group_id' => 'nullable|integer',
            'auto_create_account' => 'nullable|boolean',
            'payment_terms' => 'nullable|string',
            'currency' => 'nullable|string|max:3',
            'contacts' => 'nullable|array',
            'notes' => 'nullable|string',
            'all_branches' => 'nullable|boolean',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => 'integer|exists:branches,id',
        ]);

        $validated['tenant_id'] = $request->tenant_id;

        if (array_key_exists('vendor_group_id', $validated) && $validated['vendor_group_id']) {
            $gid = (int) $validated['vendor_group_id'];
            $ok = VendorGroup::where('tenant_id', $request->tenant_id)->where('id', $gid)->exists();
            if (! $ok) {
                return response()->json(['message' => 'فئة المورد غير صحيحة لهذه الشركة.'], 422);
            }
            $validated['vendor_group_id'] = $gid;
        } else {
            $validated['vendor_group_id'] = null;
        }

        $allBranches = $request->boolean('all_branches', true);
        $branchIds = $request->input('branch_ids', []);
        unset($validated['all_branches'], $validated['branch_ids']);

        if (! $allBranches && (! is_array($branchIds) || count($branchIds) < 1)) {
            return response()->json([
                'message' => 'يجب اختيار فرع واحد على الأقل عند تقييد المورد بفروع محددة.',
            ], 422);
        }

        $vendor = DB::transaction(function () use ($validated, $request) {
            $autoCreate = $validated['auto_create_account'] ?? true;
            unset($validated['auto_create_account']);

            if ($autoCreate && empty($validated['account_id'])) {
                $parentAccount = null;
                $defaults = TenantAccountDefault::where('tenant_id', $request->tenant_id)->first();
                if ($defaults && $defaults->vendors_account_id) {
                    $parentAccount = Account::where('tenant_id', $request->tenant_id)
                        ->find($defaults->vendors_account_id);
                }
                if (! $parentAccount) {
                    $parentAccount = Account::where('tenant_id', $request->tenant_id)
                        ->where('code', '211')
                        ->first();
                }

                if ($parentAccount) {
                    $lastChild = Account::where('tenant_id', $request->tenant_id)
                        ->where('parent_id', $parentAccount->id)
                        ->orderByRaw(SqlHelper::orderByNumericDesc('code'))
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
                        'type' => 'liability',
                        'level' => $parentAccount->level + 1,
                        'is_active' => true,
                    ]);

                    $validated['account_id'] = $account->id;
                }
            }

            return Vendor::create($validated);
        });

        $this->syncVendorBranches($vendor, $request->tenant_id, $allBranches, is_array($branchIds) ? $branchIds : []);

        return response()->json($vendor->load(['account', 'vendorGroup:id,tenant_id,name,name_en,is_active', 'branches:id,name,name_en']), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $vendor = Vendor::where('tenant_id', $request->tenant_id)
            ->with(['account', 'vendorGroup:id,tenant_id,name,name_en,is_active', 'branches:id,name,name_en'])
            ->findOrFail($id);

        return response()->json($vendor);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $vendor = Vendor::where('tenant_id', $request->tenant_id)->findOrFail($id);

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
            'vendor_group_id' => 'nullable|integer',
            'payment_terms' => 'nullable|string',
            'currency' => 'nullable|string|max:3',
            'contacts' => 'nullable|array',
            'notes' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
            'all_branches' => 'nullable|boolean',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => 'integer|exists:branches,id',
        ]);

        if (array_key_exists('vendor_group_id', $validated)) {
            if ($validated['vendor_group_id']) {
                $gid = (int) $validated['vendor_group_id'];
                $ok = VendorGroup::where('tenant_id', $request->tenant_id)->where('id', $gid)->exists();
                if (! $ok) {
                    return response()->json(['message' => 'فئة المورد غير صحيحة لهذه الشركة.'], 422);
                }
                $validated['vendor_group_id'] = $gid;
            } else {
                $validated['vendor_group_id'] = null;
            }
        }

        $allBranches = null;
        $branchIds = null;
        if ($request->has('all_branches') || $request->has('branch_ids')) {
            $allBranches = $request->boolean('all_branches', true);
            $branchIds = $request->input('branch_ids', []);
            unset($validated['all_branches'], $validated['branch_ids']);
            if ($allBranches === false && (! is_array($branchIds) || count($branchIds) < 1)) {
                return response()->json([
                    'message' => 'يجب اختيار فرع واحد على الأقل عند تقييد المورد بفروع محددة.',
                ], 422);
            }
        }

        $vendor->update($validated);

        if ($allBranches !== null) {
            $this->syncVendorBranches($vendor, $request->tenant_id, $allBranches, is_array($branchIds) ? $branchIds : []);
        }

        return response()->json($vendor->load(['account', 'vendorGroup:id,tenant_id,name,name_en,is_active', 'branches:id,name,name_en']));
    }

    /**
     * @param  array<int, int|string>  $branchIds
     */
    private function syncVendorBranches(Vendor $vendor, int $tenantId, bool $allBranches, array $branchIds): void
    {
        if ($allBranches || count($branchIds) === 0) {
            $vendor->branches()->detach();

            return;
        }

        $ids = array_values(array_unique(array_map('intval', $branchIds)));
        $allowed = Branch::where('tenant_id', $tenantId)->whereIn('id', $ids)->pluck('id')->all();
        $vendor->branches()->sync($allowed);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $vendor = Vendor::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($vendor->invoices()->exists()) {
            return response()->json(['message' => 'لا يمكن حذف مورد له فواتير'], 422);
        }

        $vendor->delete();

        return response()->json(['message' => 'تم الحذف بنجاح']);
    }
}
