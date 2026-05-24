<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\TenantSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HrSettingsController extends Controller
{
    public function __construct(
        private TenantSettingsService $settings
    ) {}

    public function show(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $out = [
            'hr_shift_start' => $this->settings->get($tenantId, 'hr_shift_start', '09:00'),
            'hr_shift_end' => $this->settings->get($tenantId, 'hr_shift_end', '17:00'),
            'hr_weekend_days' => $this->settings->get($tenantId, 'hr_weekend_days', [5, 6]),
            'hr_late_grace_minutes' => (int) ($this->settings->get($tenantId, 'hr_late_grace_minutes', 0) ?? 0),
            'hr_late_deduction_per_minute' => (float) ($this->settings->get($tenantId, 'hr_late_deduction_per_minute', 0) ?? 0),
            'hr_absence_deduction_per_day' => (float) ($this->settings->get($tenantId, 'hr_absence_deduction_per_day', 0) ?? 0),
            'hr_overtime_rate_per_hour' => (float) ($this->settings->get($tenantId, 'hr_overtime_rate_per_hour', 0) ?? 0),
            'hr_doc_expiry_warning_days' => (int) ($this->settings->get($tenantId, 'hr_doc_expiry_warning_days', 30) ?? 30),
        ];

        return response()->json($out);
    }

    public function update(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $validated = $request->validate([
            'hr_shift_start' => 'nullable|string|max:5',
            'hr_shift_end' => 'nullable|string|max:5',
            'hr_weekend_days' => 'nullable|array',
            'hr_weekend_days.*' => 'integer|min:0|max:6',
            'hr_late_grace_minutes' => 'nullable|integer|min:0|max:240',
            'hr_late_deduction_per_minute' => 'nullable|numeric|min:0',
            'hr_absence_deduction_per_day' => 'nullable|numeric|min:0',
            'hr_overtime_rate_per_hour' => 'nullable|numeric|min:0',
            'hr_doc_expiry_warning_days' => 'nullable|integer|min:1|max:365',
        ]);

        $this->settings->setMany($tenantId, $validated);

        return $this->show($request);
    }
}
