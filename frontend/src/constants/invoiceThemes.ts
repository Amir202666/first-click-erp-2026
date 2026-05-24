/**
 * نماذج قوالب الفواتير والسندات الجاهزة
 * كل قالب: HTML + CSS مع وسوم برمجية {tag}
 */

export type InvoiceThemeId = 'classic' | 'modern' | 'compact'

export interface InvoiceThemeMeta {
  id: InvoiceThemeId
  nameAr: string
  nameEn: string
  descriptionAr: string
  descriptionEn: string
  widthMm: number
}

export const INVOICE_THEMES_META: InvoiceThemeMeta[] = [
  { id: 'classic', nameAr: 'الكلاسيكي', nameEn: 'Classic', descriptionAr: 'رسمي جداً للمؤسسات', descriptionEn: 'Formal for organizations', widthMm: 210 },
  { id: 'modern', nameAr: 'المودرن', nameEn: 'Modern', descriptionAr: 'هادئ وبسيط للمطاعم والكافيهات', descriptionEn: 'Clean for restaurants & cafés', widthMm: 210 },
  { id: 'compact', nameAr: 'المختصر (80مم)', nameEn: 'Compact (80mm)', descriptionAr: 'للطابعات الحرارية 80mm', descriptionEn: 'For 80mm thermal printers', widthMm: 80 },
]

const FONT_AR = "'Cairo', 'Tajawal', 'Segoe UI', Tahoma, sans-serif"

/** كلاسيكي: رسمي، حدود واضحة، ألوان محايدة */
export const THEME_CLASSIC = `
<style>
.invoice-theme-classic { font-family: ${FONT_AR}; direction: rtl; width: 210mm; max-width: 100%; margin: 0 auto; padding: 12mm; box-sizing: border-box; color: #1e293b; }
.invoice-theme-classic .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; padding-bottom: 12px; border-bottom: 2px solid #1e3a5f; margin-bottom: 12px; }
.invoice-theme-classic .header-right { text-align: right; }
.invoice-theme-classic .header-right .logo { max-width: 120px; max-height: 56px; object-fit: contain; margin-bottom: 8px; }
.invoice-theme-classic .company-name { font-size: 18pt; font-weight: 400; color: #1e3a5f; }
.invoice-theme-classic .tax-number { font-size: 9pt; color: #64748b; margin-top: 4px; }
.invoice-theme-classic .invoice-info-block { font-size: 11pt; text-align: left; line-height: 1.6; }
.invoice-theme-classic .invoice-info-block strong { color: #1e3a5f; }
.invoice-theme-classic .party-block { margin: 12px 0; padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; }
.invoice-theme-classic .party-block label { font-size: 9pt; color: #64748b; display: block; margin-bottom: 2px; }
.invoice-theme-classic .items-wrap { margin: 12px 0; border: 1px solid #cbd5e1; overflow: hidden; }
.invoice-theme-classic .items-wrap table { width: 100%; }
.invoice-theme-classic .items-wrap th { background: #1e3a5f; color: #fff; padding: 8px 10px; text-align: right; font-size: 10pt; }
.invoice-theme-classic .items-wrap td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 10pt; }
.invoice-theme-classic .invoice-installments-wrap { page-break-inside: avoid; break-inside: avoid; }
.invoice-theme-classic .totals { margin-top: 12px; text-align: left; width: 280px; margin-left: auto; }
.invoice-theme-classic .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
.invoice-theme-classic .totals-row.total { font-weight: 400; font-size: 12pt; border-top: 2px solid #1e3a5f; margin-top: 6px; padding-top: 6px; }
.invoice-theme-classic .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }
.invoice-theme-classic .template-terms { font-size: 8pt; color: #64748b; max-width: 60%; }
.invoice-theme-classic .template-signatures { min-height: 40px; }
@media print { .invoice-theme-classic { box-shadow: none; padding: 8mm; } }
</style>
<div class="invoice-theme-classic">
  <div class="header">
    <div class="header-right">
      <div class="logo">{logo}</div>
      <div class="company-name">{company_name}</div>
      <div class="tax-number">{tax_number}</div>
      <div style="font-size:9pt;margin-top:4px;">{company_phone} | {company_email}</div>
    </div>
    <div class="invoice-info-block">
      <strong>{invoice_info}</strong>
    </div>
  </div>
  <div class="party-block">
    <label>العميل / المورد</label>
    <div>{customer_name}</div>
    <div style="font-size:9pt;color:#64748b;">{customer_phone} {customer_address}</div>
  </div>
  <div class="items-wrap">{items_table}</div>
  {installments_block}
  <div class="totals">
    <div class="totals-row"><span>المجموع الفرعي</span><span>{subtotal}</span></div>
    <div class="totals-row"><span>الخصم</span><span>{discount_amount}</span></div>
    <div class="totals-row"><span>الضريبة</span><span>{tax_amount}</span></div>
    <div class="totals-row total"><span>الإجمالي</span><span>{total}</span></div>
    <div class="totals-row"><span>المدفوع</span><span>{amount_paid}</span></div>
    <div class="totals-row"><span>المتبقي</span><span>{balance}</span></div>
  </div>
  <div class="footer">
    <div class="template-terms">{terms}</div>
    <div style="display:flex;align-items:center;gap:12px;">
      <div class="template-signatures">{signatures}</div>
      <div>{qr_code}</div>
    </div>
  </div>
</div>
`

/** مودرن: هادئ، بسيط، مناسب للمطاعم والكافيهات */
export const THEME_MODERN = `
<style>
.invoice-theme-modern { font-family: ${FONT_AR}; direction: rtl; width: 210mm; max-width: 100%; margin: 0 auto; padding: 14mm; box-sizing: border-box; color: #334155; background: #fff; }
.invoice-theme-modern .header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px; margin-bottom: 24px; }
.invoice-theme-modern .logo-wrap { flex-shrink: 0; }
.invoice-theme-modern .logo-wrap img { max-width: 100px; max-height: 50px; object-fit: contain; }
.invoice-theme-modern .company-name { font-size: 22pt; font-weight: 400; color: #0f172a; letter-spacing: -0.02em; }
.invoice-theme-modern .company-meta { font-size: 10pt; color: #64748b; margin-top: 4px; }
.invoice-theme-modern .invoice-info-block { text-align: left; font-size: 11pt; line-height: 1.7; color: #475569; }
.invoice-theme-modern .party-section { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px dashed #e2e8f0; }
.invoice-theme-modern .party-section .name { font-size: 12pt; font-weight: 400; color: #0f172a; }
.invoice-theme-modern .party-section .sub { font-size: 10pt; color: #64748b; margin-top: 2px; }
.invoice-theme-modern table { width: 100%; border-collapse: collapse; margin: 16px 0; }
.invoice-theme-modern th { padding: 10px 12px; text-align: right; font-size: 10pt; font-weight: 400; color: #475569; background: #f8fafc; border-bottom: 2px solid #e2e8f0; }
.invoice-theme-modern td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 10pt; }
.invoice-theme-modern .invoice-installments-wrap { page-break-inside: avoid; break-inside: avoid; }
.invoice-theme-modern .summary { margin-top: 20px; padding: 16px; background: #f8fafc; border-radius: 8px; width: 260px; margin-left: auto; }
.invoice-theme-modern .summary-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 11pt; }
.invoice-theme-modern .summary-row.grand { font-weight: 400; font-size: 13pt; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
.invoice-theme-modern .footer { margin-top: 28px; padding-top: 16px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 20px; }
.invoice-theme-modern .template-terms { font-size: 9pt; color: #94a3b8; line-height: 1.5; max-width: 55%; }
.invoice-theme-modern .template-signatures { min-height: 36px; }
@media print { .invoice-theme-modern { padding: 10mm; } }
</style>
<div class="invoice-theme-modern">
  <div class="header">
    <div style="display:flex;align-items:center;gap:16px;">
      <div class="logo-wrap">{logo}</div>
      <div>
        <div class="company-name">{company_name}</div>
        <div class="company-meta">{tax_number} · {company_phone}</div>
      </div>
    </div>
    <div class="invoice-info-block">{invoice_info}</div>
  </div>
  <div class="party-section">
    <div class="name">{customer_name}</div>
    <div class="sub">{customer_phone} {customer_address}</div>
  </div>
  {items_table}
  {installments_block}
  <div class="summary">
    <div class="summary-row"><span>المجموع الفرعي</span><span>{subtotal}</span></div>
    <div class="summary-row"><span>الخصم</span><span>{discount_amount}</span></div>
    <div class="summary-row"><span>الضريبة</span><span>{tax_amount}</span></div>
    <div class="summary-row grand"><span>الإجمالي</span><span>{total}</span></div>
    <div class="summary-row"><span>المدفوع</span><span>{amount_paid}</span></div>
    <div class="summary-row"><span>المتبقي</span><span>{balance}</span></div>
  </div>
  <div class="footer">
    <div class="template-terms">{terms}</div>
    <div style="display:flex;align-items:center;gap:10px;">
      <div class="template-signatures">{signatures}</div>
      {qr_code}
    </div>
  </div>
</div>
`

/** مختصر: 80mm للطابعات الحرارية */
export const THEME_COMPACT = `
<style>
.invoice-theme-compact { font-family: ${FONT_AR}; direction: rtl; width: 80mm; max-width: 100%; margin: 0 auto; padding: 4mm; box-sizing: border-box; font-size: 9pt; color: #1e293b; }
.invoice-theme-compact .header { text-align: center; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; margin-bottom: 6px; }
.invoice-theme-compact .company-name { font-weight: 400; font-size: 11pt; }
.invoice-theme-compact .invoice-info-block { font-size: 9pt; text-align: center; margin: 4px 0; }
.invoice-theme-compact .party { margin: 6px 0; font-size: 9pt; }
.invoice-theme-compact table { width: 100%; font-size: 8pt; border-collapse: collapse; }
.invoice-theme-compact th { padding: 3px 2px; border-bottom: 1px solid #e2e8f0; text-align: right; }
.invoice-theme-compact td { padding: 3px 2px; border-bottom: 1px dotted #f1f5f9; }
.invoice-theme-compact .invoice-installments-wrap { page-break-inside: avoid; break-inside: avoid; font-size: 8pt; }
.invoice-theme-compact .totals { margin-top: 6px; text-align: left; font-size: 9pt; }
.invoice-theme-compact .totals .row { display: flex; justify-content: space-between; }
.invoice-theme-compact .totals .row.grand { font-weight: 400; margin-top: 4px; padding-top: 4px; border-top: 1px solid #cbd5e1; }
.invoice-theme-compact .footer { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #cbd5e1; text-align: center; font-size: 8pt; color: #64748b; }
.invoice-theme-compact .template-terms { margin-top: 4px; }
.invoice-theme-compact .template-signatures { min-height: 24px; }
.invoice-theme-compact .qr-wrap { text-align: center; margin-top: 4px; }
@media print { .invoice-theme-compact { width: 80mm !important; padding: 2mm; } }
</style>
<div class="invoice-theme-compact">
  <div class="header">
    <div class="logo-wrap" style="text-align:center;">{logo}</div>
    <div class="company-name">{company_name}</div>
    <div style="font-size:8pt;">{company_phone}</div>
  </div>
  <div class="invoice-info-block">{invoice_info}</div>
  <div class="party">{customer_name} · {customer_phone}</div>
  {items_table}
  {installments_block}
  <div class="totals">
    <div class="row"><span>المجموع</span><span>{subtotal}</span></div>
    <div class="row"><span>الخصم</span><span>{discount_amount}</span></div>
    <div class="row"><span>الضريبة</span><span>{tax_amount}</span></div>
    <div class="row grand"><span>الإجمالي</span><span>{total}</span></div>
    <div class="row"><span>المدفوع</span><span>{amount_paid}</span></div>
    <div class="row"><span>المتبقي</span><span>{balance}</span></div>
  </div>
  <div class="footer">
    <div class="template-terms">{terms}</div>
    <div class="template-signatures">{signatures}</div>
    <div class="qr-wrap">{qr_code}</div>
  </div>
</div>
`

export function getThemeHtml(themeId: InvoiceThemeId): string {
  switch (themeId) {
    case 'classic':
      return THEME_CLASSIC
    case 'modern':
      return THEME_MODERN
    case 'compact':
      return THEME_COMPACT
    default:
      return THEME_MODERN
  }
}
