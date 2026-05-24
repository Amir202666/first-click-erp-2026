import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { useDocumentTitleContext } from '../contexts/DocumentTitleContext'
import { getTitleKeyForPath, DOCUMENT_TITLE_SUFFIX } from '../config/routeTitles'

function getNestedLabel(t: Record<string, unknown>, key: string): string {
  const parts = key.split('.')
  let current: unknown = t
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return key
    }
  }
  return typeof current === 'string' ? current : key
}

/**
 * Sets document.title from route config or page override. Runs only in useEffect to avoid
 * unnecessary re-renders; no DOM output.
 */
export default function DocumentTitle() {
  const location = useLocation()
  const { t } = useLanguage()
  const { pageTitleOverride } = useDocumentTitleContext()

  useEffect(() => {
    const suffix = DOCUMENT_TITLE_SUFFIX
    if (pageTitleOverride) {
      document.title = `${pageTitleOverride}${suffix}`
      return
    }
    const titleKey = getTitleKeyForPath(location.pathname)
    const label = getNestedLabel(t as Record<string, unknown>, titleKey)
    document.title = `${label}${suffix}`
  }, [location.pathname, pageTitleOverride, t])

  return null
}
