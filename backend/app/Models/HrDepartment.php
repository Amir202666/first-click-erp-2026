<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use App\Traits\HasAutoNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HrDepartment extends Model
{
    use BelongsToTenant, HasAutoNumber;

    protected $table = 'hr_departments';

    protected $numberPrefix = 'DEPT';

    protected $numberField = 'code';

    protected $fillable = [
        'tenant_id',
        'code',
        'name',
        'name_en',
        'administration_id',
        'manager_employee_id',
        'status',
        'notes',
        'description_ar',
        'description_en',
        'created_by',
    ];

    public function administration(): BelongsTo
    {
        return $this->belongsTo(HrAdministration::class, 'administration_id');
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'manager_employee_id');
    }
}
