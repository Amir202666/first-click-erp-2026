/** Curated themes for appearance settings */

export interface ThemePalette {
  id: string
  label: string
  accent: string
  accentDark: string
  accentLight: string
  sidebarBg: string
  sidebarText: string
  sidebarActiveItem: string
  sidebarRegularItem: string
  sidebarDivider: string
  isLightSidebar: boolean
  /** خلفية الصفحة الرئيسية (ثيمات محاسبية) */
  pageBg?: string
  /** accounting = ثيمات النظام المحاسبي الرسمية */
  category?: 'accounting' | 'extra'
  /** Tailwind `--color-primary-*` */
  shades: Record<string, string>
}

const emeraldShades: Record<string, string> = {
  '50': '#ecfdf5',
  '100': '#d1fae5',
  '200': '#a7f3d0',
  '300': '#6ee7b7',
  '400': '#34d399',
  '500': '#10b981',
  '600': '#059669',
  '700': '#047857',
  '800': '#065f46',
  '900': '#064e3b',
  '950': '#022c22',
}

const skyShades: Record<string, string> = {
  '50': '#f0f9ff',
  '100': '#e0f2fe',
  '200': '#bae6fd',
  '300': '#7dd3fc',
  '400': '#38bdf8',
  '500': '#0ea5e9',
  '600': '#0284c7',
  '700': '#0369a1',
  '800': '#075985',
  '900': '#0c4a6e',
  '950': '#082f49',
}

const violetShades: Record<string, string> = {
  '50': '#f5f3ff',
  '100': '#ede9fe',
  '200': '#ddd6fe',
  '300': '#c4b5fd',
  '400': '#a78bfa',
  '500': '#8b5cf6',
  '600': '#7c3aed',
  '700': '#6d28d9',
  '800': '#5b21b6',
  '900': '#4c1d95',
  '950': '#2e1065',
}

const tealShades: Record<string, string> = {
  '50': '#f0fdfa',
  '100': '#ccfbf1',
  '200': '#99f6e4',
  '300': '#5eead4',
  '400': '#2dd4bf',
  '500': '#14b8a6',
  '600': '#0d9488',
  '700': '#0f766e',
  '800': '#115e59',
  '900': '#134e4a',
  '950': '#042f2e',
}

const indigoShades: Record<string, string> = {
  '50': '#eef2ff',
  '100': '#e0e7ff',
  '200': '#c7d2fe',
  '300': '#a5b4fc',
  '400': '#818cf8',
  '500': '#6366f1',
  '600': '#4f46e5',
  '700': '#4338ca',
  '800': '#3730a3',
  '900': '#312e81',
  '950': '#1e1b4b',
}

const peachShades: Record<string, string> = {
  '50': '#fff7ed',
  '100': '#ffedd5',
  '200': '#fed7aa',
  '300': '#fdba74',
  '400': '#fb923c',
  '500': '#f97316',
  '600': '#ea580c',
  '700': '#c2410c',
  '800': '#9a3412',
  '900': '#7c2d12',
  '950': '#431407',
}

const navyShades: Record<string, string> = {
  '50': '#eaf3fb',
  '100': '#eaf3fb',
  '200': '#c5dff5',
  '300': '#9ec9ef',
  '400': '#5a9de3',
  '500': '#2e7dd1',
  '600': '#2e7dd1',
  '700': '#1b4f8a',
  '800': '#1b4f8a',
  '900': '#0f2b4c',
  '950': '#0f2b4c',
}

const accountingTealShades: Record<string, string> = {
  '50': '#f0fdfa',
  '100': '#ccfbf1',
  '200': '#99f6e4',
  '300': '#5eead4',
  '400': '#2dd4bf',
  '500': '#14b8a6',
  '600': '#14b8a6',
  '700': '#0f766e',
  '800': '#0f766e',
  '900': '#0d4f4f',
  '950': '#0d4f4f',
}

export const THEMES: ThemePalette[] = [
  {
    id: 'first-click',
    label: 'نيلي محاسبي ⭐',
    accent: '#2e7dd1',
    accentDark: '#1b4f8a',
    accentLight: '#eaf3fb',
    sidebarBg: '#0f2b4c',
    sidebarText: '#ffffff',
    sidebarActiveItem: 'rgba(46,125,209,0.22)',
    sidebarRegularItem: 'rgba(255,255,255,0.72)',
    sidebarDivider: 'rgba(255,255,255,0.1)',
    isLightSidebar: false,
    pageBg: '#f5f7fa',
    category: 'accounting',
    shades: navyShades,
  },
  {
    id: 'accounting-teal',
    label: 'فيروزي ونعناع',
    accent: '#14b8a6',
    accentDark: '#0f766e',
    accentLight: '#ccfbf1',
    sidebarBg: '#0d4f4f',
    sidebarText: '#99f6e4',
    sidebarActiveItem: 'rgba(20,184,166,0.22)',
    sidebarRegularItem: 'rgba(255,255,255,0.72)',
    sidebarDivider: 'rgba(255,255,255,0.1)',
    isLightSidebar: false,
    pageBg: '#f0fdfa',
    category: 'accounting',
    shades: accountingTealShades,
  },
  {
    id: 'accounting-indigo',
    label: 'بنفسجي دافئ',
    accent: '#6366f1',
    accentDark: '#3730a3',
    accentLight: '#e0e7ff',
    sidebarBg: '#1e1b4b',
    sidebarText: '#c7d2fe',
    sidebarActiveItem: 'rgba(99,102,241,0.22)',
    sidebarRegularItem: 'rgba(255,255,255,0.72)',
    sidebarDivider: 'rgba(255,255,255,0.1)',
    isLightSidebar: false,
    pageBg: '#f8f7f4',
    category: 'accounting',
    shades: indigoShades,
  },
  {
    id: 'emerald',
    label: 'Emerald ⭐',
    accent: '#10b981',
    accentDark: '#059669',
    accentLight: '#ecfdf5',
    sidebarBg: '#0d2137',
    sidebarText: '#10b981',
    sidebarActiveItem: 'rgba(16,185,129,0.15)',
    sidebarRegularItem: 'rgba(255,255,255,0.55)',
    sidebarDivider: 'rgba(255,255,255,0.08)',
    isLightSidebar: false,
    category: 'extra',
    shades: emeraldShades,
  },
  {
    id: 'sky',
    label: 'Sky Blue',
    accent: '#0ea5e9',
    accentDark: '#0284c7',
    accentLight: '#e0f2fe',
    sidebarBg: '#0c2340',
    sidebarText: '#38bdf8',
    sidebarActiveItem: 'rgba(14,165,233,0.15)',
    sidebarRegularItem: 'rgba(255,255,255,0.55)',
    sidebarDivider: 'rgba(255,255,255,0.08)',
    isLightSidebar: false,
    category: 'extra',
    shades: skyShades,
  },
  {
    id: 'violet',
    label: 'Violet',
    accent: '#8b5cf6',
    accentDark: '#7c3aed',
    accentLight: '#ede9fe',
    sidebarBg: '#1e1b4b',
    sidebarText: '#a78bfa',
    sidebarActiveItem: 'rgba(139,92,246,0.15)',
    sidebarRegularItem: 'rgba(255,255,255,0.55)',
    sidebarDivider: 'rgba(255,255,255,0.08)',
    isLightSidebar: false,
    category: 'extra',
    shades: violetShades,
  },
  {
    id: 'teal',
    label: 'Teal',
    accent: '#14b8a6',
    accentDark: '#0d9488',
    accentLight: '#ccfbf1',
    sidebarBg: '#115e59',
    sidebarText: '#2dd4bf',
    sidebarActiveItem: 'rgba(20,184,166,0.15)',
    sidebarRegularItem: 'rgba(255,255,255,0.55)',
    sidebarDivider: 'rgba(255,255,255,0.08)',
    isLightSidebar: false,
    category: 'extra',
    shades: tealShades,
  },
  {
    id: 'indigo',
    label: 'Indigo',
    accent: '#6366f1',
    accentDark: '#4f46e5',
    accentLight: '#e0e7ff',
    sidebarBg: '#1e1e3f',
    sidebarText: '#818cf8',
    sidebarActiveItem: 'rgba(99,102,241,0.15)',
    sidebarRegularItem: 'rgba(255,255,255,0.55)',
    sidebarDivider: 'rgba(255,255,255,0.08)',
    isLightSidebar: false,
    category: 'extra',
    shades: indigoShades,
  },
  {
    id: 'mint',
    label: 'Mint',
    accent: '#34d399',
    accentDark: '#10b981',
    accentLight: '#d1fae5',
    sidebarBg: '#f0fdf4',
    sidebarText: '#065f46',
    sidebarActiveItem: 'rgba(52,211,153,0.15)',
    sidebarRegularItem: '#374151',
    sidebarDivider: 'rgba(0,0,0,0.08)',
    isLightSidebar: true,
    category: 'extra',
    shades: emeraldShades,
  },
  {
    id: 'lavender',
    label: 'Lavender',
    accent: '#a78bfa',
    accentDark: '#8b5cf6',
    accentLight: '#ede9fe',
    sidebarBg: '#f5f3ff',
    sidebarText: '#5b21b6',
    sidebarActiveItem: 'rgba(167,139,250,0.15)',
    sidebarRegularItem: '#374151',
    sidebarDivider: 'rgba(0,0,0,0.08)',
    isLightSidebar: true,
    category: 'extra',
    shades: violetShades,
  },
  {
    id: 'peach',
    label: 'Peach',
    accent: '#fb923c',
    accentDark: '#f97316',
    accentLight: '#ffedd5',
    sidebarBg: '#fff7ed',
    sidebarText: '#9a3412',
    sidebarActiveItem: 'rgba(251,146,60,0.12)',
    sidebarRegularItem: '#374151',
    sidebarDivider: 'rgba(0,0,0,0.08)',
    isLightSidebar: true,
    category: 'extra',
    shades: peachShades,
  },
]

export const DEFAULT_THEME_ID = 'first-click'

/** ثيمات أُزيلت من القائمة — تُحوَّل تلقائياً لأقرب بديل */
export const RETIRED_THEME_IDS: Record<string, string> = {
  rose: 'violet',
  amber: 'peach',
  cyan: 'sky',
  blush: 'lavender',
}

export const THEMES_BY_ID: Record<string, ThemePalette> = Object.fromEntries(
  THEMES.map((t) => [t.id, t]),
)

export function resolveTheme(id: string): ThemePalette {
  const resolved = RETIRED_THEME_IDS[id] ?? id
  return THEMES_BY_ID[resolved] ?? THEMES[0]
}

/** Legacy `firstclick_theme` palette keys → new theme ids */
export const LEGACY_FIRSTCLICK_PALETTE: Record<string, string> = {
  emerald: 'emerald',
  blue: 'sky',
  violet: 'violet',
  rose: 'violet',
  amber: 'peach',
  cyan: 'sky',
  teal: 'accounting-teal',
  'first-click': 'first-click',
}

/** Legacy `app-theme` string ids → new theme ids */
export const LEGACY_APP_THEME_ID: Record<string, string> = {
  indigo: 'indigo',
  white: 'lavender',
  blue: 'sky',
  emerald: 'emerald',
  teal: 'accounting-teal',
  'first-click': 'first-click',
  cyan: 'sky',
  sky: 'sky',
  mint: 'mint',
  'light-sky': 'sky',
  'light-emerald': 'mint',
  'steel-blue': 'sky',
  'ocean-teal': 'first-click',
  mauve: 'lavender',
  'warm-brown': 'peach',
  coral: 'violet',
  silver: 'lavender',
  'medium-gray': 'lavender',
  'deep-blue-royal': 'indigo',
  'azure-sky': 'sky',
  'pastel-light-blue': 'lavender',
  'md-appbar-blue': 'sky',
  'md-indigo-night': 'indigo',
  'md-deep-purple': 'violet',
  'md-teal-sea': 'accounting-teal',
  'md-cyan-bright': 'sky',
}
