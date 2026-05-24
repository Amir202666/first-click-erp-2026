import { useMemo } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'

type IntegrationCard = {
  id: string
  name: string
  icon: string
  category: 'store' | 'payment' | 'shipping' | 'automation'
  color: string
}

const INTEGRATIONS: IntegrationCard[] = [
  { id: 'salla', name: 'Salla', icon: '🛍️', category: 'store', color: 'bg-orange-50 border-orange-200' },
  { id: 'zid', name: 'Zid', icon: '🛒', category: 'store', color: 'bg-blue-50 border-blue-200' },
  { id: 'woocommerce', name: 'WooCommerce', icon: '🐱', category: 'store', color: 'bg-purple-50 border-purple-200' },
  { id: 'shopify', name: 'Shopify', icon: '🟢', category: 'store', color: 'bg-green-50 border-green-200' },
  { id: 'myfatoorah', name: 'MyFatoorah', icon: '💳', category: 'payment', color: 'bg-teal-50 border-teal-200' },
  { id: 'tap', name: 'Tap Payments', icon: '💰', category: 'payment', color: 'bg-red-50 border-red-200' },
  { id: 'aramex', name: 'Aramex', icon: '📦', category: 'shipping', color: 'bg-red-50 border-red-200' },
  { id: 'zapier', name: 'Zapier', icon: '⚡', category: 'automation', color: 'bg-orange-50 border-orange-200' },
]

export default function SettingsIntegrations() {
  const { t, isRtl } = useLanguage()
  const copy = t.apiPlatform

  const categoryLabel = useMemo(
    () => ({
      store: copy.categoryStore,
      payment: copy.categoryPayment,
      shipping: copy.categoryShipping,
      automation: copy.categoryAutomation,
    }),
    [copy.categoryAutomation, copy.categoryPayment, copy.categoryShipping, copy.categoryStore],
  )

  return (
    <div className="page-bg" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="max-w-5xl mx-auto w-full min-w-0">
        <h1 className="text-xl mb-2" style={{ color: 'var(--fc-text)' }}>
          {copy.integrationsTitle}
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--fc-text-muted)' }}>
          {copy.integrationsHint}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {INTEGRATIONS.map((it) => (
            <div key={it.id} className={`rounded-2xl border p-4 ${it.color}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-2xl" aria-hidden>
                    {it.icon}
                  </div>
                  <p className="text-base mt-2 font-semibold text-slate-900">{it.name}</p>
                  <p className="text-xs mt-1 text-slate-600">{categoryLabel[it.category]}</p>
                </div>
                <span className="text-[11px] px-2 py-1 rounded-full bg-white/70 border border-black/5 text-slate-700 shrink-0">
                  {it.id}
                </span>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-md w-full mt-4 fc-tap-target"
                disabled
                title={copy.integrationsHint}
              >
                {copy.connect}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
