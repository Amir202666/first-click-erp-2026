<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DocumentTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DocumentTemplateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $templates = DocumentTemplate::query()
            ->forTenant($tenantId)
            ->when($request->doc_type, fn ($q, $type) => $q->where('doc_type', $type))
            ->when($request->format, fn ($q, $format) => $q->where('format', $format))
            ->orderBy('name')
            ->get();

        return response()->json($templates);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $template = DocumentTemplate::forTenant($tenantId)->findOrFail($id);

        return response()->json($template);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'doc_type' => 'required|string|max:50',
            'format' => 'nullable|string|max:30',
            'content' => 'required|string',
            'is_active' => 'sometimes|boolean',
            'meta' => 'nullable|array',
        ]);

        $validated['tenant_id'] = $tenantId;
        $validated['format'] ??= 'a4';

        $template = DocumentTemplate::create($validated);

        return response()->json($template, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $template = DocumentTemplate::forTenant($tenantId)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:150',
            'doc_type' => 'sometimes|string|max:50',
            'format' => 'sometimes|string|max:30',
            'content' => 'sometimes|string',
            'is_active' => 'sometimes|boolean',
            'meta' => 'nullable|array',
        ]);

        $template->update($validated);

        return response()->json($template);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $template = DocumentTemplate::forTenant($tenantId)->findOrFail($id);

        if ($template->is_system) {
            return response()->json(['message' => 'لا يمكن حذف قالب نظامي'], 422);
        }

        $template->delete();

        return response()->json(['message' => 'تم الحذف بنجاح']);
    }

    /**
     * تحويل قالب من صيغة PHP المُسلسَلة (مثل تصدير أنظمة أخرى) إلى صيغة القالب المستخدمة في النظام.
     * يقبل النص الخام: إما base64 لمحتوى PHP serialized أو النص المُسلسَل مباشرة.
     */
    public function convertPhpSerialized(Request $request): JsonResponse
    {
        $request->validate([
            'content' => 'required|string',
        ]);
        $raw = $request->input('content');

        $data = null;
        if (preg_match('/^[A-Za-z0-9+\/=]+\s*$/', trim($raw)) && strlen(trim($raw)) > 20) {
            $decoded = base64_decode(trim($raw), true);
            if ($decoded !== false) {
                $data = @unserialize($decoded);
            }
        }
        if ($data === false || $data === null) {
            $data = @unserialize($raw);
        }

        if (! is_array($data)) {
            return response()->json(['message' => 'المحتوى ليس قالباً بصيغة PHP صالحة.'], 422);
        }

        $title = $data['title'] ?? $data['name'] ?? 'قالب مستورد';
        $type = $data['type'] ?? 'sales';
        $docType = $type === 'sales' ? 'invoice' : $type;
        $html = $data['html'] ?? '';
        $config = isset($data['config']) ? (is_string($data['config']) ? json_decode($data['config'], true) : $data['config']) : null;
        $labels = isset($data['labels']) ? (is_string($data['labels']) ? json_decode($data['labels'], true) : $data['labels']) : null;

        $meta = array_filter([
            'imported_from' => 'php_serialized',
            'module' => $data['module'] ?? null,
            'config' => $config,
            'labels' => $labels,
        ], fn ($v) => $v !== null);

        return response()->json([
            'name' => $title,
            'doc_type' => $docType,
            'format' => 'a4',
            'content' => $html,
            'meta' => $meta,
        ]);
    }
}
