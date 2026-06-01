/** مالك المنصة فقط — وليس مدير الشركة بصلاحيات كاملة */
export type PlatformSuperAdminMe = {
  role_slug?: string
  is_super_admin?: boolean
} | null | undefined

const PLATFORM_OWNER_USERNAMES = ['firstclick-erp', 'firstclick-admin']
const PLATFORM_OWNER_EMAILS = ['owner@firstclick-erp.com', 'admin@firstclickerp.com']

export function isPlatformSuperAdmin(me: PlatformSuperAdminMe): boolean {
  if ((me as { platform_admin?: boolean } | null | undefined)?.platform_admin) {
    return true
  }
  if (me?.role_slug === 'super_admin' || !!me?.is_super_admin) {
    return true
  }
  const username = (me as { username?: string } | null | undefined)?.username
  if (username && PLATFORM_OWNER_USERNAMES.includes(username)) {
    return true
  }
  const email = (me as { email?: string } | null | undefined)?.email
  return !!email && PLATFORM_OWNER_EMAILS.includes(email.toLowerCase())
}

/** مدير شركة بصلاحيات كاملة — يرى كل قوائم الشركة (ما عدا إدارة المنصة) */
export function hasFullTenantAccess(me: PlatformSuperAdminMe & { permissions?: string[] } | null | undefined): boolean {
  if (isPlatformSuperAdmin(me)) return true
  return !!me?.permissions?.includes('*')
}
