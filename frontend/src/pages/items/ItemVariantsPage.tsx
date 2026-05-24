import { useMemo, useState } from 'react'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { createItemAttributeTemplate, fetchItemAttributeTemplates } from '../../api/tenant'
import { formatDisplayDate } from '../../utils/date'
import Toast, { type ToastType } from '../../components/ui/Toast'
import type { ItemAttributeTemplate } from '../../types'

export default function ItemVariantsPage() {
  const { t, lang, isRtl } = useLanguage()
  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [valuesText, setValuesText] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tagValues, setTagValues] = useState<string[]>([])
  const [editingTemplate, setEditingTemplate] = useState<ItemAttributeTemplate | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [variantFilter, setVariantFilter] = useState('')

  const { data, isLoading } = useQuery<ItemAttributeTemplate[]>({
    queryKey: ['item-attribute-templates', tenantId],
    queryFn: () => fetchItemAttributeTemplates(tenantId),
    enabled: !!tenantId,
  })

  const createMut = useMutation({
    mutationFn: ({ name, values }: { name: string; values: string[] }) =>
      createItemAttributeTemplate(tenantId, { name, values }),
    onSuccess: () => {
      setShowModal(false)
      setName('')
      setValuesText('')
      setTagInput('')
      setTagValues([])
      setEditingTemplate(null)
      setToast({
        message: lang === 'ar' ? 'تم حفظ الخاصية بنجاح.' : 'Attribute saved successfully.',
        type: 'success',
      })
      queryClient.invalidateQueries({ queryKey: ['item-attribute-templates', tenantId] })
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        (lang === 'ar' ? 'تعذر حفظ الخاصية. يرجى المحاولة لاحقاً.' : 'Could not save attribute. Please try again.')
      setToast({
        message: msg,
        type: 'error',
      })
    },
  })

  const templates = data ?? []

  const rows = useMemo(
    () =>
      templates
        .map((tpl) => {
          const createdAt = tpl.created_at ? formatDisplayDate(tpl.created_at) : ''
          return {
            key: tpl.id,
            name: tpl.name,
            values: (tpl.values ?? []).map((v) => v.value),
            createdAt,
          }
        })
        .filter((row) => {
          if (!variantFilter) return true
          return row.name === variantFilter
        }),
    [templates, variantFilter],
  )

  type VariantRow = (typeof rows)[number]
  type VariantSortKey = 'name' | 'values' | 'createdAt'
  const variantSortColumns = useMemo((): SortColumn<VariantRow, VariantSortKey>[] => {
    return [
      { key: 'name', type: 'string', getValue: (r) => r.name ?? '' },
      { key: 'values', type: 'string', getValue: (r) => r.values.join('\u0001') },
      { key: 'createdAt', type: 'string', getValue: (r) => r.createdAt ?? '' },
    ]
  }, [])
  const variantSortLocale = lang === 'ar' ? 'ar' : 'en'
  const { sort, toggleSort, sortedRows } = useClientSort<VariantRow, VariantSortKey>(rows, variantSortColumns, {
    locale: variantSortLocale,
  })

  return (
    <div className="p-4 space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-xl font-semibold text-slate-800">
          {lang === 'ar' ? 'قوالب خصائص المتغيرات' : 'Variant attribute templates'}
        </h1>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={variantFilter}
            onChange={(e) => setVariantFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none min-w-[220px]"
            aria-label={lang === 'ar' ? 'تصفية حسب اسم الخاصية' : 'Filter by attribute name'}
            title={lang === 'ar' ? 'كل المتغيرات أو اختيار خاصية' : 'All variants or select an attribute'}
          >
            <option value="">
              {lang === 'ar' ? 'كل المتغيرات' : 'All variants'}
            </option>
            {Array.from(new Set(templates.map((t) => t.name))).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingTemplate(null)
            setName('')
            setTagInput('')
            setTagValues([])
            setValuesText('')
            setShowModal(true)
          }}
          className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-500"
        >
          {lang === 'ar' ? 'إنشاء خاصية جديدة' : 'New attribute'}
        </button>
      </div>

      {isLoading && (
        <div className="py-10 text-center text-slate-500 text-sm">
          {lang === 'ar' ? 'جارِ تحميل المتغيرات...' : 'Loading variants...'}
        </div>
      )}

      {!isLoading && sortedRows.length === 0 && (
        <div className="py-10 text-center text-slate-500 text-sm border border-dashed border-slate-300 rounded-xl">
          {lang === 'ar'
            ? 'لا توجد خصائص معرفة بعد. اضغط على زر إنشاء خاصية جديدة لإضافة أول خاصية.'
            : 'No attributes defined yet. Click “New attribute” to add your first one.'}
        </div>
      )}

      {!isLoading && sortedRows.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="min-w-full text-sm table-fixed">
            <thead className="bg-slate-50">
              <tr>
                <SortableTh
                  label={lang === 'ar' ? 'اسم الخاصية' : 'Attribute name'}
                  sortKey="name"
                  sortState={sort}
                  onToggle={toggleSort}
                  className="px-0 py-0 text-start"
                />
                <SortableTh
                  label={lang === 'ar' ? 'القيم' : 'Values'}
                  sortKey="values"
                  sortState={sort}
                  onToggle={toggleSort}
                  className="px-0 py-0 text-start"
                />
                <SortableTh
                  label={lang === 'ar' ? 'تاريخ الإنشاء' : 'Created at'}
                  sortKey="createdAt"
                  sortState={sort}
                  onToggle={toggleSort}
                  className="px-0 py-0 text-start"
                />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr
                  key={r.key}
                  className="border-t border-slate-200 hover:bg-slate-50 cursor-pointer"
                  onClick={() => {
                    const tpl = templates.find((t) => t.id === r.key)
                    if (!tpl) return
                    setEditingTemplate(tpl)
                    setName(tpl.name)
                    setTagValues((tpl.values ?? []).map((v) => v.value))
                    setTagInput('')
                    setValuesText('')
                    setShowModal(true)
                  }}
                >
                  <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.values.length === 0 && (
                        <span className="text-xs text-slate-400">
                          {lang === 'ar' ? 'لا توجد قيم' : 'No values'}
                        </span>
                      )}
                      {r.values.map((val) => (
                        <span
                          key={val}
                          className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-100"
                        >
                          {val}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.createdAt ? r.createdAt : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => {
            if (!createMut.isPending) setShowModal(false)
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">
              {lang === 'ar' ? 'إنشاء خاصية جديدة' : 'Create new attribute'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {lang === 'ar' ? 'اسم الخاصية' : 'Attribute name'}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  placeholder={lang === 'ar' ? 'مثال: اللون، المقاس' : 'e.g. Color, Size'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {lang === 'ar' ? 'القيم (كـ Tags)' : 'Values (as tags)'}
                </label>
                <div className="border border-slate-300 rounded-lg px-2 py-1 text-sm flex flex-wrap gap-1 bg-white">
                  {tagValues.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-100 text-xs"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() =>
                          setTagValues((prev) => prev.filter((t) => t !== tag))
                        }
                        className="text-primary-700 hover:text-primary-900"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        const raw = tagInput.trim()
                        if (!raw) return
                        setTagValues((prev) =>
                          prev.includes(raw) ? prev : [...prev, raw],
                        )
                        setTagInput('')
                      }
                    }}
                    placeholder={
                      tagValues.length === 0
                        ? lang === 'ar'
                          ? 'اكتب القيمة ثم اضغط Enter لإضافتها'
                          : 'Type value then press Enter'
                        : ''
                    }
                    className="flex-1 min-w-[120px] border-none outline-none bg-transparent py-1 px-1"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {lang === 'ar'
                    ? 'اكتب القيمة واضغط Enter لتحويلها إلى وسم (Tag).'
                    : 'Type a value and press Enter to add it as a tag.'}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (!createMut.isPending) setShowModal(false)
                }}
                className="px-4 py-2 text-sm rounded-lg border border-slate-300"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={
                  !name.trim() ||
                  (tagValues.length === 0 && !tagInput.trim() && !valuesText.trim()) ||
                  createMut.isPending
                }
                onClick={() => {
                  const normalizedName = name.trim()

                  const allTags: string[] = [...tagValues]
                  if (tagInput.trim()) allTags.push(tagInput.trim())
                  const base =
                    allTags.length > 0
                      ? allTags
                      : valuesText
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean)
                  const values = Array.from(new Set(base))
                  if (!name.trim() || values.length === 0) return
                  createMut.mutate({ name: normalizedName, values })
                }}
                className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white font-medium disabled:opacity-50"
              >
                {createMut.isPending
                  ? lang === 'ar'
                    ? 'جارِ الحفظ...'
                    : 'Saving...'
                  : lang === 'ar'
                    ? 'حفظ'
                    : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          dir={isRtl ? 'rtl' : 'ltr'}
        />
      )}
    </div>
  )
}

