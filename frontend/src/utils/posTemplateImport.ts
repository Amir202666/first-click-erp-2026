type PosLabelElement = {
  type?: string
  text?: string
  style?: Record<string, string | number>
  order?: number
}

const POS_VAR_MAP: Record<string, string> = {
  '{name}': '{{this.name}}',
  '{category_name}': '{{this.category}}',
  '{price_before_discount_with_tax}': '{{formatNumber this.price}} {{currency}}',
  '{price_before_discount_without_tax}': '{{formatNumber this.price}} {{currency}}',
  '{unit_quantity}': '{{this.qty}}',
  '{subtotal_before_discount_with_tax}': '{{formatNumber this.total}} {{currency}}',
  '{subtotal_before_discount_without_tax}': '{{formatNumber subtotal}} {{currency}}',
  '{subtotal_after_discount_with_tax}': '{{formatNumber total}} {{currency}}',
  '{total_discount}': '{{formatNumber discount}} {{currency}}',
  '{vat_value}': '{{formatNumber vat_amount}} {{currency}}',
  '{total_paid}': '{{formatNumber paid}} {{currency}}',
  '{balance}': '{{formatNumber change}} {{currency}}',
  '{company}': '{{company.name}}',
  '{company_name}': '{{company.name}}',
  '{company_address}': '{{company.address}}',
  '{company_phone}': '{{company.phone}}',
  '{company_logo}': '<img src="{{company.logo}}" style="max-width:100%;max-height:60px;" alt="" />',
  '{ref_num}': '{{inv.number}}',
  '{invoice_num}': '{{inv.number}}',
  '{datetime}': '{{inv.date}}',
  '{date}': '{{inv.date}}',
  '{time}': '{{inv.time}}',
  '{client_name}': '{{customer.name}}',
  '{client}': '{{customer.name}}',
  '{cashier}': '{{cashier}}',
  '{barcode}': '{{inv.number}}',
}

function convertPosVars(text: string): string {
  let result = text
  for (const [from, to] of Object.entries(POS_VAR_MAP)) {
    result = result.split(from).join(to)
  }
  return result.replace(/\{([a-z_]+)\}/g, '{{$1}}')
}

function extractPosLabelsJson(decoded: string): string | null {
  const markers = ['s:6:"labels";s:', 's:6:"labels";a:', '"labels";s:', 's:6:"labels"']
  let labelsStart = -1
  for (const marker of markers) {
    const idx = decoded.indexOf(marker)
    if (idx !== -1) {
      labelsStart = idx
      break
    }
  }
  if (labelsStart === -1) return null

  const jsonStart = decoded.indexOf('{"', labelsStart)
  if (jsonStart === -1) return null

  let labelsJson = ''
  let depth = 0
  let inStr = false
  let escape = false

  for (let i = jsonStart; i < decoded.length; i++) {
    const ch = decoded[i]
    labelsJson += ch

    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      inStr = !inStr
      continue
    }
    if (!inStr) {
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) break
      }
    }
  }

  return labelsJson || null
}

export function extractPosTemplateTitle(fileContent: string, fallback: string): string {
  try {
    const decoded = atob(fileContent.trim().replace(/\s+/g, ''))
    const titleMatch = decoded.match(/s:5:"title";s:\d+:"([^"]+)"/)
    return titleMatch?.[1] ?? fallback
  } catch {
    return fallback
  }
}

/** تحويل ملف قالب POS (Base64 + PHP Serialized) إلى HTML */
export function convertPosTemplateFileToHtml(fileContent: string): string | null {
  try {
    let decoded: string
    try {
      decoded = atob(fileContent.trim().replace(/\s+/g, ''))
    } catch {
      return null
    }

    const labelsJson = extractPosLabelsJson(decoded)
    if (!labelsJson) return null

    let labels: Record<string, PosLabelElement>
    try {
      labels = JSON.parse(labelsJson) as Record<string, PosLabelElement>
    } catch {
      try {
        const fixed = labelsJson.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
        labels = JSON.parse(fixed) as Record<string, PosLabelElement>
      } catch {
        return null
      }
    }

    const elements = Object.values(labels)
    elements.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))

    let bodyHtml = ''

    for (const el of elements) {
      const style = el.style ?? {}
      const styleStr = Object.entries(style)
        .map(([k, v]) => `${k}:${v}`)
        .join(';')
      const rawText = el.text ?? ''

      if (el.type === 'products') {
        const theadMatch = rawText.match(/<thead>([\s\S]*?)<\/thead>/i)
        const tbodyMatch = rawText.match(/<tbody>([\s\S]*?)<\/tbody>/i)
        const tfootMatch = rawText.match(/<tfoot>([\s\S]*?)<\/tfoot>/i)

        const thead = theadMatch ? `<thead>${convertPosVars(theadMatch[1])}</thead>` : ''
        const tbodyRow = tbodyMatch ? convertPosVars(tbodyMatch[1]) : ''
        const tbody = `<tbody>{{#each items}}${tbodyRow}{{/each}}</tbody>`
        const tfoot = tfootMatch ? `<tfoot>${convertPosVars(tfootMatch[1])}</tfoot>` : ''

        bodyHtml += `<div style="${styleStr}"><table>${thead}${tbody}${tfoot}</table></div>\n`
      } else if (el.type === 'image') {
        bodyHtml += `<div style="${styleStr}"><img src="{{company.logo}}" style="max-width:100%;max-height:100%;" alt="" /></div>\n`
      } else {
        bodyHtml += `<div style="${styleStr}">${convertPosVars(rawText)}</div>\n`
      }
    }

    const cssMatch = decoded.match(/"css";s:\d+:"((?:[^"\\]|\\.)*)"/)
    const css = cssMatch ? cssMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') : ''

    return `<div class="pos-template-root" style="position:relative;width:100%;min-height:200px;background:white;direction:rtl;font-family:Cairo,Tajawal,Arial,sans-serif;overflow:visible;">
<style>
${css}
.pos-template-root table { width:100%; border-collapse:collapse; }
.pos-template-root table th,
.pos-template-root table td { border:1px solid #000; padding:2px 4px; font-size:10px; }
</style>
${bodyHtml}
</div>`
  } catch (err) {
    console.error('convertPosTemplateFileToHtml error:', err)
    return null
  }
}
