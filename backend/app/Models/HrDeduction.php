<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use App\Traits\HasAutoNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HrDeduction extends Model
{
    use BelongsToTenant, HasAutoNumber;

    protected $table = 'hr_deductions';

    protected $numberPrefix = 'DED';

    protected $numberField = 'code';

    protected $fillable = [
        'tenant_id',
        'code',
        'name',
        'reason',
        'value_type',
        'value',
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
}
