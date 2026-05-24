/**
 * محرك قوالب الفواتير والسندات — HTML/CSS مع وسوم برمجية (Short-tags)
 * استبدال {tag} ببيانات الفاتورة مع دعم جدول أصناف قابل للتكوين
 */

export interface InvoiceLineLike {
  item?: { name?: string; name_en?: string; code?: string }
  description?: string
  quantity?: number
  unit_price?: number
  discount_percent?: number
  tax_percent?: number
  total?: number
}

export interface InstallmentLinePrintLike {
  sequence: number
  due_date: string
  amount: number
}

export interface InstallmentPrintLike {
  number?: string | null
  lines: InstallmentLinePrintLike[]
}

export interface InvoiceLike {
  number: string
  date: string
  due_date?: string | null
  type?: string
  payment_timing?: string | null
  subtotal?: number
  discount_amount?: number
  tax_amount?: number
  total?: number
  amount_paid?: number
  balance?: number
  lines?: InvoiceLineLike[]
}

export interface TemplateRenderContext {
  logo?: string | null
  company_name: string
  company_address?: string
  company_phone?: string
  company_email?: string
  tax_number?: string
  party_tax_number?: string
  invoice: InvoiceLike
  customer_name?: string
  customer_phone?: string
  customer_address?: string
  vendor_name?: string
  vendor_phone?: string
  vendor_address?: string
  warehouse_name?: string
  terms?: string
  /** جدول أقساط للطباعة (يُعرض فقط عند وجود بنود) */
  installment?: InstallmentPrintLike | null
  /** محتوى يُرمّز في QR (رابط متابعة الأقساط أو رقم الفاتورة) */
  qr_code_payload?: string | null
  isRtl?: boolean
  lang?: 'ar' | 'en'
  fmt: (n: number) => string
  fmtQty: (n: number) => string
  labels?: {
    invoiceNumber?: string
    invoiceDate?: string
    dueDate?: string
    customer?: string
    vendor?: string
    item?: string
    quantity?: string
    unitPrice?: string
    discount?: string
    tax?: string
    amount?: string
    subtotal?: string
    discountAmount?: string
    taxAmount?: string
    total?: string
    amountPaid?: string
    balance?: string
    installmentScheduleTitle?: string
    installmentColSeq?: string
    installmentColDue?: string
    installmentColAmount?: string
    installmentPrintAck?: string
    installmentSignerName?: string
    installmentSignatureLine?: string
    installmentThumbprint?: string
  }
}

export interface ItemsTableOptions {
  show_discount?: boolean
  show_tax?: boolean
  show_item_code?: boolean
  columns?: Array<{ key: string; label: string }>
}

const DEFAULT_ITEMS_TABLE_OPTIONS: ItemsTableOptions = {
  show_discount: true,
  show_tax: true,
  show_item_code: false,
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * بناء HTML لجدول الأصناف حسب الخيارات
 */
export function buildItemsTableHtml(
  ctx: TemplateRenderContext,
  options: ItemsTableOptions = {}
): string {
  const opts = { ...DEFAULT_ITEMS_TABLE_OPTIONS, ...options }
  const lines = ctx.invoice.lines ?? []
  const t = ctx.labels ?? {}
  const dir = ctx.isRtl ? 'rtl' : 'ltr'

  const cols: Array<{ key: string; label: string }> = opts.columns ?? [
    { key: 'item', label: t.item ?? 'الصنف / الوصف' },
    ...(opts.show_item_code ? [{ key: 'code', label: 'الكود' }] : []),
    { key: 'quantity', label: t.quantity ?? 'الكمية' },
    { key: 'unit_price', label: t.unitPrice ?? 'سعر الوحدة' },
    ...(opts.show_discount ? [{ key: 'discount', label: t.discount ?? 'الخصم' }] : []),
    ...(opts.show_tax ? [{ key: 'tax', label: t.tax ?? 'الضريبة' }] : []),
    { key: 'total', label: t.amount ?? 'المبلغ' },
  ]

  const thead = `<thead><tr>${cols.map((c) => `<th style="padding:6px 8px;text-align:${ctx.isRtl ? 'right' : 'left'};border-bottom:1px solid #e2e8f0;font-weight:400;">${escapeHtml(c.label)}</th>`).join('')}</tr></thead>`
  const rows = lines.map((line) => {
    const itemName = line.item ? (ctx.lang === 'en' && line.item.name_en ? line.item.name_en : line.item.name) || line.description : line.description ?? '—'
    const cells = [
      `<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">${escapeHtml(String(itemName))}</td>`,
      ...(opts.show_item_code ? [`<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">${escapeHtml(String(line.item?.code ?? '—'))}</td>`] : []),
      `<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">${ctx.fmtQty(Number(line.quantity ?? 0))}</td>`,
      `<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">${ctx.fmt(Number(line.unit_price ?? 0))}</td>`,
      ...(opts.show_discount ? [`<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">${Number(line.discount_percent ?? 0)}%</td>`] : []),
      ...(opts.show_tax ? [`<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">${Number(line.tax_percent ?? 0)}%</td>`] : []),
      `<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-weight:400;">${ctx.fmt(Number(line.total ?? 0))}</td>`,
    ]
    return `<tr>${cells.join('')}</tr>`
  }).join('')
  const tbody = `<tbody>${rows}</tbody>`
  return `<table dir="${dir}" style="width:100%;border-collapse:collapse;font-size:inherit;">${thead}${tbody}</table>`
}

/** يظهر جدول الأقساط في الطباعة فقط عند وجود جدول مرتبط بالفاتورة وبنود فعلية */
export function shouldShowInstallmentScheduleOnPrint(ctx: TemplateRenderContext): boolean {
  const lines = ctx.installment?.lines
  return Array.isArray(lines) && lines.length > 0
}

/**
 * قسم جدول الأقساط + إقرار وتوقيع — تنسيق هادئ، page-break داخل المجموعة يُفضّل البقاء معاً
 */
export function buildInstallmentSchedulePrintHtml(ctx: TemplateRenderContext): string {
  if (!shouldShowInstallmentScheduleOnPrint(ctx)) return ''
  const L = ctx.labels ?? {}
  const rtl = ctx.isRtl !== false
  const dir = rtl ? 'rtl' : 'ltr'
  const taStart = rtl ? 'right' : 'left'
  const border = '#e2e8f0'
  const headBg = '#f8fafc'
  const textMuted = '#64748b'
  const title = escapeHtml(L.installmentScheduleTitle ?? (ctx.lang === 'en' ? 'Installment schedule' : 'جدول الأقساط'))
  const colSeq = escapeHtml(L.installmentColSeq ?? (ctx.lang === 'en' ? '#' : 'القسط'))
  const colDue = escapeHtml(L.installmentColDue ?? (ctx.lang === 'en' ? 'Due date' : 'تاريخ الاستحقاق'))
  const colAmt = escapeHtml(L.installmentColAmount ?? (ctx.lang === 'en' ? 'Amount' : 'المبلغ'))
  const ack = escapeHtml(
    L.installmentPrintAck ??
      (ctx.lang === 'en'
        ? 'I, the undersigned, acknowledge my commitment to pay the installments listed above on their due dates.'
        : 'أقر أنا الموقع أدناه بالتزامي بسداد الأقساط الموضحة أعلاه في مواعيدها المحددة.'),
  )
  const labName = escapeHtml(L.installmentSignerName ?? (ctx.lang === 'en' ? 'Customer / signer name' : 'اسم العميل / الموقّع'))
  const labSig = escapeHtml(L.installmentSignatureLine ?? (ctx.lang === 'en' ? 'Signature' : 'التوقيع'))
  const labThumb = escapeHtml(L.installmentThumbprint ?? (ctx.lang === 'en' ? 'Thumbprint' : 'بصمة الإبهام'))

  const rows = (ctx.installment!.lines ?? [])
    .map(
      (ln) =>
        `<tr>
          <td style="padding:7px 10px;border-bottom:1px solid ${border};text-align:center;">${escapeHtml(String(ln.sequence))}</td>
          <td style="padding:7px 10px;border-bottom:1px solid ${border};text-align:${taStart};">${escapeHtml(String(ln.due_date))}</td>
          <td style="padding:7px 10px;border-bottom:1px solid ${border};text-align:${taStart};font-variant-numeric:tabular-nums;">${escapeHtml(ctx.fmt(Number(ln.amount ?? 0)))}</td>
        </tr>`,
    )
    .join('')

  const thead = `<thead style="display:table-header-group;"><tr>
    <th style="padding:8px 10px;text-align:center;border-bottom:1px solid ${border};font-weight:600;color:#475569;background:${headBg};width:52px;">${colSeq}</th>
    <th style="padding:8px 10px;text-align:${taStart};border-bottom:1px solid ${border};font-weight:600;color:#475569;background:${headBg};">${colDue}</th>
    <th style="padding:8px 10px;text-align:${taStart};border-bottom:1px solid ${border};font-weight:600;color:#475569;background:${headBg};width:28%;">${colAmt}</th>
  </tr></thead>`

  const signRow = (label: string) =>
    `<tr><td colspan="3" style="padding:10px 4px 6px;border:none;">
      <div style="display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;">
        <span style="font-size:9pt;color:${textMuted};white-space:nowrap;">${label}</span>
        <span style="flex:1;min-width:120px;border-bottom:1px solid #94a3b8;height:22px;"></span>
      </div>
    </td></tr>`

  return `<div class="invoice-installments-wrap" dir="${dir}" style="page-break-inside:avoid;break-inside:avoid;margin:14px 0;padding:12px 14px;border:1px solid ${border};border-radius:8px;background:#fafafa;">
    <div style="font-size:10.5pt;font-weight:600;color:#334155;margin-bottom:10px;letter-spacing:0.01em;">${title}</div>
    <table style="width:100%;border-collapse:collapse;font-size:9.5pt;color:#334155;">${thead}<tbody>${rows}</tbody></table>
    <p style="margin:14px 0 10px;font-size:9pt;line-height:1.55;color:#475569;text-align:${taStart};">${ack}</p>
    <table style="width:100%;border-collapse:collapse;font-size:9pt;margin-top:4px;"><tbody>
      ${signRow(labName)}
      ${signRow(labSig)}
      ${signRow(labThumb)}
    </tbody></table>
  </div>`
}

/**
 * استبدال جميع الوسوم البرمجية في HTML القالب ببيانات السياق
 */
export function renderTemplate(
  html: string,
  ctx: TemplateRenderContext,
  itemsTableOptions?: ItemsTableOptions
): string {
  const inv = ctx.invoice
  const partyName = ctx.customer_name ?? ctx.vendor_name ?? ''
  const partyPhone = ctx.customer_phone ?? ctx.vendor_phone ?? ''
  const partyAddress = ctx.customer_address ?? ctx.vendor_address ?? ''

  const replacements: Array<[RegExp | string, string]> = [
    [/\{logo\}/g, ctx.logo ? `<img src="${escapeHtml(ctx.logo)}" alt="Logo" style="max-width:100%;max-height:80px;object-fit:contain;" />` : ''],
    [/\{company_name\}/g, escapeHtml(ctx.company_name)],
    [/\{company_address\}/g, escapeHtml(ctx.company_address ?? '')],
    [/\{company_phone\}/g, escapeHtml(ctx.company_phone ?? '')],
    [/\{company_email\}/g, escapeHtml(ctx.company_email ?? '')],
    [/\{tax_number\}/g, escapeHtml(ctx.tax_number ?? '')],
    [/\{party_tax_number\}/g, escapeHtml(ctx.party_tax_number ?? '')],
    [/\{invoice_number\}/g, escapeHtml(String(inv.number))],
    [/\{invoice_date\}/g, escapeHtml(inv.date)],
    [/\{invoice_due_date\}/g, inv.due_date ? escapeHtml(inv.due_date) : ''],
    [/\{invoice_info\}/g, `<div class="invoice-info-block">${ctx.labels?.invoiceNumber ?? 'رقم الفاتورة'}: ${escapeHtml(String(inv.number))}<br/>${ctx.labels?.invoiceDate ?? 'التاريخ'}: ${escapeHtml(inv.date)}${inv.due_date ? `<br/>${ctx.labels?.dueDate ?? 'تاريخ الاستحقاق'}: ${escapeHtml(inv.due_date)}` : ''}</div>`],
    [/\{customer_name\}/g, escapeHtml(partyName)],
    [/\{customer_phone\}/g, escapeHtml(partyPhone)],
    [/\{customer_address\}/g, escapeHtml(partyAddress)],
    [/\{warehouse_name\}/g, escapeHtml(ctx.warehouse_name ?? '')],
    [/\{subtotal\}/g, ctx.fmt(Number(inv.subtotal ?? 0))],
    [/\{discount_amount\}/g, ctx.fmt(Number(inv.discount_amount ?? 0))],
    [/\{tax_amount\}/g, ctx.fmt(Number(inv.tax_amount ?? 0))],
    [/\{total\}/g, ctx.fmt(Number(inv.total ?? 0))],
    [/\{amount_paid\}/g, ctx.fmt(Number(inv.amount_paid ?? 0))],
    [/\{balance\}/g, ctx.fmt(Number(inv.balance ?? 0))],
    [/\{terms\}/g, ctx.terms ? `<div class="template-terms">${escapeHtml(ctx.terms)}</div>` : ''],
    [/\{signatures\}/g, '<div class="template-signatures" data-placeholder="التوقيعات"></div>'],
    [
      /\{qr_code\}/g,
      `<img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(String(ctx.qr_code_payload ?? inv.number))}" alt="QR" style="width:80px;height:80px;" title="" />`,
    ],
    [/\{items_table\}/g, buildItemsTableHtml(ctx, itemsTableOptions)],
    [/\{installments_block\}/g, buildInstallmentSchedulePrintHtml(ctx)],
  ]

  let out = html
  for (const [pattern, value] of replacements) {
    out = out.replace(pattern, value)
  }
  return out
}

const MIN_CTX_STUB: Pick<TemplateRenderContext, 'company_name' | 'invoice' | 'fmt' | 'fmtQty'> = {
  company_name: '',
  invoice: { number: '—', date: '—' },
  fmt: (n) => String(n),
  fmtQty: (n) => String(n),
}

/** لاستخدام جدول الأقساط خارج القالب الكامل (مثلاً قالب A4 في React) */
export function renderInstallmentScheduleOnly(
  opts: Pick<TemplateRenderContext, 'installment' | 'fmt' | 'labels' | 'isRtl' | 'lang'>,
): string {
  return buildInstallmentSchedulePrintHtml({ ...MIN_CTX_STUB, ...opts } as TemplateRenderContext)
}

/** تجهيز بيانات الأقساط للطباعة من كائن الفاتورة القادم من الـ API */
export function buildInstallmentPrintBundleFromInvoice(
  invoice: {
    installment?: {
      number?: string | null
      lines?: Array<{ sequence: number; due_date: string; amount?: number | string | null }>
    } | null
  },
  formatDate: (iso: string) => string,
): InstallmentPrintLike | null {
  const raw = invoice.installment?.lines
  if (!Array.isArray(raw) || raw.length === 0) return null
  return {
    number: invoice.installment?.number ?? null,
    lines: raw.map((l) => ({
      sequence: Number(l.sequence ?? 0),
      due_date: formatDate(String(l.due_date ?? '').slice(0, 10)),
      amount: Number(l.amount ?? 0),
    })),
  }
}
