/**
 * تحويل المبلغ إلى كلمات (تفقيط) - نسخة مبسطة للعربية والإنجليزية.
 */
const AR_ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة']
const AR_TENS = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
const AR_HUNDREDS = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة']
const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const EN_TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function toArabicWords(n: number): string {
  if (n <= 0 || n >= 1e12) return n === 0 ? 'صفر' : String(n)
  const intPart = Math.floor(n)
  const decPart = Math.round((n - intPart) * 100)
  let s = ''
  const billions = Math.floor(intPart / 1e9)
  const millions = Math.floor((intPart % 1e9) / 1e6)
  const thousands = Math.floor((intPart % 1e6) / 1e3)
  const rest = intPart % 1e3
  if (billions) s += (billions === 2 ? 'ملياران' : billions === 1 ? 'مليار' : toArabicHundreds(billions) + ' مليار') + ' '
  if (millions) s += (millions === 2 ? 'مليونان' : millions === 1 ? 'مليون' : toArabicHundreds(millions) + ' مليون') + ' '
  if (thousands) s += (thousands === 2 ? 'ألفان' : thousands === 1 ? 'ألف' : toArabicHundreds(thousands) + ' آلاف') + ' '
  if (rest) s += toArabicHundreds(rest)
  s = s.trim() || 'صفر'
  if (decPart > 0) s += ' فاصلة ' + (decPart < 10 ? AR_ONES[decPart] : toArabicHundreds(decPart))
  return s
}

function toArabicHundreds(n: number): string {
  if (n <= 0 || n >= 1000) return ''
  const h = Math.floor(n / 100)
  const t = Math.floor((n % 100) / 10)
  const o = n % 10
  let s = AR_HUNDREDS[h]
  if (t === 1 && o > 0) {
    s += (s ? ' و' : '') + (o === 1 ? 'أحد عشر' : o === 2 ? 'اثنا عشر' : AR_ONES[o] + ' عشر')
  } else {
    if (o) s += (s ? ' و' : '') + AR_ONES[o]
    if (t) s += (s ? ' و' : '') + AR_TENS[t]
  }
  return s
}

function toEnglishWords(n: number): string {
  if (n <= 0 || n >= 1e12) return n === 0 ? 'zero' : String(n)
  const intPart = Math.floor(n)
  const decPart = Math.round((n - intPart) * 100)
  let s = ''
  const billions = Math.floor(intPart / 1e9)
  const millions = Math.floor((intPart % 1e9) / 1e6)
  const thousands = Math.floor((intPart % 1e6) / 1e3)
  const rest = intPart % 1e3
  if (billions) s += toEnglishHundreds(billions) + ' billion '
  if (millions) s += toEnglishHundreds(millions) + ' million '
  if (thousands) s += toEnglishHundreds(thousands) + ' thousand '
  if (rest) s += toEnglishHundreds(rest)
  s = s.trim() || 'zero'
  if (decPart > 0) s += ' point ' + (decPart < 10 ? EN_ONES[decPart] : toEnglishHundreds(decPart))
  return s
}

function toEnglishHundreds(n: number): string {
  if (n <= 0 || n >= 1000) return ''
  const h = Math.floor(n / 100)
  const t = Math.floor((n % 100) / 10)
  const o = n % 10
  let s = h ? EN_ONES[h] + ' hundred' : ''
  if (t === 1) {
    s += (s ? ' ' : '') + (o ? EN_TEENS[o] : 'ten')
  } else {
    if (t) s += (s ? ' ' : '') + EN_TENS[t]
    if (o) s += (s ? ' ' : '') + EN_ONES[o]
  }
  return s.trim()
}

export function amountInWords(amount: number, lang: 'ar' | 'en'): string {
  return lang === 'ar' ? toArabicWords(amount) : toEnglishWords(amount)
}
