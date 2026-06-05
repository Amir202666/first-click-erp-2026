import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ThemeConfig, ThemeMode } from '../types/theme'
import type { ThemePalette } from '../constants/palettes'
import {
  DEFAULT_THEME_ID,
  LEGACY_APP_THEME_ID,
  LEGACY_FIRSTCLICK_PALETTE,
  THEMES,
  resolveTheme,
} from '../constants/palettes'

const STORAGE_KEY = 'fc_theme_v2'
const LEGACY_FIRSTCLICK_KEY = 'firstclick_theme'
const LEGACY_APP_THEME_KEY = 'app-theme'

const LIGHT_NEUTRAL: Record<string, string> = {
  '50': '#fafafa',
  '100': '#f4f4f5',
  '200': '#e4e4e7',
  '300': '#d4d4d8',
  '500': '#71717a',
  '700': '#3f3f46',
  '900': '#18181b',
}

const DARK_NEUTRAL: Record<string, string> = {
  '50': '#1a1f2e',
  '100': '#252d3d',
  '200': '#374151',
  '300': '#4b5563',
  '500': '#94a3b8',
  '700': '#cbd5e1',
  '900': '#f1f5f9',
}

function validMode(m: unknown): ThemeMode {
  if (m === 'light' || m === 'dark' || m === 'auto') return m
  return 'light'
}

function readInitialConfig(): ThemeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<ThemeConfig>
      if (p.themeId && THEMES.some((t) => t.id === p.themeId)) {
        return { themeId: p.themeId, mode: validMode(p.mode) }
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(LEGACY_FIRSTCLICK_KEY)
    if (raw) {
      const p = JSON.parse(raw) as { palette?: string; mode?: ThemeMode }
      const id = p.palette ? LEGACY_FIRSTCLICK_PALETTE[p.palette] : undefined
      if (id) {
        return { themeId: id, mode: validMode(p.mode) }
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const legacyId = localStorage.getItem(LEGACY_APP_THEME_KEY)
    if (legacyId) {
      const mapped = LEGACY_APP_THEME_ID[legacyId]
      if (mapped) return { themeId: mapped, mode: 'light' }
    }
  } catch {
    /* ignore */
  }
  return { themeId: DEFAULT_THEME_ID, mode: 'light' }
}

function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

interface ThemeContextValue {
  config: ThemeConfig
  currentTheme: ThemePalette
  setTheme: (id: string) => void
  setMode: (mode: ThemeMode) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyCssTheme(theme: ThemePalette, isDark: boolean, config: ThemeConfig) {
  const root = document.documentElement

  root.style.setProperty('--fc-accent', theme.accent)
  root.style.setProperty('--fc-accent-dark', theme.accentDark)
  root.style.setProperty('--fc-accent-light', theme.accentLight)
  root.style.setProperty('--fc-sidebar-bg', theme.sidebarBg)
  root.style.setProperty('--fc-sidebar-text', theme.sidebarText)
  root.style.setProperty('--fc-sidebar-active-bg', theme.sidebarActiveItem)
  root.style.setProperty('--fc-sidebar-regular-text', theme.sidebarRegularItem)
  root.style.setProperty('--fc-sidebar-divider', theme.sidebarDivider)

  for (const [shade, rgb] of Object.entries(theme.shades)) {
    root.style.setProperty(`--color-primary-${shade}`, rgb)
  }

  root.style.setProperty('--color-accent', theme.accent)
  root.style.setProperty('--color-accent-dark', theme.accentDark)
  root.style.setProperty('--color-accent-light', theme.accentLight)
  root.style.setProperty('--color-sidebar-bg', theme.sidebarBg)

  const neutral = isDark ? DARK_NEUTRAL : LIGHT_NEUTRAL
  for (const [k, v] of Object.entries(neutral)) {
    root.style.setProperty(`--color-neutral-${k}`, v)
  }

  if (isDark) {
    root.classList.add('dark')
    root.style.setProperty('--fc-page-bg', '#0f172a')
    root.style.setProperty('--fc-card-bg', '#1e293b')
    root.style.setProperty('--fc-border', '#475569')
    root.style.setProperty('--fc-text', '#f1f5f9')
    root.style.setProperty('--fc-text-muted', '#94a3b8')
    root.style.setProperty('--fc-input-bg', '#1e293b')
    root.style.setProperty('--fc-table-row-hover', '#1e293b')
  } else {
    root.classList.remove('dark')
    root.style.setProperty('--fc-page-bg', '#ffffff')
    root.style.setProperty('--fc-card-bg', '#ffffff')
    root.style.setProperty('--fc-border', '#e5e7eb')
    root.style.setProperty('--fc-text', '#1f2937')
    root.style.setProperty('--fc-text-muted', '#6b7280')
    root.style.setProperty('--fc-input-bg', '#ffffff')
    root.style.setProperty('--fc-table-row-hover', '#ffffff')
  }

  root.style.setProperty('--color-page-bg', isDark ? '#0f172a' : '#ffffff')
  root.style.setProperty('--color-card-bg', isDark ? '#1e293b' : '#ffffff')
  root.style.setProperty('--color-border', isDark ? '#475569' : '#e5e7eb')
  root.style.setProperty('--color-text', isDark ? '#f1f5f9' : '#1f2937')
  root.style.setProperty('--color-text-muted', isDark ? '#94a3b8' : '#6b7280')
  root.style.setProperty('--color-input-bg', isDark ? '#1e293b' : '#ffffff')

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    localStorage.removeItem(LEGACY_FIRSTCLICK_KEY)
    localStorage.removeItem(LEGACY_APP_THEME_KEY)
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ThemeConfig>(() => readInitialConfig())
  const [systemDark, setSystemDark] = useState(() => resolveDark('auto'))

  const currentTheme = useMemo(() => resolveTheme(config.themeId), [config.themeId])

  const isDark = useMemo(
    () => (config.mode === 'auto' ? systemDark : resolveDark(config.mode)),
    [config.mode, systemDark],
  )

  useLayoutEffect(() => {
    applyCssTheme(currentTheme, isDark, config)
  }, [currentTheme, isDark, config])

  useEffect(() => {
    if (config.mode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setSystemDark(mq.matches)
    handler()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [config.mode])

  const setTheme = useCallback((id: string) => {
    if (!THEMES.some((t) => t.id === id)) return
    setConfig((prev) => ({ ...prev, themeId: id }))
  }, [])

  const setMode = useCallback((mode: ThemeMode) => {
    setConfig((prev) => ({ ...prev, mode }))
  }, [])

  return (
    <ThemeContext.Provider value={{ config, currentTheme, setTheme, setMode, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
