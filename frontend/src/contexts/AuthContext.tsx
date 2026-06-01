import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api } from '../api/client'
import { applyUiFontScaleIfChanged, readCachedUiFontScale } from '../utils/uiFontScaleStorage'
import { expandPlanFeatures, planAllowsAny, planAllowsFeature } from '../utils/planFeatures'
import {
  hasFullTenantAccess as checkFullTenantAccess,
  isPlatformSuperAdmin as checkPlatformSuperAdmin,
} from '../utils/platformSuperAdmin'

interface User {
  id: number
  name: string
  email: string
  username?: string
  is_super_admin?: boolean
  platform_admin?: boolean
}

interface Tenant {
  id: number
  name: string
  slug: string
}

interface MeData {
  role: string | null
  role_slug?: string
  username?: string
  email?: string
  is_super_admin?: boolean
  platform_admin?: boolean
  permissions: string[]
  default_branch_id?: number | null
  default_warehouse_id?: number | null
  restrict_to_branch_warehouse?: boolean
  /** id من جدول tenant_users (pivot) */
  tenant_user_id?: number | null
  subscription_ends_at?: string | null
  subscription_status?: string | null
  subscription_expired?: boolean
  plan_features?: string[]
  pricing_group_ids?: number[]
}

interface AuthContextType {
  user: User | null
  tenants: Tenant[]
  currentTenant: Tenant | null
  setCurrentTenant: (tenant: Tenant | null) => void
  meData: MeData | null
  subscriptionExpired: boolean
  can: (permission: string) => boolean
  canAccessFeature: (feature: string) => boolean
  canAccessPath: (path: string) => boolean
  /** مالك المنصة (إدارة الاشتراكات) — ليس مدير الشركة */
  isPlatformSuperAdmin: boolean
  /** مدير / صلاحيات * — كل قوائم الشركة في الشريط الجانبي */
  hasFullTenantAccess: boolean
  isAuthenticated: boolean
  isLoading: boolean
  login: (company: string, username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const TENANT_STORAGE_KEY = 'currentTenantId'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [currentTenant, setCurrentTenantState] = useState<Tenant | null>(null)
  const [meData, setMeData] = useState<MeData | null>(null)
  const [subscriptionExpired, setSubscriptionExpired] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const setCurrentTenant = (tenant: Tenant | null) => {
    setCurrentTenantState(tenant)
    if (tenant) {
      localStorage.setItem(TENANT_STORAGE_KEY, String(tenant.id))
      applyUiFontScaleIfChanged(readCachedUiFontScale(tenant.id))
    } else {
      localStorage.removeItem(TENANT_STORAGE_KEY)
    }
  }

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (!currentTenant || !user) {
      setMeData(null)
      setSubscriptionExpired(false)
      return
    }
    setSubscriptionExpired(false)
    api.get<{
      role?: string; role_slug?: string; username?: string; email?: string; is_super_admin?: boolean; platform_admin?: boolean; permissions?: string[];
      default_branch_id?: number | null; default_warehouse_id?: number | null;
      restrict_to_branch_warehouse?: boolean;
      tenant_user_id?: number | null;
      subscription_ends_at?: string | null; subscription_status?: string | null; subscription_expired?: boolean;
      plan_features?: string[];
      pricing_group_ids?: number[];
    }>('/me', { headers: { 'X-Tenant-ID': String(currentTenant.id) } })
      .then(({ data }) => {
        const rawPlanFeatures = Array.isArray(data.plan_features) ? data.plan_features : []
        setMeData({
          role: data.role ?? null,
          role_slug: data.role_slug,
          is_super_admin: !!data.is_super_admin,
          platform_admin: !!data.platform_admin,
          username: data.username,
          email: data.email,
          permissions: data.permissions ?? [],
          default_branch_id: data.default_branch_id ?? null,
          default_warehouse_id: data.default_warehouse_id ?? null,
          restrict_to_branch_warehouse: data.restrict_to_branch_warehouse ?? false,
          tenant_user_id: data.tenant_user_id ?? null,
          subscription_ends_at: data.subscription_ends_at ?? null,
          subscription_status: data.subscription_status ?? null,
          subscription_expired: data.subscription_expired ?? false,
          plan_features: expandPlanFeatures(rawPlanFeatures),
          pricing_group_ids: Array.isArray(data.pricing_group_ids) ? data.pricing_group_ids : [],
        })
        setSubscriptionExpired(!!data.subscription_expired)
      })
      .catch((err) => {
        const is402 = err.response?.status === 402 && err.response?.data?.subscription_expired
        setSubscriptionExpired(!!is402)
        setMeData(null)
      })
  }, [currentTenant?.id, user?.id])

  async function checkAuth() {
    try {
      const token = localStorage.getItem('token')
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
        const { data } = await api.get('/user')
        setUser(data)
        const tenantsRes = await api.get('/tenants')
        const tenantsList = tenantsRes.data
        setTenants(tenantsList)
        if (tenantsList.length > 0) {
          const savedId = localStorage.getItem(TENANT_STORAGE_KEY)
          const chosen = savedId ? tenantsList.find((t: Tenant) => t.id === +savedId) : null
          const tenant = chosen ?? tenantsList[0]
          setCurrentTenantState(tenant)
          localStorage.setItem(TENANT_STORAGE_KEY, String(tenant.id))
        } else {
          setCurrentTenantState(null)
          localStorage.removeItem(TENANT_STORAGE_KEY)
        }
      }
    } catch {
      localStorage.removeItem('token')
      localStorage.removeItem(TENANT_STORAGE_KEY)
      setUser(null)
      setTenants([])
      setCurrentTenantState(null)
    } finally {
      setIsLoading(false)
    }
  }

  async function login(company: string, username: string, password: string) {
    const { data } = await api.post<{
      token: string
      user: User
      tenant?: { id: number; name: string; slug: string }
    }>('/login', { company: company.trim(), username: username.trim(), password })
    localStorage.setItem('token', data.token)
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
    setUser(data.user)
    if (data.tenant) {
      setTenants([data.tenant])
      setCurrentTenant(data.tenant)
    } else {
      const tenantsRes = await api.get('/tenants')
      setTenants(tenantsRes.data)
      if (tenantsRes.data.length > 0) setCurrentTenant(tenantsRes.data[0])
    }
  }

  async function logout() {
    try {
      await api.post('/logout')
    } catch {
      // ignore
    }
    localStorage.removeItem('token')
    localStorage.removeItem(TENANT_STORAGE_KEY)
    delete api.defaults.headers.common['Authorization']
    setUser(null)
    setTenants([])
    setCurrentTenantState(null)
    setMeData(null)
    setSubscriptionExpired(false)
  }

  function hasFullPermissions(): boolean {
    return !!meData?.permissions?.includes('*')
  }

  function can(permission: string): boolean {
    if (!meData) return true
    return hasFullPermissions() || meData.permissions.includes(permission)
  }

  function effectivePlanFeatures(): string[] {
    return meData?.plan_features ?? []
  }

  const pathToFeatures: Record<string, string[]> = {
    '/': ['accounting'],
    '/dashboard': ['accounting'],
    '/accounts': ['accounting'],
    '/journal-entries': ['accounting'],
    '/fiscal-years': ['accounting'],
    '/fiscal-years/close': ['accounting'],
    '/receipt-vouchers': ['accounting'],
    '/payment-vouchers': ['accounting'],
    '/payment-methods': ['accounting'],
    '/currencies': ['accounting'],
    '/branches': ['accounting'],
    '/cost-centers': ['accounting'],
    '/settings': ['accounting'],
    '/reports/trial-balance': ['accounting'],
    '/reports/income-statement': ['accounting'],
    '/reports/balance-sheet': ['accounting'],
    '/reports/receipts': ['accounting'],
    '/reports/payments': ['accounting'],
    '/reports/tax-declaration': ['accounting'],
    '/reports/expenses': ['accounting'],
    '/reports/item-sales': ['sales'],
    '/reports/invoice-profits': ['sales'],
    '/reports/branch-sales-annual': ['sales'],
    '/reports/cost-center-sales-annual': ['sales'],
    '/reports/best-selling': ['sales'],
    '/reports/item-purchases': ['purchases'],
    '/reports/monthly-purchases-analysis': ['purchases'],
    '/customers': ['sales'],
    '/invoices/quotations': ['sales'],
    '/invoices/sales': ['sales'],
    '/invoices/pos': ['pos'],
    '/invoices/pos-list': ['pos'],
    '/invoices/purchases': ['purchases'],
    '/vendors': ['purchases'],
    '/vendors/balances': ['purchases'],
    '/vendors/analysis': ['purchases'],
    '/vendors/aging': ['purchases'],
    '/vendors/performance': ['purchases'],
    '/vendor-groups': ['purchases'],
    '/purchase-requests': ['purchases'],
    '/items': ['inventory'],
    '/item-units': ['inventory'],
    '/item-categories': ['inventory'],
    '/item-brands': ['inventory'],
    '/pricing-groups': ['inventory'],
    '/warehouses': ['inventory'],
    '/inventory': ['inventory'],
    '/opening-stock': ['inventory'],
    '/inventory/low-stock': ['inventory'],
    '/inventory/expiry-stock-report': ['inventory'],
    '/inventory/transfers': ['inventory'],
    '/stock-movements': ['inventory'],
    '/reports/serial-numbers-inventory': ['inventory'],
    '/inventory-report': ['inventory'],
    '/inventory/variant-report': ['inventory'],
    '/manufacturing': ['manufacturing'],
    '/manufacturing/bom': ['manufacturing'],
    '/manufacturing/production-orders': ['manufacturing'],
    '/sales-reps': ['sales_reps'],
    '/reports/sales-rep-sales': ['sales_reps'],
    '/reports/sales-reps-monthly-productivity': ['sales_reps'],
  }

  function canAccessFeature(feature: string): boolean {
    if (hasFullPermissions() || meData?.is_super_admin || meData?.role_slug === 'super_admin') {
      return true
    }
    return planAllowsFeature(effectivePlanFeatures(), feature)
  }

  function canAccessPath(path: string): boolean {
    if (hasFullPermissions() || meData?.is_super_admin || meData?.role_slug === 'super_admin') {
      return true
    }
    const expanded = effectivePlanFeatures()
    if (!expanded.length) return true
    const normalized = path.replace(/^\/+/, '').split('/').slice(0, 4).join('/')
    const entries = Object.entries(pathToFeatures).sort((a, b) => b[0].length - a[0].length)
    for (const [prefix, features] of entries) {
      const p = prefix.replace(/^\/+/, '')
      if (normalized === p || normalized.startsWith(p + '/')) {
        return planAllowsAny(expanded, features)
      }
    }
    return true
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        tenants,
        currentTenant,
        setCurrentTenant,
        meData,
        subscriptionExpired,
        can,
        canAccessFeature,
        canAccessPath,
        isPlatformSuperAdmin:
          checkPlatformSuperAdmin(meData) ||
          checkPlatformSuperAdmin(user),
        hasFullTenantAccess:
          checkFullTenantAccess(meData) ||
          checkFullTenantAccess(user),
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
