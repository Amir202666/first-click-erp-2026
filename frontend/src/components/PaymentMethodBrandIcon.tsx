import type { SimpleIcon } from 'simple-icons'
import {
  siVisa,
  siMastercard,
  siAmericanexpress,
  siDiscover,
  siJcb,
  siApplepay,
  siGooglepay,
  siPaypal,
  siSamsungpay,
  siAlipay,
  siStripe,
  siKlarna,
  siContactlesspayment,
} from 'simple-icons'
import { Banknote, Landmark, CreditCard } from 'lucide-react'
import { FawryLogo, InstapayLogo, KnetOfficialStyleLogo, RaabetLinkLogo } from './paymentMethodLogos'

export type PaymentMethodIconInput = {
  name: string
  name_en: string | null | undefined
  type: string
}

function bundleText(m: PaymentMethodIconInput): string {
  return `${m.name} ${m.name_en ?? ''}`.toLowerCase()
}

function SimpleBrandSvg({ icon, size, title, className = '' }: { icon: SimpleIcon; size: number; title: string; className?: string }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 object-contain max-h-full max-w-full ${className}`}
      aria-hidden
    >
      <title>{title}</title>
      <path fill={`#${icon.hex}`} d={icon.path} />
    </svg>
  )
}

function MadaMark({ size, className = '' }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={`shrink-0 object-contain max-h-full max-w-full ${className}`}
      aria-hidden
    >
      <title>mada</title>
      <rect width="48" height="48" rx="10" fill="#0B6E4F" />
      <rect x="10" y="12" width="5" height="24" rx="1" fill="#fff" opacity="0.95" />
      <rect x="18" y="12" width="5" height="24" rx="1" fill="#fff" opacity="0.85" />
      <rect x="26" y="12" width="5" height="24" rx="1" fill="#fff" opacity="0.7" />
      <rect x="34" y="12" width="5" height="24" rx="1" fill="#fff" opacity="0.55" />
    </svg>
  )
}

function pickSimpleIcon(m: PaymentMethodIconInput): SimpleIcon | null {
  const b = bundleText(m)
  if (/apple\s*pay|أبل\s*باي|ابل\s*باي/.test(b)) return siApplepay
  if (/google\s*pay|جوجل\s*باي|جي\s*باي|gpay/.test(b)) return siGooglepay
  if (/samsung\s*pay|سامسونج\s*باي/.test(b)) return siSamsungpay
  if (/paypal|باي\s*بال|بايبال/.test(b)) return siPaypal
  if (/alipay|علي\s*باي|أليباي/.test(b)) return siAlipay
  if (/stripe|سترايب/.test(b)) return siStripe
  if (/klarna/i.test(b)) return siKlarna
  if (/american\s*express|امكس|amex|\bax\b/.test(b)) return siAmericanexpress
  if (/\bjcb\b/.test(b)) return siJcb
  if (/\bdiscover\b/.test(b)) return siDiscover
  if (/master\s*card|mastercard|ماستر/.test(b)) return siMastercard
  if (/\bvisa\b|فيزا/.test(b)) return siVisa
  if (/شبكة|contactless|tap\s*to\s*pay|nfc|wallet|محفظة/.test(b)) return siContactlesspayment
  return null
}

type IconProps = {
  method: PaymentMethodIconInput
  size?: number
  className?: string
}

/**
 * شعار أو أيقونة طريقة الدفع (بدون حاوية خارجية — للاستخدام داخل `PaymentMethodLogoBox` أو نقاط البيع).
 */
export default function PaymentMethodBrandIcon({ method, size = 36, className = '' }: IconProps) {
  const b = bundleText(method)
  const label = method.name_en?.trim() || method.name
  const svgCommon = { width: size, height: size, className: `object-contain max-h-full max-w-full ${className}` } as const

  if (/instapay|انستاباي|إنستاباي|insta\s*pay|انستا\s*باي/.test(b)) {
    return <InstapayLogo {...svgCommon} />
  }
  if (/fawry|فوري|فوری/.test(b)) {
    return <FawryLogo {...svgCommon} />
  }
  if (/raabet|رابط|رابت|raabt|رابط\s*دفع/.test(b)) {
    return <RaabetLinkLogo {...svgCommon} />
  }
  if (/كي\s*نت|k\.?\s*net|\bknet\b/.test(b)) {
    return <KnetOfficialStyleLogo {...svgCommon} />
  }
  if (/\bmada\b|مدى/.test(b)) {
    return <MadaMark size={size} className={className} />
  }

  if (method.type === 'cash' || /نقد|كاش|cash|نقدي|فكة|نقداً|نقدا/.test(b)) {
    return <Banknote size={size} className={`shrink-0 text-emerald-600 ${className}`} strokeWidth={1.75} aria-hidden />
  }

  const brand = pickSimpleIcon(method)
  if (brand) {
    return <SimpleBrandSvg icon={brand} size={size} title={brand.title} className={className} />
  }

  if (method.type === 'bank' || /بنك|bank|حوالة|transfer|iban|swift|تحويل/.test(b)) {
    return <Landmark size={size} className={`shrink-0 text-sky-700 ${className}`} strokeWidth={1.75} aria-hidden />
  }

  if (method.type === 'credit' || /بطاقة|card|شبكة|دفع\s*إلكتروني/.test(b)) {
    return <CreditCard size={size} className={`shrink-0 text-violet-600 ${className}`} strokeWidth={1.75} aria-hidden />
  }

  return (
    <span className={`inline-flex ${className}`} title={label}>
      <Banknote size={size} className="shrink-0 text-emerald-600" strokeWidth={1.75} aria-hidden />
    </span>
  )
}

const LOGO_BOX =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200/90 bg-gradient-to-b from-white to-slate-50 p-1.5 shadow-sm ring-1 ring-slate-900/[0.03]'

const LOGO_INNER =
  'flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden [&_svg]:max-h-[1.65rem] [&_svg]:max-w-[1.65rem] [&_svg]:object-contain'

/**
 * حاوية موحّدة لعمود «اسم طريقة الدفع» في إعدادات طرق الدفع.
 */
export function PaymentMethodLogoBox({ method }: { method: PaymentMethodIconInput }) {
  return (
    <div className={LOGO_BOX} aria-hidden>
      <div className={LOGO_INNER}>
        <PaymentMethodBrandIcon method={method} size={28} />
      </div>
    </div>
  )
}
