/** دول مع أكواد الهاتف — للاختيار بجوار رقم الهاتف */
export interface CountryOption {
  code: string
  name_ar: string
  name_en: string
}

export const COUNTRY_PHONE_CODES: CountryOption[] = [
  { code: '965', name_ar: 'الكويت', name_en: 'Kuwait' },
  { code: '966', name_ar: 'السعودية', name_en: 'Saudi Arabia' },
  { code: '971', name_ar: 'الإمارات', name_en: 'UAE' },
  { code: '973', name_ar: 'البحرين', name_en: 'Bahrain' },
  { code: '974', name_ar: 'قطر', name_en: 'Qatar' },
  { code: '968', name_ar: 'عُمان', name_en: 'Oman' },
  { code: '962', name_ar: 'الأردن', name_en: 'Jordan' },
  { code: '963', name_ar: 'سوريا', name_en: 'Syria' },
  { code: '964', name_ar: 'العراق', name_en: 'Iraq' },
  { code: '961', name_ar: 'لبنان', name_en: 'Lebanon' },
  { code: '970', name_ar: 'فلسطين', name_en: 'Palestine' },
  { code: '20', name_ar: 'مصر', name_en: 'Egypt' },
  { code: '213', name_ar: 'الجزائر', name_en: 'Algeria' },
  { code: '212', name_ar: 'المغرب', name_en: 'Morocco' },
  { code: '216', name_ar: 'تونس', name_en: 'Tunisia' },
  { code: '218', name_ar: 'ليبيا', name_en: 'Libya' },
  { code: '249', name_ar: 'السودان', name_en: 'Sudan' },
  { code: '967', name_ar: 'اليمن', name_en: 'Yemen' },
  { code: '1', name_ar: 'الولايات المتحدة / كندا', name_en: 'USA / Canada' },
  { code: '44', name_ar: 'بريطانيا', name_en: 'UK' },
  { code: '33', name_ar: 'فرنسا', name_en: 'France' },
  { code: '49', name_ar: 'ألمانيا', name_en: 'Germany' },
  { code: '90', name_ar: 'تركيا', name_en: 'Turkey' },
  { code: '91', name_ar: 'الهند', name_en: 'India' },
  { code: '86', name_ar: 'الصين', name_en: 'China' },
  { code: '81', name_ar: 'اليابان', name_en: 'Japan' },
  { code: '82', name_ar: 'كوريا الجنوبية', name_en: 'South Korea' },
  { code: '61', name_ar: 'أستراليا', name_en: 'Australia' },
  { code: '7', name_ar: 'روسيا', name_en: 'Russia' },
]

export const DEFAULT_COUNTRY_CODE = '965'

/** استخراج كود الدولة من رقم كامل إن وُجد (مثل 96551234567 → 965) */
export function getCountryCodeFromPhone(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 0) return null
  const sorted = [...COUNTRY_PHONE_CODES].sort((a, b) => b.code.length - a.code.length)
  for (const c of sorted) {
    if (digits.startsWith(c.code)) return c.code
  }
  return null
}

/** رقم الهاتف بدون كود الدولة (للعرض في الحقل عند وجود كود محدد) */
export function getNationalNumber(phone: string | null | undefined, countryCode: string | null): string {
  if (!phone || typeof phone !== 'string') return ''
  let digits = phone.replace(/\D/g, '')
  if (!countryCode) return digits
  if (digits.startsWith(countryCode)) return digits.slice(countryCode.length)
  return digits
}
