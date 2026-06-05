/**
 * Same-origin /api on production domains.
 * Prevents broken builds where .env.local baked 127.0.0.1 into the bundle.
 */
export function resolveApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim()

  if (typeof window !== 'undefined' && import.meta.env.PROD) {
    const host = window.location.hostname
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return '/api'
    }
  }

  if (fromEnv) {
    return fromEnv.replace(/\/$/, '')
  }

  return import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api'
}
