<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\TenantAccountDefault;
use RuntimeException;

/**
 * حل الحسابات: صنف ← فئة ← إعدادات افتراضية.
 * منع استخدام حساب رأس المال في العمليات التشغيلية.
 */
class AccountResolutionService
{
    /**
     * الحصول على إعدادات الحسابات الافتراضية للشريك (مع إنشائها إن لم توجد).
     */
    public function getDefaults(int $tenantId): TenantAccountDefault
    {
        $defaults = TenantAccountDefault::firstOrCreate(
            ['tenant_id' => $tenantId],
            array_fill_keys(TenantAccountDefault::requiredKeysForOperations(), null)
        );

        return $defaults;
    }

    /**
     * التحقق من أن جميع الحسابات المطلوبة للعمليات محددة، وأنه لا يُستخدم رأس المال تلقائياً.
     * يرمي استثناءً برسالة واضحة عند النقص.
     */
    public function validateForOperations(int $tenantId): void
    {
        $defaults = $this->getDefaults($tenantId);
        $required = TenantAccountDefault::requiredKeysForOperations();
        $missing = [];
        foreach ($required as $key) {
            $value = $defaults->{$key};
            if (empty($value)) {
                $missing[] = $this->keyToLabel($key);
            }
        }
        if ($missing !== []) {
            throw new RuntimeException(
                'يجب تحديد الحسابات الأساسية في الإعدادات قبل تنفيذ عمليات البيع أو الشراء. الحسابات الناقصة: '.implode('، ', $missing)
            );
        }

        $capitalId = $defaults->capital_account_id;
        if ($capitalId) {
            foreach ($required as $key) {
                if (($defaults->{$key} ?? null) == $capitalId) {
                    throw new RuntimeException(
                        'لا يجوز استخدام حساب رأس المال كحساب افتراضي للعمليات اليومية. غيّر الحساب في إعدادات الحسابات الأساسية.'
                    );
                }
            }
        }
    }

    /**
     * التحقق من إمكانية ترحيل فاتورة: وجود الحسابات المطلوبة وحل حسابات الأصناف.
     */
    public function validateInvoiceForPosting(Invoice $invoice): void
    {
        $tenantId = $invoice->tenant_id;
        $this->validateForOperations($tenantId);

        $defaults = $this->getDefaults($tenantId);
        $capitalId = $defaults->capital_account_id;

        if ($invoice->type === 'sales' && ! $invoice->is_return) {
            if (empty($invoice->customer_id)) {
                throw new RuntimeException(
                    'يجب اختيار العميل في فاتورة المبيعات قبل الترحيل.'
                );
            }
            if ((float) $invoice->discount_amount > 0 && empty($defaults->discounts_account_id)) {
                throw new RuntimeException(
                    'الفاتورة تحتوي على خصم. يرجى تحديد حساب «خصم المبيعات» في الحسابات الأساسية (الإعدادات) قبل ترحيل الفاتورة.'
                );
            }
            $customer = $invoice->customer;
            if (! $customer || empty($customer->account_id)) {
                throw new RuntimeException(
                    'العميل المختار غير مرتبط بحساب في دليل الحسابات. يرجى ربط العميل بحساب فرعي (من بيانات العميل أو إنشاء حساب تلقائياً عند الإضافة).'
                );
            }
            foreach ($invoice->lines as $line) {
                if (! $line->item_id) {
                    continue;
                }
                $item = $line->item;
                $invAcc = $this->resolveInventoryAccount($item, $defaults);
                $cogsAcc = $this->resolveCogsAccount($item, $defaults);
                $salesAcc = $this->resolveSalesAccount($item, $defaults);
                if (! $invAcc || ! $cogsAcc || ! $salesAcc) {
                    throw new RuntimeException(
                        'صنف «'.($item->name ?? $line->description).'»: يجب ربط حساب مخزون، وتكلفة مبيعات، ومبيعات (على الصنف أو الفئة أو الإعدادات الافتراضية).'
                    );
                }
                $this->ensureNotCapital([$invAcc, $cogsAcc, $salesAcc], $capitalId, 'البيع');
            }
        }

        if ($invoice->type === 'purchase' && ! $invoice->is_return) {
            if (empty($invoice->vendor_id)) {
                throw new RuntimeException(
                    'يجب اختيار المورد في فاتورة المشتريات قبل الترحيل.'
                );
            }
            $vendor = $invoice->vendor;
            if (! $vendor || empty($vendor->account_id)) {
                throw new RuntimeException(
                    'المورد المختار غير مرتبط بحساب في دليل الحسابات. يرجى ربط المورد بحساب فرعي تحت حساب الموردين (من بيانات المورد أو إنشاء حساب تلقائياً عند الإضافة).'
                );
            }
            if ((float) $invoice->discount_amount > 0 && empty($defaults->purchase_discounts_account_id)) {
                throw new RuntimeException(
                    'فاتورة المشتريات تحتوي على خصم. يرجى تحديد حساب «خصم المشتريات» في الحسابات الأساسية (الإعدادات) قبل ترحيل الفاتورة.'
                );
            }
            foreach ($invoice->lines as $line) {
                if (! $line->item_id) {
                    continue;
                }
                $item = $line->item;
                $invAcc = $this->resolveInventoryAccount($item, $defaults);
                if (! $invAcc) {
                    throw new RuntimeException(
                        'صنف «'.($item->name ?? $line->description).'»: يجب ربط حساب مخزون (على الصنف أو الفئة أو الإعدادات الافتراضية).'
                    );
                }
                $this->ensureNotCapital([$invAcc], $capitalId, 'الشراء');
            }

            $invoice->loadMissing('additionalExpenses');
            $extraTax = (float) $invoice->additionalExpenses->sum(fn ($e) => (float) ($e->tax_amount ?? 0));
            if ($extraTax > 0 && empty($defaults->tax_payable_account_id)) {
                throw new RuntimeException(
                    'الفاتورة تتضمن ضريبة على مصاريف شراء إضافية. يرجى تحديد حساب الضريبة المدخلة/المستحقة في الإعدادات المحاسبية قبل الترحيل.'
                );
            }
            foreach ($invoice->additionalExpenses as $exp) {
                $net = (float) ($exp->amount_net ?? 0);
                $total = (float) ($exp->total_amount ?? 0);
                if ($total <= 0 && $net <= 0) {
                    continue;
                }
                if (empty($exp->creditor_account_id)) {
                    throw new RuntimeException(
                        'مصروف شراء إضافي «'.(trim((string) ($exp->description ?? '')) !== '' ? trim((string) $exp->description) : 'بدون وصف').'» يتطلب حساباً دائناً (مثلاً شركة الشحن) قبل الترحيل.'
                    );
                }
                $snapshot = $exp->distribution_snapshot;
                $allocated = is_array($snapshot) && array_sum(array_map('floatval', $snapshot)) > 0.0000001;
                if ($net > 0 && ! $allocated && empty($defaults->inventory_account_id)) {
                    throw new RuntimeException(
                        'مصروف شراء إضافي «'.(trim((string) ($exp->description ?? '')) !== '' ? trim((string) $exp->description) : 'بدون وصف').'» لا يمكن توزيعه على الأصناف وسيتم دمجه مباشرةً في المخزون. يرجى تحديد حساب «مخزون» افتراضي في الإعدادات المحاسبية قبل الترحيل.'
                    );
                }
            }
        }

        if ($invoice->is_return && $invoice->type === 'sales') {
            foreach ($invoice->lines as $line) {
                if (! $line->item_id) {
                    continue;
                }
                $item = $line->item;
                $invAcc = $this->resolveInventoryAccount($item, $defaults);
                $salesAcc = $this->resolveSalesAccount($item, $defaults);
                if (! $invAcc || ! $salesAcc) {
                    throw new RuntimeException(
                        'صنف «'.($item->name ?? $line->description).'»: يجب ربط حساب مخزون ومبيعات لمرتجع المبيعات.'
                    );
                }
                $this->ensureNotCapital([$invAcc, $salesAcc], $capitalId, 'مرتجع المبيعات');
            }
        }

        if ($invoice->is_return && $invoice->type === 'purchase') {
            if (! empty($invoice->vendor_id)) {
                $vendor = $invoice->vendor;
                if (! $vendor || empty($vendor->account_id)) {
                    throw new RuntimeException(
                        'المورد المختار غير مرتبط بحساب في دليل الحسابات. يرجى ربط المورد بحساب فرعي تحت حساب الموردين.'
                    );
                }
            }
            foreach ($invoice->lines as $line) {
                if (! $line->item_id) {
                    continue;
                }
                $item = $line->item;
                $invAcc = $this->resolveInventoryAccount($item, $defaults);
                if (! $invAcc) {
                    throw new RuntimeException(
                        'صنف «'.($item->name ?? $line->description).'»: يجب ربط حساب مخزون لمرتجع المشتريات.'
                    );
                }
                $this->ensureNotCapital([$invAcc], $capitalId, 'مرتجع المشتريات');
            }
        }
    }

    /**
     * حل حساب المخزون: صنف ← فئة ← افتراضي.
     */
    public function resolveInventoryAccount(?Item $item, TenantAccountDefault $defaults): ?int
    {
        if ($item && $item->inventory_account_id) {
            return (int) $item->inventory_account_id;
        }
        if ($item?->category && $item->category->inventory_account_id) {
            return (int) $item->category->inventory_account_id;
        }

        return $defaults->inventory_account_id ? (int) $defaults->inventory_account_id : null;
    }

    /**
     * حل حساب تكلفة البضاعة المباعة: صنف ← فئة ← افتراضي.
     */
    public function resolveCogsAccount(?Item $item, TenantAccountDefault $defaults): ?int
    {
        if ($item && $item->cost_of_sales_account_id) {
            return (int) $item->cost_of_sales_account_id;
        }
        if ($item?->category && $item->category->cost_of_sales_account_id) {
            return (int) $item->category->cost_of_sales_account_id;
        }

        return $defaults->cogs_account_id ? (int) $defaults->cogs_account_id : null;
    }

    /**
     * حل حساب المبيعات: صنف ← فئة ← افتراضي.
     */
    public function resolveSalesAccount(?Item $item, TenantAccountDefault $defaults): ?int
    {
        if ($item && $item->sales_account_id) {
            return (int) $item->sales_account_id;
        }
        if ($item?->category && $item->category->sales_account_id) {
            return (int) $item->category->sales_account_id;
        }

        return $defaults->sales_account_id ? (int) $defaults->sales_account_id : null;
    }

    /**
     * حساب الذمم المدينة للعميل في قيود المبيعات/المرتجع (عميل فرعي أو حساب العملاء الافتراضي).
     */
    public function resolveSalesReceivableAccountId(Invoice $invoice): ?int
    {
        $invoice->loadMissing('customer');
        $defaults = $this->getDefaults((int) $invoice->tenant_id);
        if ($invoice->customer_id && $invoice->customer && ! empty($invoice->customer->account_id)) {
            return (int) $invoice->customer->account_id;
        }

        return $defaults->customers_account_id ? (int) $defaults->customers_account_id : null;
    }

    private function ensureNotCapital(array $accountIds, ?int $capitalId, string $operation): void
    {
        if (! $capitalId) {
            return;
        }
        foreach ($accountIds as $id) {
            if ((int) $id === (int) $capitalId) {
                throw new RuntimeException(
                    'لا يجوز استخدام حساب رأس المال في قيود '.$operation.'. غيّر ربط الحساب في الصنف/الفئة أو الإعدادات.'
                );
            }
        }
    }

    private function keyToLabel(string $key): string
    {
        $labels = [
            'cash_account_id' => 'الصندوق',
            'bank_account_id' => 'البنك',
            'customers_account_id' => 'العملاء',
            'vendors_account_id' => 'الموردين',
            'inventory_account_id' => 'المخزون',
            'sales_account_id' => 'المبيعات',
            'sales_returns_account_id' => 'مردودات المبيعات',
            'cogs_account_id' => 'تكلفة البضاعة المباعة',
            'purchases_account_id' => 'المشتريات',
            'discounts_account_id' => 'الخصومات',
            'tax_payable_account_id' => 'الضرائب المستحقة',
        ];

        return $labels[$key] ?? $key;
    }

    /**
     * حساب إيراد رسوم التوصيل/الشحن: حساب مُفضّل إن وُجد وكان إيرادياً، أو بحث بالاسم/الرمز، أو المبيعات الافتراضية.
     */
    public function resolveDeliveryRevenueAccountId(int $tenantId, ?int $preferredAccountId = null): int
    {
        if ($preferredAccountId && $preferredAccountId > 0) {
            $acc = Account::where('tenant_id', $tenantId)->where('id', $preferredAccountId)->first();
            if ($acc && (string) $acc->type === 'revenue' && $acc->is_postable) {
                return (int) $acc->id;
            }
        }

        $found = Account::where('tenant_id', $tenantId)
            ->where('type', 'revenue')
            ->where('is_postable', true)
            ->where(function ($q) {
                $q->where('name', 'like', '%توصيل%')
                    ->orWhere('name', 'like', '%شحن%')
                    ->orWhere('name', 'like', '%نقل%')
                    ->orWhere('code', '4200');
            })
            ->first();

        if ($found) {
            return (int) $found->id;
        }

        $defaults = $this->getDefaults($tenantId);
        if (! empty($defaults->sales_account_id)) {
            return (int) $defaults->sales_account_id;
        }

        throw new RuntimeException(
            'تعذر تحديد حساب إيراد رسوم التوصيل. أضف حساب إيراد في دليل الحسابات أو أكمل حساب المبيعات الافتراضي في الإعدادات.'
        );
    }
}
