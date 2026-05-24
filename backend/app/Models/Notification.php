<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notification extends Model
{
    use BelongsToTenant;

    public const TYPE_STOCK_LOW = 'stock_low';

    public const TYPE_INSTALLMENT_DUE_TODAY = 'installment_due_today';

    public const TYPE_INSTALLMENT_OVERDUE = 'installment_overdue';

    public const TYPE_EXPIRY_SOON = 'expiry_soon';

    public const TYPE_KITCHEN_READY = 'kitchen_ready';

    public const SEVERITY_INFO = 'info';

    public const SEVERITY_WARNING = 'warning';

    public const SEVERITY_DANGER = 'danger';

    public const SEVERITY_SUCCESS = 'success';

    protected $fillable = [
        'tenant_id',
        'user_id',
        'type',
        'title_ar',
        'title_en',
        'body_ar',
        'body_en',
        'link_path',
        'link_params',
        'severity',
        'read_at',
        'related_entity_type',
        'related_entity_id',
        'branch_id',
    ];

    protected $casts = [
        'read_at' => 'datetime',
        'link_params' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function scopeUnread($query)
    {
        return $query->whereNull('read_at');
    }

    public function scopeOfType($query, string $type)
    {
        return $query->where('type', $type);
    }
}
