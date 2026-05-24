import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true })

/** طبقة مودالات فوق #root والشريط — أنماط inline !important إن لم تُحمَّل CSS */
function ensureModalRoot() {
  let el = document.getElementById('modal-root')
  if (!el) {
    el = document.createElement('div')
    el.id = 'modal-root'
    el.setAttribute('aria-live', 'polite')
    el.classList.add('no-print')
    document.body.appendChild(el)
  }
  el.classList.add('no-print')
  el.style.setProperty('position', 'fixed', 'important')
  el.style.setProperty('inset', '0', 'important')
  el.style.setProperty('z-index', '999999', 'important')
  el.style.setProperty('pointer-events', 'none', 'important')
}

ensureModalRoot()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: (failureCount, error: unknown) => {
        const status = (error as { response?: { status?: number } })?.response?.status
        if (status != null && status >= 400 && status < 500) return false
        return failureCount < 2
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
