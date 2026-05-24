<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TenantAccountDefault extends Model
{
    use BelongsToTenant;

    protected $table = 'tenant_account_defaults';

    protected $fillable = [
        'tenant_id',
        'cash_account_id',
        'bank_account_id',
        'customers_account_id',
        'vendors_account_id',
        'inventory_account_id',
        'sales_account_id',
        'sales_returns_account_id',
        'cogs_account_id',
        'purchases_account_id',
        'discounts_account_id',
        'purchase_discounts_account_id',
        'tax_payable_account_id',
        'capital_account_id',
        'pos_cash_custody_account_id',
        'cash_variance_account_id',
        'installments_receivable_account_id',
        'installments_payable_account_id',
        'inventory_adjustment_gain_account_id',
        'inventory_adjustment_loss_account_id',
    ];

    public function cashAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'cash_account_id');
    }

    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'bank_account_id');
    }

    public function customersAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'customers_account_id');
    }

    public function vendorsAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'vendors_account_id');
    }

    public function inventoryAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'inventory_account_id');
    }

    public function salesAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'sales_account_id');
    }

    public function salesReturnsAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'sales_returns_account_id');
    }

    public function cogsAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'cogs_account_id');
    }

    public function purchasesAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'purchases_account_id');
    }

    public function discountsAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'discounts_account_id');
    }

    public function purchaseDiscountsAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'purchase_discounts_account_id');
    }

    public function taxPayableAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'tax_payable_account_id');
    }

    public function capitalAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'capital_account_id');
    }

    public function posCashCustodyAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'pos_cash_custody_account_id');
    }

    public function cashVarianceAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'cash_variance_account_id');
    }

    public function installmentsReceivableAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'installments_receivable_account_id');
    }

    public function installmentsPayableAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'installments_payable_account_id');
    }

    public function inventoryAdjustmentGainAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'inventory_adjustment_gain_account_id');
    }

    public function inventoryAdjustmentLossAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'inventory_adjustment_loss_account_id');
    }

    /** الحسابات المطلوبة لعمليات البيع والشراء (رأس المال غير مستخدم تلقائياً في العمليات) */
    public static function requiredKeysForOperations(): array
    {
        return [
            'cash_account_id',
            'bank_account_id',
            'customers_account_id',
            'vendors_account_id',
            'inventory_account_id',
            'sales_account_id',
            'sales_returns_account_id',
            'cogs_account_id',
            'purchases_account_id',
            'discounts_account_id',
            'tax_payable_account_id',
        ];
    }
}
