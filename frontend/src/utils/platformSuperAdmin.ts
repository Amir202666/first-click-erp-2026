/** مالك المنصة فقط — وليس مدير الشركة بصلاحيات كاملة */
export type PlatformSuperAdminMe = {
  role_slug?: string
  is_super_admin?: boolean
} | null | undefined

const PLATFORM_OWNER_USERNAMES = ['firstclick-erp', 'firstclick-admin']

export function isPlatformSuperAdmin(me: PlatformSuperAdminMe): boolean {
  if (me?.role_slug === 'super_admin' || !!me?.is_super_admin) {
    return true
  }
  const username = (me as { username?: string } | null | undefined)?.username
  return !!username && PLATFORM_OWNER_USERNAMES.includes(username)
}
