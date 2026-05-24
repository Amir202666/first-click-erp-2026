<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use App\Traits\HasAutoNumber;
use Illuminate\Database\Eloquent\Model;

class HrJobTitle extends Model
{
    use BelongsToTenant, HasAutoNumber;

    protected $table = 'hr_job_titles';

    protected $numberPrefix = 'JOB';

    protected $numberField = 'code';

    protected $fillable = [
        'tenant_id',
        'code',
        'name',
        'name_en',
        'status',
        'notes',
        'description_ar',
        'description_en',
        'created_by',
    ];
}
