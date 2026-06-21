import { formatAmount } from './currency'
import type { PosShiftInfo, PosXReport } from '../types'

export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function safeLogoUrlForPrint(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const t = url.trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  if (t.startsWith('/') && !t.startsWith('//')) return t
  return null
}

export type CloseShiftBreakdown = {
  cashSales: number
  cardSales: number
  bankSales: number
  otherSales: number
  totalReceived: number
  returns: number
  discount: number
  totalCashSalesNet: number
  creditSales: number
  totalSales: number
  expenses: number
  netCash: number
}

export function computeCloseShiftBreakdown(closeShiftSummary: PosXReport): CloseShiftBreakdown {
  const byMethod = closeShiftSummary.by_payment_method ?? []
  const isCash = (ty: string, n: string) => /cash|نقد|كاش/i.test(ty) || /cash|نقد|كاش/i.test(n)
  const isCard = (ty: string, n: string) => /card|credit|فيزا|بطاقة|شبكة/i.test(ty) || /card|visa|فيزا|بطاقة|شبكة/i.test(n)
  const isBank = (ty: string, n: string) => /bank|تحويل|بنك/i.test(ty) || /bank|تحويل|بنك/i.test(n)
  const cashSales = byMethod.filter((m) => isCash(m.type, m.name)).reduce((s, m) => s + (m.amount ?? 0), 0)
  const cardSales = byMethod.filter((m) => isCard(m.type, m.name)).reduce((s, m) => s + (m.amount ?? 0), 0)
  const bankSales = byMethod.filter((m) => isBank(m.type, m.name)).reduce((s, m) => s + (m.amount ?? 0), 0)
  const otherSales = byMethod
    .filter((m) => !isCash(m.type, m.name) && !isCard(m.type, m.name) && !isBank(m.type, m.name))
    .reduce((s, m) => s + (m.amount ?? 0), 0)
  const totalReceived = cashSales + cardSales + bankSales + otherSales
  const returns = closeShiftSummary.total_returns ?? 0
  const discount = 0
  const totalCashSalesNet = Math.max(0, totalReceived - returns - discount)
  const creditSales = Math.max(0, (closeShiftSummary.total_sales ?? 0) - returns - totalReceived)
  const totalSales = closeShiftSummary.total_sales ?? 0
  const expenses = closeShiftSummary.total_expenses ?? 0
  const netCash = closeShiftSummary.expected_cash ?? 0
  return {
    cashSales,
    cardSales,
    bankSales,
    otherSales,
    totalReceived,
    returns,
    discount,
    totalCashSalesNet,
    creditSales,
    totalSales,
    expenses,
    netCash,
  }
}

export function resolveShiftInvoiceLogo(settings: Record<string, unknown> | undefined): unknown {
  return settings?.pos_invoice_logo ?? settings?.company_logo
}

type OpenCloseShiftPrintArgs = {
  closeShiftSummary: PosXReport
  closeShiftBreakdown: CloseShiftBreakdown
  currentShift: PosShiftInfo
  companyName?: string
  managerName?: string
  invoiceLogo?: unknown
  lang: string
  amountDecimals: number
  locale: string
}

export function openCloseShiftPrintWindow({
  closeShiftSummary,
  closeShiftBreakdown,
  currentShift,
  companyName,
  managerName,
  invoiceLogo,
  lang,
  amountDecimals,
  locale,
}: OpenCloseShiftPrintArgs): boolean {
  const isAr = lang === 'ar'
  const dir = isAr ? 'rtl' : 'ltr'
  const logo = safeLogoUrlForPrint(invoiceLogo)
  const company = escHtml(companyName ?? '')
  const cashier = escHtml(currentShift.user?.name ?? '—')
  const manager = escHtml(managerName ?? '—')
  const branch = escHtml(currentShift.branch?.name ?? currentShift.branch?.code ?? '—')
  const openedRaw = closeShiftSummary.opened_at ?? currentShift.opened_at
  const openedStr = openedRaw
    ? new Date(openedRaw).toLocaleString(isAr ? 'ar-SA' : 'en-GB', { hour12: true })
    : '—'
  const printNow = new Date().toLocaleString(isAr ? 'ar-SA' : 'en-GB', { hour12: true })
  const closingNote = isAr
    ? 'لم يُسجَّل بعد — الوردية مفتوحة (يُثبَّت عند الضغط على «إغلاق الوردية»)'
    : 'Not recorded yet — shift open (recorded on «Close shift»)'
  const b = closeShiftBreakdown
  const fmtN = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)
  const invoicesCount = closeShiftSummary.invoices_count ?? 0
  const returnsCount = closeShiftSummary.returns_count ?? 0
  const itemsSoldCount = closeShiftSummary.items_sold_count
  const row = (label: string, val: string, valClass = '') =>
    `<tr><td>${escHtml(label)}</td><td class="num ${valClass}">${val}</td></tr>`
  const sec = (t: string) => `<tr><td colspan="2" class="sec">${escHtml(t)}</td></tr>`
  const summaryRows = [
    sec(isAr ? 'ملخص الوردية' : 'Shift summary'),
    row(isAr ? 'عدد الفواتير / الطلبات' : 'Invoices / orders count', String(invoicesCount), 'bold'),
    ...(returnsCount > 0
      ? [row(isAr ? 'عدد المرتجعات' : 'Returns count', String(returnsCount))]
      : []),
    ...(itemsSoldCount != null && itemsSoldCount > 0
      ? [row(isAr ? 'الأصناف المباعة' : 'Items sold', String(itemsSoldCount))]
      : []),
  ]
  const tableBody = [
    ...summaryRows,
    sec(isAr ? 'المبيعات حسب طريقة الدفع' : 'Sales by payment method'),
    row(isAr ? 'مبيعات نقداً' : 'Cash sales', fmtN(b.cashSales)),
    row(isAr ? 'مبيعات فيزا / بطاقة' : 'Card sales', fmtN(b.cardSales)),
    row(isAr ? 'تحويلات بنكية' : 'Bank transfers', fmtN(b.bankSales)),
    row(isAr ? 'أخرى' : 'Other', fmtN(b.otherSales)),
    row(isAr ? '− مرتجعات' : '− Returns', `- ${fmtN(b.returns)}`, 'neg'),
    row(isAr ? '− خصم' : '− Discount', `- ${fmtN(b.discount)}`, 'neg'),
    row(isAr ? 'إجمالي المبيعات النقدية' : 'Total cash sales', fmtN(b.totalCashSalesNet), 'bold'),
    row(isAr ? 'مبيعات بالآجل' : 'Credit sales', fmtN(b.creditSales)),
    row(isAr ? 'إجمالي المبيعات' : 'Total sales', fmtN(b.totalSales), 'bold'),
    row(isAr ? 'المصروفات' : 'Expenses', `- ${fmtN(b.expenses)}`, 'neg'),
    row(isAr ? 'صافي النقدية' : 'Net cash', fmtN(b.netCash), 'total'),
  ].join('')

  const tLine = (k: string, v: string, extra = '') =>
    `<div class="ti ${extra}"><div class="tik">${escHtml(k)}</div><div class="tiv">${v}</div></div>`
  const tSec = (t: string) => `<div class="tisec">${escHtml(t)}</div>`
  const thermalBody = [
    tSec(isAr ? 'ملخص الوردية' : 'Shift summary'),
    tLine(isAr ? 'عدد الفواتير / الطلبات' : 'Invoices / orders count', String(invoicesCount), 'strong'),
    ...(returnsCount > 0 ? [tLine(isAr ? 'عدد المرتجعات' : 'Returns count', String(returnsCount))] : []),
    ...(itemsSoldCount != null && itemsSoldCount > 0
      ? [tLine(isAr ? 'الأصناف المباعة' : 'Items sold', String(itemsSoldCount))]
      : []),
    tSec(isAr ? 'المبيعات حسب طريقة الدفع' : 'Sales by payment method'),
    tLine(isAr ? 'مبيعات نقداً' : 'Cash sales', fmtN(b.cashSales)),
    tLine(isAr ? 'مبيعات فيزا / بطاقة' : 'Card sales', fmtN(b.cardSales)),
    tLine(isAr ? 'تحويلات بنكية' : 'Bank transfers', fmtN(b.bankSales)),
    tLine(isAr ? 'أخرى' : 'Other', fmtN(b.otherSales)),
    tLine(isAr ? '− مرتجعات' : '− Returns', `- ${fmtN(b.returns)}`, 'neg'),
    tLine(isAr ? '− خصم' : '− Discount', `- ${fmtN(b.discount)}`, 'neg'),
    tLine(isAr ? 'إجمالي المبيعات النقدية' : 'Total cash sales', fmtN(b.totalCashSalesNet), 'strong'),
    tLine(isAr ? 'مبيعات بالآجل' : 'Credit sales', fmtN(b.creditSales)),
    tLine(isAr ? 'إجمالي المبيعات' : 'Total sales', fmtN(b.totalSales), 'strong'),
    tLine(isAr ? 'المصروفات' : 'Expenses', `- ${fmtN(b.expenses)}`, 'neg'),
    tLine(isAr ? 'صافي النقدية' : 'Net cash', fmtN(b.netCash), 'total'),
  ].join('')

  const title = isAr ? 'تقرير مطابقة وجرد وردية مبيعات' : 'Sales shift reconciliation & cash count report'
  const modeLabel = isAr ? 'نمط الطباعة' : 'Print layout'
  const lblA4 = isAr ? 'A4 (مكتبية)' : 'A4 (office)'
  const lblTh = isAr ? 'حراري 80مم' : 'Thermal 80mm'
  const btnPrint = isAr ? 'طباعة' : 'Print'
  const hint = isAr ? 'اختر النمط ثم اضغط طباعة. حجم الورق يُضبط تلقائياً مع نمط الطباعة.' : 'Choose layout, then Print. Paper size follows the selected layout.'

  const html = `<!DOCTYPE html><html dir="${dir}" lang="${isAr ? 'ar' : 'en'}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escHtml(title)}</title>
<style id="page-size-rule"></style>
<style>
  *{box-sizing:border-box;}
  body{margin:0;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#0f172a;background:#e2e8f0;}
  .toolbar.no-print{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;padding:12px 16px;background:#1e293b;color:#f8fafc;border-bottom:2px solid #0f172a;}
  .toolbar .ttl{font-weight:700;font-size:0.9rem;}
  .toolbar label{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:0.85rem;}
  .toolbar input{accent-color:#38bdf8;}
  .toolbar button#printGo{margin-inline-start:auto;background:#0ea5e9;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.9rem;}
  .wrap{padding:16px;display:flex;justify-content:center;}
  #sheet-a4{display:block;width:100%;max-width:210mm;margin:0 auto;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.12);padding:20px 24px;border-radius:8px;}
  body.mode-thermal #sheet-a4{display:none !important;}
  #sheet-a4 .logo{text-align:center;margin-bottom:10px;}
  #sheet-a4 .logo img{max-height:72px;max-width:240px;object-fit:contain;}
  #sheet-a4 h1{font-size:1.15rem;text-align:center;font-weight:700;margin:6px 0 14px;}
  #sheet-a4 .company{text-align:center;font-size:0.85rem;color:#64748b;margin-bottom:12px;}
  #sheet-a4 .meta{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;font-size:0.82rem;margin-bottom:16px;border:1px solid #cbd5e1;padding:12px;border-radius:8px;background:#f8fafc;}
  #sheet-a4 .meta .cell{display:flex;flex-direction:column;gap:3px;}
  #sheet-a4 .meta .k{color:#64748b;font-size:0.72rem;}
  #sheet-a4 .meta .v{font-weight:600;}
  #sheet-a4 .meta .full{grid-column:1/-1;}
  #sheet-a4 table{width:100%;border-collapse:collapse;font-size:0.84rem;table-layout:fixed;}
  #sheet-a4 th,#sheet-a4 td{border:1px solid #cbd5e1;padding:8px 10px;word-wrap:break-word;}
  #sheet-a4 th{background:#e2e8f0;font-weight:600;}
  #sheet-a4 th:first-child{width:62%;}
  #sheet-a4 .sec{background:#f1f5f9;font-size:0.72rem;font-weight:700;color:#475569;}
  #sheet-a4 .num{text-align:left;direction:ltr;font-variant-numeric:tabular-nums;}
  [dir="rtl"] #sheet-a4 .num{text-align:right;}
  #sheet-a4 .neg{color:#dc2626;}
  #sheet-a4 .bold{font-weight:700;background:#f1f5f9;}
  #sheet-a4 .total{font-weight:800;background:#e0f2fe;color:#0369a1;}
  #sheet-a4 .sign{margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:28px;}
  #sheet-a4 .sign .lbl{font-size:0.78rem;color:#475569;margin-bottom:6px;}
  #sheet-a4 .sign .line{border-bottom:1px solid #334155;min-height:40px;}
  #sheet-thermal{display:none;width:80mm;max-width:80mm;margin:0 auto;background:#fff;padding:6px 8px 10px;font-size:11px;line-height:1.35;}
  body.mode-thermal #sheet-thermal{display:block !important;}
  @media print{.no-print{display:none !important;}}
</style></head><body class="mode-a4">
  <header class="toolbar no-print">
    <span class="ttl">${escHtml(modeLabel)}</span>
    <label><input type="radio" name="printMode" value="a4" checked/> ${escHtml(lblA4)}</label>
    <label><input type="radio" name="printMode" value="thermal"/> ${escHtml(lblTh)}</label>
    <button type="button" id="printGo">${escHtml(btnPrint)}</button>
    <p class="hint">${escHtml(hint)}</p>
  </header>
  <div class="wrap">
  <div id="sheet-a4">
  ${logo ? `<div class="logo"><img src="${escHtml(logo)}" alt=""/></div>` : ''}
  <h1>${escHtml(title)}</h1>
  ${company ? `<div class="company">${company}</div>` : ''}
  <div class="meta">
    <div class="cell"><span class="k">${isAr ? 'اسم الكاشير (فاتح الوردية)' : 'Cashier (opened shift)'}</span><span class="v">${cashier}</span></div>
    <div class="cell"><span class="k">${isAr ? 'اسم المدير / المُغلق' : 'Manager / closing user'}</span><span class="v">${manager}</span></div>
    <div class="cell"><span class="k">${isAr ? 'تاريخ ووقت فتح الوردية' : 'Shift opened at'}</span><span class="v">${escHtml(openedStr)}</span></div>
    <div class="cell"><span class="k">${isAr ? 'تاريخ ووقت إغلاق الوردية' : 'Shift closed at'}</span><span class="v">${escHtml(closingNote)}</span></div>
    <div class="cell full"><span class="k">${isAr ? 'الفرع' : 'Branch'}</span><span class="v">${branch}</span></div>
    <div class="cell full"><span class="k">${isAr ? 'وقت طباعة التقرير' : 'Report printed at'}</span><span class="v">${escHtml(printNow)}</span></div>
  </div>
  <table><thead><tr><th>${isAr ? 'البند' : 'Item'}</th><th>${isAr ? 'المبلغ' : 'Amount'}</th></tr></thead><tbody>${tableBody}</tbody></table>
  <div class="sign">
    <div><div class="lbl">${isAr ? 'توقيع الكاشير' : 'Cashier signature'}</div><div class="line"></div></div>
    <div><div class="lbl">${isAr ? 'توقيع المشرف' : 'Supervisor signature'}</div><div class="line"></div></div>
  </div>
  </div>
  <div id="sheet-thermal">
  ${logo ? `<div class="tlogo"><img src="${escHtml(logo)}" alt=""/></div>` : ''}
  <h1>${escHtml(title)}</h1>
  ${company ? `<div class="tco">${company}</div>` : ''}
  ${thermalBody}
  </div>
  </div>
<script>
(function(){
  var pageEl=document.getElementById('page-size-rule');
  function setPageRule(mode){
    if(!pageEl)return;
    pageEl.textContent=mode==='thermal'?'@media print{@page{size:80mm auto;margin:2mm;}}':'@media print{@page{size:A4 portrait;margin:12mm;}}';
  }
  function setMode(mode){document.body.className=mode==='thermal'?'mode-thermal':'mode-a4';setPageRule(mode);}
  document.querySelectorAll('input[name="printMode"]').forEach(function(r){r.addEventListener('change',function(){if(r.checked)setMode(r.value);});});
  document.getElementById('printGo').addEventListener('click',function(){var m=document.querySelector('input[name="printMode"]:checked');setMode(m?m.value:'a4');window.print();});
  setMode('a4');
})();
</script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  return true
}
