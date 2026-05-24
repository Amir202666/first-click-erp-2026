import { useEffect } from 'react'
import { useDocumentTitleContext } from '../contexts/DocumentTitleContext'

/**
 * Sets the browser tab title for the current page. Use for dynamic titles (e.g. "فاتورة #105").
 * The suffix " | FIRST CLICK" is added automatically.
 * On unmount, the title is cleared so the next page can show its route-based title.
 */
export function useDocumentTitle(title: string | null) {
  const { setPageTitle } = useDocumentTitleContext()

  useEffect(() => {
    setPageTitle(title)
    return () => setPageTitle(null)
  }, [title, setPageTitle])
}
