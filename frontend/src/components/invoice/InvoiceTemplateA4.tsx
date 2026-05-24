/**
 * قالب فاتورة A4 احترافي — تصميم عصري بسيط (Minimalist)
 * أزرق داكن + رمادي فاتح، خطوط Sans-serif، جاهز للطباعة بدقة عالية
 */
import { useMemo } from 'react'
import type { Invoice } from '../../types'
import { formatDisplayDate } from '../../utils/date'
import { getLocalizedName, type Lang } from '../../utils/localizedName'
import { buildInstallmentPrintBundleFromInvoice, renderInstallmentScheduleOnly } from '../../utils/invoiceTemplateEngine'

type PaymentLike = { id: number; number: string; date: string }

const BRAND = {
  primary: '#1e3a5f',      // أزرق داكن
  primaryLight: '#2c5282',
  gray: '#64748b',
  grayLight: '#f1f5f9',
  grayBorder: '#e2e8f0',
  white: '#ffffff',
}

export interface InvoiceTemplateA4Props {
  invoice: Invoice
  companyName: string
  companyLogo?: string | null
  companyAddress?: string | null
  companyPhone?: string | null
  companyEmail?: string | null
  companyTaxNumber?: string | null
  partyTaxNumber?: string | null
  typeLabel: string
  partyLabel: string
  partyName: string
  warehouseName?: string | null
  lang?: Lang
  t: {
    invoiceNumber: string
    referenceNumber: string
    invoiceDate: string
    dueDate: string
    warehouse?: string
    lineItems: string
    item: string
    quantity: string
    unitPrice: string
    discount: string
    tax: string
    taxAmount: string
    taxNumber?: string
    amount: string
    subtotal: string
    discountAmount: string
    total: string
    balance: string
    paymentStatus?: string
    notes: string
    voucherProof?: string
    voucherNumber?: string
    voucherDate?: string
    refNumBarcode?: string
    refNumQrcode?: string
    installmentScheduleTitle?: string
    installmentColSeq?: string
    installmentColDue?: string
    installmentColAmount?: string
    installmentPrintAck?: string
    installmentSignerName?: string
    installmentSignatureLine?: string
    installmentThumbprint?: string
    installmentQrHint?: string
  }
  isRtl: boolean
  fmt: (n: number) => string
  fmtQty: (n: number) => string
}

export default function InvoiceTemplateA4({
  invoice,
  companyName,
  companyLogo,
  companyAddress,
  companyPhone,
  companyEmail,
  companyTaxNumber,
  partyTaxNumber,
  typeLabel,
  partyLabel,
  partyName,
  warehouseName,
  lang = 'ar',
  t,
  isRtl,
  fmt,
  fmtQty,
}: InvoiceTemplateA4Props) {
  const textAlign = isRtl ? 'text-right' : 'text-left'

  const installmentPrintBundle = useMemo(
    () => buildInstallmentPrintBundleFromInvoice(invoice, formatDisplayDate),
    [invoice],
  )
  const installmentQrPayload = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    if (installmentPrintBundle && invoice.installment?.id && origin) {
      return `${origin}/installments/${invoice.installment.id}/edit`
    }
    return String(invoice.number)
  }, [installmentPrintBundle, invoice.installment?.id, invoice.number])

  const installmentHtml = useMemo(() => {
    if (!installmentPrintBundle) return ''
    return renderInstallmentScheduleOnly({
      installment: installmentPrintBundle,
      fmt,
      labels: {
        installmentScheduleTitle: t.installmentScheduleTitle,
        installmentColSeq: t.installmentColSeq,
        installmentColDue: t.installmentColDue,
        installmentColAmount: t.installmentColAmount,
        installmentPrintAck: t.installmentPrintAck,
        installmentSignerName: t.installmentSignerName,
        installmentSignatureLine: t.installmentSignatureLine,
        installmentThumbprint: t.installmentThumbprint,
      },
      isRtl,
      lang: lang === 'ar' ? 'ar' : 'en',
    })
  }, [installmentPrintBundle, fmt, t, isRtl, lang])

  return (
    <div
      className="invoice-a4"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        fontFamily: "'Inter', 'Segoe UI', 'Helvetica Neue', sans-serif",
        background: BRAND.white,
        color: '#0f172a',
        maxWidth: '210mm',
        margin: '0 auto',
        minHeight: '297mm',
      }}
    >
      {/* ترويسة علوية — شعار وبيانات التواصل */}
      <header
        className="invoice-a4-header"
        style={{
          background: BRAND.primary,
          color: BRAND.white,
          padding: '24px 32px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '1 1 auto' }}>
          {companyLogo && (
            <img
              src={companyLogo}
              alt=""
              style={{ height: '48px', maxWidth: '140px', objectFit: 'contain' }}
            />
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 400, letterSpacing: '-0.02em' }}>
              {companyName}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.9 }}>{typeLabel}</p>
          </div>
        </div>
        <div style={{ fontSize: '0.8rem', opacity: 0.95, [isRtl ? 'textAlign' : 'textAlign']: isRtl ? 'left' : 'right' }}>
          {companyAddress && <p style={{ margin: '0 0 4px' }}>{companyAddress}</p>}
          {companyPhone && <p style={{ margin: '0 0 4px' }}>{companyPhone}</p>}
          {companyEmail && <p style={{ margin: '0 0 4px' }}>{companyEmail}</p>}
          {companyTaxNumber && <p style={{ margin: 0 }}>{companyTaxNumber}</p>}
        </div>
      </header>

      {/* رقم الفاتورة والتاريخ والطرف */}
      <section
        style={{
          padding: '20px 32px',
          borderBottom: `1px solid ${BRAND.grayBorder}`,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: '20px',
          background: BRAND.grayLight,
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: '0.7rem', color: BRAND.gray, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {partyLabel}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '1rem', fontWeight: 400, color: BRAND.primary }}>
            {partyName ?? '—'}
          </p>
          {partyTaxNumber && (
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: BRAND.gray }}>
              {t.taxNumber ?? 'الرقم الضريبي'}: {partyTaxNumber}
            </p>
          )}
        </div>
        <div className={textAlign}>
          <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 400, color: BRAND.primary }}>
            #{invoice.number}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: BRAND.gray }}>
            {t.invoiceDate}: {formatDisplayDate(invoice.date)}
          </p>
          {invoice.due_date && (
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: BRAND.gray }}>
              {t.dueDate}: {formatDisplayDate(invoice.due_date)}
            </p>
          )}
          {invoice.reference_number && (
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: BRAND.gray }}>
              {t.referenceNumber}: {invoice.reference_number}
            </p>
          )}
          {warehouseName && (
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: BRAND.gray }}>
              {t.warehouse ?? 'Warehouse'}: {warehouseName}
            </p>
          )}
        </div>
      </section>

      {/* جدول البنود */}
      <section style={{ padding: '24px 32px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 400, color: BRAND.gray }}>
          {t.lineItems}
        </h3>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.875rem',
          }}
          className="invoice-a4-table"
        >
          <thead>
            <tr style={{ background: BRAND.grayLight, borderBottom: `2px solid ${BRAND.primary}` }}>
              <th style={{ padding: '12px 10px', fontWeight: 400, color: BRAND.primary, textAlign: isRtl ? 'right' : 'left' }}>{t.item}</th>
              <th style={{ padding: '12px 10px', fontWeight: 400, color: BRAND.primary, width: '90px', textAlign: 'right' }}>{t.quantity}</th>
              <th style={{ padding: '12px 10px', fontWeight: 400, color: BRAND.primary, width: '100px', textAlign: 'right' }}>{t.unitPrice}</th>
              <th style={{ padding: '12px 10px', fontWeight: 400, color: BRAND.primary, width: '70px', textAlign: 'center' }}>{t.discount}</th>
              <th style={{ padding: '12px 10px', fontWeight: 400, color: BRAND.primary, width: '70px', textAlign: 'center' }}>{t.tax}</th>
              <th style={{ padding: '12px 10px', fontWeight: 400, color: BRAND.primary, width: '90px', textAlign: 'right' }}>{t.taxAmount}</th>
              <th style={{ padding: '12px 10px', fontWeight: 400, color: BRAND.primary, width: '110px', textAlign: 'right' }}>{t.amount}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines?.map((line, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom: `1px solid ${BRAND.grayBorder}`,
                }}
              >
                <td style={{ padding: '12px 10px', color: '#334155' }}>
                  {line.item ? getLocalizedName(line.item, lang) : (line.description ?? '—')}
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'right' }}>{fmtQty(Number(line?.quantity ?? 0))}</td>
                <td style={{ padding: '12px 10px', textAlign: 'right' }}>{fmt(Number(line?.unit_price ?? 0))}</td>
                <td style={{ padding: '12px 10px', textAlign: 'center' }}>{line.discount_percent ?? 0}%</td>
                <td style={{ padding: '12px 10px', textAlign: 'center' }}>{line.tax_percent ?? 0}%</td>
                <td style={{ padding: '12px 10px', textAlign: 'right' }}>{fmt(Number(line?.tax_amount ?? 0))}</td>
                <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 400 }}>{fmt(Number(line?.total ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {installmentHtml ? (
        <section
          style={{ padding: '0 32px 8px' }}
          className="print:break-inside-avoid"
          dangerouslySetInnerHTML={{ __html: installmentHtml }}
        />
      ) : null}

      {/* الضريبة والإجمالي النهائي */}
      <section
        style={{
          padding: '16px 32px 24px',
          borderTop: `2px solid ${BRAND.grayBorder}`,
          background: BRAND.grayLight,
        }}
      >
        <div
          style={{
            maxWidth: '320px',
            marginLeft: isRtl ? 0 : 'auto',
            marginRight: isRtl ? 'auto' : 0,
          }}
        >
          {(Number(invoice.discount_amount) || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
              <span style={{ color: BRAND.gray }}>{t.discountAmount}</span>
              <span>{fmt(Number(invoice.discount_amount) || 0)}</span>
            </div>
          )}
          {(Number(invoice.tax_amount) || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
              <span style={{ color: BRAND.gray }}>{t.taxAmount}</span>
              <span>{fmt(Number(invoice.tax_amount) || 0)}</span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: `2px solid ${BRAND.primary}`,
              fontSize: '1.1rem',
              fontWeight: 400,
              color: BRAND.primary,
            }}
          >
            <span>{t.total}</span>
            <span>{fmt(Number(invoice?.total ?? 0))}</span>
          </div>
          {(Number(invoice.amount_paid) || 0) > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.85rem', color: BRAND.gray }}>
                <span>{t.balance}</span>
                <span>{fmt(Number(invoice?.balance ?? 0))}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', fontSize: '0.85rem', color: BRAND.gray }}>
                <span>{t.paymentStatus ?? 'المدفوع'}</span>
                <span>{fmt(Number(invoice?.amount_paid ?? 0))}</span>
              </div>
            </>
          )}
        </div>
      </section>

      {invoice.notes && (
        <section
          style={{
            padding: '16px 32px',
            borderTop: `1px solid ${BRAND.grayBorder}`,
            fontSize: '0.85rem',
            color: BRAND.gray,
          }}
        >
          <p style={{ margin: 0, fontWeight: 400, color: '#475569' }}>{t.notes}</p>
          <p style={{ margin: '4px 0 0' }}>{invoice.notes}</p>
        </section>
      )}

      {invoice.payments && invoice.payments.length > 0 && (
        <section
          style={{
            padding: '16px 32px',
            borderTop: `1px solid ${BRAND.grayBorder}`,
            fontSize: '0.85rem',
            color: BRAND.gray,
            marginTop: 'auto',
          }}
        >
          <p style={{ margin: 0, fontWeight: 400, color: BRAND.primary, marginBottom: '8px' }}>
            {t.voucherProof ?? 'إثبات سداد'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            {invoice.payments.map((p: PaymentLike) => (
              <span key={p.id} style={{ margin: 0 }}>
                {t.voucherNumber ?? 'رقم السند'}: <strong>{p.number}</strong> — {t.voucherDate ?? 'تاريخ السند'}: {formatDisplayDate(p.date)}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* باركود و QR لرقم الفاتورة — لاستدعاء الفاتورة في المرتجعات */}
      {invoice.number && (
        <section
          style={{
            padding: '16px 32px 24px',
            borderTop: `1px solid ${BRAND.grayBorder}`,
            marginTop: 'auto',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '24px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <p style={{ margin: 0, fontSize: '0.7rem', color: BRAND.gray }}>{t.refNumBarcode ?? 'باركود رقم الفاتورة'}</p>
            <img
              src={`https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(invoice.number)}&code=Code128&dpi=96&dataseparator=`}
              alt={`Barcode ${invoice.number}`}
              style={{ height: '36px', minWidth: '120px', imageRendering: 'pixelated' }}
            />
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 400 }}>{invoice.number}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <p style={{ margin: 0, fontSize: '0.7rem', color: BRAND.gray, textAlign: 'center', maxWidth: '140px' }}>
              {installmentPrintBundle ? (t.installmentQrHint ?? t.refNumQrcode ?? 'QR') : (t.refNumQrcode ?? 'QR رقم الفاتورة')}
            </p>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(installmentQrPayload)}`}
              alt={`QR ${invoice.number}`}
              style={{ width: '80px', height: '80px' }}
            />
          </div>
        </section>
      )}

      <style>{`
        .invoice-a4 {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @media print {
          .invoice-a4 {
            box-shadow: none !important;
            max-width: 100% !important;
            min-height: auto !important;
            height: auto !important;
            break-after: avoid !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
          }
          .invoice-a4-header {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .invoice-a4-table th,
          .invoice-a4-table td {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  )
}
