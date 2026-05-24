<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\FiscalYear;
use App\Services\FiscalYearClosingService;
use App\Services\FiscalYearService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class FiscalYearController extends Controller
{
    public function __construct(
        private FiscalYearClosingService $closingService,
        private FiscalYearService $fiscalYearService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->closingService->ensureFiscalYearsExist((int) $request->tenant_id);

        $rows = FiscalYear::where('tenant_id', $request->tenant_id)
            ->orderByDesc('year')
            ->with([
                'closingJournalEntry:id,number,date',
                'openingJournalEntry:id,number,date',
                'retainedEarningsAccount:id,code,name',
            ])
            ->get();

        return response()->json($rows);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $fy = FiscalYear::where('tenant_id', $request->tenant_id)
            ->with(['closingJournalEntry.lines.account', 'closedBy:id,name'])
            ->findOrFail($id);

        return response()->json($fy);
    }

    /**
     * حسابات حقوق ملكية قابلة للترحيل لاختيار حساب ترحيل صافي الربح/الخسارة عند الإقفال.
     */
    public function equityAccounts(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $accounts = Account::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->where('is_postable', true)
            ->where('type', 'equity')
            ->orderBy('code')
            ->get(['id', 'code', 'name', 'type']);

        return response()->json(['data' => $accounts]);
    }

    public function preCloseChecks(Request $request, int $id): JsonResponse
    {
        $fy = FiscalYear::where('tenant_id', $request->tenant_id)->findOrFail($id);
        if ($fy->is_closed) {
            return response()->json(['message' => 'هذه السنة المالية مقفلة مسبقاً.'], 422);
        }

        $checks = $this->fiscalYearService->runPreCloseChecks((int) $request->tenant_id, $fy);

        return response()->json($checks);
    }

    public function previewClosingEntry(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'retained_earnings_account_id' => [
                'required',
                'integer',
                Rule::exists('accounts', 'id')->where(fn ($q) => $q->where('tenant_id', $request->tenant_id)),
            ],
        ]);

        $fy = FiscalYear::where('tenant_id', $request->tenant_id)->findOrFail($id);
        if ($fy->is_closed) {
            return response()->json(['message' => 'هذه السنة المالية مقفلة مسبقاً.'], 422);
        }

        try {
            $preview = $this->closingService->previewClosingEntry(
                $fy,
                (int) $validated['retained_earnings_account_id']
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($preview);
    }

    public function close(Request $request, int $id): JsonResponse
    {
        $fy = FiscalYear::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($fy->is_closed) {
            return response()->json(['message' => 'هذه السنة المالية مقفلة مسبقاً.'], 422);
        }

        $wizard = $request->has('confirmation');
        $retainedEarningsAccountIdForClose = null;

        if ($wizard) {
            $validated = $request->validate([
                'confirmation' => 'required|string',
                'retained_earnings_account_id' => [
                    'required',
                    'integer',
                    Rule::exists('accounts', 'id')->where(fn ($q) => $q->where('tenant_id', $request->tenant_id)),
                ],
                'confirmed_checks' => 'required|array|size:5',
                'confirmed_checks.*' => 'required|boolean',
                'archive_inventory' => 'sometimes|boolean',
            ]);

            foreach ($validated['confirmed_checks'] as $ok) {
                if ($ok !== true) {
                    return response()->json(['message' => 'يجب تأكيد جميع نقاط التحقق.'], 422);
                }
            }

            $expected = 'إقفال '.$fy->year;
            if ($validated['confirmation'] !== $expected) {
                return response()->json([
                    'message' => 'نص التأكيد غير صحيح. المطلوب: '.$expected,
                ], 422);
            }

            $checks = $this->fiscalYearService->runPreCloseChecks((int) $request->tenant_id, $fy);
            if (! ($checks['can_close'] ?? false)) {
                $parts = [];
                if (empty($checks['trial_balance']['is_balanced'])) {
                    $parts[] = 'ميزان المراجعة غير متوازن.';
                }
                if (empty($checks['journal_entries']['is_ok'])) {
                    $parts[] = 'يوجد قيود غير مرحّلة.';
                }

                return response()->json([
                    'message' => 'لا يمكن الإقفال: '.implode(' ', $parts),
                ], 422);
            }

            $retainedEarningsAccountIdForClose = (int) $validated['retained_earnings_account_id'];
        } else {
            $request->validate([
                'archive_inventory' => 'sometimes|boolean',
            ]);
        }

        $archiveInventory = (bool) ($request->input('archive_inventory', false));

        try {
            $result = $this->closingService->closeYear(
                $fy,
                (int) $request->user()->id,
                $archiveInventory,
                $retainedEarningsAccountIdForClose,
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $je = $result['closing_journal_entry'] ?? null;

        return response()->json([
            'message' => 'تم إقفال السنة المالية.',
            'closing_entry_id' => $je?->id,
            ...$result,
        ]);
    }

    public function setLock(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'locked' => 'required|boolean',
        ]);

        $fy = FiscalYear::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $fy = $this->closingService->setLocked($fy, $validated['locked'], (int) $request->user()->id);

        return response()->json([
            'message' => $validated['locked'] ? 'تم تفعيل قفل السنة المالية.' : 'تم إلغاء قفل السنة المالية.',
            'fiscal_year' => $fy,
        ]);
    }
}
