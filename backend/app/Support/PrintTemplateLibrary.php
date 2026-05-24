<?php

namespace App\Support;

use App\Models\PrintTemplate;

/**
 * 14 seed print templates (2 per document type). Used by PrintTemplateService and PrintTemplatesSeeder.
 *
 * @return list<array<string, mixed>>
 */
final class PrintTemplateLibrary
{
    public static function definitions(): array
    {
        return [
            self::tpl(
                'فاتورة مبيعات كلاسيك',
                'invoice',
                'classic',
                'A4',
                true,
                'invoice_classic',
                '#4f46e5',
                'Cairo',
                11,
                '#1f2937',
                ['top' => 15, 'right' => 15, 'bottom' => 15, 'left' => 15],
            ),
            self::tpl(
                'فاتورة مبيعات عصرية',
                'invoice',
                'modern',
                'A4',
                false,
                'invoice_modern',
                '#7c3aed',
                'Tajawal',
                11,
                '#1e293b',
                ['top' => 12, 'right' => 12, 'bottom' => 12, 'left' => 12],
            ),
            self::tpl(
                'سند قبض كلاسيك',
                'receipt',
                'classic',
                'A4',
                true,
                'receipt_classic',
                '#059669',
                'Cairo',
                11,
                '#1f2937',
                PrintTemplate::defaultMargins(),
            ),
            self::tpl(
                'سند قبض A5 مبسط',
                'receipt',
                'simple',
                'A5',
                false,
                'receipt_simple',
                '#10b981',
                'Cairo',
                10,
                '#1f2937',
                ['top' => 12, 'right' => 12, 'bottom' => 12, 'left' => 12],
            ),
            self::tpl(
                'سند صرف كلاسيك',
                'payment',
                'classic',
                'A4',
                true,
                'payment_classic',
                '#dc2626',
                'Cairo',
                11,
                '#1f2937',
                PrintTemplate::defaultMargins(),
            ),
            self::tpl(
                'سند صرف A5 مبسط',
                'payment',
                'simple',
                'A5',
                false,
                'payment_simple',
                '#ef4444',
                'Cairo',
                10,
                '#1f2937',
                ['top' => 12, 'right' => 12, 'bottom' => 12, 'left' => 12],
            ),
            self::tpl(
                'إيصال حراري 80mm',
                'pos',
                'thermal',
                'thermal_80',
                true,
                'pos_thermal',
                '#0891b2',
                'Cairo',
                10,
                '#1f2937',
                ['top' => 2, 'right' => 2, 'bottom' => 2, 'left' => 2],
            ),
            self::tpl(
                'إيصال A4 مطعم',
                'pos',
                'restaurant',
                'A4',
                false,
                'pos_restaurant',
                '#0891b2',
                'Cairo',
                11,
                '#1f2937',
                PrintTemplate::defaultMargins(),
            ),
            self::tpl(
                'قيد يومي كلاسيك',
                'journal',
                'classic',
                'A4',
                true,
                'journal_classic',
                '#7c3aed',
                'Cairo',
                11,
                '#1f2937',
                PrintTemplate::defaultMargins(),
            ),
            self::tpl(
                'قيد يومي تفصيلي',
                'journal',
                'detailed',
                'A4',
                false,
                'journal_detailed',
                '#6d28d9',
                'Cairo',
                11,
                '#1f2937',
                PrintTemplate::defaultMargins(),
            ),
            self::tpl(
                'فاتورة مشتريات كلاسيك',
                'purchase',
                'classic',
                'A4',
                true,
                'purchase_classic',
                '#d97706',
                'Cairo',
                11,
                '#1f2937',
                PrintTemplate::defaultMargins(),
            ),
            self::tpl(
                'أمر شراء رسمي',
                'purchase',
                'po',
                'A4',
                false,
                'purchase_po',
                '#b45309',
                'Cairo',
                11,
                '#1f2937',
                PrintTemplate::defaultMargins(),
            ),
            self::tpl(
                'تسوية مخزنية كلاسيك',
                'inventory',
                'classic',
                'A4',
                true,
                'inventory_classic',
                '#0891b2',
                'Cairo',
                11,
                '#1f2937',
                PrintTemplate::defaultMargins(),
            ),
            self::tpl(
                'تقرير مخزون تفصيلي',
                'inventory',
                'detailed',
                'A4',
                false,
                'inventory_detailed',
                '#0e7490',
                'Cairo',
                11,
                '#1f2937',
                PrintTemplate::defaultMargins(),
            ),
        ];
    }

    /**
     * @param  array{top: int, right: int, bottom: int, left: int}  $margins
     * @return array<string, mixed>
     */
    private static function tpl(
        string $name,
        string $documentType,
        string $layout,
        string $paperSize,
        bool $isDefault,
        string $blockKey,
        string $accent,
        string $fontFamily,
        int $fontSize,
        string $textColor,
        array $margins,
    ): array {
        return [
            'name' => $name,
            'document_type' => $documentType,
            'layout' => $layout,
            'paper_size' => $paperSize,
            'orientation' => 'portrait',
            'is_default' => $isDefault,
            'is_system' => false,
            'margins' => $margins,
            'settings' => [
                'accent_color' => $accent,
                'font_family' => $fontFamily,
                'font_size' => $fontSize,
                'text_color' => $textColor,
                'layout' => $layout,
            ],
            'sections' => self::sectionsAll(),
            'blocks_json' => json_encode(PrintTemplateSeedBlocks::blocksFor($blockKey), JSON_UNESCAPED_UNICODE),
            'html_content' => PrintTemplateSeedHtml::build($documentType, $layout, $accent),
        ];
    }

    /** @return array<string, bool> */
    private static function sectionsAll(): array
    {
        return [
            'header' => true,
            'company' => true,
            'customer' => true,
            'recipient' => true,
            'items' => true,
            'totals' => true,
            'notes' => true,
            'signature' => true,
            'footer' => true,
        ];
    }
}
