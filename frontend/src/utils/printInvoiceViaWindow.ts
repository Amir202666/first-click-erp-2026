import {
  adjustTotalsPositionInDocument,
  buildPrintTemplateFrameDocument,
  normalizePrintDocumentLayoutInDocument,
  waitForPrintLayout,
  type PrintTemplatePageLayout,
} from './printTemplateRender'

/**
 * طباعة HTML الفاتورة في نافذة معزولة — يعمل في Chrome (iframe.contentWindow.print غير موثوق).
 */
export function printInvoiceViaWindow(
  htmlContent: string,
  accentColor = '#4f46e5',
  itemsCount?: number,
  pageLayout?: PrintTemplatePageLayout,
): void {
  const fullDocument = buildPrintTemplateFrameDocument(
    htmlContent.trim(),
    accentColor,
    itemsCount,
    pageLayout,
  )

  const printWindow = window.open('', '_blank', 'width=800,height=600')
  if (!printWindow) {
    window.print()
    return
  }

  printWindow.document.open()
  printWindow.document.write(fullDocument)
  printWindow.document.close()

  const layoutAndPrint = async () => {
    try {
      await waitForPrintLayout(printWindow.document)
      normalizePrintDocumentLayoutInDocument(printWindow.document, pageLayout)
      adjustTotalsPositionInDocument(printWindow.document, itemsCount)
      await waitForPrintLayout(printWindow.document)
      normalizePrintDocumentLayoutInDocument(printWindow.document, pageLayout)
      adjustTotalsPositionInDocument(printWindow.document, itemsCount)

      const triggerPrint = () => {
        try {
          printWindow.focus()
          printWindow.print()
        } catch {
          /* ignore */
        }
      }
      if (typeof printWindow.requestAnimationFrame === 'function') {
        printWindow.requestAnimationFrame(() => {
          printWindow.requestAnimationFrame(triggerPrint)
        })
      } else {
        triggerPrint()
      }
    } catch {
      /* ignore */
    }
  }

  printWindow.onafterprint = () => {
    try {
      printWindow.close()
    } catch {
      /* ignore */
    }
  }

  const runPrint = () => {
    void layoutAndPrint()
    window.setTimeout(() => {
      try {
        if (!printWindow.closed) printWindow.close()
      } catch {
        /* ignore */
      }
    }, 5000)
  }

  if (printWindow.document.readyState === 'complete') {
    window.setTimeout(() => void layoutAndPrint(), 500)
  } else {
    printWindow.onload = () => window.setTimeout(runPrint, 300)
  }

  window.setTimeout(() => {
    if (!printWindow.closed) {
      void (async () => {
        try {
          await waitForPrintLayout(printWindow.document)
          normalizePrintDocumentLayoutInDocument(printWindow.document, pageLayout)
          adjustTotalsPositionInDocument(printWindow.document, itemsCount)
          printWindow.focus()
          printWindow.print()
        } catch {
          /* ignore */
        }
      })()
    }
  }, 3500)
}

/** @deprecated استخدم printInvoiceViaWindow */
export const printViaIframe = printInvoiceViaWindow
