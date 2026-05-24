<?php

namespace App\Rules;

use App\Models\ItemSerial;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class UniqueSerialPerTenantItem implements ValidationRule
{
    public function __construct(
        protected int $tenantId,
        protected int $itemId,
        protected ?int $excludeId = null
    ) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $value = is_string($value) ? trim($value) : (string) $value;
        if ($value === '') {
            $fail(__('validation.required', ['attribute' => $attribute]));

            return;
        }

        if (! ItemSerial::isSerialUniqueForTenantItem($this->tenantId, $this->itemId, $value, $this->excludeId)) {
            $fail(__('The serial number already exists for this item in this company.'));
        }
    }
}
