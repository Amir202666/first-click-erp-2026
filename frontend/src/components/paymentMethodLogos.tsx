/**
 * رسوم SVG مضغوطة لطرق دفع معروفة في المنطقة (ألوان وشكل يقترب من الهوية العامة؛
 * للاستخدام داخل واجهة ERP فقط — يُفضّل استبدالها بأصول رسمية عند توفرها من الجهة).
 */
import type { SVGProps } from 'react'

const box = (props: SVGProps<SVGSVGElement> & { title: string }) => {
  const { title, children, ...rest } = props
  return (
    <svg role="img" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden {...rest}>
      <title>{title}</title>
      {children}
    </svg>
  )
}

/** شعار InstaPay الرسمي (نمط كلمة): INSTA >> PAY على خلفية بنفسجية، نص أبيض عريض مائل، شيفرونان برتقاليان. */
const IP_BG = '#4B0082'
const IP_WHITE = '#FFFFFF'
const IP_CHEV_PEACH = '#FFCFA8'
const IP_CHEV_ORANGE = '#FF6A1A'
const IP_FONT = "ui-sans-serif, system-ui, 'Segoe UI', Roboto, sans-serif"

export function InstapayLogo(props: SVGProps<SVGSVGElement>) {
  const { className, ...rest } = props
  return (
    <svg
      role="img"
      viewBox="0 0 268 72"
      xmlns="http://www.w3.org/2000/svg"
      style={{ direction: 'ltr' }}
      aria-hidden
      className={className}
      {...rest}
    >
      <title>InstaPay</title>
      <rect width="268" height="72" rx="10" fill={IP_BG} />
      <text
        x="14"
        y="48"
        fill={IP_WHITE}
        fontSize="23"
        fontWeight="800"
        fontStyle="italic"
        fontFamily={IP_FONT}
        letterSpacing="0.04em"
      >
        INSTA
      </text>
      {/* شيفرونان يميناً: خوخي ثم برتقالي */}
      <path fill={IP_CHEV_PEACH} d="M92 24 L104 36 L92 48 Z" />
      <path fill={IP_CHEV_ORANGE} d="M102 22 L118 36 L102 50 Z" />
      <text
        x="128"
        y="48"
        fill={IP_WHITE}
        fontSize="23"
        fontWeight="800"
        fontStyle="italic"
        fontFamily={IP_FONT}
        letterSpacing="0.04em"
      >
        PAY
      </text>
    </svg>
  )
}

/** فوري — برتقالي مع حرف F مبسّط */
export function FawryLogo(props: SVGProps<SVGSVGElement>) {
  return box({
    ...props,
    title: 'Fawry',
    children: (
      <>
        <rect width="48" height="48" rx="10" fill="#ed5a23" />
        <path
          fill="#fff"
          d="M14 12h14c6 0 10 3.4 10 9.2 0 3.4-1.5 6.2-4.2 7.8L38 36H30l-3.2-5.4H22V36h-8V12zm8 7.6V24h5.2c2.1 0 3.3-1 3.3-2.7 0-1.7-1.2-2.7-3.4-2.7H22z"
        />
      </>
    ),
  })
}

/** رابط / Raabet — أزرق بنمط «ربط» */
export function RaabetLinkLogo(props: SVGProps<SVGSVGElement>) {
  return box({
    ...props,
    title: 'Raabet',
    children: (
      <>
        <rect width="48" height="48" rx="10" fill="#1e3a5f" />
        <path
          fill="none"
          stroke="#38bdf8"
          strokeWidth="3.2"
          strokeLinecap="round"
          d="M18 22h-3a5 5 0 010-10h3m12 0h3a5 5 0 010 10h-3M16 22h16"
        />
        <circle cx="24" cy="22" r="3.5" fill="#fff" />
      </>
    ),
  })
}

/** كي نت — أزرق مع شريط موجة أبيض (هوية بصرية شائعة) */
export function KnetOfficialStyleLogo(props: SVGProps<SVGSVGElement>) {
  return box({
    ...props,
    title: 'KNET',
    children: (
      <>
        <rect width="48" height="48" rx="10" fill="#0067b1" />
        <path fill="#fff" d="M6 28c8-14 18-18 36-12v8C22 18 12 26 8 38H6V28z" opacity="0.95" />
        <rect x="8" y="34" width="32" height="5" rx="1.2" fill="#9fd4ff" />
      </>
    ),
  })
}
