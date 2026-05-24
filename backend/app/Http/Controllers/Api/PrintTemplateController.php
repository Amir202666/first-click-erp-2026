<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PrintTemplate;
use App\Services\PrintTemplateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PrintTemplateController extends Controller
{
    public function __construct(
        private readonly PrintTemplateService $printTemplateService
    ) {}

    private function allowedTypes(): array
    {
        return array_keys(PrintTemplate::TYPES);
    }

    /** GET /print-templates */
    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $type = $request->query('type');

        $query = PrintTemplate::query()
            ->forTenant($tenantId)
            ->orderBy('sort_order')
            ->orderBy('id');

        if ($type && in_array($type, $this->allowedTypes(), true)) {
            $query->where('document_type', $type);
        }

        return response()->json([
            'data' => $query->get(),
            'types' => PrintTemplate::TYPES,
            'paper_sizes' => PrintTemplate::PAPER_SIZES,
        ]);
    }

    /** GET /print-templates/{id} */
    public function show(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $template = PrintTemplate::forTenant($tenantId)->findOrFail($id);

        return response()->json(['data' => $template]);
    }

    /** POST /print-templates */
    public function store(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'document_type' => ['required', Rule::in($this->allowedTypes())],
            'paper_size' => ['required', Rule::in(array_keys(PrintTemplate::PAPER_SIZES))],
            'orientation' => ['nullable', Rule::in(['portrait', 'landscape'])],
            'margins' => 'nullable|array',
            'margins.top' => 'nullable|numeric',
            'margins.right' => 'nullable|numeric',
            'margins.bottom' => 'nullable|numeric',
            'margins.left' => 'nullable|numeric',
            'settings' => 'nullable|array',
            'sections' => 'nullable|array',
            'html_content' => 'nullable|string',
            'blocks_json' => 'nullable|string',
            'is_default' => 'sometimes|boolean',
            'sort_order' => 'nullable|integer',
        ]);

        $validated['tenant_id'] = $tenantId;
        $validated['orientation'] ??= 'portrait';
        $validated['margins'] ??= PrintTemplate::defaultMargins();
        $validated['is_default'] = (bool) ($validated['is_default'] ?? false);
        $validated['is_system'] = false;

        $template = PrintTemplate::create($validated);

        if ($template->is_default) {
            $this->clearDefaultExcept($tenantId, $template->document_type, $template->id);
        }

        return response()->json(['data' => $template, 'message' => 'تم إنشاء القالب'], 201);
    }

    /** PUT /print-templates/{id} */
    public function update(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $template = PrintTemplate::forTenant($tenantId)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:150',
            'paper_size' => ['sometimes', Rule::in(array_keys(PrintTemplate::PAPER_SIZES))],
            'orientation' => ['sometimes', Rule::in(['portrait', 'landscape'])],
            'margins' => 'nullable|array',
            'margins.top' => 'nullable|numeric',
            'margins.right' => 'nullable|numeric',
            'margins.bottom' => 'nullable|numeric',
            'margins.left' => 'nullable|numeric',
            'settings' => 'nullable|array',
            'sections' => 'nullable|array',
            'html_content' => 'nullable|string',
            'blocks_json' => 'nullable|string',
            'is_default' => 'sometimes|boolean',
            'sort_order' => 'nullable|integer',
        ]);

        if ($template->is_system && isset($validated['name'])) {
            unset($validated['name']);
        }

        $template->update($validated);

        if (array_key_exists('is_default', $validated) && $validated['is_default']) {
            $this->clearDefaultExcept($tenantId, $template->document_type, $template->id);
            $template->update(['is_default' => true]);
        }

        return response()->json(['data' => $template->fresh(), 'message' => 'تم تحديث القالب']);
    }

    /** DELETE /print-templates/{id} */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $template = PrintTemplate::forTenant($tenantId)->findOrFail($id);

        if ($template->is_system) {
            return response()->json(['message' => 'لا يمكن حذف قالب النظام'], 422);
        }

        if ($template->is_default) {
            $replacement = PrintTemplate::forTenant($tenantId)
                ->where('document_type', $template->document_type)
                ->where('id', '!=', $template->id)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->first();

            if (! $replacement) {
                return response()->json(['message' => 'لا يمكن حذف القالب الافتراضي الوحيد لهذا النوع'], 422);
            }

            $replacement->update(['is_default' => true]);
        }

        $template->delete();

        return response()->json(['message' => 'تم حذف القالب']);
    }

    /** PUT /print-templates/{id}/set-default */
    public function setDefault(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $template = PrintTemplate::forTenant($tenantId)->findOrFail($id);

        $this->clearDefaultExcept($tenantId, $template->document_type, $template->id);
        $template->update(['is_default' => true]);

        // جلب البيانات الطازجة مباشرة من الـ database بدلاً من الـ cache
        $fresh = PrintTemplate::forTenant($tenantId)->findOrFail($id);

        return response()->json(['data' => $fresh, 'message' => 'تم تعيين القالب الافتراضي']);
    }

    /** POST /print-templates/{id}/duplicate */
    public function duplicate(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $template = PrintTemplate::forTenant($tenantId)->findOrFail($id);

        $copy = $template->replicate();
        $copy->name = $template->name.' (نسخة)';
        $copy->is_default = false;
        $copy->is_system = false;
        $copy->save();

        return response()->json(['data' => $copy, 'message' => 'تم نسخ القالب'], 201);
    }

    /** GET /print-templates/default/{type} */
    public function getDefault(Request $request, string $type): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        if (! in_array($type, $this->allowedTypes(), true)) {
            return response()->json(['message' => 'نوع مستند غير معروف'], 404);
        }

        // جلب القالب الافتراضي مباشرة من الـ database
        $template = DB::table('print_templates')
            ->where('tenant_id', $tenantId)
            ->where('document_type', $type)
            ->where('is_default', true)
            ->orderBy('id', 'desc')
            ->limit(1)
            ->first();

        // تحويل لـ Eloquent model
        if ($template) {
            $template = PrintTemplate::find($template->id);
        }

        // إذا لم يوجد قالب افتراضي، جلب أول قالب من هذا النوع
        if (! $template) {
            $template = PrintTemplate::forTenant($tenantId)
                ->where('document_type', $type)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->first();
        }

        // تنظيف البيانات: تأكد من وجود قالب واحد فقط بـ is_default=true لهذا النوع
        if ($template && $template->is_default) {
            PrintTemplate::forTenant($tenantId)
                ->where('document_type', $type)
                ->where('is_default', true)
                ->where('id', '!=', $template->id)
                ->update(['is_default' => false]);
        }

        return response()->json(['data' => $template]);
    }

    /** POST /print-templates/seed */
    public function seedDefaults(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $this->printTemplateService->seedDefaultTemplates($tenantId);

        return response()->json(['message' => 'تم إنشاء القوالب الافتراضية']);
    }

    /** POST /print-templates/clear — حذف كل قوالب المستأجر */
    public function clearAll(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $n = $this->printTemplateService->clearAllTemplates($tenantId);

        return response()->json(['message' => 'تم حذف جميع القوالب', 'deleted' => $n]);
    }

    private function clearDefaultExcept(int $tenantId, string $documentType, int $keepId): void
    {
        PrintTemplate::forTenant($tenantId)
            ->where('document_type', $documentType)
            ->where('id', '!=', $keepId)
            ->update(['is_default' => false]);
    }
}
