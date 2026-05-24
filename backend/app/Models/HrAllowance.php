<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use App\Traits\HasAutoNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HrAllowance extends Model
{
    use BelongsToTenant, HasAutoNumber;

    protected $table = 'hr_allowances';

    protected $numberPrefix = 'ALW';

    protected $numberField = 'code';

    protected $fillable = [
        'tenant_id',
        'code',
        'name',
        'value_type',
        'value',
        'currency_id',
        'apply_to',
        'administration_id',
        'employee_id',
        'status',
        'notes',
        'created_by',
    ];

    public function administration(): BelongsTo
    {
        return $this->belongsTo(HrAdministration::class, 'administration_id');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class, 'currency_id');
    }
}
