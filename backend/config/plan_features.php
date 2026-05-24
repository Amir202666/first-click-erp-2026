<?php

return [
    /*
    | مسارات API مقترنة بالميزة المطلوبة في الباقة.
    | إذا كان المسار يطابق أحد المفاتيح (يحتوي على النص)، يُطلب وجود إحدى الميزات في القيمة.
    | القيمة مصفوفة من الميزات: أي واحدة منها تكفي للسماح بالوصول.
    */
    'path_to_features' => [
        'accounts' => ['accounting'],
        'journal-entries' => ['accounting'],
        'fiscal-years' => ['accounting'],
        'receipt-vouchers' => ['accounting'],
        'payment-vouchers' => ['accounting'],
        'payment-methods' => ['accounting'],
        'currencies' => ['accounting'],
        'branches' => ['accounting'],
        'cost-centers' => ['accounting'],
        'account-defaults' => ['accounting'],
        'dashboard' => ['accounting'],
        'reports/trial-balance' => ['accounting'],
        'reports/income-statement' => ['accounting'],
        'reports/balance-sheet' => ['accounting'],
        'reports/receipts' => ['accounting'],
        'reports/payments' => ['accounting'],
        'reports/tax-declaration' => ['accounting'],
        'reports/account-statement' => ['accounting'],
        'reports/customer-balances' => ['accounting'],
        'reports/vendor-balances' => ['accounting'],
        'reports/expenses' => ['accounting'],
        'reports/account-last-movements' => ['accounting'],
        'reports/customer-aging' => ['accounting'],
        'reports/customer-analysis' => ['sales', 'accounting'],
        'settings' => ['accounting'],
        'document-templates' => ['accounting'],

        'customers' => ['sales'],
        'customer-groups' => ['sales'],
        'quotations' => ['sales'],
        'reports/item-sales' => ['sales'],
        'reports/best-selling' => ['sales'],
        'invoices' => ['sales', 'purchases'],

        'vendors' => ['purchases'],
        'purchase-requests' => ['purchases'],
        'reports/item-purchases' => ['purchases'],

        'items' => ['inventory'],
        'item-units' => ['inventory'],
        'item-categories' => ['inventory'],
        'item-brands' => ['inventory'],
        'warehouses' => ['inventory'],
        'inventory' => ['inventory'],
        'transfers' => ['inventory'],
        'opening-stock' => ['inventory'],
        'low-stock' => ['inventory'],

        'pos' => ['pos'],

        'boms' => ['manufacturing'],
        'production-orders' => ['manufacturing'],

        'delivery-' => ['sales'],
        'delivery/' => ['sales'],
        'sales-reps' => ['sales_reps'],
        'reports/sales-rep-sales' => ['sales_reps'],
        'reports/sales-reps-monthly-productivity' => ['sales_reps'],

        'hr/' => ['hr'],
    ],
];
