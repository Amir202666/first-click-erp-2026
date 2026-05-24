/** جذور DOM التي تُعرض فيها قوالب الطباعة (شاشة + طباعة) */
const PRINT_TABLE_ROOTS =
  '.print-doc-root, .print-doc-abs-root, .invoice-custom-template, .print-template-preview-html'

/** أنماط جداول بارتفاع تلقائي — تُطبَّق على الشاشة والطباعة */
export const PRINT_TEMPLATE_TABLE_PRINT_CSS = `
  ${PRINT_TABLE_ROOTS} table {
    width: 100%;
    border-collapse: collapse;
    page-break-inside: auto;
    height: auto !important;
    min-height: 0 !important;
  }
  ${PRINT_TABLE_ROOTS} table tbody,
  ${PRINT_TABLE_ROOTS} table thead {
    height: auto !important;
  }
  ${PRINT_TABLE_ROOTS} table tr {
    page-break-inside: avoid;
    page-break-after: auto;
    height: auto !important;
  }
  ${PRINT_TABLE_ROOTS} table td,
  ${PRINT_TABLE_ROOTS} table th {
    height: auto !important;
    min-height: 0 !important;
    vertical-align: top;
  }
  ${PRINT_TABLE_ROOTS} table thead {
    display: table-header-group;
  }
  ${PRINT_TABLE_ROOTS} .print-canvas-table-wrap,
  ${PRINT_TABLE_ROOTS} div[style*="position:absolute"]:has(table),
  ${PRINT_TABLE_ROOTS} div[style*="position: absolute"]:has(table) {
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
  }
  ${PRINT_TABLE_ROOTS} table tbody:empty {
    display: none !important;
  }
`

/** قوالب اللوحة الحرة (position:absolute) — ضمان ظهور المحتوى على الشاشة */
export const PRINT_TEMPLATE_CANVAS_SCREEN_CSS = `
  .invoice-custom-template .print-doc-root {
    position: relative;
    width: 100%;
    overflow: visible;
    box-sizing: border-box;
  }
  .invoice-custom-template .print-doc-abs-root {
    position: relative;
    width: 100%;
    overflow: visible;
    box-sizing: border-box;
  }
  .invoice-custom-template .print-doc-abs-root > div[style*="position:absolute"],
  .invoice-custom-template .print-doc-abs-root > div[style*="position: absolute"] {
    overflow: visible !important;
  }
`

/** نفس أنماط الجدول للمعاينة على الشاشة (خارج @media print) */
export const PRINT_TEMPLATE_TABLE_SCREEN_CSS =
  PRINT_TEMPLATE_TABLE_PRINT_CSS + PRINT_TEMPLATE_CANVAS_SCREEN_CSS

/** تنسيق احترافي لجدول الأصناف وجدول الإجماليات */
export const PRINT_TEMPLATE_TABLE_PROFESSIONAL_CSS = `
  .print-doc-root table,
  .print-doc-abs-root table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    direction: rtl;
  }

  .print-canvas-table-wrap table thead tr,
  .print-doc-root table thead tr,
  .print-doc-abs-root table thead tr {
    background-color: var(--accent, #4f46e5) !important;
    color: #fff !important;
  }

  .print-canvas-table-wrap table thead th,
  .print-doc-root table thead th,
  .print-doc-abs-root table thead th {
    padding: 8px 10px !important;
    text-align: center !important;
    font-weight: 700 !important;
    font-size: 11px !important;
    border: 1px solid rgba(255, 255, 255, 0.3) !important;
    color: #fff !important;
  }

  .print-canvas-table-wrap table tbody tr:nth-child(even),
  .print-doc-root table tbody tr:nth-child(even),
  .print-doc-abs-root table tbody tr:nth-child(even) {
    background-color: #f8fafc !important;
  }

  .print-canvas-table-wrap table tbody tr:nth-child(odd),
  .print-doc-root table tbody tr:nth-child(odd),
  .print-doc-abs-root table tbody tr:nth-child(odd) {
    background-color: #fff !important;
  }

  .print-canvas-table-wrap table tbody td,
  .print-doc-root table tbody td,
  .print-doc-abs-root table tbody td {
    padding: 7px 10px !important;
    text-align: center !important;
    border: 1px solid #e2e8f0 !important;
    font-size: 11px !important;
    color: #1e293b !important;
  }

  .print-canvas-table-wrap table tbody td:nth-child(2),
  .print-doc-root table tbody td:first-child,
  .print-doc-abs-root table tbody td:first-child {
    text-align: right !important;
    font-weight: 600 !important;
  }

  .print-canvas-table-wrap table tbody td:last-child,
  .print-doc-root table tbody td:last-child,
  .print-doc-abs-root table tbody td:last-child {
    font-weight: 700 !important;
    color: #0f172a !important;
    text-align: left !important;
    direction: ltr !important;
  }

  .print-doc-root table tfoot tr,
  .print-doc-abs-root table tfoot tr,
  .print-invoice-totals-table tr,
  .print-canvas-totals-table tr,
  .invoice-totals-table tr {
    border-bottom: 1px solid #e2e8f0;
  }

  .print-doc-root table tfoot td,
  .print-doc-root table tfoot th,
  .print-doc-abs-root table tfoot td,
  .print-doc-abs-root table tfoot th,
  .print-invoice-totals-table td,
  .print-invoice-totals-table th,
  .print-canvas-totals-table td,
  .print-canvas-totals-table th,
  .invoice-totals-table td,
  .invoice-totals-table th {
    padding: 6px 12px !important;
    font-size: 11px !important;
    border: 1px solid #e2e8f0 !important;
  }

  .print-invoice-totals-table thead tr,
  .print-canvas-totals-table thead tr {
    background-color: var(--accent, #4f46e5) !important;
    color: #fff !important;
  }

  .print-invoice-totals-table thead th,
  .print-canvas-totals-table thead th {
    padding: 8px 10px !important;
    text-align: center !important;
    font-weight: 700 !important;
    border: 1px solid rgba(255, 255, 255, 0.3) !important;
    color: #fff !important;
  }

  .print-invoice-totals-table tbody tr:nth-child(even),
  .print-canvas-totals-table tbody tr:nth-child(even) {
    background-color: #f8fafc !important;
  }

  .print-invoice-totals-table tbody td:first-child,
  .print-canvas-totals-table tbody td:first-child {
    text-align: right !important;
    font-weight: 600 !important;
    color: #334155 !important;
  }

  .print-invoice-totals-table tbody td:last-child,
  .print-canvas-totals-table tbody td:last-child {
    text-align: left !important;
    direction: ltr !important;
    font-weight: 700 !important;
    color: #0f172a !important;
  }

  .print-doc-root table tfoot tr:last-child td,
  .print-doc-root table tfoot tr:last-child th,
  .print-doc-abs-root table tfoot tr:last-child td,
  .print-doc-abs-root table tfoot tr:last-child th,
  .print-invoice-totals-table tbody tr:last-child td,
  .print-canvas-totals-table tbody tr:last-child td {
    background-color: var(--accent, #4f46e5) !important;
    color: #fff !important;
    font-weight: 700 !important;
    font-size: 12px !important;
    border-color: rgba(255, 255, 255, 0.25) !important;
  }
`

/** عرض مباشر لقوالب الطباعة داخل PrintTemplateHtmlView */
/** أنماط قوالب اللوحة داخل iframe أو معاينة مباشرة */
export const PRINT_TEMPLATE_CANVAS_FRAME_CSS = `
  ${PRINT_TEMPLATE_TABLE_PROFESSIONAL_CSS}
  .print-doc-root {
    position: relative;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    box-sizing: border-box !important;
  }
  .print-doc-abs-root {
    position: relative;
    width: 100%;
    min-height: auto !important;
    height: auto !important;
    overflow: visible;
  }
  .print-doc-abs-root > div[style*="position:absolute"],
  .print-doc-abs-root > div[style*="position: absolute"],
  .print-doc-abs-root .print-canvas-table-wrap {
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
  }
  .print-doc-abs-root .print-canvas-table-wrap table {
    display: table !important;
    table-layout: auto !important;
  }
  .print-doc-abs-root p {
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    white-space: normal !important;
    text-overflow: clip !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  .print-doc-abs-root img {
    max-width: 100%;
    height: auto;
  }
  .print-invoice-totals-wrap {
    box-sizing: border-box;
  }
  .print-invoice-totals-table {
    width: 100%;
    border-collapse: collapse;
    page-break-inside: avoid;
  }
  [data-print-totals-hidden="1"] {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    overflow: hidden !important;
    opacity: 0 !important;
  }
  ${PRINT_TEMPLATE_TABLE_PRINT_CSS}
`

/** معاينة الشاشة — مُقيَّد بـ .print-template-html-view فقط (لا يؤثر على بقية التطبيق) */
export const PRINT_TEMPLATE_INLINE_VIEW_CSS = `
  ${PRINT_TEMPLATE_TABLE_PROFESSIONAL_CSS}
  .print-template-html-view .print-doc-root,
  .print-template-html-view .print-doc-abs-root {
    position: relative !important;
    width: 100% !important;
    min-height: 0 !important;
    overflow: visible !important;
    box-sizing: border-box !important;
  }
  .print-template-html-view .print-doc-abs-root > div,
  .print-template-html-view .print-doc-abs-root .print-canvas-table-wrap {
    overflow: visible !important;
    max-height: none !important;
  }
  .print-template-html-view .print-doc-abs-root p {
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    white-space: normal !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  .print-template-html-view table,
  .print-template-html-view table tr,
  .print-template-html-view table td,
  .print-template-html-view table th {
    visibility: visible !important;
    opacity: 1 !important;
  }
`

/** معاينة canvas على الشاشة — بسيط وغير مُدمّر (مثل مصمم القوالب) */
export const PRINT_TEMPLATE_CANVAS_PREVIEW_CSS = `
  ${PRINT_TEMPLATE_TABLE_PROFESSIONAL_CSS}
  .print-template-html-view .print-doc-root,
  .print-template-html-view .print-doc-abs-root {
    position: relative;
    overflow: visible;
    box-sizing: border-box;
  }
  .print-template-html-view .print-doc-abs-root > div[style*="position:absolute"],
  .print-template-html-view .print-doc-abs-root > div[style*="position: absolute"],
  .print-template-html-view .print-canvas-table-wrap {
    overflow: visible !important;
  }
  .print-template-html-view [data-print-totals-hidden="1"] {
    display: none !important;
  }
`

/** ضمان ظهور المحتوى فوق أي تنسيق عام أو طبقة ختم */
export const PRINT_TEMPLATE_SCREEN_ENSURE_VISIBLE_CSS = `
  .print-template-html-view,
  .print-template-html-view .print-template-preview-html,
  .print-template-html-view .print-doc-root,
  .print-template-html-view .print-doc-abs-root,
  .print-template-html-view .print-doc-abs-root * {
    visibility: visible !important;
    opacity: 1 !important;
  }
  .print-template-html-view .print-template-preview-html,
  .print-template-html-view .print-doc-root,
  .print-template-html-view .print-doc-abs-root {
    display: block !important;
    overflow: visible !important;
  }
  .print-template-html-view table {
    display: table !important;
  }
  .print-template-html-view tr {
    display: table-row !important;
  }
  .print-template-html-view td,
  .print-template-html-view th {
    display: table-cell !important;
  }
`

export const PRINT_TEMPLATE_PRINT_MEDIA_CSS = `
@media print {
  ${PRINT_TEMPLATE_TABLE_PROFESSIONAL_CSS}
  ${PRINT_TEMPLATE_TABLE_PRINT_CSS}
  tr:empty { display: none !important; }

  body * { visibility: hidden !important; }

  .print-template-html-view,
  .print-template-html-view * {
    visibility: visible !important;
    opacity: 1 !important;
  }

  .print-template-html-view {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    background: white !important;
  }

  @page { size: A4 portrait; margin: 0mm; }
}
`

/** مستند معزول (نافذة طباعة) — إظهار كل المحتوى بدون visibility:hidden */
export const PRINT_TEMPLATE_FRAME_PRINT_CSS = `
@media print {
  ${PRINT_TEMPLATE_TABLE_PROFESSIONAL_CSS}
  ${PRINT_TEMPLATE_TABLE_PRINT_CSS}
  tr:empty { display: none !important; }

  .print-doc-abs-root > div,
  .print-doc-root > div {
    margin-bottom: 0 !important;
    padding-bottom: 0 !important;
  }

  .print-doc-abs-root table,
  .print-doc-root table {
    height: auto !important;
    min-height: 0 !important;
    margin-bottom: 0 !important;
  }

  .print-canvas-table-wrap,
  .print-canvas-totals-anchor,
  .print-doc-abs-root div[style*="position:absolute"]:has(table),
  .print-doc-abs-root div[style*="position: absolute"]:has(table) {
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
  }

  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  body * {
    visibility: visible !important;
    opacity: 1 !important;
  }

  .print-doc-root,
  .print-doc-abs-root,
  .print-doc-root *,
  .print-doc-abs-root * {
    visibility: visible !important;
    opacity: 1 !important;
    overflow: visible !important;
  }

  @page {
    margin: 0mm !important;
  }
}
`
