export interface ThermalPrintConfig {
  width: 58 | 80
  encoding: 'UTF-8'
  cutPaper: boolean
  openDrawer: boolean
}

export interface ThermalReceiptData {
  storeName: string
  invoiceNumber: string
  items: { name: string; qty: number; price: number }[]
  total: number
  currency: string
  date: string
}

export function printReceipt(
  data: ThermalReceiptData,
  config: ThermalPrintConfig = {
    width: 80,
    encoding: 'UTF-8',
    cutPaper: true,
    openDrawer: false,
  },
): void {
  const printWindow = window.open('', '_blank', 'width=320,height=720')
  if (!printWindow) return

  const html = `<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 0; size: ${config.width}mm auto; }
    * { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; box-sizing: border-box; }
    body { width: ${config.width}mm; padding: 4mm; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .large { font-size: 16px; }
    .line { border-top: 1px dashed #000; margin: 4px 0; }
    .row { display: flex; justify-content: space-between; gap: 4px; }
    .total { font-size: 18px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="center bold large">${escapeHtml(data.storeName)}</div>
  <div class="line"></div>
  <div class="row"><span>رقم الفاتورة:</span><span>${escapeHtml(data.invoiceNumber)}</span></div>
  <div class="row"><span>التاريخ:</span><span>${escapeHtml(data.date)}</span></div>
  <div class="line"></div>
  ${data.items
    .map(
      (item) => `
    <div>${escapeHtml(item.name)}</div>
    <div class="row">
      <span>${item.qty} × ${item.price.toFixed(3)}</span>
      <span>${(item.qty * item.price).toFixed(3)}</span>
    </div>`,
    )
    .join('')}
  <div class="line"></div>
  <div class="row total">
    <span>الإجمالي:</span>
    <span>${data.total.toFixed(3)} ${escapeHtml(data.currency)}</span>
  </div>
  <div class="line"></div>
  <div class="center">شكراً لتعاملكم معنا</div>
</body>
</html>`

  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  printWindow.close()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** WebUSB لطابعات تدعم البروتوكول — يتطلب HTTPS وسياق آمن. */
export async function printViaWebUSB(_escPosCommands: Uint8Array): Promise<void> {
  const nav = navigator as Navigator & { usb?: { requestDevice: (opts: unknown) => Promise<unknown> } }
  if (!nav.usb?.requestDevice) {
    console.warn('WebUSB not available')
    return
  }
  console.warn('WebUSB thermal: configure device filters for your printer model.')
}
