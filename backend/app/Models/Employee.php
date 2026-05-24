<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use App\Traits\HasAutoNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Employee extends Model
{
    use Auditable, BelongsToTenant, HasAutoNumber;

    protected $numberPrefix = 'EMP';

    protected $numberField = 'code';

    protected $fillable = [
        'tenant_id',
        'code',
        'name',
        'national_id',
        'birth_date',
        'phone',
        'email',
        'address',
        'branch_id',
        'administration_id',
        'department_id',
        'department',
        'job_title',
        'hire_date',
        'status',
        'basic_salary',
        'housing_allowance',
        'transport_allowance',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'birth_date' => 'date',
        'hire_date' => 'date',
        'basic_salary' => 'decimal:3',
        'housing_allowance' => 'decimal:3',
        'transport_allowance' => 'decimal:3',
    ];

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function administration(): BelongsTo
    {
        return $this->belongsTo(HrAdministration::class, 'administration_id');
    }

    public function departmentRef(): BelongsTo
    {
        return $this->belongsTo(HrDepartment::class, 'department_id');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(EmployeeDocument::class);
    }

    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }
}
