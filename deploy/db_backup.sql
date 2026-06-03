-- First Click ERP — SQLite full export for MySQL import
-- التاريخ: 2026-06-03 22:04:36

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

-- account_branch
DELETE FROM `account_branch`;

-- account_cost_center
DELETE FROM `account_cost_center`;

-- account_user
DELETE FROM `account_user`;

-- accounts
DELETE FROM `accounts`;
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (1, 1, NULL, '1', 'الأصول', 'asset', NULL, 1, 1, 1, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Assets', 0, 'debit', '1', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (2, 1, NULL, '2', 'الخصوم', 'liability', NULL, 1, 1, 1, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Liabilities', 0, 'credit', '2', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (3, 1, NULL, '3', 'حقوق الملكية', 'equity', NULL, 1, 1, 1, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Equity', 0, 'credit', '3', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (4, 1, NULL, '4', 'الإيرادات', 'revenue', NULL, 1, 1, 1, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Revenue', 0, 'credit', '4', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (5, 1, NULL, '5', 'المصروفات', 'expense', NULL, 1, 1, 1, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Expenses', 0, 'debit', '5', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (6, 1, 1, '11', 'الأصول المتداولة', 'asset', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Current Assets', 0, 'debit', '1/11', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (7, 1, 1, '12', 'الأصول الثابتة', 'asset', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Fixed Assets', 0, 'debit', '1/12', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (8, 1, 1, '13', 'أصول أخرى', 'asset', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Other Assets', 0, 'debit', '1/13', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (9, 1, 6, '111', 'النقدية وما يعادلها', 'asset', NULL, 0, 1, 3, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Cash & Equivalents', 0, 'debit', '1/11/111', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (10, 1, 6, '112', 'الذمم المدينة', 'asset', NULL, 0, 1, 3, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Accounts Receivable', 0, 'debit', '1/11/112', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (11, 1, 6, '113', 'المخزون', 'asset', NULL, 0, 1, 3, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Inventory', 0, 'debit', '1/11/113', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (12, 1, 6, '114', 'مصروفات مدفوعة مقدماً', 'asset', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Prepaid Expenses', 1, 'debit', '1/11/114', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (13, 1, 6, '115', 'ضريبة القيمة المضافة مدخلات', 'asset', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'VAT Input', 1, 'debit', '1/11/115', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (14, 1, 9, '1111', 'الصندوق الرئيسي', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Main Cash', 1, 'debit', '1/11/111/1111', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (15, 1, 9, '1112', 'الصندوق الثاني', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Second Cash', 1, 'debit', '1/11/111/1112', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (16, 1, 9, '1113', 'البنك الرئيسي', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Main Bank', 1, 'debit', '1/11/111/1113', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (17, 1, 9, '1114', 'البنك الثاني', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Second Bank', 1, 'debit', '1/11/111/1114', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (18, 1, 9, '1115', 'المحفظة الإلكترونية', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Digital Wallet', 1, 'debit', '1/11/111/1115', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (19, 1, 10, '1121', 'العملاء', 'asset', NULL, 0, 1, 4, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Customers', 0, 'debit', '1/11/112/1121', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (20, 1, 10, '1122', 'أوراق القبض', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Notes Receivable', 1, 'debit', '1/11/112/1122', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (21, 1, 10, '1123', 'ذمم موظفين', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Employee Advances', 1, 'debit', '1/11/112/1123', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (22, 1, 10, '1124', 'ذمم متنوعة', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Other Receivables', 1, 'debit', '1/11/112/1124', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (23, 1, 19, '11211', 'عميل نقدي', 'asset', NULL, 0, 1, 5, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Cash Customer', 1, 'debit', '1/11/112/1121/11211', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (24, 1, 11, '1131', 'بضاعة تامة الصنع', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Finished Goods', 1, 'debit', '1/11/113/1131', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (25, 1, 11, '1132', 'مواد خام', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Raw Materials', 1, 'debit', '1/11/113/1132', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (26, 1, 11, '1133', 'بضاعة في الطريق', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Goods in Transit', 1, 'debit', '1/11/113/1133', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (27, 1, 7, '121', 'الأصول الثابتة - التكلفة', 'asset', NULL, 0, 1, 3, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Fixed Assets at Cost', 0, 'debit', '1/12/121', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (28, 1, 7, '122', 'مجمع الإهلاك', 'asset', NULL, 0, 1, 3, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Accumulated Depreciation', 0, 'debit', '1/12/122', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (29, 1, 27, '1211', 'أثاث ومعدات مكتبية', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Furniture & Equipment', 1, 'debit', '1/12/121/1211', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (30, 1, 27, '1212', 'أجهزة حاسب آلي', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Computer Equipment', 1, 'debit', '1/12/121/1212', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (31, 1, 27, '1213', 'سيارات ومركبات', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Vehicles', 1, 'debit', '1/12/121/1213', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (32, 1, 27, '1214', 'مباني وعقارات', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Buildings & Properties', 1, 'debit', '1/12/121/1214', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (33, 1, 27, '1215', 'معدات وآلات', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Machinery & Equipment', 1, 'debit', '1/12/121/1215', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (34, 1, 28, '1221', 'إهلاك الأثاث والمعدات', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Acc. Dep. Furniture', 1, 'debit', '1/12/122/1221', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (35, 1, 28, '1222', 'إهلاك الحاسب الآلي', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Acc. Dep. Computers', 1, 'debit', '1/12/122/1222', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (36, 1, 28, '1223', 'إهلاك السيارات', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Acc. Dep. Vehicles', 1, 'debit', '1/12/122/1223', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (37, 1, 28, '1224', 'إهلاك المباني', 'asset', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Acc. Dep. Buildings', 1, 'debit', '1/12/122/1224', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (38, 1, 2, '21', 'الخصوم المتداولة', 'liability', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Current Liabilities', 0, 'credit', '2/21', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (39, 1, 2, '22', 'الخصوم طويلة الأجل', 'liability', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Long-term Liabilities', 0, 'credit', '2/22', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (40, 1, 38, '211', 'الذمم الدائنة', 'liability', NULL, 0, 1, 3, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Accounts Payable', 0, 'credit', '2/21/211', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (41, 1, 38, '212', 'ضريبة القيمة المضافة مخرجات', 'liability', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'VAT Output', 1, 'credit', '2/21/212', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (42, 1, 38, '213', 'مصروفات مستحقة الدفع', 'liability', NULL, 0, 1, 3, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Accrued Expenses', 0, 'credit', '2/21/213', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (43, 1, 38, '214', 'دفعات مقدمة من العملاء', 'liability', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Customer Advances', 1, 'credit', '2/21/214', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (44, 1, 40, '2111', 'الموردون', 'liability', NULL, 0, 1, 4, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Suppliers', 0, 'credit', '2/21/211/2111', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (45, 1, 40, '2112', 'أوراق الدفع', 'liability', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Notes Payable', 1, 'credit', '2/21/211/2112', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (46, 1, 40, '2113', 'ذمم دائنة متنوعة', 'liability', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Other Payables', 1, 'credit', '2/21/211/2113', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (47, 1, 44, '21111', 'مورد نقدي', 'liability', NULL, 0, 1, 5, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Cash Supplier', 1, 'credit', '2/21/211/2111/21111', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (48, 1, 42, '2131', 'رواتب وأجور مستحقة', 'liability', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Salaries Payable', 1, 'credit', '2/21/213/2131', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (49, 1, 42, '2132', 'إيجار مستحق', 'liability', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Rent Payable', 1, 'credit', '2/21/213/2132', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (50, 1, 42, '2133', 'مصروفات متنوعة مستحقة', 'liability', NULL, 0, 1, 4, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Other Accrued Exp', 1, 'credit', '2/21/213/2133', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (51, 1, 39, '221', 'قروض بنكية طويلة الأجل', 'liability', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Long-term Bank Loans', 1, 'credit', '2/22/221', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (52, 1, 39, '222', 'قروض من المساهمين', 'liability', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Shareholder Loans', 1, 'credit', '2/22/222', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (53, 1, 3, '31', 'رأس المال المدفوع', 'equity', NULL, 0, 1, 2, 'SAR', 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Paid-in Capital', 1, 'credit', '3/31', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (54, 1, 3, '32', 'الأرباح المحتجزة', 'equity', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 'Retained Earnings', 0, 'credit', '3/32', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (55, 1, 3, '33', 'أرباح وخسائر العام الحالي', 'equity', NULL, 0, 1, 2, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Current Year P&L', 1, 'credit', '3/33', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (56, 1, 3, '34', 'احتياطيات', 'equity', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Reserves', 0, 'credit', '3/34', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (57, 1, 54, '321', 'أرباح السنوات السابقة', 'equity', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Prior Years Earnings', 1, 'credit', '3/32/321', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (58, 1, 56, '341', 'احتياطي قانوني', 'equity', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Legal Reserve', 1, 'credit', '3/34/341', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (59, 1, 56, '342', 'احتياطي اختياري', 'equity', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Optional Reserve', 1, 'credit', '3/34/342', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (60, 1, 4, '41', 'إيرادات المبيعات', 'revenue', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Sales Revenue', 0, 'credit', '4/41', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (61, 1, 4, '42', 'إيرادات الخدمات', 'revenue', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Service Revenue', 0, 'credit', '4/42', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (62, 1, 4, '43', 'إيرادات أخرى', 'revenue', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Other Revenue', 0, 'credit', '4/43', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (63, 1, 60, '411', 'مبيعات البضاعة', 'revenue', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Goods Sales', 1, 'credit', '4/41/411', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (64, 1, 60, '412', 'مردودات المبيعات', 'revenue', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Sales Returns', 1, 'credit', '4/41/412', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (65, 1, 60, '413', 'خصم ممنوح على المبيعات', 'revenue', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Sales Discount', 1, 'credit', '4/41/413', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (66, 1, 61, '421', 'إيرادات خدمات مهنية', 'revenue', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Professional Services', 1, 'credit', '4/42/421', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (67, 1, 61, '422', 'إيرادات صيانة وإصلاح', 'revenue', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Maintenance Revenue', 1, 'credit', '4/42/422', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (68, 1, 62, '431', 'إيرادات فوائد بنكية', 'revenue', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Bank Interest Income', 1, 'credit', '4/43/431', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (69, 1, 62, '432', 'أرباح بيع الأصول', 'revenue', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Gain on Asset Sale', 1, 'credit', '4/43/432', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (70, 1, 62, '433', 'إيرادات إيجارية', 'revenue', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Rental Income', 1, 'credit', '4/43/433', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (71, 1, 62, '434', 'إيرادات متنوعة', 'revenue', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Miscellaneous Income', 1, 'credit', '4/43/434', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (72, 1, 5, '51', 'تكلفة المبيعات', 'cogs', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Cost of Sales', 0, 'debit', '5/51', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (73, 1, 5, '52', 'المصروفات التشغيلية', 'expense', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Operating Expenses', 0, 'debit', '5/52', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (74, 1, 5, '53', 'المصروفات الإدارية', 'expense', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Administrative Exp', 0, 'debit', '5/53', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (75, 1, 5, '54', 'المصروفات المالية', 'expense', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Financial Expenses', 0, 'debit', '5/54', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (76, 1, 5, '55', 'مصروفات الإهلاك', 'expense', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Depreciation Expenses', 0, 'debit', '5/55', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (77, 1, 5, '56', 'مصروفات أخرى', 'expense', NULL, 0, 1, 2, 'SAR', 0, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Other Expenses', 0, 'debit', '5/56', 1, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (78, 1, 72, '511', 'تكلفة البضاعة المباعة', 'cogs', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Cost of Goods Sold', 1, 'debit', '5/51/511', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (79, 1, 72, '512', 'تكلفة الخدمات المقدمة', 'cogs', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Cost of Services', 1, 'debit', '5/51/512', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (80, 1, 72, '513', 'مشتريات', 'cogs', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Purchases', 1, 'debit', '5/51/513', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (81, 1, 72, '514', 'مردودات المشتريات', 'cogs', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Purchase Returns', 1, 'debit', '5/51/514', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (82, 1, 73, '521', 'رواتب وأجور العمال', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Labor Salaries', 1, 'debit', '5/52/521', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (83, 1, 73, '522', 'إيجار المحل / المكتب', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Rent Expense', 1, 'debit', '5/52/522', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (84, 1, 73, '523', 'كهرباء وماء وهاتف', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Utilities', 1, 'debit', '5/52/523', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (85, 1, 73, '524', 'دعاية وإعلان وتسويق', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Marketing & Ads', 1, 'debit', '5/52/524', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (86, 1, 73, '525', 'مصروفات صيانة وإصلاح', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Maintenance & Repairs', 1, 'debit', '5/52/525', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (87, 1, 73, '526', 'مواصلات ونقل وشحن', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Transportation', 1, 'debit', '5/52/526', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (88, 1, 73, '527', 'تأمينات', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Insurance', 1, 'debit', '5/52/527', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (89, 1, 73, '528', 'قرطاسية ومستلزمات مكتبية', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Office Supplies', 1, 'debit', '5/52/528', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (90, 1, 73, '529', 'مصروفات تشغيلية متنوعة', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Other Operating Exp', 1, 'debit', '5/52/529', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (91, 1, 74, '531', 'رواتب الإدارة', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Admin Salaries', 1, 'debit', '5/53/531', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (92, 1, 74, '532', 'مصروفات قانونية ومحاسبية', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Legal & Accounting', 1, 'debit', '5/53/532', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (93, 1, 74, '533', 'رسوم حكومية ورخص', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Government Fees', 1, 'debit', '5/53/533', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (94, 1, 74, '534', 'اشتراكات وعضويات', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Subscriptions', 1, 'debit', '5/53/534', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (95, 1, 74, '535', 'مصروفات سفر وإقامة', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Travel & Accommodation', 1, 'debit', '5/53/535', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (96, 1, 75, '541', 'فوائد وعمولات بنكية', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Bank Charges', 1, 'debit', '5/54/541', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (97, 1, 75, '542', 'خسائر فروق العملة', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'FX Losses', 1, 'debit', '5/54/542', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (98, 1, 75, '543', 'فوائد القروض', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Loan Interest', 1, 'debit', '5/54/543', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (99, 1, 76, '551', 'إهلاك الأصول الثابتة', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Fixed Asset Dep.', 1, 'debit', '5/55/551', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (100, 1, 76, '552', 'إهلاك الأصول غير الملموسة', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Intangible Asset Dep.', 1, 'debit', '5/55/552', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (101, 1, 77, '561', 'خسائر بيع الأصول', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Loss on Asset Sale', 1, 'debit', '5/56/561', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (102, 1, 77, '562', 'مصروفات متنوعة', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Miscellaneous Exp', 1, 'debit', '5/56/562', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (103, 1, 77, '563', 'ديون معدومة', 'expense', NULL, 0, 1, 3, 'SAR', 1, '2026-06-01 11:42:57', '2026-06-01 11:42:57', 'Bad Debts', 1, 'debit', '5/56/563', 0, 0, 0, NULL);
INSERT INTO `accounts` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `type`, `description`, `is_system`, `is_active`, `level`, `currency`, `allow_manual_entry`, `created_at`, `updated_at`, `name_en`, `is_postable`, `normal_balance`, `path`, `is_group`, `opening_balance`, `sort_order`, `deleted_at`) VALUES (104, 1, 44, '21112', 'مورد جديد', 'liability', NULL, 0, 1, 5, NULL, 1, '2026-06-02 22:28:08', '2026-06-02 22:28:08', NULL, 1, NULL, NULL, 0, 0, 0, NULL);

-- api_keys
DELETE FROM `api_keys`;

-- attendances
DELETE FROM `attendances`;

-- audit_logs
DELETE FROM `audit_logs`;
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (1, 1, 1, 'login', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-01 11:46:19', '2026-06-01 11:46:19', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (2, 1, 1, 'login', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-01 11:47:25', '2026-06-01 11:47:25', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (3, 1, 1, 'login', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-01 18:06:46', '2026-06-01 18:06:46', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (4, 1, 1, 'logout', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-01 18:14:24', '2026-06-01 18:14:24', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (5, 1, 1, 'login', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-01 18:33:51', '2026-06-01 18:33:51', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (6, 1, 1, 'logout', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-01 23:35:14', '2026-06-01 23:35:14', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (7, 1, 1, 'login', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-01 23:46:48', '2026-06-01 23:46:48', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (8, 1, 1, 'logout', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-01 23:47:05', '2026-06-01 23:47:05', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (9, 1, 1, 'login', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 00:09:45', '2026-06-02 00:09:45', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (10, 1, 1, 'logout', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 00:11:39', '2026-06-02 00:11:39', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (11, 1, 1, 'login', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 00:22:39', '2026-06-02 00:22:39', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (12, 1, 1, 'logout', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 00:24:48', '2026-06-02 00:24:48', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (13, 1, 1, 'login', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 00:24:59', '2026-06-02 00:24:59', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (14, 1, 1, 'logout', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 00:30:43', '2026-06-02 00:30:43', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (15, 1, 1, 'login', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 00:49:38', '2026-06-02 00:49:38', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (16, 1, 1, 'logout', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 21:22:32', '2026-06-02 21:22:32', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (17, 1, 1, 'login', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 21:23:34', '2026-06-02 21:23:34', 'sessions');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (18, 1, 1, 'created', 'App\Models\Item', 1, NULL, '{"code":"CAT-002-001","name":"\u0635\u0646\u0641 \u062a\u062c\u0631\u064a\u0628\u064a","name_en":null,"description":null,"unit":"\u0642\u0637\u0639\u0629","type":"inventory","category_id":2,"brand_id":null,"unit_id":1,"cost_price":"250.0000","selling_price":"400.0000","default_tax_percent":null,"min_selling_price":null,"max_selling_price":null,"min_quantity":"10.0000","barcode":"17804391276718871","sku":null,"tenant_id":1,"inventory_account_id":24,"cost_of_sales_account_id":78,"sales_account_id":63,"updated_at":"2026-06-02T22:25:51.000000Z","created_at":"2026-06-02T22:25:51.000000Z","id":1,"image_url":null}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 22:25:51', '2026-06-02 22:25:51', 'items');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (19, 1, 1, 'created', 'App\Models\Vendor', 1, NULL, '{"name":"\u0645\u0648\u0631\u062f \u062c\u062f\u064a\u062f","name_en":null,"company_name":null,"tax_number":null,"address":null,"country":null,"city":null,"email":null,"phone":"965","country_code":"965","tenant_id":1,"vendor_group_id":null,"account_id":104,"updated_at":"2026-06-02T22:28:08.000000Z","created_at":"2026-06-02T22:28:08.000000Z","id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 22:28:08', '2026-06-02 22:28:08', 'vendors');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (20, 1, NULL, 'created', 'App\Models\Vendor', 2, NULL, '{"tenant_id":1,"account_id":47,"name":"\u0645\u0648\u0631\u062f \u0646\u0642\u062f\u064a","name_en":"Cash Supplier","is_active":true,"updated_at":"2026-06-02T22:41:24.000000Z","created_at":"2026-06-02T22:41:24.000000Z","id":2}', '127.0.0.1', 'Symfony', '2026-06-02 22:41:25', '2026-06-02 22:41:25', 'vendors');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (21, 1, 1, 'created', 'App\Models\Invoice', 1, NULL, '{"type":"purchase","date":"2026-06-03T00:00:00.000000Z","due_date":null,"customer_id":null,"vendor_id":1,"branch_id":1,"warehouse_id":1,"cost_center_id":1,"payment_method_id":null,"pricing_group_id":null,"receipt_status":"received","payment_timing":null,"reference_number":null,"notes":null,"sales_rep_id":null,"payment_terms":null,"tenant_id":1,"status":"draft","created_by":1,"is_return":false,"parent_invoice_id":null,"quotation_id":null,"delivery_fees":[],"delivery_fees_total":"0.000","number":"PUR-0001","document_status":"draft","payment_status":"na","updated_at":"2026-06-02T23:07:16.000000Z","created_at":"2026-06-02T23:07:16.000000Z","id":1,"attachment_url":null}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 23:07:16', '2026-06-02 23:07:16', 'invoices');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (22, 1, 1, 'updated', 'App\Models\Invoice', 1, '{"id":1,"tenant_id":1,"number":"PUR-0001","type":"purchase","status":"draft","customer_id":null,"vendor_id":1,"date":"2026-06-03T00:00:00.000000Z","due_date":null,"payment_terms":null,"subtotal":"0.000","tax_amount":"0.000","discount_amount":"0.000","total":"0.000","amount_paid":"0.000","balance":"0.000","currency":null,"exchange_rate":"1.00000000","journal_entry_id":null,"notes":null,"metadata":null,"created_by":1,"created_at":"2026-06-02T23:07:16.000000Z","updated_at":"2026-06-02T23:07:16.000000Z","branch_id":1,"payment_method_id":null,"cost_center_id":1,"receipt_status":"received","payment_timing":null,"reference_number":null,"is_return":false,"parent_invoice_id":null,"pos_shift_id":null,"pos_session_id":null,"printed_at":null,"quotation_id":null,"warehouse_id":1,"sales_rep_id":null,"order_type":null,"table_id":null,"cost_amount":null,"attachment":null,"document_status":"draft","payment_status":"na","pricing_group_id":null,"auto_manufacturing_applied":false,"manufacturing_journal_entry_id":null,"delivery_ready_at":null,"delivery_driver_id":null,"delivery_fees":[],"delivery_fees_total":"0.000","promotion_id":null,"promotion_discount":0}', '{"subtotal":250,"total":250,"balance":250}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 23:07:16', '2026-06-02 23:07:16', 'invoices');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (23, 1, 1, 'created', 'App\Models\JournalEntry', 1, NULL, '{"tenant_id":1,"date":"2026-06-03T00:00:00.000000Z","type":"purchase","description":"\u0642\u064a\u062f \u0641\u0627\u062a\u0648\u0631\u0629 #PUR-0001","customer_id":null,"vendor_id":1,"branch_id":1,"reference_type":"App\\Models\\Invoice","reference_id":1,"status":"posted","created_by":1,"posted_at":"2026-06-02T23:07:17.000000Z","number":"JE2026-000001","updated_at":"2026-06-02T23:07:17.000000Z","created_at":"2026-06-02T23:07:17.000000Z","id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 23:07:17', '2026-06-02 23:07:17', 'journal_entries');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (24, 1, 1, 'updated', 'App\Models\JournalEntry', 1, '{"tenant_id":1,"date":"2026-06-03T00:00:00.000000Z","type":"purchase","description":"\u0642\u064a\u062f \u0641\u0627\u062a\u0648\u0631\u0629 #PUR-0001","customer_id":null,"vendor_id":1,"branch_id":1,"reference_type":"App\\Models\\Invoice","reference_id":1,"status":"posted","created_by":1,"posted_at":"2026-06-02T23:07:17.000000Z","number":"JE2026-000001","updated_at":"2026-06-02T23:07:17.000000Z","created_at":"2026-06-02T23:07:17.000000Z","id":1}', '{"total_debit":250,"total_credit":250}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 23:07:17', '2026-06-02 23:07:17', 'journal_entries');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (25, 1, 1, 'updated', 'App\Models\Invoice', 1, '{"id":1,"tenant_id":1,"number":"PUR-0001","type":"purchase","status":"draft","customer_id":null,"vendor_id":1,"date":"2026-06-03T00:00:00.000000Z","due_date":null,"payment_terms":null,"subtotal":"250.000","tax_amount":"0.000","discount_amount":"0.000","total":"250.000","amount_paid":"0.000","balance":"250.000","currency":null,"exchange_rate":"1.00000000","journal_entry_id":null,"notes":null,"metadata":null,"created_by":1,"created_at":"2026-06-02T23:07:16.000000Z","updated_at":"2026-06-02T23:07:16.000000Z","branch_id":1,"payment_method_id":null,"cost_center_id":1,"receipt_status":"received","payment_timing":null,"reference_number":null,"is_return":false,"parent_invoice_id":null,"pos_shift_id":null,"pos_session_id":null,"printed_at":null,"quotation_id":null,"warehouse_id":1,"sales_rep_id":null,"order_type":null,"table_id":null,"cost_amount":null,"attachment":null,"document_status":"draft","payment_status":"na","pricing_group_id":null,"auto_manufacturing_applied":false,"manufacturing_journal_entry_id":null,"delivery_ready_at":null,"delivery_driver_id":null,"delivery_fees":[],"delivery_fees_total":"0.000","promotion_id":null,"promotion_discount":0}', '{"journal_entry_id":1,"updated_at":"2026-06-02 23:07:17"}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 23:07:17', '2026-06-02 23:07:17', 'invoices');
INSERT INTO `audit_logs` (`id`, `tenant_id`, `user_id`, `action`, `model_type`, `model_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`, `updated_at`, `table_name`) VALUES (26, 1, 1, 'login', 'sessions', NULL, NULL, '{"user_id":1}', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-06-02 23:48:30', '2026-06-02 23:48:30', 'sessions');

-- bill_of_material_lines
DELETE FROM `bill_of_material_lines`;

-- bill_of_materials
DELETE FROM `bill_of_materials`;

-- branch_customer
DELETE FROM `branch_customer`;

-- branch_delivery_driver
DELETE FROM `branch_delivery_driver`;

-- branch_item_category
DELETE FROM `branch_item_category`;

-- branch_vendor
DELETE FROM `branch_vendor`;

-- branch_warehouse
DELETE FROM `branch_warehouse`;

-- branches
DELETE FROM `branches`;
INSERT INTO `branches` (`id`, `tenant_id`, `name`, `code`, `address`, `phone`, `manager_name`, `is_active`, `created_at`, `updated_at`, `deleted_at`, `name_en`) VALUES (1, 1, 'الفرع الرئيسي', 'MAIN', NULL, NULL, NULL, 1, '2026-06-01 11:42:58', '2026-06-01 11:42:58', NULL, NULL);
INSERT INTO `branches` (`id`, `tenant_id`, `name`, `code`, `address`, `phone`, `manager_name`, `is_active`, `created_at`, `updated_at`, `deleted_at`, `name_en`) VALUES (2, 1, 'فرع الشويخ', '1', 'الشويخ - قطعه 10', '5213151124', NULL, 1, '2026-06-01 11:44:04', '2026-06-01 11:44:04', NULL, NULL);
INSERT INTO `branches` (`id`, `tenant_id`, `name`, `code`, `address`, `phone`, `manager_name`, `is_active`, `created_at`, `updated_at`, `deleted_at`, `name_en`) VALUES (3, 1, 'فرع حولي', '2', NULL, NULL, NULL, 1, '2026-06-01 11:44:04', '2026-06-01 11:44:04', NULL, NULL);

-- cache
DELETE FROM `cache`;
INSERT INTO `cache` (`key`, `value`, `expiration`) VALUES ('laravel-cache-5c785c036466adea360111aa28563bfd556b5fba', 'i:1;', 1780444170);
INSERT INTO `cache` (`key`, `value`, `expiration`) VALUES ('laravel-cache-5c785c036466adea360111aa28563bfd556b5fba:timer', 'i:1780444170;', 1780444170);
INSERT INTO `cache` (`key`, `value`, `expiration`) VALUES ('laravel-cache-tenant_settings:1', 'a:15:{s:19:"allow_negative_sale";s:1:"0";s:12:"company_name";s:15:"FIRST CLICK ERP";s:18:"company_tax_number";s:0:"";s:16:"default_currency";s:3:"SAR";s:16:"default_vat_rate";s:1:"0";s:17:"fiscal_year_start";s:5:"01-01";s:28:"invoice_expiry_dates_enabled";s:1:"0";s:23:"invoice_prefix_purchase";s:4:"PUR-";s:20:"invoice_prefix_sales";s:4:"Sal-";s:30:"invoice_show_serial_in_reports";s:1:"0";s:26:"invoice_use_serial_numbers";s:1:"0";s:34:"invoice_variants_purchases_enabled";s:1:"0";s:30:"invoice_variants_sales_enabled";s:1:"1";s:11:"vat_enabled";s:1:"1";s:8:"vat_rate";s:5:"15.00";}', 1780520200);

-- cache_locks
DELETE FROM `cache_locks`;

-- cost_centers
DELETE FROM `cost_centers`;
INSERT INTO `cost_centers` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `description`, `is_active`, `created_at`, `updated_at`, `name_en`) VALUES (1, 1, NULL, '1', 'مركز تكلفه 1', NULL, 1, '2026-06-01 11:44:04', '2026-06-01 11:44:04', NULL);

-- currencies
DELETE FROM `currencies`;
INSERT INTO `currencies` (`id`, `code`, `name`, `symbol`, `decimal_places`, `exchange_rate`, `base_currency`, `rate_date`, `is_active`, `created_at`, `updated_at`, `tenant_id`, `is_default`, `name_en`) VALUES (1, 'SAR', 'ريال سعودي', 'ر.س', 2, 13.926412834582, 'SAR', '2026-06-01 00:00:00', 1, '2026-06-01 11:42:58', '2026-06-01 19:22:45', 1, 0, NULL);
INSERT INTO `currencies` (`id`, `code`, `name`, `symbol`, `decimal_places`, `exchange_rate`, `base_currency`, `rate_date`, `is_active`, `created_at`, `updated_at`, `tenant_id`, `is_default`, `name_en`) VALUES (2, 'KD', 'دينار كويتي', '1', 3, 168.83336147223, 'SAR', '2026-06-01 00:00:00', 1, '2026-06-01 11:44:04', '2026-06-01 19:22:45', 1, 0, NULL);
INSERT INTO `currencies` (`id`, `code`, `name`, `symbol`, `decimal_places`, `exchange_rate`, `base_currency`, `rate_date`, `is_active`, `created_at`, `updated_at`, `tenant_id`, `is_default`, `name_en`) VALUES (4, 'EGP', 'جنيه مصري', NULL, 2, 1, 'SAR', '2026-06-01 00:00:00', 1, '2026-06-01 19:22:39', '2026-06-01 19:22:41', 1, 1, NULL);

-- customer_groups
DELETE FROM `customer_groups`;

-- customers
DELETE FROM `customers`;

-- delivery_assignments
DELETE FROM `delivery_assignments`;

-- delivery_drivers
DELETE FROM `delivery_drivers`;

-- document_templates
DELETE FROM `document_templates`;

-- employee_documents
DELETE FROM `employee_documents`;

-- employees
DELETE FROM `employees`;

-- failed_jobs
DELETE FROM `failed_jobs`;

-- fiscal_years
DELETE FROM `fiscal_years`;

-- hr_administrations
DELETE FROM `hr_administrations`;

-- hr_allowances
DELETE FROM `hr_allowances`;

-- hr_deductions
DELETE FROM `hr_deductions`;

-- hr_departments
DELETE FROM `hr_departments`;

-- hr_job_titles
DELETE FROM `hr_job_titles`;

-- hr_leave_types
DELETE FROM `hr_leave_types`;

-- hr_requests
DELETE FROM `hr_requests`;

-- installment_lines
DELETE FROM `installment_lines`;

-- installment_periods
DELETE FROM `installment_periods`;
INSERT INTO `installment_periods` (`id`, `tenant_id`, `code`, `months`, `name`, `name_en`, `is_active`, `created_at`, `updated_at`) VALUES (1, NULL, 'monthly', 1, 'شهري', 'Monthly', 1, '2026-06-01 11:42:51', '2026-06-01 11:42:51');
INSERT INTO `installment_periods` (`id`, `tenant_id`, `code`, `months`, `name`, `name_en`, `is_active`, `created_at`, `updated_at`) VALUES (2, NULL, 'quarterly', 3, 'ربع سنوي', 'Quarterly', 1, '2026-06-01 11:42:51', '2026-06-01 11:42:51');
INSERT INTO `installment_periods` (`id`, `tenant_id`, `code`, `months`, `name`, `name_en`, `is_active`, `created_at`, `updated_at`) VALUES (3, NULL, 'semi_annually', 6, 'نصف سنوي', 'Semi-Annually', 1, '2026-06-01 11:42:51', '2026-06-01 11:42:51');
INSERT INTO `installment_periods` (`id`, `tenant_id`, `code`, `months`, `name`, `name_en`, `is_active`, `created_at`, `updated_at`) VALUES (4, NULL, 'annually', 12, 'سنوي', 'Annually', 1, '2026-06-01 11:42:51', '2026-06-01 11:42:51');

-- installments
DELETE FROM `installments`;

-- inventory_adjustment_lines
DELETE FROM `inventory_adjustment_lines`;

-- inventory_adjustments
DELETE FROM `inventory_adjustments`;

-- inventory_movements
DELETE FROM `inventory_movements`;
INSERT INTO `inventory_movements` (`id`, `tenant_id`, `item_id`, `type`, `quantity`, `unit_cost`, `total_cost`, `reference_type`, `reference_id`, `date`, `notes`, `created_by`, `created_at`, `updated_at`, `warehouse_id`, `branch_id`, `item_variant_id`, `expiry_date`, `batch_number`) VALUES (1, 1, 1, 'in', 1, 250, 250, 'App\Models\Invoice', 1, '2026-06-03 00:00:00', NULL, 1, '2026-06-02 23:07:17', '2026-06-02 23:07:17', 1, NULL, NULL, NULL, NULL);

-- invoice_additional_expenses
DELETE FROM `invoice_additional_expenses`;

-- invoice_line_modifiers
DELETE FROM `invoice_line_modifiers`;

-- invoice_line_serials
DELETE FROM `invoice_line_serials`;

-- invoice_lines
DELETE FROM `invoice_lines`;
INSERT INTO `invoice_lines` (`id`, `invoice_id`, `item_id`, `account_id`, `description`, `quantity`, `unit_price`, `discount_percent`, `tax_percent`, `amount`, `tax_amount`, `total`, `sort_order`, `created_at`, `updated_at`, `unit_id`, `serial_numbers`, `landed_cost_allocated`, `distribution_weight`, `item_variant_id`, `expiry_date`, `batch_number`, `discount_amount`) VALUES (1, 1, 1, NULL, 'صنف تجريبي', 1, 250, 0, 0, 250, 0, 250, 0, '2026-06-02 23:07:16', '2026-06-02 23:07:16', 1, '[]', 0, NULL, NULL, NULL, NULL, 0);

-- invoice_manufacturing_frozen_batches
DELETE FROM `invoice_manufacturing_frozen_batches`;

-- invoice_manufacturing_frozen_components
DELETE FROM `invoice_manufacturing_frozen_components`;

-- invoice_payments
DELETE FROM `invoice_payments`;

-- invoices
DELETE FROM `invoices`;
INSERT INTO `invoices` (`id`, `tenant_id`, `number`, `type`, `status`, `customer_id`, `vendor_id`, `date`, `due_date`, `payment_terms`, `subtotal`, `tax_amount`, `discount_amount`, `total`, `amount_paid`, `balance`, `currency`, `exchange_rate`, `journal_entry_id`, `notes`, `metadata`, `created_by`, `created_at`, `updated_at`, `branch_id`, `payment_method_id`, `cost_center_id`, `receipt_status`, `payment_timing`, `reference_number`, `is_return`, `parent_invoice_id`, `pos_shift_id`, `pos_session_id`, `printed_at`, `quotation_id`, `warehouse_id`, `sales_rep_id`, `order_type`, `table_id`, `cost_amount`, `attachment`, `document_status`, `payment_status`, `pricing_group_id`, `auto_manufacturing_applied`, `manufacturing_journal_entry_id`, `delivery_ready_at`, `delivery_driver_id`, `delivery_fees`, `delivery_fees_total`, `promotion_id`, `promotion_discount`) VALUES (1, 1, 'PUR-0001', 'purchase', 'sent', NULL, 1, '2026-06-03 00:00:00', NULL, NULL, 250, 0, 0, 250, 0, 250, NULL, 1, 1, NULL, NULL, 1, '2026-06-02 23:07:16', '2026-06-02 23:07:17', 1, NULL, 1, 'received', NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, 'posted', 'unpaid', NULL, 0, NULL, NULL, NULL, '[]', 0, NULL, 0);

-- item_attribute_template_values
DELETE FROM `item_attribute_template_values`;

-- item_attribute_templates
DELETE FROM `item_attribute_templates`;

-- item_brands
DELETE FROM `item_brands`;
INSERT INTO `item_brands` (`id`, `tenant_id`, `name`, `description`, `is_active`, `created_at`, `updated_at`, `name_en`) VALUES (1, 1, 'سامسونج', NULL, 1, '2026-06-02 21:30:01', '2026-06-02 21:30:01', NULL);

-- item_categories
DELETE FROM `item_categories`;
INSERT INTO `item_categories` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `description`, `is_active`, `created_at`, `updated_at`, `name_en`, `inventory_account_id`, `cost_of_sales_account_id`, `sales_account_id`, `image`, `applies_to_all_branches`, `show_in_pos`, `show_in_restaurant_pos`) VALUES (1, 1, NULL, 'CAT-001', 'الكترونيات', NULL, 1, '2026-06-01 14:15:20', '2026-06-01 14:15:20', NULL, 24, 78, 63, NULL, 1, 1, 0);
INSERT INTO `item_categories` (`id`, `tenant_id`, `parent_id`, `code`, `name`, `description`, `is_active`, `created_at`, `updated_at`, `name_en`, `inventory_account_id`, `cost_of_sales_account_id`, `sales_account_id`, `image`, `applies_to_all_branches`, `show_in_pos`, `show_in_restaurant_pos`) VALUES (2, 1, NULL, 'CAT-002', 'مواد غذائية', NULL, 1, '2026-06-01 14:15:41', '2026-06-01 14:15:41', NULL, 24, 78, 63, NULL, 1, 1, 1);

-- item_modifier_group
DELETE FROM `item_modifier_group`;

-- item_serials
DELETE FROM `item_serials`;

-- item_unit_options
DELETE FROM `item_unit_options`;

-- item_units
DELETE FROM `item_units`;
INSERT INTO `item_units` (`id`, `tenant_id`, `name`, `symbol`, `is_active`, `created_at`, `updated_at`, `name_en`) VALUES (1, 1, 'قطعة', 'pc', 1, '2026-06-01 11:42:58', '2026-06-01 11:42:58', NULL);
INSERT INTO `item_units` (`id`, `tenant_id`, `name`, `symbol`, `is_active`, `created_at`, `updated_at`, `name_en`) VALUES (2, 1, 'كرتون', 'box', 1, '2026-06-01 11:42:58', '2026-06-01 11:42:58', NULL);
INSERT INTO `item_units` (`id`, `tenant_id`, `name`, `symbol`, `is_active`, `created_at`, `updated_at`, `name_en`) VALUES (3, 1, 'كيلو', 'kg', 1, '2026-06-01 11:42:58', '2026-06-01 11:42:58', NULL);

-- item_variants
DELETE FROM `item_variants`;

-- items
DELETE FROM `items`;
INSERT INTO `items` (`id`, `tenant_id`, `category_id`, `default_vendor_id`, `inventory_account_id`, `cost_of_sales_account_id`, `sales_account_id`, `code`, `name`, `description`, `unit`, `type`, `cost_price`, `selling_price`, `min_quantity`, `max_quantity`, `currency`, `is_active`, `track_quantity`, `barcode`, `sku`, `created_at`, `updated_at`, `unit_id`, `brand_id`, `name_en`, `image`, `min_selling_price`, `max_selling_price`, `default_tax_percent`, `use_serial_number`) VALUES (1, 1, 2, NULL, 24, 78, 63, 'CAT-002-001', 'صنف تجريبي', NULL, 'قطعة', 'inventory', 250, 400, 10, NULL, NULL, 1, 1, '17804391276718871', NULL, '2026-06-02 22:25:51', '2026-06-02 23:07:17', 1, NULL, NULL, NULL, NULL, NULL, NULL, 0);

-- job_batches
DELETE FROM `job_batches`;

-- jobs
DELETE FROM `jobs`;

-- journal_entries
DELETE FROM `journal_entries`;
INSERT INTO `journal_entries` (`id`, `tenant_id`, `number`, `date`, `type`, `description`, `reference_type`, `reference_id`, `currency`, `total_debit`, `total_credit`, `status`, `created_by`, `posted_at`, `created_at`, `updated_at`, `customer_id`, `vendor_id`, `branch_id`) VALUES (1, 1, 'JE2026-000001', '2026-06-03 00:00:00', 'purchase', 'قيد فاتورة #PUR-0001', 'App\Models\Invoice', 1, NULL, 250, 250, 'posted', 1, '2026-06-02 23:07:17', '2026-06-02 23:07:17', '2026-06-02 23:07:17', NULL, 1, 1);

-- journal_entry_lines
DELETE FROM `journal_entry_lines`;
INSERT INTO `journal_entry_lines` (`id`, `journal_entry_id`, `account_id`, `cost_center_id`, `debit`, `credit`, `description`, `currency`, `exchange_rate`, `created_at`, `updated_at`) VALUES (1, 1, 24, NULL, 250, 0, 'فاتورة مشتريات رقم: PUR-0001', NULL, 1, '2026-06-02 23:07:17', '2026-06-02 23:07:17');
INSERT INTO `journal_entry_lines` (`id`, `journal_entry_id`, `account_id`, `cost_center_id`, `debit`, `credit`, `description`, `currency`, `exchange_rate`, `created_at`, `updated_at`) VALUES (2, 1, 104, NULL, 0, 250, 'فاتورة مشتريات رقم: PUR-0001', NULL, 1, '2026-06-02 23:07:17', '2026-06-02 23:07:17');

-- kitchen_ticket_lines
DELETE FROM `kitchen_ticket_lines`;

-- kitchen_tickets
DELETE FROM `kitchen_tickets`;

-- loan_installments
DELETE FROM `loan_installments`;

-- loyalty_points
DELETE FROM `loyalty_points`;

-- loyalty_programs
DELETE FROM `loyalty_programs`;

-- loyalty_tiers
DELETE FROM `loyalty_tiers`;

-- migrations
DELETE FROM `migrations`;
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (1, '0001_01_01_000000_create_users_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (2, '0001_01_01_000001_create_cache_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (3, '0001_01_01_000002_create_jobs_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (4, '2025_02_28_000001_create_subscription_plans_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (5, '2025_02_28_000002_create_tenants_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (6, '2025_02_28_000003_create_tenant_users_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (7, '2025_02_28_000004_create_subscriptions_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (8, '2025_02_28_000005_add_two_factor_to_users_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (9, '2025_02_28_000006_create_currencies_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (10, '2025_02_28_000007_create_cost_centers_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (11, '2025_02_28_000008_create_accounts_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (12, '2025_02_28_000009_create_journal_entries_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (13, '2025_02_28_000010_create_journal_entry_lines_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (14, '2025_02_28_000011_create_customers_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (15, '2025_02_28_000012_create_vendors_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (16, '2025_02_28_000013_create_item_categories_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (17, '2025_02_28_000014_create_items_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (18, '2025_02_28_000015_create_invoices_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (19, '2025_02_28_000016_create_invoice_lines_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (20, '2025_02_28_000017_create_payments_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (21, '2025_02_28_000018_create_inventory_movements_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (22, '2025_02_28_000019_create_audit_logs_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (23, '2026_02_28_163756_create_personal_access_tokens_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (24, '2026_02_28_200000_add_client_fields_to_journal_entries', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (25, '2026_02_28_300000_create_item_units_and_brands', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (26, '2026_02_28_400000_add_modules_payment_methods_branches', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (27, '2026_02_28_500000_add_accounts_and_cost_center_to_payments', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (28, '2026_02_28_500000_add_name_en_to_all_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (29, '2026_02_28_600000_add_invoice_fields_and_line_unit', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (30, '2026_02_28_700000_add_reference_number_to_invoices', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (31, '2026_02_28_800000_create_opening_stock_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (32, '2026_03_01_100000_add_invoice_id_to_payments_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (33, '2026_03_01_120000_add_return_fields_to_invoices_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (34, '2026_03_01_150000_add_is_postable_to_accounts_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (35, '2026_03_01_200000_create_tenant_account_defaults_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (36, '2026_03_01_200001_add_account_ids_to_item_categories_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (37, '2026_03_01_220000_create_permissions_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (38, '2026_03_01_220001_create_roles_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (39, '2026_03_01_220002_create_role_permissions_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (40, '2026_03_01_220003_add_rbac_and_super_admin_fields', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (41, '2026_03_02_100000_create_pos_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (42, '2026_03_02_100000_create_quotations_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (43, '2026_03_02_200000_add_image_to_items_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (44, '2026_03_02_210000_create_tenant_settings_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (45, '2026_03_02_220000_add_min_max_selling_price_to_items_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (46, '2026_03_03_100000_create_customer_groups_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (47, '2026_03_03_100001_add_customer_group_id_to_customers_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (48, '2026_03_03_120000_add_purchase_discounts_to_tenant_account_defaults_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (49, '2026_03_04_100000_create_warehouses_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (50, '2026_03_04_100001_add_warehouse_id_to_inventory_movements', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (51, '2026_03_04_100002_create_transfer_headers_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (52, '2026_03_04_100003_create_transfer_lines_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (53, '2026_03_05_100000_add_normal_balance_to_accounts_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (54, '2026_03_05_100000_add_warehouse_id_to_invoices', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (55, '2026_03_05_100001_add_warehouse_id_to_opening_stock_headers', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (56, '2026_03_05_200100_create_document_templates_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (57, '2026_03_06_100000_add_attachment_and_workflow_to_payments', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (58, '2026_03_06_100000_create_item_unit_options_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (59, '2026_03_07_100000_add_branch_warehouse_to_tenant_users', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (60, '2026_03_07_100000_add_default_tax_percent_to_items_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (61, '2026_03_07_120000_create_purchase_requests_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (62, '2026_03_08_100000_add_serial_numbers_tracking', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (63, '2026_03_08_100001_add_serial_numbers_to_invoice_lines', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (64, '2026_03_08_200000_add_duration_days_to_subscription_plans', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (65, '2026_03_09_100000_create_bill_of_materials_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (66, '2026_03_09_100001_create_production_orders_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (67, '2026_03_10_100000_create_sales_reps_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (68, '2026_03_10_100001_add_sales_rep_id_to_invoices_and_payments', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (69, '2026_03_10_100002_add_address_phone_branches_to_sales_reps', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (70, '2026_03_11_100000_add_pos_accounts_to_tenant_account_defaults', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (71, '2026_03_11_200000_create_pos_expense_categories_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (72, '2026_03_11_210000_create_pos_expense_items_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (73, '2026_03_11_220000_add_pos_shift_id_to_payments_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (74, '2026_03_12_100500_add_branch_and_user_to_warehouses_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (75, '2026_03_12_200000_create_restaurant_tables_and_modifiers', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (76, '2026_03_12_200100_create_kitchen_tickets_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (77, '2026_03_12_200200_add_order_type_and_table_to_invoices', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (78, '2026_03_12_210000_create_restaurant_sections_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (79, '2026_03_12_220000_add_branch_id_to_restaurant_sections_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (80, '2026_03_12_230000_add_kitchen_kds_fields', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (81, '2026_03_14_100000_add_country_city_country_code_to_customers', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (82, '2026_03_14_100000_add_image_to_item_categories_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (83, '2026_03_14_100000_create_installments_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (84, '2026_03_14_100000_create_notifications_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (85, '2026_03_14_100001_add_country_city_country_code_to_vendors', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (86, '2026_03_14_100001_add_installments_receivable_to_tenant_account_defaults', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (87, '2026_03_14_100002_add_company_name_to_customers_and_vendors', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (88, '2026_03_15_100000_create_account_mapping_pivot_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (89, '2026_03_15_100000_create_restaurant_orders_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (90, '2026_03_16_000001_add_username_phone_to_users_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (91, '2026_03_16_200000_add_cost_amount_to_invoices_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (92, '2026_03_17_200000_create_hr_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (93, '2026_03_17_210000_create_hr_org_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (94, '2026_03_17_220000_add_manager_to_hr_departments', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (95, '2026_03_17_230000_add_i18n_fields_to_hr_departments', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (96, '2026_03_17_240000_add_fields_to_hr_administrations', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (97, '2026_03_17_250000_create_hr_job_titles_and_leave_types', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (98, '2026_03_17_260000_create_hr_allowances_and_deductions', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (99, '2026_03_17_270000_add_other_allowances_to_payroll_lines', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (100, '2026_03_18_000001_add_attachment_to_invoices', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (101, '2026_03_22_200000_create_branch_customer_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (102, '2026_03_22_210000_create_branch_vendor_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (103, '2026_03_22_220000_add_applies_to_all_branches_to_item_categories_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (104, '2026_03_22_220100_create_branch_item_category_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (105, '2026_03_22_230000_add_responsible_employee_id_to_warehouses_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (106, '2026_03_23_120000_add_name_en_to_warehouses_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (107, '2026_03_23_130000_warehouse_branches_pivot', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (108, '2026_03_23_140000_unique_bill_of_material_per_finished_item', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (109, '2026_03_25_000001_create_inventory_adjustments_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (110, '2026_03_25_000002_create_inventory_adjustment_lines_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (111, '2026_03_25_000003_add_inventory_adjustment_accounts_to_tenant_account_defaults', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (112, '2026_03_25_000004_add_action_to_inventory_adjustment_lines_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (113, '2026_03_26_000001_add_target_account_id_to_inventory_adjustments', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (114, '2026_03_26_000002_add_unit_to_inventory_adjustment_lines_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (115, '2026_03_26_000003_add_overhead_cost_to_production_orders_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (116, '2026_03_26_000004_add_pos_visibility_to_item_categories_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (117, '2026_03_26_000005_add_branch_and_cost_center_to_transfer_headers_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (118, '2026_03_31_100000_create_item_attribute_templates', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (119, '2026_04_01_100000_drop_unique_tenant_name_from_item_attribute_templates', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (120, '2026_04_05_120000_add_invoice_document_and_payment_status', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (121, '2026_04_08_000001_create_pricing_groups_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (122, '2026_04_08_000002_add_pricing_group_to_customers_and_invoices_and_roles', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (123, '2026_04_08_000004_add_operation_type_to_pricing_groups_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (124, '2026_04_08_000005_create_pricing_group_scopes', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (125, '2026_04_12_120000_add_auto_manufacturing_applied_to_invoices_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (126, '2026_04_12_140000_change_invoices_number_unique_to_tenant_scoped', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (127, '2026_04_13_100000_create_invoice_manufacturing_frozen_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (128, '2026_04_13_100001_add_branch_id_to_inventory_movements', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (129, '2026_04_13_120000_add_manufacturing_journal_entry_id_to_invoices', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (130, '2026_04_14_100000_add_created_by_to_production_orders_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (131, '2026_04_15_000001_create_payment_method_user_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (132, '2026_04_17_000001_create_vendor_groups_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (133, '2026_04_17_000002_add_vendor_group_id_to_vendors_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (134, '2026_04_18_210000_create_invoice_additional_expenses_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (135, '2026_04_18_210001_add_landed_cost_to_invoice_lines_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (136, '2026_04_21_100000_create_item_variants_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (137, '2026_04_21_100001_add_item_variant_id_to_inventory_movements_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (138, '2026_04_21_120000_add_line_overrides_to_production_orders_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (139, '2026_04_21_180000_create_production_order_expenses_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (140, '2026_04_22_100000_add_item_variant_id_to_invoice_lines_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (141, '2026_04_23_120000_add_expiry_and_batch_to_invoice_lines_and_inventory_movements', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (142, '2026_04_25_140000_installments_invoice_vendor_account_line_payment', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (143, '2026_04_26_220000_create_installment_periods_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (144, '2026_04_27_120000_add_installments_payable_account_to_tenant_account_defaults', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (145, '2026_04_27_150000_add_cost_center_id_to_installments_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (146, '2026_04_30_100000_create_delivery_drivers_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (147, '2026_04_30_100001_create_delivery_assignments_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (148, '2026_04_30_100002_add_delivery_ready_at_to_invoices_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (149, '2026_05_01_120000_add_delivery_driver_id_to_invoices_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (150, '2026_05_01_120001_create_shipping_orders_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (151, '2026_05_01_130000_add_code_to_delivery_drivers_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (152, '2026_05_01_130010_create_branch_delivery_driver_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (153, '2026_05_02_120000_create_fiscal_years_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (154, '2026_05_02_120001_add_fiscal_year_fields_to_opening_stock_headers', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (155, '2026_05_03_000000_add_closing_summary_to_fiscal_years_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (156, '2026_05_03_120000_add_delivery_fees_to_invoices_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (157, '2026_05_03_120000_add_retained_earnings_account_id_to_fiscal_years_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (158, '2026_05_04_120000_add_discount_amount_to_invoice_lines_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (159, '2026_05_05_120000_create_api_keys_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (160, '2026_05_05_120001_create_webhooks_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (161, '2026_05_07_090000_create_loyalty_programs_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (162, '2026_05_07_090010_create_loyalty_tiers_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (163, '2026_05_07_090020_create_loyalty_points_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (164, '2026_05_07_090030_add_loyalty_fields_to_customers_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (165, '2026_05_07_103000_update_loyalty_programs_add_multi_support', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (166, '2026_05_07_103010_update_loyalty_tiers_link_to_program', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (167, '2026_05_07_103020_update_loyalty_points_add_program_id', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (168, '2026_05_07_103030_update_customers_loyalty_per_program', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (169, '2026_05_08_120000_add_source_index_to_loyalty_points_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (170, '2026_05_11_120000_create_print_templates_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (171, '2026_05_14_000001_add_blocks_json_to_print_templates_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (172, '2026_05_16_000001_add_layout_to_print_templates_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (173, '2026_05_24_100000_create_reset_logs_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (174, '2026_05_24_100000_create_restaurant_menu_tables', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (175, '2026_05_24_100001_nullable_item_id_restaurant_order_lines', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (176, '2026_05_24_120000_add_image_to_restaurant_menu_categories', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (177, '2026_05_24_120000_create_promotions_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (178, '2026_05_24_120001_create_promotion_usages_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (179, '2026_05_24_120002_add_promotion_to_invoices', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (180, '2026_05_26_100000_enhance_accounts_chart_structure', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (181, '2026_06_01_120000_add_tenant_profile_fields', 2);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (182, '2026_06_02_100000_create_platform_login_page_settings_table', 3);

-- notifications
DELETE FROM `notifications`;

-- opening_stock_headers
DELETE FROM `opening_stock_headers`;

-- opening_stock_items
DELETE FROM `opening_stock_items`;

-- password_reset_tokens
DELETE FROM `password_reset_tokens`;

-- payment_method_user
DELETE FROM `payment_method_user`;

-- payment_methods
DELETE FROM `payment_methods`;
INSERT INTO `payment_methods` (`id`, `tenant_id`, `name`, `type`, `linked_account_id`, `is_active`, `created_at`, `updated_at`, `deleted_at`, `name_en`) VALUES (1, 1, 'نقدي', 'cash', 14, 1, '2026-06-01 11:42:58', '2026-06-01 11:42:58', NULL, NULL);
INSERT INTO `payment_methods` (`id`, `tenant_id`, `name`, `type`, `linked_account_id`, `is_active`, `created_at`, `updated_at`, `deleted_at`, `name_en`) VALUES (2, 1, 'بنك', 'bank', 15, 1, '2026-06-01 11:42:58', '2026-06-01 11:42:58', NULL, NULL);
INSERT INTO `payment_methods` (`id`, `tenant_id`, `name`, `type`, `linked_account_id`, `is_active`, `created_at`, `updated_at`, `deleted_at`, `name_en`) VALUES (3, 1, 'انستا باي', 'bank', 16, 1, '2026-06-01 12:14:07', '2026-06-01 12:14:07', NULL, NULL);

-- payments
DELETE FROM `payments`;

-- payroll_lines
DELETE FROM `payroll_lines`;

-- payroll_runs
DELETE FROM `payroll_runs`;

-- permissions
DELETE FROM `permissions`;

-- personal_access_tokens
DELETE FROM `personal_access_tokens`;
INSERT INTO `personal_access_tokens` (`id`, `tokenable_type`, `tokenable_id`, `name`, `token`, `abilities`, `last_used_at`, `expires_at`, `created_at`, `updated_at`) VALUES (2, 'App\Models\User', 1, 'auth-token', '3dd0c30e9ee000e5a3a30cbbfe15dc568a58f9375bf4ba30374de9c945ecbf16', '["*"]', '2026-06-01 12:09:12', NULL, '2026-06-01 11:47:25', '2026-06-01 12:09:12');
INSERT INTO `personal_access_tokens` (`id`, `tokenable_type`, `tokenable_id`, `name`, `token`, `abilities`, `last_used_at`, `expires_at`, `created_at`, `updated_at`) VALUES (9, 'App\Models\User', 1, 'auth-token', 'dad3a2f08be391b10cbbde0c9b681a0f8ec4a074cd9e5963d030375c92acca06', '["*"]', '2026-06-02 00:52:35', NULL, '2026-06-02 00:49:38', '2026-06-02 00:52:35');
INSERT INTO `personal_access_tokens` (`id`, `tokenable_type`, `tokenable_id`, `name`, `token`, `abilities`, `last_used_at`, `expires_at`, `created_at`, `updated_at`) VALUES (10, 'App\Models\User', 1, 'auth-token', 'a07e73539024b1adafe53471de705baa676da770181e8af82c1eae287fb227e7', '["*"]', '2026-06-03 21:01:13', NULL, '2026-06-02 21:23:34', '2026-06-03 21:01:13');
INSERT INTO `personal_access_tokens` (`id`, `tokenable_type`, `tokenable_id`, `name`, `token`, `abilities`, `last_used_at`, `expires_at`, `created_at`, `updated_at`) VALUES (11, 'App\Models\User', 1, 'auth-token', '47085bde259b128354d9816fd1a2cffed8e6fa2d2019771917a060225f43cfcd', '["*"]', '2026-06-02 23:48:55', NULL, '2026-06-02 23:48:30', '2026-06-02 23:48:55');

-- platform_login_page_settings
DELETE FROM `platform_login_page_settings`;
INSERT INTO `platform_login_page_settings` (`id`, `content`, `created_at`, `updated_at`) VALUES (1, '{"headline_ar":"\u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u062d\u0627\u0633\u0628\u0629 \u0627\u0644\u0645\u062a\u0643\u0627\u0645\u0644","headline_en":"Integrated Accounting System","tagline_ar":"\u0628\u0631\u0646\u0627\u0645\u062c \u0645\u062d\u0627\u0633\u0628\u064a | \u0630\u0643\u0627\u0621 \u0645\u062d\u0644\u064a | \u0627\u0646\u062a\u0634\u0627\u0631 \u0639\u0627\u0644\u0645\u064a","tagline_en":"ACCOUNTING SOFTWARE | LOCAL INTELLIGENCE | GLOBAL REACH","subtitle_ar":"\u0623\u062f\u062e\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u062d\u0633\u0627\u0628\u0643 \u0644\u0644\u0645\u062a\u0627\u0628\u0639\u0629","subtitle_en":"Enter your account details to continue","features_ar":["\u0625\u062f\u0627\u0631\u0629 \u0645\u0627\u0644\u064a\u0629 \u0645\u062a\u0643\u0627\u0645\u0644\u0629","\u0646\u0642\u0627\u0637 \u0628\u064a\u0639 \u0645\u062a\u0639\u062f\u062f\u0629","\u0627\u062f\u0627\u0631\u0629 \u0644\u0644\u0645\u0637\u0627\u0639\u0645","\u062a\u0642\u0627\u0631\u064a\u0631 \u0630\u0643\u064a\u0629 \u0641\u0648\u0631\u064a\u0629"],"features_en":["Integrated financial management","Multi POS","Restaurant Management","Instant smart reports"],"contact_title_ar":"\u062a\u0648\u0627\u0635\u0644 \u0645\u0639\u0646\u0627","contact_title_en":"Contact us","phone":"+201149412646","phone_display":"+201149412646","whatsapp":"+201149412646","email":"support@firstclickerp.top","website":"firstclickerp.top","show_brand_panel":true,"show_contact_section":true,"show_demo_hint":true,"show_forgot_password_link":true,"copyright_ar":"First Click ERP","copyright_en":"First Click ERP","app_version":"1.0.0"}', '2026-06-02 00:11:26', '2026-06-02 00:24:46');

-- pos_expense_categories
DELETE FROM `pos_expense_categories`;

-- pos_expense_items
DELETE FROM `pos_expense_items`;

-- pos_held_carts
DELETE FROM `pos_held_carts`;

-- pos_sessions
DELETE FROM `pos_sessions`;

-- pos_shifts
DELETE FROM `pos_shifts`;

-- pricing_group_branch
DELETE FROM `pricing_group_branch`;

-- pricing_group_tenant_user
DELETE FROM `pricing_group_tenant_user`;

-- pricing_groups
DELETE FROM `pricing_groups`;

-- print_templates
DELETE FROM `print_templates`;

-- product_modifier_groups
DELETE FROM `product_modifier_groups`;

-- product_modifier_options
DELETE FROM `product_modifier_options`;

-- production_order_expenses
DELETE FROM `production_order_expenses`;

-- production_order_materials
DELETE FROM `production_order_materials`;

-- production_orders
DELETE FROM `production_orders`;

-- promotion_usages
DELETE FROM `promotion_usages`;

-- promotions
DELETE FROM `promotions`;

-- purchase_request_lines
DELETE FROM `purchase_request_lines`;

-- purchase_requests
DELETE FROM `purchase_requests`;

-- quotation_lines
DELETE FROM `quotation_lines`;

-- quotations
DELETE FROM `quotations`;

-- reset_logs
DELETE FROM `reset_logs`;

-- restaurant_menu_categories
DELETE FROM `restaurant_menu_categories`;

-- restaurant_menu_items
DELETE FROM `restaurant_menu_items`;

-- restaurant_menu_settings
DELETE FROM `restaurant_menu_settings`;

-- restaurant_order_lines
DELETE FROM `restaurant_order_lines`;

-- restaurant_orders
DELETE FROM `restaurant_orders`;

-- restaurant_sections
DELETE FROM `restaurant_sections`;

-- restaurant_tables
DELETE FROM `restaurant_tables`;

-- role_permissions
DELETE FROM `role_permissions`;

-- roles
DELETE FROM `roles`;
INSERT INTO `roles` (`id`, `tenant_id`, `name`, `slug`, `description`, `is_system`, `sort_order`, `created_at`, `updated_at`, `pricing_group_ids`) VALUES (1, NULL, 'المسؤول العام', 'super_admin', 'صلاحيات كاملة على النظام', 1, 0, '2026-06-01 11:42:55', '2026-06-01 11:42:55', NULL);
INSERT INTO `roles` (`id`, `tenant_id`, `name`, `slug`, `description`, `is_system`, `sort_order`, `created_at`, `updated_at`, `pricing_group_ids`) VALUES (2, 1, 'مدير النظام', 'admin', 'Admin', 1, 1, '2026-06-01 11:42:58', '2026-06-01 11:42:58', NULL);
INSERT INTO `roles` (`id`, `tenant_id`, `name`, `slug`, `description`, `is_system`, `sort_order`, `created_at`, `updated_at`, `pricing_group_ids`) VALUES (3, 1, 'محاسب', 'accountant', 'Accountant', 1, 2, '2026-06-01 11:42:58', '2026-06-01 11:42:58', NULL);
INSERT INTO `roles` (`id`, `tenant_id`, `name`, `slug`, `description`, `is_system`, `sort_order`, `created_at`, `updated_at`, `pricing_group_ids`) VALUES (4, 1, 'مبيعات', 'sales', 'Sales', 1, 3, '2026-06-01 11:42:58', '2026-06-01 11:42:58', NULL);
INSERT INTO `roles` (`id`, `tenant_id`, `name`, `slug`, `description`, `is_system`, `sort_order`, `created_at`, `updated_at`, `pricing_group_ids`) VALUES (5, 1, 'مخازن', 'warehouse', 'Warehouse', 1, 4, '2026-06-01 11:42:58', '2026-06-01 11:42:58', NULL);
INSERT INTO `roles` (`id`, `tenant_id`, `name`, `slug`, `description`, `is_system`, `sort_order`, `created_at`, `updated_at`, `pricing_group_ids`) VALUES (6, 1, 'كاشير', 'cashier', 'Cashier', 1, 5, '2026-06-01 11:42:58', '2026-06-01 11:42:58', NULL);

-- sales_rep_branch
DELETE FROM `sales_rep_branch`;

-- sales_reps
DELETE FROM `sales_reps`;

-- sessions
DELETE FROM `sessions`;

-- shipping_orders
DELETE FROM `shipping_orders`;

-- subscription_plans
DELETE FROM `subscription_plans`;
INSERT INTO `subscription_plans` (`id`, `name`, `slug`, `description`, `price`, `currency`, `billing_cycle_months`, `max_users`, `features`, `is_active`, `sort_order`, `created_at`, `updated_at`, `duration_days`) VALUES (1, 'الباقة الأساسية', 'basic', 'للشركات الناشئة والصغيرة — مبيعات ومشتريات وتقارير أساسية', 99, 'KWD', 1, 3, '["accounting","sales","purchases","inventory"]', 1, 1, '2026-06-01 11:42:55', '2026-06-01 22:24:28', 30);
INSERT INTO `subscription_plans` (`id`, `name`, `slug`, `description`, `price`, `currency`, `billing_cycle_months`, `max_users`, `features`, `is_active`, `sort_order`, `created_at`, `updated_at`, `duration_days`) VALUES (2, 'متوسط', 'medium', 'خطة للشركات المتوسطة', 2400, 'SAR', 12, 10, '["chart_of_accounts","invoices","inventory","reports","multi_currency"]', 1, 2, '2026-06-01 11:42:55', '2026-06-01 11:42:55', NULL);
INSERT INTO `subscription_plans` (`id`, `name`, `slug`, `description`, `price`, `currency`, `billing_cycle_months`, `max_users`, `features`, `is_active`, `sort_order`, `created_at`, `updated_at`, `duration_days`) VALUES (3, 'الباقة المتقدمة', 'advanced', 'للشركات المتوسطة — مخزون ونقاط بيع', 249, 'SAR', 1, 5, '["accounting","sales","purchases","inventory","pos"]', 1, 2, '2026-06-01 11:42:55', '2026-06-01 21:21:25', NULL);
INSERT INTO `subscription_plans` (`id`, `name`, `slug`, `description`, `price`, `currency`, `billing_cycle_months`, `max_users`, `features`, `is_active`, `sort_order`, `created_at`, `updated_at`, `duration_days`) VALUES (4, 'الباقة المتكاملة', 'integrated', 'محاسبة كاملة، موارد بشرية، مناديب، وتصنيع', 499, 'SAR', 1, 15, '["accounting","sales","purchases","inventory","pos","manufacturing","hr","sales_reps"]', 1, 3, '2026-06-01 21:21:25', '2026-06-01 21:21:25', NULL);
INSERT INTO `subscription_plans` (`id`, `name`, `slug`, `description`, `price`, `currency`, `billing_cycle_months`, `max_users`, `features`, `is_active`, `sort_order`, `created_at`, `updated_at`, `duration_days`) VALUES (5, 'الباقة الاحترافية', 'professional', 'جميع مميزات النظام — مستخدمون غير محدود', 999, 'SAR', 1, NULL, '["all_features"]', 1, 4, '2026-06-01 21:21:25', '2026-06-01 21:21:25', NULL);

-- subscriptions
DELETE FROM `subscriptions`;
INSERT INTO `subscriptions` (`id`, `tenant_id`, `subscription_plan_id`, `starts_at`, `ends_at`, `cancelled_at`, `auto_renew`, `status`, `amount_paid`, `currency`, `created_at`, `updated_at`) VALUES (1, 1, 3, '2026-06-01 11:44:07', '2038-01-01 00:00:00', NULL, 1, 'active', 0, 'SAR', '2026-06-01 11:42:58', '2026-06-01 11:44:07');

-- tenant_account_defaults
DELETE FROM `tenant_account_defaults`;
INSERT INTO `tenant_account_defaults` (`id`, `tenant_id`, `cash_account_id`, `bank_account_id`, `customers_account_id`, `vendors_account_id`, `inventory_account_id`, `sales_account_id`, `sales_returns_account_id`, `cogs_account_id`, `purchases_account_id`, `discounts_account_id`, `tax_payable_account_id`, `capital_account_id`, `created_at`, `updated_at`, `purchase_discounts_account_id`, `pos_cash_custody_account_id`, `cash_variance_account_id`, `installments_receivable_account_id`, `inventory_adjustment_gain_account_id`, `inventory_adjustment_loss_account_id`, `installments_payable_account_id`) VALUES (1, 1, 14, 16, 19, 44, 24, 63, 64, 78, 80, 65, 41, 53, '2026-06-01 11:42:58', '2026-06-01 11:42:58', NULL, NULL, NULL, NULL, NULL, NULL, NULL);

-- tenant_settings
DELETE FROM `tenant_settings`;
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (1, 1, 'company_name', 'FIRST CLICK ERP', NULL, '2026-06-01 11:42:58');
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (2, 1, 'default_currency', 'SAR', NULL, '2026-06-01 11:42:58');
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (3, 1, 'vat_enabled', '1', NULL, '2026-06-01 11:42:58');
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (4, 1, 'vat_rate', '15.00', NULL, '2026-06-01 11:42:58');
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (5, 1, 'fiscal_year_start', '01-01', NULL, '2026-06-01 11:42:58');
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (6, 1, 'invoice_prefix_sales', 'Sal-', NULL, '2026-06-01 11:42:58');
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (7, 1, 'invoice_prefix_purchase', 'PUR-', NULL, '2026-06-01 11:42:58');
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (8, 1, 'invoice_use_serial_numbers', '0', NULL, '2026-06-02 22:57:53');
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (9, 1, 'invoice_show_serial_in_reports', '0', NULL, '2026-06-02 22:57:53');
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (10, 1, 'invoice_expiry_dates_enabled', '0', NULL, '2026-06-02 22:57:53');
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (11, 1, 'allow_negative_sale', '0', NULL, '2026-06-02 22:57:53');
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (12, 1, 'invoice_variants_sales_enabled', '1', NULL, '2026-06-02 22:57:53');
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (13, 1, 'invoice_variants_purchases_enabled', '0', NULL, '2026-06-02 22:57:53');
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (14, 1, 'company_tax_number', '', NULL, '2026-06-02 22:31:03');
INSERT INTO `tenant_settings` (`id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at`) VALUES (15, 1, 'default_vat_rate', '0', NULL, '2026-06-02 22:31:03');

-- tenant_users
DELETE FROM `tenant_users`;
INSERT INTO `tenant_users` (`id`, `tenant_id`, `user_id`, `role`, `permissions`, `is_active`, `created_at`, `updated_at`, `role_id`, `default_branch_id`, `default_warehouse_id`, `restrict_to_branch_warehouse`) VALUES (1, 1, 1, 'admin', NULL, 1, '2026-06-01 11:42:56', '2026-06-01 11:42:56', 2, NULL, NULL, 0);
INSERT INTO `tenant_users` (`id`, `tenant_id`, `user_id`, `role`, `permissions`, `is_active`, `created_at`, `updated_at`, `role_id`, `default_branch_id`, `default_warehouse_id`, `restrict_to_branch_warehouse`) VALUES (2, 1, 2, 'admin', NULL, 1, '2026-06-01 11:44:07', '2026-06-01 11:44:07', 2, NULL, NULL, 0);
INSERT INTO `tenant_users` (`id`, `tenant_id`, `user_id`, `role`, `permissions`, `is_active`, `created_at`, `updated_at`, `role_id`, `default_branch_id`, `default_warehouse_id`, `restrict_to_branch_warehouse`) VALUES (3, 1, 3, 'admin', NULL, 1, '2026-06-01 11:44:08', '2026-06-01 11:44:08', 2, NULL, NULL, 0);

-- tenants
DELETE FROM `tenants`;
INSERT INTO `tenants` (`id`, `name`, `slug`, `address`, `activity`, `tax_registration_number`, `contacts`, `email`, `phone`, `logo`, `domain`, `database_name`, `schema_name`, `default_currency`, `fiscal_year_start`, `inventory_method`, `vat_enabled`, `vat_rate`, `is_active`, `settings`, `created_at`, `updated_at`, `deleted_at`, `name_en`, `country`, `city`) VALUES (1, 'FIRST CLICK ERP', 'first-company', NULL, 'commercial', NULL, NULL, 'owner@firstclick-erp.com', NULL, NULL, NULL, NULL, NULL, 'SAR', '01-01', 'average', 1, 0, 1, NULL, '2026-06-01 11:42:56', '2026-06-02 22:31:03', NULL, NULL, NULL, NULL);

-- transfer_headers
DELETE FROM `transfer_headers`;

-- transfer_lines
DELETE FROM `transfer_lines`;

-- users
DELETE FROM `users`;
INSERT INTO `users` (`id`, `name`, `email`, `email_verified_at`, `password`, `remember_token`, `created_at`, `updated_at`, `two_factor_secret`, `two_factor_confirmed_at`, `is_super_admin`, `username`, `phone`) VALUES (1, 'مالك النظام', 'owner@firstclick-erp.com', NULL, '$2y$12$.wISn4smk8g2zSGvGkc/TecqbmJH/oGhYpHUe3R61quaRhnquzvXm', NULL, '2026-06-01 11:42:56', '2026-06-01 11:42:56', NULL, NULL, 1, 'firstclick-erp', NULL);
INSERT INTO `users` (`id`, `name`, `email`, `email_verified_at`, `password`, `remember_token`, `created_at`, `updated_at`, `two_factor_secret`, `two_factor_confirmed_at`, `is_super_admin`, `username`, `phone`) VALUES (2, 'Amir - مدير النظام', 'amirismail2017@gmail.com', NULL, '$2y$12$4Mf/hgc0smP2gx49mUjKtesAzm24s4v.1Z.DEsi0JhNnGL54RvEWa', NULL, '2026-06-01 11:44:07', '2026-06-01 11:44:07', NULL, NULL, 1, 'amir-admin', NULL);
INSERT INTO `users` (`id`, `name`, `email`, `email_verified_at`, `password`, `remember_token`, `created_at`, `updated_at`, `two_factor_secret`, `two_factor_confirmed_at`, `is_super_admin`, `username`, `phone`) VALUES (3, 'مدير النظام', 'demo@firstclickerp.com', NULL, '$2y$12$V/EcLVjGcQrguSMOap4TFOg6/OA9eD8z8/.iY1dQdbK7B/YXbXKrK', NULL, '2026-06-01 11:44:08', '2026-06-01 11:44:08', NULL, NULL, 0, 'demo-admin', NULL);

-- vendor_groups
DELETE FROM `vendor_groups`;

-- vendors
DELETE FROM `vendors`;
INSERT INTO `vendors` (`id`, `tenant_id`, `code`, `name`, `tax_number`, `address`, `email`, `phone`, `account_id`, `payment_terms`, `currency`, `is_active`, `contacts`, `notes`, `created_at`, `updated_at`, `name_en`, `country`, `city`, `country_code`, `company_name`, `vendor_group_id`) VALUES (1, 1, NULL, 'مورد جديد', NULL, NULL, NULL, 'eyJpdiI6InlEY2tVcFUrU1RCMm8vS2V1UWlqTFE9PSIsInZhbHVlIjoiMUE2ejBqaHpST1JXaTVIQkRibHNNUT09IiwibWFjIjoiMTMwYWVjYjMyMDJlMzUxYTJlZjQ0MDFkMTM2YmRjYzY4ZDY3OWVlZDI1Yzg0MGQ0NWVkOGMzZmI0NjQyMjJiZiIsInRhZyI6IiJ9', 104, NULL, NULL, 1, NULL, NULL, '2026-06-02 22:28:08', '2026-06-02 22:28:08', NULL, NULL, NULL, '965', NULL, NULL);
INSERT INTO `vendors` (`id`, `tenant_id`, `code`, `name`, `tax_number`, `address`, `email`, `phone`, `account_id`, `payment_terms`, `currency`, `is_active`, `contacts`, `notes`, `created_at`, `updated_at`, `name_en`, `country`, `city`, `country_code`, `company_name`, `vendor_group_id`) VALUES (2, 1, NULL, 'مورد نقدي', NULL, NULL, NULL, NULL, 47, NULL, NULL, 1, NULL, NULL, '2026-06-02 22:41:24', '2026-06-02 22:41:24', 'Cash Supplier', NULL, NULL, NULL, NULL, NULL);

-- warehouses
DELETE FROM `warehouses`;
INSERT INTO `warehouses` (`id`, `tenant_id`, `name`, `code`, `address`, `phone`, `is_active`, `created_at`, `updated_at`, `deleted_at`, `branch_id`, `user_id`, `responsible_employee_id`, `name_en`, `applies_to_all_branches`) VALUES (1, 1, 'مخزن رئيسي', 'WH-001', NULL, NULL, 1, '2026-06-02 22:26:28', '2026-06-02 22:26:28', NULL, NULL, NULL, NULL, NULL, 1);

-- webhooks
DELETE FROM `webhooks`;

SET FOREIGN_KEY_CHECKS=1;
