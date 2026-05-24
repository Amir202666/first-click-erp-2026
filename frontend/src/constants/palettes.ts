/** Curated themes: 8 dark sidebar + 4 light/pastel sidebar */

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

const roseShades: Record<string, string> = {
  '50': '#fff1f2',
  '100': '#ffe4e6',
  '200': '#fecdd3',
  '300': '#fda4af',
  '400': '#fb7185',
  '500': '#f43f5e',
  '600': '#e11d48',
  '700': '#be123c',
  '800': '#9f1239',
  '900': '#881337',
  '950': '#4c0519',
}

const amberShades: Record<string, string> = {
  '50': '#fffbeb',
  '100': '#fef3c7',
  '200': '#fde68a',
  '300': '#fcd34d',
  '400': '#fbbf24',
  '500': '#f59e0b',
  '600': '#d97706',
  '700': '#b45309',
  '800': '#92400e',
  '900': '#78350f',
  '950': '#451a03',
}

const cyanShades: Record<string, string> = {
  '50': '#ecfeff',
  '100': '#cffafe',
  '200': '#a5f3fc',
  '300': '#67e8f9',
  '400': '#22d3ee',
  '500': '#06b6d4',
  '600': '#0891b2',
  '700': '#0e7490',
  '800': '#155e75',
  '900': '#164e63',
  '950': '#083344',
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

const blushShades: Record<string, string> = {
  '50': '#fdf2f8',
  '100': '#fce7f3',
  '200': '#fbcfe8',
  '300': '#f9a8d4',
  '400': '#f472b6',
  '500': '#ec4899',
  '600': '#db2777',
  '700': '#be185d',
  '800': '#9d174d',
  '900': '#831843',
  '950': '#500724',
}

export const THEMES: ThemePalette[] = [
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
    shades: violetShades,
  },
  {
    id: 'rose',
    label: 'Rose',
    accent: '#f43f5e',
    accentDark: '#e11d48',
    accentLight: '#ffe4e6',
    sidebarBg: '#1c0a12',
    sidebarText: '#fb7185',
    sidebarActiveItem: 'rgba(244,63,94,0.15)',
    sidebarRegularItem: 'rgba(255,255,255,0.55)',
    sidebarDivider: 'rgba(255,255,255,0.08)',
    isLightSidebar: false,
    shades: roseShades,
  },
  {
    id: 'amber',
    label: 'Amber',
    accent: '#f59e0b',
    accentDark: '#d97706',
    accentLight: '#fef3c7',
    sidebarBg: '#1c1207',
    sidebarText: '#fbbf24',
    sidebarActiveItem: 'rgba(245,158,11,0.15)',
    sidebarRegularItem: 'rgba(255,255,255,0.55)',
    sidebarDivider: 'rgba(255,255,255,0.08)',
    isLightSidebar: false,
    shades: amberShades,
  },
  {
    id: 'cyan',
    label: 'Cyan',
    accent: '#06b6d4',
    accentDark: '#0891b2',
    accentLight: '#cffafe',
    sidebarBg: '#0c1a2e',
    sidebarText: '#22d3ee',
    sidebarActiveItem: 'rgba(6,182,212,0.15)',
    sidebarRegularItem: 'rgba(255,255,255,0.55)',
    sidebarDivider: 'rgba(255,255,255,0.08)',
    isLightSidebar: false,
    shades: cyanShades,
  },
  {
    id: 'teal',
    label: 'Teal',
    accent: '#14b8a6',
    accentDark: '#0d9488',
    accentLight: '#ccfbf1',
    sidebarBg: '#0d1f1e',
    sidebarText: '#2dd4bf',
    sidebarActiveItem: 'rgba(20,184,166,0.15)',
    sidebarRegularItem: 'rgba(255,255,255,0.55)',
    sidebarDivider: 'rgba(255,255,255,0.08)',
    isLightSidebar: false,
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
    shades: peachShades,
  },
  {
    id: 'blush',
    label: 'Blush',
    accent: '#f472b6',
    accentDark: '#ec4899',
    accentLight: '#fce7f3',
    sidebarBg: '#fdf2f8',
    sidebarText: '#9d174d',
    sidebarActiveItem: 'rgba(244,114,182,0.12)',
    sidebarRegularItem: '#374151',
    sidebarDivider: 'rgba(0,0,0,0.08)',
    isLightSidebar: true,
    shades: blushShades,
  },
]

export const DEFAULT_THEME_ID = 'emerald'

export const THEMES_BY_ID: Record<string, ThemePalette> = Object.fromEntries(
  THEMES.map((t) => [t.id, t]),
)

export function resolveTheme(id: string): ThemePalette {
  return THEMES_BY_ID[id] ?? THEMES[0]
}

/** Legacy `firstclick_theme` palette keys → new theme ids */
export const LEGACY_FIRSTCLICK_PALETTE: Record<string, string> = {
  emerald: 'emerald',
  blue: 'sky',
  violet: 'violet',
  rose: 'rose',
  amber: 'amber',
  cyan: 'cyan',
}

/** Legacy `app-theme` string ids → new theme ids */
export const LEGACY_APP_THEME_ID: Record<string, string> = {
  indigo: 'indigo',
  white: 'lavender',
  blue: 'sky',
  emerald: 'emerald',
  teal: 'teal',
  cyan: 'cyan',
  sky: 'sky',
  mint: 'mint',
  'light-sky': 'sky',
  'light-emerald': 'mint',
  'steel-blue': 'sky',
  'ocean-teal': 'teal',
  mauve: 'lavender',
  'warm-brown': 'amber',
  coral: 'rose',
  silver: 'lavender',
  'medium-gray': 'lavender',
  'deep-blue-royal': 'indigo',
  'azure-sky': 'sky',
  'pastel-light-blue': 'lavender',
  'md-appbar-blue': 'sky',
  'md-indigo-night': 'indigo',
  'md-deep-purple': 'violet',
  'md-teal-sea': 'teal',
  'md-cyan-bright': 'cyan',
}
