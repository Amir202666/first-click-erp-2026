import type { Invoice } from '../../types'
import { getLocalizedName, type Lang } from '../../utils/localizedName'
import { formatDisplayDate } from '../../utils/date'

export type DirectInvoiceRendererProps = {
  invoice: Invoice
  companyName: string
  companyLogo?: string | null
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyTaxNumber?: string | null
  partyLabel: string
  partyName: string
  partyPhone?: string
  partyAddress?: string
  partyTaxNumber?: string | null
  typeLabel: string
  accentColor?: string
  isRtl: boolean
  lang: Lang
  fmt: (n: number) => string
  fmtQty: (n: number) => string
  labels: {
    invoiceNumber: string
    invoiceDate: string
    dueDate: string
    item: string
    quantity: string
    unitPrice: string
    tax: string
    amount: string
    subtotal: string
    discountAmount: string
    taxAmount: string
    total: string
    balance: string
    notes: string
  }
}

export default function DirectInvoiceRenderer({
  invoice,
  companyName,
  companyLogo,
  companyAddress,
  companyPhone,
  companyEmail,
  companyTaxNumber,
  partyLabel,
  partyName,
  partyPhone,
  partyAddress,
  partyTaxNumber,
  typeLabel,
  accentColor = '#4f46e5',
  isRtl,
  lang,
  fmt,
  fmtQty,
  labels,
}: DirectInvoiceRendererProps) {
  const accent = accentColor
  const lines = invoice.lines ?? []
  const paid = Number(invoice.amount_paid ?? 0)
  const total = Number(invoice.total ?? 0)
  const balance = Number(invoice.balance ?? 0)

  const paymentLabel =
    invoice.payment_timing === 'cash'
      ? lang === 'ar'
        ? 'نقدي'
        : 'Cash'
      : invoice.payment_timing === 'credit'
        ? lang === 'ar'
          ? 'آجل'
          : 'Credit'
        : invoice.payment_timing ?? '—'

  return (
    <div
      id="invoice-paper"
      className="bg-white shadow-sm"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        width: '210mm',
        maxWidth: '100%',
        minHeight: '297mm',
        margin: '0 auto',
        fontFamily: 'Cairo, Tajawal, Tahoma, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          background: accent,
          color: '#fff',
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          {companyLogo ? (
            <img
              src={companyLogo}
              alt=""
              style={{ height: 48, objectFit: 'contain', marginBottom: 8, display: 'block' }}
            />
          ) : null}
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{companyName}</h1>
          {companyAddress ? (
            <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.9 }}>{companyAddress}</p>
          ) : null}
          <p style={{ margin: '2px 0 0', fontSize: 11, opacity: 0.85 }}>
            {[companyPhone, companyEmail].filter(Boolean).join(' · ')}
            {companyTaxNumber ? ` · ${labels.taxAmount ? '' : ''}${lang === 'ar' ? 'الرقم الضريبي' : 'VAT'}: ${companyTaxNumber}` : ''}
          </p>
        </div>
        <div style={{ textAlign: isRtl ? 'left' : 'right' }}>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>{typeLabel}</p>
          <p style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 800 }}>#{invoice.number}</p>
        </div>
      </div>

      <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div
            style={{
              flex: '1 1 200px',
              background: '#f8fafc',
              borderRadius: 10,
              padding: 14,
              borderRight: isRtl ? `4px solid ${accent}` : undefined,
              borderLeft: !isRtl ? `4px solid ${accent}` : undefined,
            }}
          >
            <p style={{ margin: '0 0 6px', fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{partyLabel}</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{partyName || '—'}</p>
            {partyPhone ? <p style={{ margin: '3px 0 0', fontSize: 11, color: '#6b7280' }}>{partyPhone}</p> : null}
            {partyAddress ? <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>{partyAddress}</p> : null}
            {partyTaxNumber ? (
              <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9ca3af' }}>
                {lang === 'ar' ? 'ر.ض' : 'VAT'}: {partyTaxNumber}
              </p>
            ) : null}
          </div>
          <div
            style={{
              flex: '1 1 200px',
              background: '#f8fafc',
              borderRadius: 10,
              padding: 14,
            }}
          >
            <p style={{ margin: '0 0 8px', fontSize: 10, color: '#6b7280', fontWeight: 600 }}>
              {lang === 'ar' ? 'تفاصيل الفاتورة' : 'Invoice details'}
            </p>
            {[
              [labels.invoiceNumber, `#${invoice.number}`],
              [labels.invoiceDate, formatDisplayDate(invoice.date)],
              invoice.due_date ? [labels.dueDate, formatDisplayDate(invoice.due_date)] : null,
              [lang === 'ar' ? 'طريقة الدفع' : 'Payment', paymentLabel],
            ]
              .filter(Boolean)
              .map((row) => (
                <div
                  key={row![0] as string}
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, gap: 8 }}
                >
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{row![0] as string}</span>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{row![1] as string}</span>
                </div>
              ))}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: accent, color: '#fff' }}>
              {['#', labels.item, labels.quantity, labels.unitPrice, labels.tax, labels.amount].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: '10px 10px',
                    textAlign: i === 0 ? (isRtl ? 'right' : 'left') : i === 5 ? (isRtl ? 'left' : 'right') : 'center',
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 16, textAlign: 'center', color: '#9ca3af' }}>
                  —
                </td>
              </tr>
            ) : (
              lines.map((line, i) => {
                const name = line.item ? getLocalizedName(line.item, lang) : (line.description ?? '—')
                const qty = Number(line.quantity ?? 0)
                const price = Number(line.unit_price ?? 0)
                const lineTotal = Number(line.total ?? 0)
                const taxPct = Number(line.tax_percent ?? 0)
                const taxAmt = taxPct > 0 ? (qty * price * taxPct) / 100 : 0
                return (
                  <tr
                    key={line.id ?? i}
                    style={{
                      background: i % 2 === 0 ? '#f9fafb' : '#fff',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <td style={{ padding: '9px 10px', color: '#9ca3af' }}>{i + 1}</td>
                    <td style={{ padding: '9px 10px', fontWeight: 600 }}>{name}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center' }}>{fmtQty(qty)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center' }}>{fmt(price)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center' }}>{fmt(taxAmt)}</td>
                    <td
                      style={{
                        padding: '9px 10px',
                        textAlign: isRtl ? 'left' : 'right',
                        fontWeight: 700,
                      }}
                    >
                      {fmt(lineTotal)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: isRtl ? 'flex-start' : 'flex-end' }}>
          <div style={{ width: 'min(100%, 280px)' }}>
            {[
              { label: labels.subtotal, value: Number(invoice.subtotal ?? 0), show: true },
              { label: labels.taxAmount, value: Number(invoice.tax_amount ?? 0), show: true },
              {
                label: labels.discountAmount,
                value: Number(invoice.discount_amount ?? 0),
                show: Number(invoice.discount_amount ?? 0) > 0,
                color: '#dc2626',
              },
            ]
              .filter((r) => r.show)
              .map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '7px 0',
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: 12,
                    color: row.color ?? 'inherit',
                  }}
                >
                  <span style={{ color: row.color ?? '#6b7280' }}>{row.label}</span>
                  <span style={{ fontWeight: 600 }}>
                    {row.color ? '-' : ''}
                    {fmt(row.value)}
                  </span>
                </div>
              ))}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: accent,
                color: '#fff',
                borderRadius: 10,
                marginTop: 8,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700 }}>{labels.total}</span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>{fmt(total)}</span>
            </div>
            {paid > 0 ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  <span style={{ color: '#6b7280' }}>{lang === 'ar' ? 'المدفوع' : 'Paid'}</span>
                  <span style={{ fontWeight: 600, color: '#059669' }}>{fmt(paid)}</span>
                </div>
                {balance > 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: '#6b7280' }}>{labels.balance}</span>
                    <span style={{ fontWeight: 600, color: '#dc2626' }}>{fmt(balance)}</span>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {invoice.notes ? (
          <div>
            <p style={{ fontSize: 10, color: '#6b7280', margin: '0 0 4px', fontWeight: 600 }}>{labels.notes}</p>
            <p style={{ fontSize: 11, color: '#374151', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {invoice.notes}
            </p>
          </div>
        ) : null}

        <div
          style={{
            marginTop: 'auto',
            paddingTop: 12,
            borderTop: '2px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            fontSize: 10,
            color: '#9ca3af',
          }}
        >
          <span>{[companyName, companyPhone, companyEmail].filter(Boolean).join(' | ')}</span>
          {companyTaxNumber ? (
            <span>
              {lang === 'ar' ? 'الرقم الضريبي' : 'VAT'}: {companyTaxNumber}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
