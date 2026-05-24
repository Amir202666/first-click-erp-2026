<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KitchenTicket extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'table_id',
        'invoice_id',
        'restaurant_order_id',
        'status',
    ];

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(RestaurantTable::class, 'table_id');
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function restaurantOrder(): BelongsTo
    {
        return $this->belongsTo(RestaurantOrder::class, 'restaurant_order_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(KitchenTicketLine::class, 'ticket_id');
    }

    /** طلبات نشطة على شاشة المطبخ فقط */
    public function scopeActiveForKds($query)
    {
        return $query
            ->whereIn('status', ['pending', 'in_progress', 'ready'])
            ->where(function ($q) {
                $q->whereDoesntHave('restaurantOrder')
                    ->orWhereHas('restaurantOrder', fn ($ro) => $ro->whereNotIn('status', ['paid', 'cancelled']));
            })
            ->where(function ($q) {
                $q->whereNull('invoice_id')
                    ->orWhereHas('invoice', fn ($inv) => $inv->where('status', 'draft'));
            });
    }

    /** نشطة + منتهية/مُسلَّمة (بدون قيود الطلب المدفوع) */
    public function scopeIncludingAllForKds($query)
    {
        return $query
            ->whereIn('status', ['pending', 'in_progress', 'ready', 'done'])
            ->whereNotIn('status', ['cancelled']);
    }
}
