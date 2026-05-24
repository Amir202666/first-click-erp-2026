<?php

namespace App\Models;

use App\Enums\AccountType;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Account extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'parent_id',
        'code',
        'name',
        'name_en',
        'type',
        'normal_balance',
        'description',
        'is_system',
        'is_active',
        'level',
        'currency',
        'allow_manual_entry',
        'is_postable',
    ];

    protected $casts = [
        'is_system' => 'boolean',
        'is_active' => 'boolean',
        'is_postable' => 'boolean',
    ];

    /** الحساب يقبل قيوداً مباشرة (حساب نهائي). الرؤوس الرئيسية = غير قابلة للترحيل. */
    public function isPostable(): bool
    {
        return (bool) $this->is_postable;
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Account::class, 'parent_id');
    }

    /** الربط المتقدم: الفروع المرتبطة بهذا الحساب (فارغ = كل الفروع) */
    public function branches(): BelongsToMany
    {
        return $this->belongsToMany(Branch::class, 'account_branch');
    }

    /** الربط المتقدم: مراكز التكلفة المرتبطة بهذا الحساب (فارغ = كل المراكز) */
    public function costCenters(): BelongsToMany
    {
        return $this->belongsToMany(CostCenter::class, 'account_cost_center');
    }

    /** الربط المتقدم: المستخدمون المسموح لهم بالقيود على هذا الحساب (فارغ = كل المستخدمين) */
    public function allowedUsers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'account_user');
    }

    public function getTypeEnum(): AccountType
    {
        return AccountType::from($this->type);
    }

    /** الطبيعة المحاسبية: مدين أو دائن. إن وُجد normal_balance في الجدول نستخدمه، وإلا من نوع الحساب. */
    public function getEffectiveNormalBalance(): string
    {
        if ($this->normal_balance && in_array($this->normal_balance, ['debit', 'credit'], true)) {
            return $this->normal_balance;
        }

        return $this->getTypeEnum()->normalBalance();
    }
}
