import Handlebars from 'handlebars'
import { coerceDecimalPlaces } from './currency'

let registered = false

function resolveDecimalPlaces(options?: Handlebars.HelperOptions): number {
  const root = options?.data?.root as { currency_decimal_places?: unknown } | undefined
  return coerceDecimalPlaces(root?.currency_decimal_places, 2)
}

/** تنسيق مبلغ بأرقام غربية 0-9 حسب عدد كسور العملة */
export function formatPrintNumber(n: unknown, decimals = 2): string {
  const d = coerceDecimalPlaces(decimals, 2)
  if (n == null || n === '') {
    return (0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  }
  if (typeof n === 'object' && n !== null && 'net' in n) {
    const net = Number((n as { net: unknown }).net)
    if (!Number.isNaN(net)) {
      return net.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
    }
  }
  const num = Number(n)
  if (Number.isNaN(num)) return String(n)
  return num.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

/** تسجيل مساعدات Handlebars مرة واحدة لمعاينة وطباعة القوالب */
export function ensurePrintTemplateHandlebarsHelpers(): void {
  if (registered) return
  registered = true

  Handlebars.registerHelper('formatNumber', function (n: unknown, options: Handlebars.HelperOptions) {
    return formatPrintNumber(n, resolveDecimalPlaces(options))
  })

  /** متوافق مع قوالب قديمة — نفس formatNumber بدون رمز عملة */
  Handlebars.registerHelper('formatMoney', function (n: unknown, options: Handlebars.HelperOptions) {
    return formatPrintNumber(n, resolveDecimalPlaces(options))
  })

  Handlebars.registerHelper('index_plus_one', function (this: unknown, options: { data: { index: number } }) {
    return options.data.index + 1
  })

  /** جمع رقمين — {{sum @index 1}} */
  Handlebars.registerHelper('sum', (a: unknown, b: unknown) => {
    const x = Number(a)
    const y = Number(b)
    if (Number.isNaN(x) || Number.isNaN(y)) return 0
    return x + y
  })

  /** صفوف متناوبة — {{#if (isOdd @index)}} */
  Handlebars.registerHelper('isOdd', (idx: unknown) => Number(idx) % 2 === 1)
}
