import { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallPrompt() {
  const { t, isRtl } = useLanguage()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  if (!show || !deferred) return null

  const copy = (t as { pwa?: { installTitle?: string; installHint?: string; install?: string; later?: string } }).pwa

  return (
    <div
      className="no-print fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-[60] flex items-center gap-3"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center text-2xl flex-shrink-0" aria-hidden>
        📱
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-gray-900">{copy?.installTitle ?? 'تثبيت التطبيق'}</p>
        <p className="text-xs text-gray-500 mt-0.5">{copy?.installHint ?? 'استخدم النظام كتطبيق على جهازك'}</p>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button
          type="button"
          onClick={async () => {
            try {
              await deferred.prompt()
              await deferred.userChoice
            } catch {
              /* ignore */
            }
            setShow(false)
            setDeferred(null)
          }}
          className="px-3 py-2 min-h-[44px] bg-emerald-500 text-white rounded-lg text-xs font-semibold"
        >
          {copy?.install ?? 'تثبيت'}
        </button>
        <button
          type="button"
          onClick={() => { setShow(false); setDeferred(null) }}
          className="text-xs text-gray-400 text-center py-1 min-h-[40px]"
        >
          {copy?.later ?? 'لاحقاً'}
        </button>
      </div>
    </div>
  )
}
