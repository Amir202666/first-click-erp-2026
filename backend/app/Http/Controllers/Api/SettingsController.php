<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Tenant;
use App\Models\Warehouse;
use App\Services\TenantSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * إعدادات الشريك (محاسبة، نقطة بيع، عام) - Key/Value مع كاش.
 */
class SettingsController extends Controller
{
    /** مفاتيح واجهة الفواتير — تُعاد دائماً في الاستجابة حتى لو غير محفوظة بعد */
    private const INVOICE_UI_DEFAULTS = [
        'invoice_variants_sales_enabled' => false,
        'invoice_variants_purchases_enabled' => false,
        'invoice_expiry_dates_enabled' => false,
        'default_vat_rate' => 15,
    ];

    public function __construct(
        private TenantSettingsService $settings
    ) {}

    /**
     * عرض جميع الإعدادات للشريك الحالي.
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        if ($tenantId < 1) {
            return response()->json(['message' => 'معرف العميل مطلوب.'], 422);
        }

        return response()->json($this->settingsPayload($tenantId));
    }

    /**
     * تحديث إعدادات (جزئية أو كاملة) حسب المفاتيح المرسلة.
     */
    public function update(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        if ($tenantId < 1) {
            return response()->json(['message' => 'معرف العميل مطلوب.'], 422);
        }
        $payload = $request->all();
        unset($payload['tenant_id']);
        if (empty($payload)) {
            return response()->json(['message' => 'لا توجد إعدادات للتحديث.'], 422);
        }

        $rawSettings = $this->settings->getAll($tenantId);
        $merged = array_merge($rawSettings, $payload);
        $method = $merged['manufacturing_method'] ?? 'auto_on_sale';
        $manufacturingTouched = ! empty(array_intersect_key(
            $payload,
            array_flip([
                'manufacturing_method',
                'manufacturing_default_raw_warehouse_id',
                'manufacturing_default_finished_warehouse_id',
                'manufacturing_wip_account_id',
                'allow_manufacturing_with_raw_shortage',
            ])
        ));
        if ($manufacturingTouched && $method !== 'manual_orders') {
            $rawWh = (int) ($merged['manufacturing_default_raw_warehouse_id'] ?? 0);
            $finWh = (int) ($merged['manufacturing_default_finished_warehouse_id'] ?? 0);
            $wip = (int) ($merged['manufacturing_wip_account_id'] ?? 0);
            if ($rawWh < 1 || $finWh < 1 || $wip < 1) {
                return response()->json([
                    'message' => 'عند اختيار «آلي عند البيع» يجب تحديد مخزن المواد الخام الافتراضي، ومخزن المنتج النهائي الافتراضي، وحساب التصنيع الوسيط (WIP).',
                ], 422);
            }
            $whBase = fn (int $id) => Warehouse::query()
                ->where('tenant_id', $tenantId)
                ->where('is_active', true)
                ->where('id', $id)
                ->exists();
            if (! $whBase($rawWh) || ! $whBase($finWh)) {
                return response()->json(['message' => 'المخازن المحددة غير موجودة أو غير نشطة.'], 422);
            }
            $wipOk = Account::query()
                ->where('tenant_id', $tenantId)
                ->where('id', $wip)
                ->where('is_postable', true)
                ->where('is_active', true)
                ->exists();
            if (! $wipOk) {
                return response()->json(['message' => 'حساب التصنيع الوسيط غير صالح أو غير قابل للترحيل.'], 422);
            }
        }
        if (array_key_exists('default_vat_rate', $payload)) {
            $tenant = Tenant::find($tenantId);
            if ($tenant) {
                $tenant->update(['vat_rate' => (float) $payload['default_vat_rate']]);
            }
        }
        $this->settings->setMany($tenantId, $payload);

        return response()->json($this->settingsPayload($tenantId));
    }

    /**
     * @return array<string, mixed>
     */
    private function settingsPayload(int $tenantId): array
    {
        $all = $this->settings->getAll($tenantId);
        $out = [];
        foreach ($all as $key => $raw) {
            $out[$key] = $this->settings->get($tenantId, $key);
        }
        foreach (self::INVOICE_UI_DEFAULTS as $key => $default) {
            $out[$key] = $this->settings->get($tenantId, $key, $default);
        }

        return $out;
    }

    /**
     * رفع شعار الشركة وتخزينه كافتراضي.
     */
    public function uploadCompanyLogo(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        if ($tenantId < 1) {
            return response()->json(['message' => 'معرف العميل مطلوب.'], 422);
        }

        $request->validate([
            'logo' => 'required|image|mimes:jpeg,png,gif,webp|max:2048',
        ]);

        $file = $request->file('logo');
        $dir = 'tenant-logos/'.$tenantId;
        $path = $file->store($dir, 'public');

        $url = Storage::disk('public')->url($path);
        if (! str_starts_with($url, 'http')) {
            $url = rtrim(config('app.url', ''), '/').'/'.ltrim($url, '/');
        }

        $this->settings->set($tenantId, 'company_logo', $url);

        return response()->json(['url' => $url, 'path' => $path]);
    }
}
