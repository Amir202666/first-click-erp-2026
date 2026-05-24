<?php

namespace App\Traits;

trait HasAutoNumber
{
    public static function bootHasAutoNumber(): void
    {
        static::creating(function ($model) {
            if (empty($model->{$model->getNumberField()})) {
                $model->{$model->getNumberField()} = static::generateNextNumber($model);
            }
        });
    }

    public function getNumberField(): string
    {
        return property_exists($this, 'numberField') ? $this->numberField : 'number';
    }

    public function getNumberPrefix(): string
    {
        return property_exists($this, 'numberPrefix') ? $this->numberPrefix : '';
    }

    protected static function generateNextNumber($model): string
    {
        $prefix = $model->getNumberPrefix();
        $year = date('Y');
        $fullPrefix = $prefix.$year.'-';

        $last = static::withoutGlobalScopes()
            ->where('tenant_id', $model->tenant_id)
            ->where($model->getNumberField(), 'like', $fullPrefix.'%')
            ->orderByRaw("CAST(REPLACE({$model->getNumberField()}, '{$fullPrefix}', '') AS INTEGER) DESC")
            ->value($model->getNumberField());

        if ($last) {
            $lastNum = (int) str_replace($fullPrefix, '', $last);

            return $fullPrefix.str_pad($lastNum + 1, 6, '0', STR_PAD_LEFT);
        }

        return $fullPrefix.'000001';
    }
}
