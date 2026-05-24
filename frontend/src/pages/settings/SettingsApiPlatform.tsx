import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  createIntegrationApiKey,
  createIntegrationWebhook,
  deleteIntegrationWebhook,
  fetchIntegrationApiKeys,
  fetchIntegrationWebhooks,
  revokeIntegrationApiKey,
} from '../../api/integrationPlatform'

function backendOriginFromApiBase(): string {
  const base = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api')
  return base.replace(/\/?api\/?$/, '')
}

export default function SettingsApiPlatform() {
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const qc = useQueryClient()
  const copy = t.apiPlatform

  const tenantId = currentTenant?.id ?? 0

  const [newKeyName, setNewKeyName] = useState('')
  const [createdToken, setCreatedToken] = useState<string | null>(null)

  const [hookUrl, setHookUrl] = useState('')
  const [hookEvents, setHookEvents] = useState('invoice.created, invoice.paid, inventory.low, inventory.out_of_stock')
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)

  const docsUrl = useMemo(() => `${backendOriginFromApiBase()}/integration-api-docs.html`, [])

  const keysQuery = useQuery({
    queryKey: ['integration-api-keys', tenantId],
    queryFn: () => fetchIntegrationApiKeys(tenantId),
    enabled: tenantId > 0,
  })

  const hooksQuery = useQuery({
    queryKey: ['integration-webhooks', tenantId],
    queryFn: () => fetchIntegrationWebhooks(tenantId),
    enabled: tenantId > 0,
  })

  const createKeyMut = useMutation({
    mutationFn: () => createIntegrationApiKey(tenantId, { name: newKeyName.trim() || 'integration' }),
    onSuccess: async (data) => {
      setCreatedToken(data.token)
      setNewKeyName('')
      await qc.invalidateQueries({ queryKey: ['integration-api-keys', tenantId] })
    },
  })

  const revokeKeyMut = useMutation({
    mutationFn: (id: number) => revokeIntegrationApiKey(tenantId, id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['integration-api-keys', tenantId] })
    },
  })

  const createHookMut = useMutation({
    mutationFn: () =>
      createIntegrationWebhook(tenantId, {
        url: hookUrl.trim(),
        events: hookEvents
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: async (data) => {
      setCreatedSecret(data.secret)
      setHookUrl('')
      await qc.invalidateQueries({ queryKey: ['integration-webhooks', tenantId] })
    },
  })

  const deleteHookMut = useMutation({
    mutationFn: (id: number) => deleteIntegrationWebhook(tenantId, id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['integration-webhooks', tenantId] })
    },
  })

  if (!tenantId) {
    return <div className="page-bg">{t.loading}</div>
  }

  return (
    <div className="page-bg" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="max-w-3xl mx-auto w-full min-w-0">
        <h1 className="text-xl mb-5" style={{ color: 'var(--fc-text)' }}>
          {copy.pageTitle}
        </h1>

        <div className="card-app mb-5">
          <div className="card-padding space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base" style={{ color: 'var(--fc-text)' }}>
                  {copy.keysHeading}
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--fc-text-muted)' }}>
                  {copy.keysHint}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder={copy.keyName}
                  className="input-app w-full sm:w-56"
                />
                <button
                  type="button"
                  className="btn btn-primary btn-md w-full sm:w-auto fc-tap-target"
                  onClick={() => createKeyMut.mutate()}
                  disabled={createKeyMut.isPending}
                >
                  {copy.createKey}
                </button>
              </div>
            </div>

            {createdToken ? (
              <div className="rounded-app border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-semibold">{copy.tokenOnce}</p>
                <p className="font-mono break-all mt-1">{createdToken}</p>
                <p className="text-xs mt-2 text-emerald-800">{copy.copyHint}</p>
                <button type="button" className="btn btn-secondary btn-sm mt-3 w-full sm:w-auto fc-tap-target" onClick={() => setCreatedToken(null)}>
                  {t.close}
                </button>
              </div>
            ) : null}

            <div className="space-y-2">
              {keysQuery.isLoading ? <p className="text-sm text-slate-500">{t.loading}</p> : null}
              {!keysQuery.isLoading && (keysQuery.data?.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-500">{copy.noKeys}</p>
              ) : null}
              {(keysQuery.data?.data ?? []).map((k) => (
                <div key={k.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-app border border-slate-200 bg-white">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{k.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {copy.lastUsed}: {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : copy.neverUsed}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm w-full sm:w-auto fc-tap-target"
                    onClick={() => revokeKeyMut.mutate(k.id)}
                    disabled={revokeKeyMut.isPending}
                  >
                    {copy.revoke}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card-app mb-5">
          <div className="card-padding space-y-4">
            <h2 className="text-base" style={{ color: 'var(--fc-text)' }}>
              {copy.webhooksHeading}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">{copy.webhookUrl}</label>
                <input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} className="input-app" placeholder="https://example.com/hooks/first-click" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">{copy.webhookEvents}</label>
                <input value={hookEvents} onChange={(e) => setHookEvents(e.target.value)} className="input-app" />
              </div>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-md w-full sm:w-auto fc-tap-target"
              onClick={() => createHookMut.mutate()}
              disabled={createHookMut.isPending || !hookUrl.trim()}
            >
              {copy.addWebhook}
            </button>

            {createdSecret ? (
              <div className="rounded-app border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
                <p className="font-semibold">{copy.webhookSecretOnce}</p>
                <p className="font-mono break-all mt-1">{createdSecret}</p>
                <button type="button" className="btn btn-secondary btn-sm mt-3 w-full sm:w-auto fc-tap-target" onClick={() => setCreatedSecret(null)}>
                  {t.close}
                </button>
              </div>
            ) : null}

            <div className="space-y-2">
              {hooksQuery.isLoading ? <p className="text-sm text-slate-500">{t.loading}</p> : null}
              {!hooksQuery.isLoading && (hooksQuery.data?.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-500">{copy.noWebhooks}</p>
              ) : null}
              {(hooksQuery.data?.data ?? []).map((h) => (
                <div key={h.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-app border border-slate-200 bg-white">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 break-all">{h.url}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {(h.events ?? []).length ? h.events?.join(', ') : '*'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm w-full sm:w-auto fc-tap-target"
                    onClick={() => deleteHookMut.mutate(h.id)}
                    disabled={deleteHookMut.isPending}
                  >
                    {t.delete}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <h2 className="text-base text-indigo-900">{copy.docsHeading}</h2>
          <p className="text-sm text-indigo-800 mt-2">{copy.docsHint}</p>
          <button
            type="button"
            className="btn btn-primary btn-md mt-4 w-full sm:w-auto fc-tap-target"
            onClick={() => window.open(docsUrl, '_blank', 'noopener,noreferrer')}
          >
            {copy.openDocs}
          </button>
        </div>
      </div>
    </div>
  )
}
