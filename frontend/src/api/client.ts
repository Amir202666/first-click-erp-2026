import axios, { type InternalAxiosRequestConfig } from 'axios'
import { resolveApiBase } from '../utils/apiBase'

const apiBase = resolveApiBase()

const MAX_NETWORK_RETRIES = 3
const RETRY_DELAY_MS = 1500

/** فحص سريع لاتصال الخادم (بدون إعادة محاولة) */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const { data } = await axios.get(apiBase + '/health', {
      timeout: 4000,
      withCredentials: true,
    })
    return data?.ok === true
  } catch {
    return false
  }
}

export const api = axios.create({
  baseURL: apiBase,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  withCredentials: true,
  timeout: 30000,
})

/** حقن X-Tenant-ID تلقائياً من localStorage في كل طلب */
api.interceptors.request.use((config) => {
  const tenantId = localStorage.getItem('currentTenantId')
  if (tenantId && !config.headers['X-Tenant-ID']) {
    config.headers['X-Tenant-ID'] = tenantId
  }
  return config
})

/** إعادة المحاولة التلقائية عند فشل الاتصال (بدون استجابة من الخادم) */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
      return Promise.reject(error)
    }
    if (error.response?.status === 403 && error.response?.data?.feature_required) {
      window.location.href = '/renew-subscription?reason=feature'
      return Promise.reject(error)
    }
    const config = error.config as InternalAxiosRequestConfig & { __retryCount?: number }
    const isNetworkError = !error.response
    const is4xx = error.response?.status != null && error.response.status >= 400 && error.response.status < 500
    const retryCount = config?.__retryCount ?? 0
    if (!is4xx && isNetworkError && config && retryCount < MAX_NETWORK_RETRIES) {
      config.__retryCount = retryCount + 1
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (retryCount + 1)))
      return api.request(config)
    }
    return Promise.reject(error)
  }
)
