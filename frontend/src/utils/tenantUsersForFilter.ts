/**
 * ترتيب قائمة مستخدمي الشركة للفلتر: أولاً المدير/الأدمن، ثم باقي المستخدمين حسب الاسم.
 * يُستخدم في شاشات الفواتير والتقارير حيث تظهر خانة "المستخدم".
 */
export type UserForFilter = {
  id: number
  name: string
  email?: string
  pivot?: { role?: string; role_name?: string }
}

export function sortUsersForFilter<T extends UserForFilter>(users: T[]): T[] {
  if (!users.length) return users
  const roleSlug = (u: T) => (u.pivot?.role ?? '').toLowerCase()
  const isAdmin = (u: T) => {
    const slug = roleSlug(u)
    const name = (u.pivot?.role_name ?? '').toLowerCase()
    return slug === 'admin' || slug === 'owner' || name.includes('مدير') || name.includes('admin')
  }
  const byName = (a: T, b: T) => (a.name || '').localeCompare(b.name || '', 'ar')
  const admins = users.filter(isAdmin).sort(byName)
  const rest = users.filter((u) => !isAdmin(u)).sort(byName)
  return [...admins, ...rest]
}
