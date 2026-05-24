import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  deleteRestaurantMenuCategory,
  deleteRestaurantMenuItem,
  fetchRestaurantMenuAdmin,
  saveRestaurantMenuCategory,
  saveRestaurantMenuItem,
  updateRestaurantMenuSettings,
  uploadRestaurantMenuCover,
  type MenuAdminSettings,
  type MenuCategoryPayload,
  type MenuItemPayload,
} from '../../api/restaurantMenu'
import type { MenuCategory, MenuItem } from '../../types/menu'
import { menuCurrencyFromRestaurant } from '../../types/menu'
import { cn } from '../../lib/cn'
import { formatAmountWithSymbol } from '../../utils/currency'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { Plus, Trash2, Edit2, X, Copy, ExternalLink, ImagePlus, UtensilsCrossed, Layers, Package, Eye } from 'lucide-react'

type Tab = 'settings' | 'categories' | 'items'

const emptyCategory = (): Partial<MenuCategory> => ({
  name: '',
  name_en: '',
  icon: '',
  sort_order: 0,
})

const emptyItem = (categoryId?: number): MenuItemPayload => ({
  category_id: categoryId,
  name: '',
  name_en: '',
  description: '',
  price: 0,
  original_price: undefined,
  emoji: '🍽️',
  is_available: true,
  sort_order: 0,
})

export default function MenuBuilderPage() {
  const { currentTenant } = useAuth()
  const { lang } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const isAr = lang === 'ar'

  const [tab, setTab] = useState<Tab>('items')
  const [categoryModal, setCategoryModal] = useState<MenuCategoryPayload | null>(null)
  const [categoryImagePreview, setCategoryImagePreview] = useState<string | null>(null)
  const [itemModal, setItemModal] = useState<MenuItemPayload | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<MenuCategory | null>(null)
  const [deleteItemTarget, setDeleteItemTarget] = useState<MenuItem | null>(null)
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['restaurantMenuAdmin', tenantId],
    queryFn: () => fetchRestaurantMenuAdmin(tenantId),
    enabled: !!tenantId,
  })

  const settingsForm = data?.settings
  const [localSettings, setLocalSettings] = useState<MenuAdminSettings | null>(null)
  const activeSettings = localSettings ?? settingsForm

  const menuUrl = useMemo(() => {
    if (!data?.restaurant.slug) return ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/menu/${data.restaurant.slug}?table=1`
  }, [data?.restaurant.slug])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['restaurantMenuAdmin', tenantId] })

  const settingsMut = useMutation({
    mutationFn: (payload: Partial<MenuAdminSettings>) => updateRestaurantMenuSettings(tenantId, payload),
    onSuccess: () => {
      setLocalSettings(null)
      invalidate()
      setToast({ message: isAr ? 'تم حفظ الإعدادات' : 'Settings saved', type: 'success' })
    },
  })

  const coverMut = useMutation({
    mutationFn: (file: File) => uploadRestaurantMenuCover(tenantId, file),
    onSuccess: () => {
      invalidate()
      setToast({ message: isAr ? 'تم رفع صورة الغلاف' : 'Cover uploaded', type: 'success' })
    },
  })

  const categoryMut = useMutation({
    mutationFn: (payload: MenuCategoryPayload) => saveRestaurantMenuCategory(tenantId, payload),
    onSuccess: () => {
      invalidate()
      setCategoryModal(null)
      setCategoryImagePreview(null)
      setToast({ message: isAr ? 'تم حفظ القسم' : 'Category saved', type: 'success' })
    },
  })

  const itemMut = useMutation({
    mutationFn: (payload: MenuItemPayload) => saveRestaurantMenuItem(tenantId, payload),
    onSuccess: () => {
      invalidate()
      setItemModal(null)
      setItemModalOpen(false)
      setImagePreview(null)
      setToast({ message: isAr ? 'تم حفظ الصنف' : 'Item saved', type: 'success' })
    },
  })

  const deleteCategoryMut = useMutation({
    mutationFn: (id: number) => deleteRestaurantMenuCategory(tenantId, id),
    onSuccess: () => {
      invalidate()
      setDeleteCategoryTarget(null)
    },
    onError: () => setToast({ message: isAr ? 'لا يمكن حذف قسم يحتوي أصنافاً' : 'Cannot delete category with items', type: 'error' }),
  })

  const deleteItemMut = useMutation({
    mutationFn: (id: number) => deleteRestaurantMenuItem(tenantId, id),
    onSuccess: () => {
      invalidate()
      setDeleteItemTarget(null)
    },
  })

  const copyMenuLink = async () => {
    if (!menuUrl) return
    try {
      await navigator.clipboard.writeText(menuUrl)
      setToast({ message: isAr ? 'تم نسخ الرابط' : 'Link copied', type: 'success' })
    } catch {
      setToast({ message: isAr ? 'تعذّر النسخ' : 'Copy failed', type: 'error' })
    }
  }

  const openCategoryCreate = () => {
    setCategoryModal(emptyCategory())
    setCategoryImagePreview(null)
  }

  const openCategoryEdit = (cat: MenuCategory) => {
    setCategoryModal({ ...cat, imageFile: null })
    setCategoryImagePreview(cat.image_url ?? null)
  }

  const openItemEdit = (item: MenuItem) => {
    setItemModal({ ...item, imageFile: null })
    setImagePreview(item.image_url ?? null)
    setItemModalOpen(true)
  }

  const openItemCreate = () => {
    const firstCat = data?.categories[0]?.id
    setItemModal(emptyItem(firstCat))
    setImagePreview(null)
    setItemModalOpen(true)
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-300 border-t-primary-600" />
      </div>
    )
  }

  const categories = data.categories
  const items = data.items
  const menuCurrency = menuCurrencyFromRestaurant(data.restaurant)
  const restaurantName = data.restaurant.name
  const primaryPreview = activeSettings?.primary_color ?? '#10b981'

  return (
    <div className="min-h-full space-y-6 p-4 md:p-6">
      {toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl text-neutral-900">{isAr ? 'إدارة المنيو' : 'Menu management'}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {isAr ? 'تحكم في الأصناف والأسعار والصور — يظهر للعملاء عبر QR' : 'Manage items, prices & photos for the public QR menu'}
          </p>
          <p className="mt-2 text-sm text-neutral-600 break-all">
            <span className="text-neutral-800">{isAr ? 'رابط QR:' : 'QR URL:'}</span>{' '}
            <span className="font-mono text-xs sm:text-sm">{menuUrl}</span>
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={copyMenuLink} className="inline-flex items-center gap-2 rounded-app border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50">
            <Copy className="h-4 w-4" />
            {isAr ? 'نسخ رابط المنيو' : 'Copy menu link'}
          </button>
          <a href={menuUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-app border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50">
            <ExternalLink className="h-4 w-4" />
            {isAr ? 'معاينة' : 'Preview'}
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-app border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-app bg-primary-50 text-primary-700">
              <Layers className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl text-neutral-900">{categories.length}</p>
              <p className="text-xs text-neutral-500">{isAr ? 'أقسام المنيو' : 'Menu categories'}</p>
            </div>
          </div>
        </div>
        <div className="rounded-app border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-app bg-primary-50 text-primary-700">
              <Package className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl text-neutral-900">{items.length}</p>
              <p className="text-xs text-neutral-500">{isAr ? 'أصناف منشورة' : 'Menu items'}</p>
            </div>
          </div>
        </div>
        <div className="rounded-app border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-app bg-primary-50 text-primary-700">
              <UtensilsCrossed className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm text-neutral-900">{restaurantName}</p>
              <p className="text-xs text-neutral-500">{isAr ? 'اسم المنيو' : 'Menu title'}</p>
            </div>
          </div>
        </div>
        <div className="rounded-app border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <span className={cn(
              'flex h-10 w-10 items-center justify-center rounded-app',
              activeSettings?.is_published ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
            )}>
              <Eye className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-neutral-900">
                {activeSettings?.is_published
                  ? (isAr ? 'منشور للعملاء' : 'Published')
                  : (isAr ? 'مخفي عن العملاء' : 'Hidden')}
              </p>
              <p className="text-xs text-neutral-500">{isAr ? 'حالة المنيو' : 'Menu status'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-neutral-200">
        {(['settings', 'categories', 'items'] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'border-b-2 px-4 py-2 text-sm transition',
              tab === key ? 'border-primary-600 text-primary-700' : 'border-transparent text-neutral-500 hover:text-neutral-800',
            )}
          >
            {key === 'settings' ? (isAr ? 'الإعدادات' : 'Settings') : key === 'categories' ? (isAr ? 'الأقسام' : 'Categories') : (isAr ? 'الأصناف' : 'Items')}
          </button>
        ))}
      </div>

      {tab === 'settings' && activeSettings ? (
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-4 rounded-app border border-neutral-200 bg-white p-4 lg:col-span-1 xl:col-span-2">
            <h2 className="text-base text-neutral-900">{isAr ? 'إعدادات المنيو' : 'Menu settings'}</h2>
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-700">{isAr ? 'لون المنيو' : 'Menu accent color'}</span>
              <div className="flex gap-3">
                <input
                  type="color"
                  value={activeSettings.primary_color}
                  onChange={(e) => setLocalSettings({ ...activeSettings, primary_color: e.target.value })}
                  className="h-11 w-16 shrink-0 cursor-pointer rounded-app border border-neutral-200"
                />
                <input
                  type="text"
                  value={activeSettings.primary_color}
                  onChange={(e) => setLocalSettings({ ...activeSettings, primary_color: e.target.value })}
                  className="min-w-0 flex-1 rounded-app border border-neutral-200 px-3 py-2 text-sm font-mono"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-700">{isAr ? 'رسوم الخدمة %' : 'Service charge %'}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={activeSettings.service_charge_percent}
                onChange={(e) => setLocalSettings({ ...activeSettings, service_charge_percent: Number(e.target.value) })}
                className="w-full rounded-app border border-neutral-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 rounded-app border border-neutral-100 bg-neutral-50 px-3 py-3 text-sm">
              <input
                type="checkbox"
                checked={activeSettings.is_published}
                onChange={(e) => setLocalSettings({ ...activeSettings, is_published: e.target.checked })}
                className="h-4 w-4"
              />
              {isAr ? 'المنيو منشور للعملاء' : 'Menu published for customers'}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-700">{isAr ? 'صورة الغلاف' : 'Cover image'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) coverMut.mutate(f)
                }}
                className="w-full text-sm"
              />
            </label>
            <button
              type="button"
              disabled={settingsMut.isPending || !localSettings}
              onClick={() => localSettings && settingsMut.mutate(localSettings)}
              className="w-full rounded-app bg-primary-600 px-4 py-2.5 text-sm text-white disabled:opacity-50"
            >
              {isAr ? 'حفظ الإعدادات' : 'Save settings'}
            </button>
          </div>

          <div className="overflow-hidden rounded-app border border-neutral-200 bg-white lg:col-span-1 xl:col-span-3">
            <div className="border-b border-neutral-100 px-4 py-3">
              <h2 className="text-base text-neutral-900">{isAr ? 'معاينة شكل المنيو للعميل' : 'Customer menu preview'}</h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                {isAr ? 'هكذا يظهر الهيدر عند مسح QR' : 'How the header looks when customers scan QR'}
              </p>
            </div>
            <div className="bg-neutral-100 p-4 sm:p-6">
              <div className="mx-auto max-w-md overflow-hidden rounded-app shadow-md">
                <div
                  className="relative px-4 py-5 text-white"
                  style={{ backgroundColor: primaryPreview }}
                >
                  {activeSettings.cover_url ? (
                    <div
                      className="absolute inset-0 bg-cover bg-center opacity-25"
                      style={{ backgroundImage: `url(${activeSettings.cover_url})` }}
                    />
                  ) : null}
                  <div className="relative flex items-center gap-3">
                    {data.restaurant.logo_url ? (
                      <img
                        src={data.restaurant.logo_url}
                        alt=""
                        className="h-12 w-12 rounded-app border-2 border-white/30 object-cover"
                      />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-app bg-white/20 text-2xl">🍽️</span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-lg">{restaurantName}</p>
                      <p className="text-sm text-white/85">{isAr ? 'طاولة 1' : 'Table 1'}</p>
                    </div>
                    <span className="ms-auto shrink-0 rounded-app border border-white/40 bg-white/15 px-2 py-1 text-xs">
                      EN
                    </span>
                  </div>
                </div>
                <div className="border-b border-neutral-200 bg-white px-3 py-2">
                  <div className="flex gap-2 overflow-x-auto">
                    {categories.length > 0 ? (
                      categories.slice(0, 4).map((cat, i) => (
                        <span
                          key={cat.id}
                          className={cn(
                            'shrink-0 rounded-full px-3 py-1.5 text-xs',
                            i === 0 ? 'text-white' : 'bg-neutral-100 text-neutral-600',
                          )}
                          style={i === 0 ? { backgroundColor: primaryPreview } : undefined}
                        >
                          {cat.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-neutral-400">{isAr ? 'لا توجد أقسام بعد' : 'No categories yet'}</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 bg-neutral-50 p-3">
                  {items.length > 0 ? (
                    items.slice(0, 4).map((item) => (
                      <div key={item.id} className="overflow-hidden rounded-app border border-neutral-200 bg-white">
                        <div className="flex aspect-[4/3] items-center justify-center bg-neutral-100 text-2xl">
                          {item.image_url ? (
                            <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            item.emoji || '🍽️'
                          )}
                        </div>
                        <div className="p-2">
                          <p className="truncate text-xs text-neutral-900">{item.name}</p>
                          <p className="text-xs text-neutral-500">{formatAmountWithSymbol(item.price, menuCurrency)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-2 py-8 text-center text-xs text-neutral-400">
                      {isAr ? 'أضف أصنافاً من تبويب الأصناف' : 'Add items from the Items tab'}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {activeSettings.cover_url ? (
              <div className="border-t border-neutral-100 px-4 py-3">
                <p className="mb-2 text-xs text-neutral-500">{isAr ? 'صورة الغلاف الحالية' : 'Current cover'}</p>
                <img src={activeSettings.cover_url} alt="" className="h-32 w-full rounded-app object-cover sm:h-40" />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'categories' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-600">
              {isAr ? `${categories.length} قسم` : `${categories.length} categories`}
            </p>
            <button type="button" onClick={openCategoryCreate} className="inline-flex items-center gap-2 rounded-app bg-primary-600 px-4 py-2 text-sm text-white">
              <Plus className="h-4 w-4" />
              {isAr ? 'قسم جديد' : 'New category'}
            </button>
          </div>
          {categories.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-app border border-dashed border-neutral-300 bg-white p-8 text-center">
              <Layers className="h-12 w-12 text-neutral-300" />
              <p className="mt-4 text-neutral-700">{isAr ? 'لا توجد أقسام بعد' : 'No categories yet'}</p>
              <p className="mt-1 text-sm text-neutral-500">{isAr ? 'ابدأ بإضافة قسم مثل: مشروبات، أطباق رئيسية' : 'Start with sections like Drinks, Main dishes'}</p>
              <button type="button" onClick={openCategoryCreate} className="mt-4 inline-flex items-center gap-2 rounded-app bg-primary-600 px-4 py-2 text-sm text-white">
                <Plus className="h-4 w-4" />
                {isAr ? 'إضافة أول قسم' : 'Add first category'}
              </button>
            </div>
          ) : (
          <div className="overflow-x-auto rounded-app border border-neutral-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-4 py-3 text-start">{isAr ? 'الصورة' : 'Image'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'الاسم' : 'Name'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'الاسم EN' : 'Name EN'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'الترتيب' : 'Order'}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id} className="border-t border-neutral-100">
                    <td className="px-4 py-3">
                      <div className="h-10 w-10 overflow-hidden rounded-app bg-neutral-100">
                        {cat.image_url ? (
                          <img src={cat.image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-lg">{cat.icon || '📁'}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{cat.name}</td>
                    <td className="px-4 py-3">{cat.name_en || '—'}</td>
                    <td className="px-4 py-3">{cat.sort_order}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => openCategoryEdit(cat)} className="rounded-app p-1.5 text-neutral-600 hover:bg-neutral-100"><Edit2 className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setDeleteCategoryTarget(cat)} className="rounded-app p-1.5 text-danger-600 hover:bg-danger-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      ) : null}

      {tab === 'items' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-600">
              {isAr ? `${items.length} صنف` : `${items.length} items`}
            </p>
            <button type="button" onClick={openItemCreate} disabled={categories.length === 0} className="inline-flex items-center gap-2 rounded-app bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              <Plus className="h-4 w-4" />
              {isAr ? 'صنف جديد' : 'New item'}
            </button>
          </div>
          {categories.length === 0 ? (
            <div className="rounded-app border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {isAr ? 'أضف قسماً أولاً من تبويب الأقسام' : 'Add a category first from the Categories tab'}
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-app border border-dashed border-neutral-300 bg-white p-8 text-center">
              <Package className="h-12 w-12 text-neutral-300" />
              <p className="mt-4 text-neutral-700">{isAr ? 'لا توجد أصناف بعد' : 'No items yet'}</p>
              <button type="button" onClick={openItemCreate} className="mt-4 inline-flex items-center gap-2 rounded-app bg-primary-600 px-4 py-2 text-sm text-white">
                <Plus className="h-4 w-4" />
                {isAr ? 'إضافة أول صنف' : 'Add first item'}
              </button>
            </div>
          ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {items.map((item) => {
              const cat = categories.find((c) => c.id === item.category_id)
              return (
                <article key={item.id} className="overflow-hidden rounded-app border border-neutral-200 bg-white">
                  <div className="aspect-[4/3] bg-neutral-100">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-4xl">{item.emoji || '🍽️'}</div>
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="text-sm text-neutral-900">{item.name}</p>
                    <p className="text-xs text-neutral-500">{cat?.name}</p>
                    <p className="text-sm text-primary-700">{formatAmountWithSymbol(item.price, menuCurrency)}</p>
                    {!item.is_available ? <span className="text-xs text-danger-600">{isAr ? 'غير متاح' : 'Unavailable'}</span> : null}
                    <div className="flex gap-2 pt-2">
                      <button type="button" onClick={() => openItemEdit(item)} className="rounded-app border border-neutral-200 px-2 py-1 text-xs">{isAr ? 'تعديل' : 'Edit'}</button>
                      <button type="button" onClick={() => setDeleteItemTarget(item)} className="rounded-app border border-danger-200 px-2 py-1 text-xs text-danger-600">{isAr ? 'حذف' : 'Delete'}</button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          )}
        </div>
      ) : null}

      {categoryModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-app bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base">{categoryModal.id ? (isAr ? 'تعديل قسم' : 'Edit category') : (isAr ? 'قسم جديد' : 'New category')}</h2>
              <button type="button" onClick={() => { setCategoryModal(null); setCategoryImagePreview(null) }}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder={isAr ? 'الاسم' : 'Name'} value={categoryModal.name ?? ''} onChange={(e) => setCategoryModal({ ...categoryModal, name: e.target.value })} className="w-full rounded-app border px-3 py-2 text-sm" />
              <input placeholder="Name EN" value={categoryModal.name_en ?? ''} onChange={(e) => setCategoryModal({ ...categoryModal, name_en: e.target.value })} className="w-full rounded-app border px-3 py-2 text-sm" />
              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-sm text-neutral-600"><ImagePlus className="h-4 w-4" />{isAr ? 'صورة القسم' : 'Category image'}</span>
                <input type="file" accept="image/*" onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    setCategoryModal({ ...categoryModal, imageFile: f })
                    setCategoryImagePreview(URL.createObjectURL(f))
                  }
                }} className="text-sm" />
                {categoryImagePreview ? <img src={categoryImagePreview} alt="" className="mt-2 h-32 w-full rounded-app object-cover" /> : null}
              </label>
              <input placeholder={isAr ? 'أيقونة / emoji (اختياري)' : 'Icon / emoji (optional)'} value={categoryModal.icon ?? ''} onChange={(e) => setCategoryModal({ ...categoryModal, icon: e.target.value })} className="w-full rounded-app border px-3 py-2 text-sm" />
              <input type="number" placeholder={isAr ? 'الترتيب' : 'Sort order'} value={categoryModal.sort_order ?? 0} onChange={(e) => setCategoryModal({ ...categoryModal, sort_order: Number(e.target.value) })} className="w-full rounded-app border px-3 py-2 text-sm" />
              <button type="button" disabled={categoryMut.isPending || !categoryModal.name?.trim()} onClick={() => categoryMut.mutate(categoryModal)} className="w-full rounded-app bg-primary-600 py-2 text-sm text-white disabled:opacity-50">
                {isAr ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {itemModalOpen && itemModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-app bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base">{itemModal.id ? (isAr ? 'تعديل صنف' : 'Edit item') : (isAr ? 'صنف جديد' : 'New item')}</h2>
              <button type="button" onClick={() => { setItemModalOpen(false); setItemModal(null) }}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <select value={itemModal.category_id ?? ''} onChange={(e) => setItemModal({ ...itemModal, category_id: Number(e.target.value) })} className="w-full rounded-app border px-3 py-2 text-sm">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input placeholder={isAr ? 'الاسم' : 'Name'} value={itemModal.name ?? ''} onChange={(e) => setItemModal({ ...itemModal, name: e.target.value })} className="w-full rounded-app border px-3 py-2 text-sm" />
              <input placeholder="Name EN" value={itemModal.name_en ?? ''} onChange={(e) => setItemModal({ ...itemModal, name_en: e.target.value })} className="w-full rounded-app border px-3 py-2 text-sm" />
              <textarea placeholder={isAr ? 'الوصف' : 'Description'} value={itemModal.description ?? ''} onChange={(e) => setItemModal({ ...itemModal, description: e.target.value })} className="w-full rounded-app border px-3 py-2 text-sm" rows={2} />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min={0} step="0.01" placeholder={isAr ? 'السعر' : 'Price'} value={itemModal.price ?? 0} onChange={(e) => setItemModal({ ...itemModal, price: Number(e.target.value) })} className="rounded-app border px-3 py-2 text-sm" />
                <input type="number" min={0} step="0.01" placeholder={isAr ? 'السعر قبل الخصم' : 'Original price'} value={itemModal.original_price ?? ''} onChange={(e) => setItemModal({ ...itemModal, original_price: e.target.value ? Number(e.target.value) : undefined })} className="rounded-app border px-3 py-2 text-sm" />
              </div>
              <input placeholder="Emoji" value={itemModal.emoji ?? ''} onChange={(e) => setItemModal({ ...itemModal, emoji: e.target.value })} className="w-full rounded-app border px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={itemModal.is_available !== false} onChange={(e) => setItemModal({ ...itemModal, is_available: e.target.checked })} />
                {isAr ? 'متاح للطلب' : 'Available'}
              </label>
              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-sm text-neutral-600"><ImagePlus className="h-4 w-4" />{isAr ? 'صورة الصنف' : 'Item image'}</span>
                <input type="file" accept="image/*" onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    setItemModal({ ...itemModal, imageFile: f })
                    setImagePreview(URL.createObjectURL(f))
                  }
                }} className="text-sm" />
                {imagePreview ? <img src={imagePreview} alt="" className="mt-2 h-32 w-full rounded-app object-cover" /> : null}
              </label>
              <button type="button" disabled={itemMut.isPending || !itemModal.name?.trim() || !itemModal.category_id} onClick={() => itemMut.mutate(itemModal)} className="w-full rounded-app bg-primary-600 py-2 text-sm text-white disabled:opacity-50">
                {isAr ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteCategoryTarget ? (
        <ConfirmDialog
          title={isAr ? 'حذف القسم؟' : 'Delete category?'}
          message={deleteCategoryTarget.name}
          confirmLabel={isAr ? 'حذف' : 'Delete'}
          cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
          onConfirm={() => deleteCategoryMut.mutate(deleteCategoryTarget.id)}
          onCancel={() => setDeleteCategoryTarget(null)}
          variant="danger"
        />
      ) : null}

      {deleteItemTarget ? (
        <ConfirmDialog
          title={isAr ? 'حذف الصنف؟' : 'Delete item?'}
          message={deleteItemTarget.name}
          confirmLabel={isAr ? 'حذف' : 'Delete'}
          cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
          onConfirm={() => deleteItemMut.mutate(deleteItemTarget.id)}
          onCancel={() => setDeleteItemTarget(null)}
          variant="danger"
        />
      ) : null}
    </div>
  )
}
