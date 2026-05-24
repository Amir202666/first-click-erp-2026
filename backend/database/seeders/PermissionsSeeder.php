<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionsSeeder extends Seeder
{
    public function run(): void
    {
        $list = [
            ['key' => 'users.view', 'module' => 'users', 'name_ar' => 'عرض المستخدمين', 'name_en' => 'View users', 'sort_order' => 10],
            ['key' => 'users.create', 'module' => 'users', 'name_ar' => 'إضافة مستخدمين', 'name_en' => 'Create users', 'sort_order' => 11],
            ['key' => 'users.edit', 'module' => 'users', 'name_ar' => 'تعديل المستخدمين', 'name_en' => 'Edit users', 'sort_order' => 12],
            ['key' => 'users.delete', 'module' => 'users', 'name_ar' => 'حذف المستخدمين', 'name_en' => 'Delete users', 'sort_order' => 13],
            ['key' => 'roles.view', 'module' => 'users', 'name_ar' => 'عرض الأدوار', 'name_en' => 'View roles', 'sort_order' => 20],
            ['key' => 'roles.create', 'module' => 'users', 'name_ar' => 'إنشاء أدوار', 'name_en' => 'Create roles', 'sort_order' => 21],
            ['key' => 'roles.edit', 'module' => 'users', 'name_ar' => 'تعديل الأدوار', 'name_en' => 'Edit roles', 'sort_order' => 22],
            ['key' => 'roles.delete', 'module' => 'users', 'name_ar' => 'حذف الأدوار', 'name_en' => 'Delete roles', 'sort_order' => 23],
            ['key' => 'accounts.view', 'module' => 'accounts', 'name_ar' => 'عرض الحسابات', 'name_en' => 'View accounts', 'sort_order' => 30],
            ['key' => 'accounts.create', 'module' => 'accounts', 'name_ar' => 'إضافة حسابات', 'name_en' => 'Create accounts', 'sort_order' => 31],
            ['key' => 'accounts.edit', 'module' => 'accounts', 'name_ar' => 'تعديل الحسابات', 'name_en' => 'Edit accounts', 'sort_order' => 32],
            ['key' => 'accounts.delete', 'module' => 'accounts', 'name_ar' => 'حذف الحسابات', 'name_en' => 'Delete accounts', 'sort_order' => 33],
            ['key' => 'journal.view', 'module' => 'journal', 'name_ar' => 'عرض القيود', 'name_en' => 'View journal', 'sort_order' => 40],
            ['key' => 'journal.create', 'module' => 'journal', 'name_ar' => 'إنشاء قيود', 'name_en' => 'Create journal', 'sort_order' => 41],
            ['key' => 'journal.edit', 'module' => 'journal', 'name_ar' => 'تعديل القيود', 'name_en' => 'Edit journal', 'sort_order' => 42],
            ['key' => 'journal.delete', 'module' => 'journal', 'name_ar' => 'حذف القيود', 'name_en' => 'Delete journal', 'sort_order' => 43],
            ['key' => 'fiscal_years.view', 'module' => 'journal', 'name_ar' => 'عرض السنوات المالية وإقفالها', 'name_en' => 'View fiscal years', 'sort_order' => 44],
            ['key' => 'fiscal_years.close', 'module' => 'journal', 'name_ar' => 'تنفيذ إقفال السنة المالية', 'name_en' => 'Close fiscal year', 'sort_order' => 45],
            ['key' => 'fiscal_years.lock', 'module' => 'journal', 'name_ar' => 'قفل/إلغاء قفل السنة المالية', 'name_en' => 'Lock fiscal year', 'sort_order' => 46],
            ['key' => 'invoices.view', 'module' => 'invoices', 'name_ar' => 'عرض الفواتير', 'name_en' => 'View invoices', 'sort_order' => 50],
            ['key' => 'invoices.create', 'module' => 'invoices', 'name_ar' => 'إنشاء فواتير', 'name_en' => 'Create invoices', 'sort_order' => 51],
            ['key' => 'invoices.edit', 'module' => 'invoices', 'name_ar' => 'تعديل الفواتير', 'name_en' => 'Edit invoices', 'sort_order' => 52],
            ['key' => 'invoices.delete', 'module' => 'invoices', 'name_ar' => 'حذف الفواتير', 'name_en' => 'Delete invoices', 'sort_order' => 53],
            // التقسيط (Installments)
            ['key' => 'installments.view', 'module' => 'installments', 'name_ar' => 'عرض الأقساط', 'name_en' => 'View installments', 'sort_order' => 200],
            ['key' => 'installments.create', 'module' => 'installments', 'name_ar' => 'إنشاء جدول أقساط', 'name_en' => 'Create installment schedules', 'sort_order' => 201],
            ['key' => 'installments.edit', 'module' => 'installments', 'name_ar' => 'تعديل الأقساط', 'name_en' => 'Edit installments', 'sort_order' => 202],
            ['key' => 'installments.delete', 'module' => 'installments', 'name_ar' => 'حذف الأقساط', 'name_en' => 'Delete installments', 'sort_order' => 203],
            ['key' => 'installments.approve', 'module' => 'installments', 'name_ar' => 'اعتماد جدول الأقساط', 'name_en' => 'Approve installment schedules', 'sort_order' => 204],
            ['key' => 'installments.pay', 'module' => 'installments', 'name_ar' => 'سداد قسط', 'name_en' => 'Pay installment line', 'sort_order' => 205],
            ['key' => 'payments.view', 'module' => 'payments', 'name_ar' => 'عرض المدفوعات', 'name_en' => 'View payments', 'sort_order' => 60],
            ['key' => 'payments.create', 'module' => 'payments', 'name_ar' => 'إنشاء مدفوعات', 'name_en' => 'Create payments', 'sort_order' => 61],
            ['key' => 'reports.view', 'module' => 'reports', 'name_ar' => 'عرض التقارير', 'name_en' => 'View reports', 'sort_order' => 70],
            ['key' => 'customers.view', 'module' => 'customers', 'name_ar' => 'عرض العملاء', 'name_en' => 'View customers', 'sort_order' => 80],
            ['key' => 'customers.create', 'module' => 'customers', 'name_ar' => 'إضافة عملاء', 'name_en' => 'Create customers', 'sort_order' => 81],
            ['key' => 'customers.edit', 'module' => 'customers', 'name_ar' => 'تعديل العملاء', 'name_en' => 'Edit customers', 'sort_order' => 82],
            ['key' => 'customers.delete', 'module' => 'customers', 'name_ar' => 'حذف العملاء', 'name_en' => 'Delete customers', 'sort_order' => 83],
            ['key' => 'pricing_groups.view', 'module' => 'items', 'name_ar' => 'عرض مجموعات التسعير', 'name_en' => 'View pricing groups', 'sort_order' => 105],
            ['key' => 'pricing_groups.create', 'module' => 'items', 'name_ar' => 'إضافة مجموعات التسعير', 'name_en' => 'Create pricing groups', 'sort_order' => 106],
            ['key' => 'pricing_groups.edit', 'module' => 'items', 'name_ar' => 'تعديل مجموعات التسعير', 'name_en' => 'Edit pricing groups', 'sort_order' => 107],
            ['key' => 'pricing_groups.delete', 'module' => 'items', 'name_ar' => 'حذف مجموعات التسعير', 'name_en' => 'Delete pricing groups', 'sort_order' => 108],
            ['key' => 'invoices.switch_pricing_group', 'module' => 'invoices', 'name_ar' => 'تبديل مجموعة التسعير في الفاتورة', 'name_en' => 'Switch pricing group on invoice', 'sort_order' => 55],
            ['key' => 'vendors.view', 'module' => 'vendors', 'name_ar' => 'عرض الموردين', 'name_en' => 'View vendors', 'sort_order' => 90],
            ['key' => 'vendors.create', 'module' => 'vendors', 'name_ar' => 'إضافة موردين', 'name_en' => 'Create vendors', 'sort_order' => 91],
            ['key' => 'vendors.edit', 'module' => 'vendors', 'name_ar' => 'تعديل الموردين', 'name_en' => 'Edit vendors', 'sort_order' => 92],
            ['key' => 'vendors.delete', 'module' => 'vendors', 'name_ar' => 'حذف الموردين', 'name_en' => 'Delete vendors', 'sort_order' => 93],
            ['key' => 'items.view', 'module' => 'items', 'name_ar' => 'عرض الأصناف', 'name_en' => 'View items', 'sort_order' => 100],
            ['key' => 'items.create', 'module' => 'items', 'name_ar' => 'إضافة أصناف', 'name_en' => 'Create items', 'sort_order' => 101],
            ['key' => 'items.edit', 'module' => 'items', 'name_ar' => 'تعديل الأصناف', 'name_en' => 'Edit items', 'sort_order' => 102],
            ['key' => 'items.delete', 'module' => 'items', 'name_ar' => 'حذف الأصناف', 'name_en' => 'Delete items', 'sort_order' => 103],
            ['key' => 'inventory.view', 'module' => 'inventory', 'name_ar' => 'عرض المخزون', 'name_en' => 'View inventory', 'sort_order' => 110],
            ['key' => 'inventory.create', 'module' => 'inventory', 'name_ar' => 'حركات مخزنية', 'name_en' => 'Inventory movements', 'sort_order' => 111],
            ['key' => 'audit.view', 'module' => 'audit', 'name_ar' => 'عرض سجل التدقيق', 'name_en' => 'View audit log', 'sort_order' => 120],
            // نقطة البيع (POS)
            ['key' => 'pos.sell', 'module' => 'pos', 'name_ar' => 'تنفيذ البيع', 'name_en' => 'POS sell', 'sort_order' => 130],
            ['key' => 'pos.hold_resume', 'module' => 'pos', 'name_ar' => 'تعليق واستئناف الفواتير', 'name_en' => 'Hold/Resume', 'sort_order' => 131],
            ['key' => 'pos.edit_price', 'module' => 'pos', 'name_ar' => 'تعديل سعر الصنف', 'name_en' => 'Edit item price', 'sort_order' => 132],
            ['key' => 'pos.apply_discount', 'module' => 'pos', 'name_ar' => 'تطبيق خصم', 'name_en' => 'Apply discount', 'sort_order' => 133],
            ['key' => 'pos.delete_printed_invoice', 'module' => 'pos', 'name_ar' => 'حذف فاتورة بعد الطباعة', 'name_en' => 'Delete printed invoice', 'sort_order' => 134],
            ['key' => 'pos.close_shift', 'module' => 'pos', 'name_ar' => 'إغلاق الوردية', 'name_en' => 'Close shift', 'sort_order' => 135],
            ['key' => 'pos.view_reports', 'module' => 'pos', 'name_ar' => 'عرض تقارير X/Z', 'name_en' => 'View X/Z reports', 'sort_order' => 136],
            // حساسة: تكلفة الصنف وأرباح الفواتير
            ['key' => 'items.view_cost', 'module' => 'items', 'name_ar' => 'رؤية تكلفة الصنف', 'name_en' => 'View item cost', 'sort_order' => 104],
            ['key' => 'invoices.view_profit', 'module' => 'invoices', 'name_ar' => 'رؤية أرباح الفواتير', 'name_en' => 'View invoice profits', 'sort_order' => 54],
            // الموارد البشرية والرواتب
            ['key' => 'hr.view', 'module' => 'hr', 'name_ar' => 'عرض الموظفين والهيكل', 'name_en' => 'View HR & employees', 'sort_order' => 140],
            ['key' => 'hr.payroll.view', 'module' => 'hr', 'name_ar' => 'عرض الرواتب ومسيراتها', 'name_en' => 'View payroll', 'sort_order' => 141],
            ['key' => 'hr.payroll.approve', 'module' => 'hr', 'name_ar' => 'اعتماد مسير الرواتب', 'name_en' => 'Approve payroll run', 'sort_order' => 142],
        ];

        foreach ($list as $p) {
            Permission::updateOrCreate(['key' => $p['key']], $p);
        }
    }
}
