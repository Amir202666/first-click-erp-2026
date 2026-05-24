import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface DocumentTitleContextType {
  pageTitleOverride: string | null
  /** Override the route-based title (e.g. "فاتورة #105"). Pass null to clear. */
  setPageTitle: (title: string | null) => void
}

const DocumentTitleContext = createContext<DocumentTitleContextType | undefined>(undefined)

export function DocumentTitleProvider({ children }: { children: ReactNode }) {
  const [pageTitleOverride, setPageTitleOverride] = useState<string | null>(null)
  const setPageTitle = useCallback((title: string | null) => {
    setPageTitleOverride(title)
  }, [])
  return (
    <DocumentTitleContext.Provider value={{ pageTitleOverride, setPageTitle }}>
      {children}
    </DocumentTitleContext.Provider>
  )
}

export function useDocumentTitleContext() {
  const ctx = useContext(DocumentTitleContext)
  if (ctx === undefined) {
    throw new Error('useDocumentTitleContext must be used within DocumentTitleProvider')
  }
  return ctx
}
