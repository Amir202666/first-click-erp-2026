import { PRINT_TEMPLATE_TABLE_PRINT_CSS, PRINT_TEMPLATE_TABLE_PROFESSIONAL_CSS } from './printTemplatePrintCss'

const PORTAL_ID = 'invoice-print-portal'

/** طباعة عبر portal — display:none فقط، بدون visibility:hidden */
const PORTAL_PRINT_CSS = `
  @media print {
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      height: auto !important;
      overflow: visible !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body > *:not(#${PORTAL_ID}) {
      display: none !important;
    }
    #${PORTAL_ID} {
      display: block !important;
      position: static !important;
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }
    #${PORTAL_ID} .print-template-html-view,
    #${PORTAL_ID} .print-template-preview-html,
    #${PORTAL_ID} .print-doc-root,
    #${PORTAL_ID} .print-doc-abs-root {
      overflow: visible !important;
    }
    ${PRINT_TEMPLATE_TABLE_PROFESSIONAL_CSS}
    ${PRINT_TEMPLATE_TABLE_PRINT_CSS}
  }
  @media screen {
    #${PORTAL_ID} {
      display: none !important;
      pointer-events: none !important;
    }
  }
`

/**
 * نسخ منطقة الفاتورة إلى عنصر مباشر تحت body وطباعتها.
 * يتجاوز visibility:hidden وLayout — يحافظ على position:absolute.
 */
export function printInvoiceFromPortal(sourceElementId = 'invoice-print-area'): boolean {
  if (typeof document === 'undefined') return false

  const source = document.getElementById(sourceElementId)
  if (!source?.innerHTML.trim()) return false

  document.getElementById(PORTAL_ID)?.remove()

  const portal = document.createElement('div')
  portal.id = PORTAL_ID
  portal.className = 'invoice-print-portal'
  portal.setAttribute('dir', source.closest('[dir]')?.getAttribute('dir') ?? 'rtl')

  const styleEl = document.createElement('style')
  styleEl.textContent = PORTAL_PRINT_CSS
  portal.appendChild(styleEl)

  const content = document.createElement('div')
  content.className = 'invoice-print-portal-content'
  content.innerHTML = source.innerHTML
  portal.appendChild(content)

  document.body.appendChild(portal)

  const cleanup = () => {
    portal.remove()
  }

  window.addEventListener('afterprint', cleanup, { once: true })

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        window.print()
      } catch {
        cleanup()
      }
    })
  })

  return true
}
