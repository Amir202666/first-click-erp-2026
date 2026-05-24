<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use App\Traits\HasAutoNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class HrAdministration extends Model
{
    use BelongsToTenant, HasAutoNumber;

    protected $table = 'hr_administrations';

    protected $numberPrefix = 'ADM';

    protected $numberField = 'code';

    protected $fillable = [
        'tenant_id',
        'code',
        'name',
        'name_en',
        'manager_employee_id',
        'status',
        'notes',
        'description_ar',
        'description_en',
        'created_by',
    ];

    public function departments(): HasMany
    {
        return $this->hasMany(HrDepartment::class, 'administration_id');
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'manager_employee_id');
    }
}
