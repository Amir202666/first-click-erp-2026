import { createContext, useContext, useState, useLayoutEffect, ReactNode, useCallback, useMemo } from 'react'
import ar from '../i18n/ar'
import en from '../i18n/en'
import type { Translations } from '../i18n/ar'
import { getLocalizedName, type LocalizedNameEntity } from '../utils/localizedName'

type Lang = 'ar' | 'en'

interface LanguageContextType {
  lang: Lang
  t: Translations
  setLang: (lang: Lang) => void
  toggleLang: () => void
  isRtl: boolean
  /** Dual-language data: returns name_ar or name_en based on current UI language, with fallback. */
  getDisplayName: (entity: LocalizedNameEntity | null | undefined, nameKey?: string, nameEnKey?: string) => string
}

const translations: Record<Lang, Translations> = { ar, en }

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

function getInitialLang(): Lang {
  const stored = localStorage.getItem('lang')
  if (stored === 'ar' || stored === 'en') return stored
  return 'ar'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang)

  const t = translations[lang]
  const isRtl = lang === 'ar'

  useLayoutEffect(() => {
    document.documentElement.dir = t.dir
    document.documentElement.lang = t.lang
    localStorage.setItem('lang', lang)
  }, [lang, t.dir, t.lang])

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang)
  }, [])

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'ar' ? 'en' : 'ar'))
  }, [])

  const getDisplayName = useMemo(
    () => (entity: LocalizedNameEntity | null | undefined, nameKey = 'name', nameEnKey = 'name_en') =>
      getLocalizedName(entity, lang, nameKey, nameEnKey),
    [lang]
  )

  return (
    <LanguageContext.Provider value={{ lang, t, setLang, toggleLang, isRtl, getDisplayName }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}
