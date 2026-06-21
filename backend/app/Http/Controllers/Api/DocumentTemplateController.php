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
     * استيراد قالب من JSON (مثل تصدير أنظمة أخرى) إلى صيغة القالب المستخدمة في النظام.
     * يقبل النص الخام: إما base64 لمحتوى JSON أو نص JSON مباشرة.
     * لا يُستخدم unserialize() — تجنباً لثغرات إلغاء التسلسل في PHP.
     */
    public function convertPhpSerialized(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'content' => 'required|string|max:500000',
        ]);
        $raw = trim($validated['content']);

        $data = $this->decodeTemplateImportPayload($raw);

        if (! is_array($data)) {
            return response()->json(['message' => 'المحتوى ليس قالباً بصيغة JSON صالحة.'], 422);
        }

        $allowedKeys = ['title', 'name', 'type', 'html', 'config', 'labels', 'module'];
        $data = array_intersect_key($data, array_flip($allowedKeys));

        $title = $data['title'] ?? $data['name'] ?? 'قالب مستورد';
        if (! is_string($title) || $title === '') {
            $title = 'قالب مستورد';
        }
        $title = mb_substr($title, 0, 150);

        $type = $data['type'] ?? 'sales';
        if (! is_string($type)) {
            $type = 'sales';
        }
        $docType = $type === 'sales' ? 'invoice' : $type;
        if (! is_string($docType) || strlen($docType) > 50) {
            return response()->json(['message' => 'نوع المستند غير صالح.'], 422);
        }

        $html = $data['html'] ?? '';
        if (! is_string($html)) {
            return response()->json(['message' => 'محتوى HTML غير صالح.'], 422);
        }

        $config = isset($data['config']) ? (is_string($data['config']) ? json_decode($data['config'], true) : $data['config']) : null;
        $labels = isset($data['labels']) ? (is_string($data['labels']) ? json_decode($data['labels'], true) : $data['labels']) : null;
        if ($config !== null && ! is_array($config)) {
            return response()->json(['message' => 'حقل config يجب أن يكون JSON صالحاً.'], 422);
        }
        if ($labels !== null && ! is_array($labels)) {
            return response()->json(['message' => 'حقل labels يجب أن يكون JSON صالحاً.'], 422);
        }

        $meta = array_filter([
            'imported_from' => 'json',
            'module' => is_string($data['module'] ?? null) ? $data['module'] : null,
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

    /**
     * @return array<string, mixed>|null
     */
    private function decodeTemplateImportPayload(string $raw): ?array
    {
        if ($raw === '') {
            return null;
        }

        if (preg_match('/^[A-Za-z0-9+\/=]+\s*$/', $raw) && strlen($raw) > 20) {
            $decoded = base64_decode($raw, true);
            if ($decoded !== false) {
                $data = json_decode($decoded, true);
                if (is_array($data)) {
                    return $data;
                }
            }
        }

        $data = json_decode($raw, true);

        return is_array($data) ? $data : null;
    }
}
