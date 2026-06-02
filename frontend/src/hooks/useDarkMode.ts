import { useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'

/**
 * واجهة مبسطة للوضع الليلي — تربط بـ ThemeContext (fc_theme_v2 في localStorage).
 */
export function useDarkMode() {
  const { isDark, setMode, config } = useTheme()

  const setIsDark = useCallback(
    (dark: boolean) => {
      setMode(dark ? 'dark' : 'light')
    },
    [setMode],
  )

  const toggle = useCallback(() => {
    setMode(isDark ? 'light' : 'dark')
  }, [isDark, setMode])

  return { isDark, setIsDark, toggle, mode: config.mode }
}
