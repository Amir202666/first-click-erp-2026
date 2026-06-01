/** مالك المنصة فقط — وليس مدير الشركة بصلاحيات كاملة */
export type PlatformSuperAdminMe = {
  role_slug?: string
  is_super_admin?: boolean
} | null | undefined

export function isPlatformSuperAdmin(me: PlatformSuperAdminMe): boolean {
  return me?.role_slug === 'super_admin' || !!me?.is_super_admin
}
