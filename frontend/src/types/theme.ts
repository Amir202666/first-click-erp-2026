export type ThemeMode = 'light' | 'dark' | 'auto'

export interface ThemeConfig {
  themeId: string
  mode: ThemeMode
}

export type { ThemePalette } from '../constants/palettes'
