<?php

namespace App\Support;

/**
 * Seed HTML for print templates (Handlebars + RTL Arabic).
 */
final class PrintTemplateSeedHtml
{
    private const FONT = 'Cairo, sans-serif';

    public static function build(string $docType, string $layout, string $accent): string
    {
        $inner = match ($docType) {
            'invoice' => self::invoiceHTML($accent, $layout),
            'receipt' => self::receiptHTML($accent, $layout),
            'payment' => self::paymentHTML($accent, $layout),
            'pos' => self::posHTML($accent, $layout),
            'journal' => self::journalHTML($accent, $layout),
            'purchase' => self::purchaseHTML($accent, $layout),
            'inventory' => self::inventoryHTML($accent, $layout),
            default => '<div>قالب فارغ</div>',
        };

        if ($docType === 'pos' && str_contains($layout, 'thermal')) {
            return '<div class="print-doc-root" dir="rtl" style="font-family:'.self::FONT.';font-size:10pt;color:#1f2937;--accent:'.$accent.';">'.$inner.'</div>';
        }

        return self::wrap($inner, self::FONT, 11, '#1f2937', $accent);
    }

    private static function wrap(string $inner, string $font, int $size, string $color, string $accent): string
    {
        return '<div class="print-doc-root" dir="rtl" style="font-family:'.$font.';font-size:'.$size.'pt;color:'.$color.';--accent:'.$accent.';line-height:1.45;box-sizing:border-box;width:100%;min-height:267mm;">'.$inner.'</div>';
    }

    public static function invoiceHTML(string $accent, string $layout): string
    {
        $font = self::FONT;

        return <<<HTML
<div style="font-family:{$font};direction:rtl;color:#1f2937;box-sizing:border-box;">

  <!-- Header -->
  <div style="background:{$accent};color:white;padding:20px 24px;margin:-15mm -15mm 20px -15mm;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <h1 style="margin:0;font-size:22px;font-weight:800;">{{company.name}}</h1>
      <p style="margin:4px 0 0;font-size:11px;opacity:.85;">{{company.address}}</p>
      <p style="margin:2px 0 0;font-size:11px;opacity:.85;">{{company.phone}} · الرقم الضريبي: {{company.vat}}</p>
    </div>
    <div style="text-align:left;">
      <p style="margin:0;font-size:12px;opacity:.8;letter-spacing:1px;">فاتورة ضريبية</p>
      <p style="margin:4px 0 0;font-size:26px;font-weight:800;">#{{inv.number}}</p>
    </div>
  </div>

  <!-- Customer + Dates -->
  <div style="display:flex;gap:16px;margin-bottom:20px;">
    <div style="flex:1;background:#f8fafc;border-radius:10px;padding:14px;border-right:4px solid {$accent};">
      <p style="margin:0 0 6px;font-size:10px;color:#6b7280;font-weight:600;">بيانات العميل</p>
      <p style="margin:0;font-size:14px;font-weight:700;">{{customer.name}}</p>
      <p style="margin:3px 0 0;font-size:11px;color:#6b7280;">{{customer.phone}}</p>
      <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">{{customer.address}}</p>
    </div>
    <div style="flex:1;background:#f8fafc;border-radius:10px;padding:14px;">
      <p style="margin:0 0 8px;font-size:10px;color:#6b7280;font-weight:600;">تفاصيل الفاتورة</p>
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
        <span style="font-size:11px;color:#6b7280;">التاريخ</span>
        <span style="font-size:11px;font-weight:600;">{{inv.date}}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
        <span style="font-size:11px;color:#6b7280;">الاستحقاق</span>
        <span style="font-size:11px;font-weight:600;">{{inv.due_date}}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:11px;color:#6b7280;">طريقة الدفع</span>
        <span style="font-size:11px;font-weight:600;">{{inv.payment_method}}</span>
      </div>
    </div>
  </div>

  <!-- Items Table -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px;">
    <thead>
      <tr style="background:{$accent};color:white;">
        <th style="padding:10px 12px;text-align:right;">#</th>
        <th style="padding:10px 12px;text-align:right;">الصنف</th>
        <th style="padding:10px 12px;text-align:center;">الكمية</th>
        <th style="padding:10px 12px;text-align:center;">السعر</th>
        <th style="padding:10px 12px;text-align:center;">الضريبة</th>
        <th style="padding:10px 12px;text-align:left;">الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:9px 12px;color:#9ca3af;">{{sum @index 1}}</td>
        <td style="padding:9px 12px;font-weight:600;">{{this.name}}</td>
        <td style="padding:9px 12px;text-align:center;">{{this.qty}}</td>
        <td style="padding:9px 12px;text-align:center;">{{formatNumber this.price}} ر.س</td>
        <td style="padding:9px 12px;text-align:center;">{{formatNumber this.vat}} ر.س</td>
        <td style="padding:9px 12px;text-align:left;font-weight:700;">{{formatNumber this.total}} ر.س</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <!-- Totals -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:20px;">
    <div style="width:280px;">
      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e5e7eb;font-size:12px;">
        <span style="color:#6b7280;">المجموع قبل الضريبة</span>
        <span style="font-weight:600;">{{formatNumber subtotal}} ر.س</span>
      </div>
      {{#if discount}}<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e5e7eb;font-size:12px;color:#dc2626;">
        <span>الخصم</span><span>-{{formatNumber discount}} ر.س</span></div>{{/if}}
      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e5e7eb;font-size:12px;">
        <span style="color:#6b7280;">ضريبة القيمة المضافة (15%)</span>
        <span style="font-weight:600;">{{formatNumber vat_amount}} ر.س</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:12px 16px;background:{$accent};color:white;border-radius:10px;margin-top:8px;">
        <span style="font-size:13px;font-weight:700;">الإجمالي المستحق</span>
        <span style="font-size:15px;font-weight:800;">{{formatNumber total}} ر.س</span>
      </div>
    </div>
  </div>

  <!-- Notes + Signature -->
  <div style="display:flex;gap:16px;align-items:flex-start;margin-top:10px;">
    <div style="flex:1;">
      {{#if inv.notes}}<p style="font-size:10px;color:#6b7280;margin:0 0 4px;font-weight:600;">ملاحظات:</p>
      <p style="font-size:11px;color:#374151;margin:0;line-height:1.6;">{{inv.notes}}</p>{{/if}}
    </div>
    <div style="text-align:center;width:140px;">
      <div style="border-top:1px solid #d1d5db;padding-top:6px;margin-top:32px;">
        <p style="font-size:10px;color:#6b7280;margin:0;">التوقيع والختم</p>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div style="margin-top:24px;padding-top:12px;border-top:2px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
    <p style="font-size:10px;color:#9ca3af;margin:0;">{{company.name}} | {{company.phone}} | {{company.email}}</p>
    <p style="font-size:10px;color:#9ca3af;margin:0;">الرقم الضريبي: {{company.vat}}</p>
  </div>

</div>
HTML;
    }

    public static function receiptHTML(string $accent, string $layout): string
    {
        $font = self::FONT;

        return <<<HTML
<div style="font-family:{$font};direction:rtl;color:#1f2937;box-sizing:border-box;padding:15mm;">

  <!-- Header -->
  <div style="background:{$accent};color:white;padding:20px;margin:-15mm -15mm 20px -15mm;text-align:center;">
    <h1 style="margin:0;font-size:20px;font-weight:800;">{{company.name}}</h1>
    <p style="margin:4px 0 0;font-size:11px;opacity:.85;">{{company.address}} | {{company.phone}}</p>
    <p style="margin:8px 0 0;font-size:14px;font-weight:700;letter-spacing:2px;">سند قبض</p>
  </div>

  <!-- Number + Date -->
  <div style="display:flex;justify-content:space-between;background:#f8fafc;padding:12px 16px;border-radius:8px;margin-bottom:16px;">
    <div><p style="margin:0;font-size:10px;color:#6b7280;">رقم السند</p><p style="margin:3px 0 0;font-weight:700;font-size:14px;">#{{inv.number}}</p></div>
    <div style="text-align:left;"><p style="margin:0;font-size:10px;color:#6b7280;">التاريخ</p><p style="margin:3px 0 0;font-weight:700;font-size:14px;">{{inv.date}}</p></div>
  </div>

  <!-- Amount Box -->
  <div style="background:{$accent};color:white;padding:20px;border-radius:12px;text-align:center;margin-bottom:20px;">
    <p style="margin:0;font-size:11px;opacity:.8;">المبلغ المستلم</p>
    <p style="margin:4px 0;font-size:32px;font-weight:800;">{{formatNumber total}} ر.س</p>
    <p style="margin:0;font-size:11px;opacity:.8;">{{amount_text}}</p>
  </div>

  <!-- Details -->
  <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:20px;">
    {{#each_detail}}
    <div style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #f3f4f6;">
      <span style="font-size:11px;color:#6b7280;">{{label}}</span>
      <span style="font-size:11px;font-weight:600;">{{value}}</span>
    </div>
    {{/each_detail}}
    <div style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #f3f4f6;">
      <span style="font-size:11px;color:#6b7280;">المستفيد</span>
      <span style="font-size:11px;font-weight:600;">{{customer.name}}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #f3f4f6;">
      <span style="font-size:11px;color:#6b7280;">طريقة الدفع</span>
      <span style="font-size:11px;font-weight:600;">{{inv.payment_method}}</span>
    </div>
    {{#if inv.notes}}
    <div style="display:flex;justify-content:space-between;padding:10px 16px;">
      <span style="font-size:11px;color:#6b7280;">ملاحظات</span>
      <span style="font-size:11px;font-weight:600;">{{inv.notes}}</span>
    </div>
    {{/if}}
  </div>

  <!-- Signatures -->
  <div style="display:flex;justify-content:space-between;margin-top:24px;">
    <div style="text-align:center;width:45%;">
      <div style="border-top:1px solid #d1d5db;padding-top:6px;margin-top:40px;">
        <p style="font-size:10px;color:#6b7280;margin:0;">المستلم</p>
      </div>
    </div>
    <div style="text-align:center;width:45%;">
      <div style="border-top:1px solid #d1d5db;padding-top:6px;margin-top:40px;">
        <p style="font-size:10px;color:#6b7280;margin:0;">الدافع</p>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div style="margin-top:20px;padding-top:10px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="font-size:10px;color:#9ca3af;margin:0;">{{company.name}} | {{company.phone}} | الرقم الضريبي: {{company.vat}}</p>
  </div>

</div>
HTML;
    }

    public static function paymentHTML(string $accent, string $layout): string
    {
        return str_replace('سند قبض', 'سند صرف', self::receiptHTML($accent, $layout));
    }

    public static function posHTML(string $accent, string $layout): string
    {
        $font = self::FONT;

        if (str_contains($layout, 'thermal')) {
            return <<<HTML
<div style="font-family:{$font};direction:rtl;color:#1f2937;width:100%;font-size:10px;text-align:center;">
  <h2 style="margin:0 0 4px;font-size:14px;font-weight:800;">{{company.name}}</h2>
  <p style="margin:0;font-size:10px;">{{company.address}}</p>
  <p style="margin:0;font-size:10px;">{{company.phone}}</p>
  <div style="border-top:1px dashed #374151;margin:8px 0;"></div>
  <div style="display:flex;justify-content:space-between;font-size:10px;">
    <span>رقم: {{inv.number}}</span><span>{{inv.date}}</span>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:6px;">
    <span>الكاشير: {{cashier}}</span><span>{{inv.time}}</span>
  </div>
  <div style="border-top:1px dashed #374151;margin:6px 0;"></div>
  <table style="width:100%;font-size:10px;border-collapse:collapse;">
    <thead>
      <tr style="border-bottom:1px solid #374151;">
        <th style="text-align:right;padding:3px 0;">الصنف</th>
        <th style="text-align:center;padding:3px 0;">ك</th>
        <th style="text-align:left;padding:3px 0;">المبلغ</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td style="padding:2px 0;text-align:right;">{{this.name}}</td>
        <td style="padding:2px 0;text-align:center;">{{this.qty}}</td>
        <td style="padding:2px 0;text-align:left;">{{formatNumber this.total}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <div style="border-top:2px solid #374151;margin:6px 0;"></div>
  <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">
    <span>المجموع</span><span>{{formatNumber subtotal}} ر.س</span>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">
    <span>الضريبة 15%</span><span>{{formatNumber vat_amount}} ر.س</span>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:800;margin:4px 0;">
    <span>الإجمالي</span><span>{{formatNumber total}} ر.س</span>
  </div>
  <div style="border-top:1px dashed #374151;margin:6px 0;"></div>
  <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">
    <span>المدفوع</span><span>{{formatNumber paid}} ر.س</span>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:10px;">
    <span>الباقي</span><span>{{formatNumber change}} ر.س</span>
  </div>
  <div style="border-top:1px dashed #374151;margin:8px 0;"></div>
  <p style="margin:0;font-size:11px;font-weight:600;">شكراً لزيارتكم</p>
  <p style="margin:4px 0 0;font-size:9px;color:#6b7280;">يُرجى الاحتفاظ بالإيصال</p>
</div>
HTML;
        }

        return <<<HTML
<div style="font-family:{$font};direction:rtl;color:#1f2937;box-sizing:border-box;">
  <div style="background:{$accent};color:white;padding:20px 24px;margin:-15mm -15mm 20px -15mm;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <h1 style="margin:0;font-size:20px;font-weight:800;">{{company.name}}</h1>
      <p style="margin:4px 0 0;font-size:11px;opacity:.85;">{{company.address}} | {{company.phone}}</p>
    </div>
    <div style="text-align:left;">
      <p style="margin:0;font-size:12px;opacity:.8;">إيصال نقطة البيع</p>
      <p style="margin:4px 0 0;font-size:22px;font-weight:800;">#{{inv.number}}</p>
    </div>
  </div>
  <div style="display:flex;justify-content:space-between;background:#f8fafc;padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:11px;">
    <span>التاريخ: <b>{{inv.date}}</b></span>
    <span>الوقت: <b>{{inv.time}}</b></span>
    <span>الكاشير: <b>{{cashier}}</b></span>
    {{#if table}}<span>الطاولة: <b>{{table}}</b></span>{{/if}}
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px;">
    <thead>
      <tr style="background:{$accent};color:white;">
        <th style="padding:10px 12px;text-align:right;">الصنف</th>
        <th style="padding:10px 12px;text-align:center;">الكمية</th>
        <th style="padding:10px 12px;text-align:center;">السعر</th>
        <th style="padding:10px 12px;text-align:left;">الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:9px 12px;font-weight:600;">{{this.name}}</td>
        <td style="padding:9px 12px;text-align:center;">{{this.qty}}</td>
        <td style="padding:9px 12px;text-align:center;">{{formatNumber this.price}} ر.س</td>
        <td style="padding:9px 12px;text-align:left;font-weight:700;">{{formatNumber this.total}} ر.س</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
    <div style="width:260px;">
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;font-size:12px;">
        <span style="color:#6b7280;">المجموع</span><span style="font-weight:600;">{{formatNumber subtotal}} ر.س</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;font-size:12px;">
        <span style="color:#6b7280;">الضريبة 15%</span><span style="font-weight:600;">{{formatNumber vat_amount}} ر.س</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 14px;background:{$accent};color:white;border-radius:8px;margin-top:6px;">
        <span style="font-size:13px;font-weight:700;">الإجمالي</span><span style="font-size:15px;font-weight:800;">{{formatNumber total}} ر.س</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;margin-top:6px;">
        <span style="color:#6b7280;">المدفوع</span><span>{{formatNumber paid}} ر.س</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;font-weight:700;color:#059669;">
        <span>الباقي</span><span>{{formatNumber change}} ر.س</span>
      </div>
    </div>
  </div>
  <div style="text-align:center;margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;">
    <p style="font-size:12px;font-weight:600;margin:0;">شكراً لزيارتكم 🙏</p>
    <p style="font-size:10px;color:#9ca3af;margin:4px 0 0;">{{company.name}} | {{company.phone}}</p>
  </div>
</div>
HTML;
    }

    public static function journalHTML(string $accent, string $layout): string
    {
        $font = self::FONT;

        return <<<HTML
<div style="font-family:{$font};direction:rtl;color:#1f2937;box-sizing:border-box;">
  <div style="background:{$accent};color:white;padding:20px 24px;margin:-15mm -15mm 20px -15mm;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <h1 style="margin:0;font-size:20px;font-weight:800;">{{company.name}}</h1>
      <p style="margin:4px 0 0;font-size:11px;opacity:.85;">{{company.address}} | {{company.phone}}</p>
    </div>
    <div style="text-align:left;">
      <p style="margin:0;font-size:12px;opacity:.8;">قيد يومي</p>
      <p style="margin:4px 0 0;font-size:22px;font-weight:800;">#{{inv.number}}</p>
    </div>
  </div>
  <div style="display:flex;gap:16px;margin-bottom:16px;">
    <div style="flex:1;background:#f8fafc;border-radius:8px;padding:12px;border-right:3px solid {$accent};">
      <p style="margin:0 0 4px;font-size:10px;color:#6b7280;">التاريخ</p>
      <p style="margin:0;font-weight:700;">{{inv.date}}</p>
    </div>
    <div style="flex:2;background:#f8fafc;border-radius:8px;padding:12px;">
      <p style="margin:0 0 4px;font-size:10px;color:#6b7280;">البيان</p>
      <p style="margin:0;font-weight:600;">{{description}}</p>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px;">
    <thead>
      <tr style="background:{$accent};color:white;">
        <th style="padding:10px 14px;text-align:right;">الحساب</th>
        <th style="padding:10px 14px;text-align:center;">مدين</th>
        <th style="padding:10px 14px;text-align:center;">دائن</th>
        <th style="padding:10px 14px;text-align:right;">ملاحظات</th>
      </tr>
    </thead>
    <tbody>
      {{#each entries}}
      <tr style="border-bottom:1px solid #e5e7eb;background:{{#if @odd}}#f9fafb{{else}}#ffffff{{/if}};">
        <td style="padding:10px 14px;">{{this.account}}</td>
        <td style="padding:10px 14px;text-align:center;color:#059669;font-weight:600;">
          {{#if this.debit}}{{formatNumber this.debit}} ر.س{{/if}}
        </td>
        <td style="padding:10px 14px;text-align:center;color:#dc2626;font-weight:600;">
          {{#if this.credit}}{{formatNumber this.credit}} ر.س{{/if}}
        </td>
        <td style="padding:10px 14px;color:#6b7280;font-size:10px;">{{this.notes}}</td>
      </tr>
      {{/each}}
      <tr style="background:#f3f4f6;font-weight:700;border-top:2px solid #e5e7eb;">
        <td style="padding:10px 14px;">الإجمالي</td>
        <td style="padding:10px 14px;text-align:center;color:#059669;">{{formatNumber total_debit}} ر.س</td>
        <td style="padding:10px 14px;text-align:center;color:#dc2626;">{{formatNumber total_credit}} ر.س</td>
        <td style="padding:10px 14px;"></td>
      </tr>
    </tbody>
  </table>
  {{#if notes}}<p style="font-size:10px;color:#6b7280;margin:0 0 4px;">ملاحظات: {{notes}}</p>{{/if}}
  <div style="display:flex;justify-content:flex-end;margin-top:20px;">
    <div style="text-align:center;width:160px;">
      <div style="border-top:1px solid #d1d5db;padding-top:6px;margin-top:40px;">
        <p style="font-size:10px;color:#6b7280;margin:0;">معتمد من</p>
        <p style="font-size:11px;margin:2px 0 0;">{{approved_by}}</p>
      </div>
    </div>
  </div>
  <div style="margin-top:20px;padding-top:10px;border-top:2px solid #e5e7eb;display:flex;justify-content:space-between;">
    <p style="font-size:10px;color:#9ca3af;margin:0;">{{company.name}} | {{company.phone}}</p>
    <p style="font-size:10px;color:#9ca3af;margin:0;">الرقم الضريبي: {{company.vat}}</p>
  </div>
</div>
HTML;
    }

    public static function purchaseHTML(string $accent, string $layout): string
    {
        $font = self::FONT;

        return <<<HTML
<div style="font-family:{$font};direction:rtl;color:#1f2937;box-sizing:border-box;">
  <div style="background:{$accent};color:white;padding:20px 24px;margin:-15mm -15mm 20px -15mm;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <h1 style="margin:0;font-size:22px;font-weight:800;">{{company.name}}</h1>
      <p style="margin:4px 0 0;font-size:11px;opacity:.85;">{{company.address}} | {{company.phone}} | ر.ض: {{company.vat}}</p>
    </div>
    <div style="text-align:left;">
      <p style="margin:0;font-size:12px;opacity:.8;">فاتورة مشتريات</p>
      <p style="margin:4px 0 0;font-size:24px;font-weight:800;">#{{inv.number}}</p>
    </div>
  </div>
  <div style="display:flex;gap:16px;margin-bottom:20px;">
    <div style="flex:1;background:#f8fafc;border-radius:10px;padding:14px;border-right:4px solid {$accent};">
      <p style="margin:0 0 6px;font-size:10px;color:#6b7280;font-weight:600;">بيانات المورد</p>
      <p style="margin:0;font-size:14px;font-weight:700;">{{supplier.name}}</p>
      <p style="margin:3px 0 0;font-size:11px;color:#6b7280;">{{supplier.phone}}</p>
      <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">{{supplier.address}}</p>
      <p style="margin:2px 0 0;font-size:10px;color:#9ca3af;">ر.ض: {{supplier.vat}}</p>
    </div>
    <div style="flex:1;background:#f8fafc;border-radius:10px;padding:14px;">
      <p style="margin:0 0 8px;font-size:10px;color:#6b7280;font-weight:600;">تفاصيل الأمر</p>
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
        <span style="font-size:11px;color:#6b7280;">التاريخ</span>
        <span style="font-size:11px;font-weight:600;">{{inv.date}}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:11px;color:#6b7280;">الاستحقاق</span>
        <span style="font-size:11px;font-weight:600;">{{inv.due_date}}</span>
      </div>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px;">
    <thead>
      <tr style="background:{$accent};color:white;">
        <th style="padding:10px 12px;text-align:right;">#</th>
        <th style="padding:10px 12px;text-align:right;">الصنف</th>
        <th style="padding:10px 12px;text-align:center;">الكمية</th>
        <th style="padding:10px 12px;text-align:center;">السعر</th>
        <th style="padding:10px 12px;text-align:center;">الضريبة</th>
        <th style="padding:10px 12px;text-align:left;">الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:9px 12px;color:#9ca3af;">{{sum @index 1}}</td>
        <td style="padding:9px 12px;font-weight:600;">{{this.name}}</td>
        <td style="padding:9px 12px;text-align:center;">{{this.qty}}</td>
        <td style="padding:9px 12px;text-align:center;">{{formatNumber this.price}} ر.س</td>
        <td style="padding:9px 12px;text-align:center;">{{formatNumber this.vat}} ر.س</td>
        <td style="padding:9px 12px;text-align:left;font-weight:700;">{{formatNumber this.total}} ر.س</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <div style="display:flex;justify-content:flex-end;margin-bottom:20px;">
    <div style="width:280px;">
      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e5e7eb;font-size:12px;">
        <span style="color:#6b7280;">المجموع</span><span style="font-weight:600;">{{formatNumber subtotal}} ر.س</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e5e7eb;font-size:12px;">
        <span style="color:#6b7280;">الضريبة 15%</span><span style="font-weight:600;">{{formatNumber vat_amount}} ر.س</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:12px 16px;background:{$accent};color:white;border-radius:10px;margin-top:8px;">
        <span style="font-size:13px;font-weight:700;">الإجمالي</span>
        <span style="font-size:15px;font-weight:800;">{{formatNumber total}} ر.س</span>
      </div>
    </div>
  </div>
  {{#if inv.notes}}
  <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:16px;">
    <p style="font-size:10px;color:#92400e;margin:0 0 4px;font-weight:600;">ملاحظات:</p>
    <p style="font-size:11px;color:#78350f;margin:0;">{{inv.notes}}</p>
  </div>
  {{/if}}
  <div style="display:flex;justify-content:space-between;margin-top:20px;">
    <div style="text-align:center;width:40%;">
      <div style="border-top:1px solid #d1d5db;padding-top:6px;margin-top:40px;">
        <p style="font-size:10px;color:#6b7280;margin:0;">ختم وتوقيع المورد</p>
      </div>
    </div>
    <div style="text-align:center;width:40%;">
      <div style="border-top:1px solid #d1d5db;padding-top:6px;margin-top:40px;">
        <p style="font-size:10px;color:#6b7280;margin:0;">اعتماد المدير</p>
      </div>
    </div>
  </div>
  <div style="margin-top:20px;padding-top:12px;border-top:2px solid #e5e7eb;display:flex;justify-content:space-between;">
    <p style="font-size:10px;color:#9ca3af;margin:0;">{{company.name}} | {{company.phone}}</p>
    <p style="font-size:10px;color:#9ca3af;margin:0;">الرقم الضريبي: {{company.vat}}</p>
  </div>
</div>
HTML;
    }

    public static function inventoryHTML(string $accent, string $layout): string
    {
        $font = self::FONT;

        return <<<HTML
<div style="font-family:{$font};direction:rtl;color:#1f2937;box-sizing:border-box;">
  <div style="background:{$accent};color:white;padding:20px 24px;margin:-15mm -15mm 20px -15mm;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <h1 style="margin:0;font-size:20px;font-weight:800;">{{company.name}}</h1>
      <p style="margin:4px 0 0;font-size:11px;opacity:.85;">{{company.address}}</p>
    </div>
    <div style="text-align:left;">
      <p style="margin:0;font-size:12px;opacity:.8;">تسوية مخزنية</p>
      <p style="margin:4px 0 0;font-size:22px;font-weight:800;">#{{adj.number}}</p>
    </div>
  </div>
  <div style="display:flex;gap:12px;margin-bottom:16px;">
    <div style="flex:1;background:#f8fafc;border-radius:8px;padding:12px;border-right:3px solid {$accent};">
      <p style="margin:0 0 3px;font-size:10px;color:#6b7280;">التاريخ</p>
      <p style="margin:0;font-weight:700;">{{adj.date}}</p>
    </div>
    <div style="flex:1;background:#f8fafc;border-radius:8px;padding:12px;">
      <p style="margin:0 0 3px;font-size:10px;color:#6b7280;">المستودع</p>
      <p style="margin:0;font-weight:700;">{{warehouse.name}}</p>
    </div>
    <div style="flex:2;background:#f8fafc;border-radius:8px;padding:12px;">
      <p style="margin:0 0 3px;font-size:10px;color:#6b7280;">سبب التسوية</p>
      <p style="margin:0;font-weight:600;">{{reason}}</p>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px;">
    <thead>
      <tr style="background:{$accent};color:white;">
        <th style="padding:10px 12px;text-align:right;">الصنف</th>
        <th style="padding:10px 12px;text-align:center;">قبل</th>
        <th style="padding:10px 12px;text-align:center;">بعد</th>
        <th style="padding:10px 12px;text-align:center;">الفرق</th>
        <th style="padding:10px 12px;text-align:center;">النوع</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr style="border-bottom:1px solid #e5e7eb;background:{{#if @odd}}#f9fafb{{else}}#ffffff{{/if}};">
        <td style="padding:9px 12px;font-weight:600;">{{this.name}}</td>
        <td style="padding:9px 12px;text-align:center;">{{this.before}}</td>
        <td style="padding:9px 12px;text-align:center;">{{this.after}}</td>
        <td style="padding:9px 12px;text-align:center;font-weight:700;
          color:{{#if this.positive}}#059669{{else}}#dc2626{{/if}};">
          {{this.diff}}
        </td>
        <td style="padding:9px 12px;text-align:center;">
          <span style="padding:2px 8px;border-radius:20px;font-size:10px;
            background:{{#if this.positive}}#dcfce7{{else}}#fee2e2{{/if}};
            color:{{#if this.positive}}#059669{{else}}#dc2626{{/if}};">
            {{this.type}}
          </span>
        </td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <div style="display:flex;gap:12px;margin-bottom:20px;">
    <div style="flex:1;background:#dcfce7;border-radius:8px;padding:12px;text-align:center;">
      <p style="margin:0;font-size:10px;color:#059669;">إجمالي الزيادة</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:800;color:#059669;">+{{total_increase}}</p>
    </div>
    <div style="flex:1;background:#fee2e2;border-radius:8px;padding:12px;text-align:center;">
      <p style="margin:0;font-size:10px;color:#dc2626;">إجمالي النقص</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:800;color:#dc2626;">-{{total_decrease}}</p>
    </div>
  </div>
  {{#if notes}}<p style="font-size:11px;color:#374151;margin:0 0 16px;background:#f8fafc;padding:10px;border-radius:8px;">{{notes}}</p>{{/if}}
  <div style="display:flex;justify-content:space-between;margin-top:16px;">
    <div style="text-align:center;width:40%;">
      <div style="border-top:1px solid #d1d5db;padding-top:6px;margin-top:40px;">
        <p style="font-size:10px;color:#6b7280;margin:0;">أمين المستودع</p>
        <p style="font-size:11px;margin:2px 0 0;font-weight:600;">{{approved_by}}</p>
      </div>
    </div>
    <div style="text-align:center;width:40%;">
      <div style="border-top:1px solid #d1d5db;padding-top:6px;margin-top:40px;">
        <p style="font-size:10px;color:#6b7280;margin:0;">اعتماد المدير</p>
      </div>
    </div>
  </div>
  <div style="margin-top:20px;padding-top:10px;border-top:2px solid #e5e7eb;display:flex;justify-content:space-between;">
    <p style="font-size:10px;color:#9ca3af;margin:0;">{{company.name}} | {{company.phone}}</p>
    <p style="font-size:10px;color:#9ca3af;margin:0;">{{adj.date}}</p>
  </div>
</div>
HTML;
    }
}
