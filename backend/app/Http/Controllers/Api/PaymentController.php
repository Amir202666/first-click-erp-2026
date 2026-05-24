<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Payment;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PaymentController extends Controller
{
    public function __construct(
        private PaymentService $paymentService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $payments = Payment::where('tenant_id', $request->tenant_id)
            ->when($request->filled('invoice_id'), fn ($q) => $q->where('invoice_id', $request->invoice_id))
            ->when($request->filled('status'), function ($q) use ($request) {
                $statuses = array_map('trim', explode(',', $request->status));
                $q->whereIn('status', $statuses);
            })
            ->when($request->type, fn ($q, $t) => $q->where('type', $t))
            ->when($request->customer_id, fn ($q, $c) => $q->where('customer_id', $c))
            ->when($request->vendor_id, fn ($q, $v) => $q->where('vendor_id', $v))
            ->when($request->from_date, fn ($q) => $q->whereDate('date', '>=', $request->from_date))
            ->when($request->to_date, fn ($q) => $q->whereDate('date', '<=', $request->to_date))
            ->when($request->filled('number'), fn ($q) => $q->where('number', 'like', '%'.$request->number.'%'))
            ->when($request->filled('payment_method_id'), fn ($q) => $q->where('payment_method_id', $request->payment_method_id))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', $request->branch_id))
            ->when($request->filled('cost_center_id'), fn ($q) => $q->where('cost_center_id', $request->cost_center_id))
            ->when($request->filled('counterpart_account_id'), fn ($q) => $q->where('counterpart_account_id', $request->counterpart_account_id))
            ->when($request->filled('cash_bank_account_id'), fn ($q) => $q->where('cash_bank_account_id', $request->cash_bank_account_id))
            ->when($request->filled('created_by'), fn ($q) => $q->where('created_by', $request->created_by))
            ->with([
                'customer',
                'vendor',
                'branch',
                'costCenter',
                'cashBankAccount',
                'counterpartAccount',
                'paymentMethodRelation.linkedAccount',
                'invoice',
                'createdBy',
                'journalEntry.lines.account',
            ])
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->paginate($request->per_page ?? 20);

        return response()->json($payments);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => 'required|in:receipt,payment,transfer,refund',
            'date' => 'required|date',
            'amount' => 'required|numeric|min:0.01',
            'currency' => 'nullable|string|max:3',
            'payment_method' => 'nullable|in:cash,bank,card,check',
            'payment_method_id' => [
                'nullable',
                'integer',
                function ($attr, $value, $fail) use ($request) {
                    if (empty($value)) {
                        return;
                    }
                    if (! \App\Models\PaymentMethod::where('tenant_id', $request->tenant_id)->where('id', $value)->exists()) {
                        $fail(__('طريقة الدفع المحددة غير موجودة أو لا تتبع الشركة الحالية.'));
                    }
                },
            ],
            'reference' => 'nullable|string',
            'sales_rep_id' => 'nullable|exists:sales_reps,id',
            'invoice_id' => [
                'nullable',
                'integer',
                function ($attr, $value, $fail) use ($request) {
                    if (empty($value)) {
                        return;
                    }
                    if (! Invoice::where('tenant_id', $request->tenant_id)->where('id', $value)->exists()) {
                        $fail(__('الفاتورة المحددة غير موجودة أو لا تتبع الشركة الحالية.'));
                    }
                },
            ],
            'customer_id' => 'nullable|exists:customers,id',
            'vendor_id' => 'nullable|exists:vendors,id',
            'branch_id' => 'nullable|exists:branches,id',
            'cost_center_id' => 'nullable|exists:cost_centers,id',
            'cash_bank_account_id' => [
                'nullable',
                'integer',
                function ($attr, $value, $fail) use ($request) {
                    if (empty($value)) {
                        return;
                    }
                    $acc = \App\Models\Account::where('tenant_id', $request->tenant_id)->where('id', $value)->first();
                    if (! $acc) {
                        $fail(__('الحساب المحدد غير موجود أو لا يتبع الشركة الحالية.'));

                        return;
                    }
                    if (! $acc->is_active) {
                        $fail(__('الحساب غير نشط ولا يمكن استخدامه في حركات جديدة.'));
                    }
                },
            ],
            'counterpart_account_id' => [
                'nullable',
                'integer',
                function ($attr, $value, $fail) use ($request) {
                    if (empty($value)) {
                        return;
                    }
                    $acc = \App\Models\Account::where('tenant_id', $request->tenant_id)->where('id', $value)->first();
                    if (! $acc) {
                        $fail(__('الحساب المحدد غير موجود أو لا يتبع الشركة الحالية.'));

                        return;
                    }
                    if (! $acc->is_active) {
                        $fail(__('الحساب غير نشط ولا يمكن استخدامه في حركات جديدة.'));
                    }
                },
            ],
            'notes' => 'nullable|string',
            'status' => 'nullable|in:draft,approved,posted',
        ]);

        $validated['tenant_id'] = $request->tenant_id;
        $validated['status'] = $validated['status'] ?? 'draft';
        if ($validated['status'] === 'posted') {
            $validated['status'] = 'approved';
        }
        $validated['created_by'] = $request->user()->id;

        if ($request->hasFile('attachment')) {
            $request->validate(['attachment' => 'file|mimes:jpeg,png,gif,webp,pdf|max:5120']);
            $path = $request->file('attachment')->store('payment-attachments/'.$request->tenant_id, 'public');
            $validated['attachment'] = $path;
        }

        $payment = $this->paymentService->createPayment($validated);

        return response()->json($payment, 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $payment = Payment::where('tenant_id', $request->tenant_id)
            ->with('customer', 'vendor', 'branch', 'costCenter', 'cashBankAccount', 'counterpartAccount', 'paymentMethodRelation.linkedAccount', 'journalEntry.lines.account', 'createdBy', 'invoice')
            ->findOrFail($id);

        return response()->json($payment);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $payment = Payment::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'date' => 'sometimes|date',
            'amount' => 'sometimes|numeric|min:0.01',
            'currency' => 'nullable|string|max:3',
            'payment_method' => 'nullable|in:cash,bank,card,check',
            'payment_method_id' => [
                'nullable',
                'integer',
                function ($attr, $value, $fail) use ($request) {
                    if (empty($value)) {
                        return;
                    }
                    if (! \App\Models\PaymentMethod::where('tenant_id', $request->tenant_id)->where('id', $value)->exists()) {
                        $fail(__('طريقة الدفع المحددة غير موجودة أو لا تتبع الشركة الحالية.'));
                    }
                },
            ],
            'reference' => 'nullable|string',
            'sales_rep_id' => 'nullable|exists:sales_reps,id',
            'branch_id' => 'nullable|exists:branches,id',
            'cost_center_id' => 'nullable|exists:cost_centers,id',
            'cash_bank_account_id' => [
                'nullable',
                'integer',
                function ($attr, $value, $fail) use ($request) {
                    if (empty($value)) {
                        return;
                    }
                    $acc = \App\Models\Account::where('tenant_id', $request->tenant_id)->where('id', $value)->first();
                    if (! $acc) {
                        $fail(__('الحساب المحدد غير موجود أو لا يتبع الشركة الحالية.'));

                        return;
                    }
                    if (! $acc->is_active) {
                        $fail(__('الحساب غير نشط ولا يمكن استخدامه في حركات جديدة.'));
                    }
                },
            ],
            'counterpart_account_id' => [
                'nullable',
                'integer',
                function ($attr, $value, $fail) use ($request) {
                    if (empty($value)) {
                        return;
                    }
                    $acc = \App\Models\Account::where('tenant_id', $request->tenant_id)->where('id', $value)->first();
                    if (! $acc) {
                        $fail(__('الحساب المحدد غير موجود أو لا يتبع الشركة الحالية.'));

                        return;
                    }
                    if (! $acc->is_active) {
                        $fail(__('الحساب غير نشط ولا يمكن استخدامه في حركات جديدة.'));
                    }
                },
            ],
            'notes' => 'nullable|string',
            'status' => 'sometimes|in:draft,approved,posted',
        ]);

        $payment = $this->paymentService->updatePayment($payment, $validated);

        return response()->json($payment);
    }

    /** اعتماد السند: ترحيل القيد المحاسبي (للسندات المسودة فقط) */
    public function approve(Request $request, int $id): JsonResponse
    {
        $payment = Payment::where('tenant_id', $request->tenant_id)->findOrFail($id);

        try {
            $payment = $this->paymentService->approvePayment($payment);

            return response()->json(['message' => 'تم اعتماد السند وترحيل القيد.', 'payment' => $payment]);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** رفع مرفق (إيصال تحويل / شيك) للسند */
    public function uploadAttachment(Request $request, int $id): JsonResponse
    {
        $payment = Payment::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $request->validate([
            'attachment' => 'required|file|mimes:jpeg,png,gif,webp,pdf|max:5120',
        ]);

        if ($payment->attachment) {
            Storage::disk('public')->delete($payment->attachment);
        }

        $path = $request->file('attachment')->store('payment-attachments/'.$request->tenant_id, 'public');
        $payment->update(['attachment' => $path]);

        return response()->json(['message' => 'تم رفع المرفق.', 'payment' => $payment->fresh()]);
    }

    /**
     * حذف السند (سند قبض/صرف).
     * يُحذف القيد المحاسبي المرتبط تلقائياً عبر booted() في موديل Payment.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $payment = Payment::where('tenant_id', $request->tenant_id)->findOrFail($id);

        \Illuminate\Support\Facades\DB::transaction(function () use ($payment) {
            $payment->delete();
        });

        return response()->json(['message' => 'تم حذف السند بنجاح']);
    }
}
