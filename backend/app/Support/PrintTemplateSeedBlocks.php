<?php

namespace App\Support;

/**
 * Block definitions (blocks_json) for the 14 seed print templates.
 */
final class PrintTemplateSeedBlocks
{
    /**
     * @return list<array<string, mixed>>
     */
    public static function blocksFor(string $name): array
    {
        return match ($name) {
            'invoice_classic' => self::invoiceClassic(),
            'invoice_modern' => self::invoiceModern(),
            'receipt_classic' => self::receiptClassic(),
            'receipt_simple' => self::receiptSimple(),
            'payment_classic' => self::paymentClassic(),
            'payment_simple' => self::paymentSimple(),
            'pos_thermal' => self::posThermal(),
            'pos_restaurant' => self::posRestaurant(),
            'journal_classic' => self::journalClassic(),
            'journal_detailed' => self::journalDetailed(),
            'purchase_classic' => self::purchaseClassic(),
            'purchase_po' => self::purchasePo(),
            'inventory_classic' => self::inventoryClassic(),
            'inventory_detailed' => self::inventoryDetailed(),
            default => [],
        };
    }

    /** @return list<array<string, mixed>> */
    private static function invoiceClassic(): array
    {
        return [
            ['id' => 'b1', 'type' => 'header', 'visible' => true, 'locked' => false, 'label' => 'رأس الفاتورة',
                'settings' => ['style' => 'banner', 'showLogo' => true, 'showCompanyName' => true, 'showAddress' => true,
                    'showPhone' => true, 'showVat' => true, 'showInvoiceNumber' => true, 'invoiceLabel' => 'فاتورة ضريبية',
                    'bgColor' => '#4f46e5', 'textColor' => '#ffffff', 'padding' => '20px 24px']],
            ['id' => 'b2', 'type' => 'info_row', 'visible' => true, 'locked' => false, 'label' => 'بيانات العميل والتواريخ',
                'settings' => ['showCustomerName' => true, 'showCustomerPhone' => true, 'showCustomerAddress' => true,
                    'showCustomerVat' => true, 'showDate' => true, 'showDueDate' => true, 'showPaymentMethod' => true,
                    'showInvoiceType' => true, 'bgColor' => '#f8fafc', 'borderAccent' => true]],
            ['id' => 'b3', 'type' => 'items_table', 'visible' => true, 'locked' => false, 'label' => 'جدول الأصناف',
                'settings' => ['columns' => ['index', 'name', 'qty', 'price', 'vat', 'total'], 'stripedRows' => true,
                    'headerBg' => '#4f46e5', 'headerColor' => '#ffffff', 'fontSize' => 11,
                    'columnLabels' => ['index' => '#', 'name' => 'الصنف', 'qty' => 'الكمية', 'price' => 'السعر', 'vat' => 'الضريبة', 'total' => 'الإجمالي']]],
            ['id' => 'b4', 'type' => 'totals', 'visible' => true, 'locked' => false, 'label' => 'الإجماليات',
                'settings' => ['showSubtotal' => true, 'showDiscount' => true, 'showVat' => true, 'showTotal' => true,
                    'vatLabel' => 'ضريبة القيمة المضافة (15%)', 'totalBg' => '#4f46e5', 'totalColor' => '#ffffff', 'width' => '280px']],
            ['id' => 'b5', 'type' => 'notes', 'visible' => true, 'locked' => false, 'label' => 'الملاحظات والتوقيع',
                'settings' => ['showNotes' => true, 'showSignature' => true, 'signatureLabel' => 'التوقيع والختم']],
            ['id' => 'b6', 'type' => 'footer', 'visible' => true, 'locked' => false, 'label' => 'تذييل الصفحة',
                'settings' => ['showCompanyName' => true, 'showPhone' => true, 'showEmail' => true, 'showVat' => true, 'borderTop' => true]],
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function invoiceModern(): array
    {
        return [
            ['id' => 'b1', 'type' => 'header', 'visible' => true, 'locked' => false, 'label' => 'رأس الفاتورة',
                'settings' => ['style' => 'split', 'showLogo' => true, 'showCompanyName' => true, 'showAddress' => true,
                    'showPhone' => true, 'showVat' => true, 'showInvoiceNumber' => true, 'invoiceLabel' => 'TAX INVOICE',
                    'bgColor' => '#7c3aed', 'textColor' => '#ffffff']],
            ['id' => 'b2', 'type' => 'info_row', 'visible' => true, 'locked' => false, 'label' => 'بيانات العميل',
                'settings' => ['showCustomerName' => true, 'showCustomerPhone' => true, 'showCustomerAddress' => true,
                    'showCustomerVat' => true, 'showDate' => true, 'showDueDate' => true, 'bgColor' => '#f5f3ff', 'borderAccent' => true]],
            ['id' => 'b3', 'type' => 'items_table', 'visible' => true, 'locked' => false, 'label' => 'جدول الأصناف',
                'settings' => ['columns' => ['index', 'name', 'qty', 'price', 'vat', 'total'], 'stripedRows' => false,
                    'headerBg' => '#7c3aed', 'headerColor' => '#ffffff', 'fontSize' => 11,
                    'columnLabels' => ['index' => '#', 'name' => 'البيان', 'qty' => 'الكمية', 'price' => 'سعر الوحدة', 'vat' => 'الضريبة', 'total' => 'الإجمالي']]],
            ['id' => 'b4', 'type' => 'totals', 'visible' => true, 'locked' => false, 'label' => 'الإجماليات',
                'settings' => ['showSubtotal' => true, 'showDiscount' => true, 'showVat' => true, 'showTotal' => true,
                    'totalBg' => '#7c3aed', 'totalColor' => '#ffffff', 'width' => '300px']],
            ['id' => 'b5', 'type' => 'qr_code', 'visible' => true, 'locked' => false, 'label' => 'QR Code',
                'settings' => ['align' => 'right', 'size' => 80, 'showLabel' => true]],
            ['id' => 'b6', 'type' => 'footer', 'visible' => true, 'locked' => false, 'label' => 'تذييل الصفحة',
                'settings' => ['showCompanyName' => true, 'showPhone' => true, 'showEmail' => true, 'showVat' => true, 'borderTop' => true]],
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function receiptClassic(): array
    {
        return [
            ['id' => 'b1', 'type' => 'receipt_header', 'visible' => true, 'locked' => false, 'label' => 'رأس السند',
                'settings' => ['title' => 'سند قبض', 'showNumber' => true, 'bgColor' => '#059669', 'textColor' => '#ffffff']],
            ['id' => 'b2', 'type' => 'receipt_body', 'visible' => true, 'locked' => false, 'label' => 'تفاصيل السند',
                'settings' => ['showCustomerName' => true, 'showAmount' => true, 'showAmountText' => true,
                    'showPaymentMethod' => true, 'showDate' => true, 'showNotes' => true, 'accentColor' => '#059669']],
            ['id' => 'b3', 'type' => 'signature_row', 'visible' => true, 'locked' => false, 'label' => 'التوقيعات',
                'settings' => ['showReceiverSignature' => true, 'showPayerSignature' => true,
                    'receiverLabel' => 'المستلم', 'payerLabel' => 'الدافع']],
            ['id' => 'b4', 'type' => 'footer', 'visible' => true, 'locked' => false, 'label' => 'تذييل',
                'settings' => ['showCompanyName' => true, 'showPhone' => true, 'borderTop' => true]],
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function receiptSimple(): array
    {
        return [
            ['id' => 'b1', 'type' => 'receipt_header', 'visible' => true, 'locked' => false, 'label' => 'رأس السند',
                'settings' => ['title' => 'سند استلام', 'showNumber' => true, 'bgColor' => '#10b981', 'textColor' => '#ffffff']],
            ['id' => 'b2', 'type' => 'receipt_body', 'visible' => true, 'locked' => false, 'label' => 'تفاصيل السند',
                'settings' => ['showCustomerName' => true, 'showAmount' => true, 'showAmountText' => true,
                    'showPaymentMethod' => true, 'showDate' => true, 'showNotes' => true, 'accentColor' => '#10b981']],
            ['id' => 'b3', 'type' => 'signature_row', 'visible' => true, 'locked' => false, 'label' => 'التوقيعات',
                'settings' => ['showReceiverSignature' => true, 'showPayerSignature' => true]],
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function paymentClassic(): array
    {
        return [
            ['id' => 'b1', 'type' => 'receipt_header', 'visible' => true, 'locked' => false, 'label' => 'رأس السند',
                'settings' => ['title' => 'سند صرف', 'showNumber' => true, 'bgColor' => '#dc2626', 'textColor' => '#ffffff']],
            ['id' => 'b2', 'type' => 'receipt_body', 'visible' => true, 'locked' => false, 'label' => 'تفاصيل السند',
                'settings' => ['showCustomerName' => true, 'showAmount' => true, 'showAmountText' => true,
                    'showPaymentMethod' => true, 'showDate' => true, 'showNotes' => true, 'accentColor' => '#dc2626',
                    'customerLabel' => 'المستفيد', 'amountLabel' => 'المبلغ المصروف']],
            ['id' => 'b3', 'type' => 'signature_row', 'visible' => true, 'locked' => false, 'label' => 'التوقيعات',
                'settings' => ['showReceiverSignature' => true, 'showPayerSignature' => true, 'showManagerSignature' => true,
                    'receiverLabel' => 'المستلم', 'payerLabel' => 'المحاسب', 'managerLabel' => 'المدير']],
            ['id' => 'b4', 'type' => 'footer', 'visible' => true, 'locked' => false, 'label' => 'تذييل',
                'settings' => ['showCompanyName' => true, 'showPhone' => true, 'borderTop' => true]],
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function paymentSimple(): array
    {
        return [
            ['id' => 'b1', 'type' => 'receipt_header', 'visible' => true, 'locked' => false, 'label' => 'رأس السند',
                'settings' => ['title' => 'سند صرف مبسط', 'showNumber' => true, 'bgColor' => '#ef4444', 'textColor' => '#ffffff']],
            ['id' => 'b2', 'type' => 'receipt_body', 'visible' => true, 'locked' => false, 'label' => 'التفاصيل',
                'settings' => ['showCustomerName' => true, 'showAmount' => true, 'showAmountText' => true,
                    'showPaymentMethod' => true, 'showDate' => true, 'accentColor' => '#ef4444']],
            ['id' => 'b3', 'type' => 'signature_row', 'visible' => true, 'locked' => false, 'label' => 'التوقيعات',
                'settings' => ['showReceiverSignature' => true, 'showPayerSignature' => true]],
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function posThermal(): array
    {
        return [
            ['id' => 'b1', 'type' => 'pos_header', 'visible' => true, 'locked' => false, 'label' => 'رأس الإيصال',
                'settings' => ['showLogo' => false, 'showCompanyName' => true, 'showAddress' => true, 'showPhone' => true, 'align' => 'center']],
            ['id' => 'b2', 'type' => 'pos_info', 'visible' => true, 'locked' => false, 'label' => 'معلومات الفاتورة',
                'settings' => ['showNumber' => true, 'showDate' => true, 'showCashier' => true, 'showTable' => false]],
            ['id' => 'b3', 'type' => 'pos_divider', 'visible' => true, 'locked' => false, 'label' => 'فاصل', 'settings' => ['style' => 'dashed']],
            ['id' => 'b4', 'type' => 'pos_items', 'visible' => true, 'locked' => false, 'label' => 'الأصناف',
                'settings' => ['showQty' => true, 'showPrice' => true, 'showTotal' => true, 'fontSize' => 10]],
            ['id' => 'b5', 'type' => 'pos_divider', 'visible' => true, 'locked' => false, 'label' => 'فاصل', 'settings' => ['style' => 'solid']],
            ['id' => 'b6', 'type' => 'pos_totals', 'visible' => true, 'locked' => false, 'label' => 'الإجماليات',
                'settings' => ['showSubtotal' => true, 'showVat' => true, 'showTotal' => true, 'showPaid' => true, 'showChange' => true, 'accentColor' => '#0891b2']],
            ['id' => 'b7', 'type' => 'pos_footer', 'visible' => true, 'locked' => false, 'label' => 'تذييل الإيصال',
                'settings' => ['message' => 'شكراً لزيارتكم', 'showQr' => true, 'align' => 'center']],
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function posRestaurant(): array
    {
        return [
            ['id' => 'b1', 'type' => 'header', 'visible' => true, 'locked' => false, 'label' => 'رأس الإيصال',
                'settings' => ['style' => 'banner', 'showLogo' => true, 'showCompanyName' => true, 'showAddress' => true,
                    'showPhone' => true, 'invoiceLabel' => 'إيصال نقطة البيع', 'bgColor' => '#0891b2', 'textColor' => '#ffffff']],
            ['id' => 'b2', 'type' => 'pos_info', 'visible' => true, 'locked' => false, 'label' => 'معلومات الطلب',
                'settings' => ['showNumber' => true, 'showDate' => true, 'showCashier' => true, 'showTable' => true]],
            ['id' => 'b3', 'type' => 'items_table', 'visible' => true, 'locked' => false, 'label' => 'الأصناف',
                'settings' => ['columns' => ['name', 'qty', 'price', 'total'], 'stripedRows' => true,
                    'headerBg' => '#0891b2', 'headerColor' => '#ffffff', 'fontSize' => 11]],
            ['id' => 'b4', 'type' => 'totals', 'visible' => true, 'locked' => false, 'label' => 'الإجماليات',
                'settings' => ['showSubtotal' => true, 'showVat' => true, 'showTotal' => true, 'showPaid' => true, 'showChange' => true,
                    'totalBg' => '#0891b2', 'totalColor' => '#ffffff', 'width' => '260px']],
            ['id' => 'b5', 'type' => 'footer', 'visible' => true, 'locked' => false, 'label' => 'تذييل',
                'settings' => ['showCompanyName' => true, 'showPhone' => true, 'borderTop' => true]],
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function journalClassic(): array
    {
        return [
            ['id' => 'b1', 'type' => 'header', 'visible' => true, 'locked' => false, 'label' => 'رأس القيد',
                'settings' => ['style' => 'banner', 'showCompanyName' => true, 'showAddress' => true, 'showPhone' => true,
                    'showVat' => true, 'showInvoiceNumber' => true, 'invoiceLabel' => 'قيد يومي', 'bgColor' => '#7c3aed', 'textColor' => '#ffffff']],
            ['id' => 'b2', 'type' => 'journal_info', 'visible' => true, 'locked' => false, 'label' => 'معلومات القيد',
                'settings' => ['showNumber' => true, 'showDate' => true, 'showDescription' => true, 'accentColor' => '#7c3aed']],
            ['id' => 'b3', 'type' => 'journal_table', 'visible' => true, 'locked' => false, 'label' => 'جدول القيد',
                'settings' => ['showAccount' => true, 'showDebit' => true, 'showCredit' => true, 'showNotes' => true,
                    'headerBg' => '#7c3aed', 'headerColor' => '#ffffff', 'showTotalsRow' => true]],
            ['id' => 'b4', 'type' => 'notes', 'visible' => true, 'locked' => false, 'label' => 'الملاحظات',
                'settings' => ['showNotes' => true, 'showSignature' => true, 'signatureLabel' => 'معتمد من']],
            ['id' => 'b5', 'type' => 'footer', 'visible' => true, 'locked' => false, 'label' => 'تذييل',
                'settings' => ['showCompanyName' => true, 'showPhone' => true, 'showVat' => true, 'borderTop' => true]],
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function journalDetailed(): array
    {
        return [
            ['id' => 'b1', 'type' => 'header', 'visible' => true, 'locked' => false, 'label' => 'رأس القيد',
                'settings' => ['style' => 'split', 'showCompanyName' => true, 'showVat' => true,
                    'showInvoiceNumber' => true, 'invoiceLabel' => 'قيد محاسبي', 'bgColor' => '#6d28d9', 'textColor' => '#ffffff']],
            ['id' => 'b2', 'type' => 'journal_info', 'visible' => true, 'locked' => false, 'label' => 'معلومات القيد',
                'settings' => ['showNumber' => true, 'showDate' => true, 'showDescription' => true, 'accentColor' => '#6d28d9']],
            ['id' => 'b3', 'type' => 'journal_table', 'visible' => true, 'locked' => false, 'label' => 'جدول القيد',
                'settings' => ['showAccount' => true, 'showDebit' => true, 'showCredit' => true, 'showNotes' => true,
                    'headerBg' => '#6d28d9', 'headerColor' => '#ffffff', 'showTotalsRow' => true, 'stripedRows' => true]],
            ['id' => 'b4', 'type' => 'notes', 'visible' => true, 'locked' => false, 'label' => 'الملاحظات',
                'settings' => ['showNotes' => true, 'showSignature' => true]],
            ['id' => 'b5', 'type' => 'footer', 'visible' => true, 'locked' => false, 'label' => 'تذييل',
                'settings' => ['showCompanyName' => true, 'showVat' => true, 'borderTop' => true]],
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function purchaseClassic(): array
    {
        return [
            ['id' => 'b1', 'type' => 'header', 'visible' => true, 'locked' => false, 'label' => 'رأس الفاتورة',
                'settings' => ['style' => 'banner', 'showCompanyName' => true, 'showAddress' => true, 'showPhone' => true,
                    'showVat' => true, 'showInvoiceNumber' => true, 'invoiceLabel' => 'فاتورة مشتريات', 'bgColor' => '#d97706', 'textColor' => '#ffffff']],
            ['id' => 'b2', 'type' => 'supplier_info', 'visible' => true, 'locked' => false, 'label' => 'بيانات المورد',
                'settings' => ['showSupplierName' => true, 'showSupplierPhone' => true, 'showSupplierAddress' => true,
                    'showSupplierVat' => true, 'showDate' => true, 'showDueDate' => true, 'accentColor' => '#d97706']],
            ['id' => 'b3', 'type' => 'items_table', 'visible' => true, 'locked' => false, 'label' => 'جدول الأصناف',
                'settings' => ['columns' => ['index', 'name', 'qty', 'price', 'vat', 'total'], 'stripedRows' => true,
                    'headerBg' => '#d97706', 'headerColor' => '#ffffff', 'fontSize' => 11]],
            ['id' => 'b4', 'type' => 'totals', 'visible' => true, 'locked' => false, 'label' => 'الإجماليات',
                'settings' => ['showSubtotal' => true, 'showVat' => true, 'showTotal' => true, 'totalBg' => '#d97706', 'totalColor' => '#ffffff', 'width' => '280px']],
            ['id' => 'b5', 'type' => 'notes', 'visible' => true, 'locked' => false, 'label' => 'الملاحظات',
                'settings' => ['showNotes' => true, 'showSignature' => true, 'signatureLabel' => 'ختم وتوقيع المورد']],
            ['id' => 'b6', 'type' => 'footer', 'visible' => true, 'locked' => false, 'label' => 'تذييل',
                'settings' => ['showCompanyName' => true, 'showPhone' => true, 'showVat' => true, 'borderTop' => true]],
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function purchasePo(): array
    {
        return [
            ['id' => 'b1', 'type' => 'header', 'visible' => true, 'locked' => false, 'label' => 'رأس أمر الشراء',
                'settings' => ['style' => 'split', 'showCompanyName' => true, 'showAddress' => true, 'showPhone' => true,
                    'showVat' => true, 'showInvoiceNumber' => true, 'invoiceLabel' => 'أمر شراء', 'bgColor' => '#b45309', 'textColor' => '#ffffff']],
            ['id' => 'b2', 'type' => 'supplier_info', 'visible' => true, 'locked' => false, 'label' => 'بيانات المورد',
                'settings' => ['showSupplierName' => true, 'showSupplierPhone' => true, 'showSupplierAddress' => true,
                    'showSupplierVat' => true, 'showDate' => true, 'showDueDate' => true, 'accentColor' => '#b45309']],
            ['id' => 'b3', 'type' => 'items_table', 'visible' => true, 'locked' => false, 'label' => 'الأصناف المطلوبة',
                'settings' => ['columns' => ['index', 'name', 'qty', 'price', 'total'], 'stripedRows' => true,
                    'headerBg' => '#b45309', 'headerColor' => '#ffffff', 'fontSize' => 11]],
            ['id' => 'b4', 'type' => 'totals', 'visible' => true, 'locked' => false, 'label' => 'الإجماليات',
                'settings' => ['showSubtotal' => true, 'showVat' => true, 'showTotal' => true, 'totalBg' => '#b45309', 'totalColor' => '#ffffff', 'width' => '280px']],
            ['id' => 'b5', 'type' => 'notes', 'visible' => true, 'locked' => false, 'label' => 'الملاحظات',
                'settings' => ['showNotes' => true, 'showSignature' => true, 'signatureLabel' => 'اعتماد المدير']],
            ['id' => 'b6', 'type' => 'footer', 'visible' => true, 'locked' => false, 'label' => 'تذييل',
                'settings' => ['showCompanyName' => true, 'showVat' => true, 'borderTop' => true]],
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function inventoryClassic(): array
    {
        return [
            ['id' => 'b1', 'type' => 'header', 'visible' => true, 'locked' => false, 'label' => 'رأس التقرير',
                'settings' => ['style' => 'banner', 'showCompanyName' => true, 'showAddress' => true, 'showPhone' => true,
                    'showVat' => false, 'showInvoiceNumber' => true, 'invoiceLabel' => 'تسوية مخزنية', 'bgColor' => '#0891b2', 'textColor' => '#ffffff']],
            ['id' => 'b2', 'type' => 'inventory_info', 'visible' => true, 'locked' => false, 'label' => 'معلومات التسوية',
                'settings' => ['showNumber' => true, 'showDate' => true, 'showWarehouse' => true, 'showReason' => true, 'accentColor' => '#0891b2']],
            ['id' => 'b3', 'type' => 'inventory_table', 'visible' => true, 'locked' => false, 'label' => 'جدول الأصناف',
                'settings' => ['showName' => true, 'showBefore' => true, 'showAfter' => true, 'showDiff' => true, 'showType' => true,
                    'headerBg' => '#0891b2', 'headerColor' => '#ffffff', 'stripedRows' => true]],
            ['id' => 'b4', 'type' => 'inventory_summary', 'visible' => true, 'locked' => false, 'label' => 'ملخص التسوية',
                'settings' => ['showTotalIncrease' => true, 'showTotalDecrease' => true, 'accentColor' => '#0891b2']],
            ['id' => 'b5', 'type' => 'notes', 'visible' => true, 'locked' => false, 'label' => 'الملاحظات',
                'settings' => ['showNotes' => true, 'showSignature' => true, 'signatureLabel' => 'أمين المستودع']],
            ['id' => 'b6', 'type' => 'footer', 'visible' => true, 'locked' => false, 'label' => 'تذييل',
                'settings' => ['showCompanyName' => true, 'showPhone' => true, 'borderTop' => true]],
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function inventoryDetailed(): array
    {
        return [
            ['id' => 'b1', 'type' => 'header', 'visible' => true, 'locked' => false, 'label' => 'رأس التقرير',
                'settings' => ['style' => 'split', 'showCompanyName' => true, 'showAddress' => true, 'showPhone' => true,
                    'showVat' => false, 'showInvoiceNumber' => true, 'invoiceLabel' => 'تقرير جرد مخزني', 'bgColor' => '#0e7490', 'textColor' => '#ffffff']],
            ['id' => 'b2', 'type' => 'inventory_info', 'visible' => true, 'locked' => false, 'label' => 'معلومات الجرد',
                'settings' => ['showNumber' => true, 'showDate' => true, 'showWarehouse' => true, 'showReason' => true, 'accentColor' => '#0e7490']],
            ['id' => 'b3', 'type' => 'inventory_table', 'visible' => true, 'locked' => false, 'label' => 'جدول الأصناف',
                'settings' => ['showName' => true, 'showBefore' => true, 'showAfter' => true, 'showDiff' => true, 'showType' => true,
                    'headerBg' => '#0e7490', 'headerColor' => '#ffffff', 'stripedRows' => true]],
            ['id' => 'b4', 'type' => 'inventory_summary', 'visible' => true, 'locked' => false, 'label' => 'الملخص',
                'settings' => ['showTotalIncrease' => true, 'showTotalDecrease' => true, 'accentColor' => '#0e7490']],
            ['id' => 'b5', 'type' => 'notes', 'visible' => true, 'locked' => false, 'label' => 'الاعتماد',
                'settings' => ['showNotes' => true, 'showSignature' => true, 'signatureLabel' => 'رئيس قسم المستودعات']],
            ['id' => 'b6', 'type' => 'footer', 'visible' => true, 'locked' => false, 'label' => 'تذييل',
                'settings' => ['showCompanyName' => true, 'showPhone' => true, 'borderTop' => true]],
        ];
    }
}
