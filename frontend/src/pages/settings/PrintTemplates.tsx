import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  createPrintTemplate,
  deletePrintTemplate,
  duplicatePrintTemplate,
  printTemplatesApi,
  clearAllPrintTemplates,
  seedPrintTemplates,
  setDefaultPrintTemplate,
} from '../../api/printTemplates'
import type { PrintDocumentType, PrintPaperSize, PrintTemplate } from '../../types/printTemplate'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { LayoutGrid, List as ListIcon, Printer, Search } from 'lucide-react'
import {
  type ImportPreviewData,
  normalizeDocumentType,
  normalizePaperSize,
  parseImportTemplateFile,
} from '../../utils/printTemplateFileImport'

function apiErrorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message
    if (msg && String(msg).trim()) return String(msg)
  }
  return fallback
}

const DOC_TYPES = [
  { key: 'all', labelAr: 'الكل', labelEn: 'All', color: '#64748b', icon: '🗂' },
  { key: 'invoice', labelAr: 'فواتير المبيعات', labelEn: 'Sales invoices', color: '#4f46e5', icon: '🧾' },
  { key: 'receipt', labelAr: 'سندات القبض', labelEn: 'Receipts', color: '#059669', icon: '💚' },
  { key: 'payment', labelAr: 'سندات الصرف', labelEn: 'Payments', color: '#dc2626', icon: '❤' },
  { key: 'journal', labelAr: 'القيود اليومية', labelEn: 'Journal entries', color: '#7c3aed', icon: '📒' },
  { key: 'purchase', labelAr: 'فواتير المشتريات', labelEn: 'Purchases', color: '#d97706', icon: '🛒' },
  { key: 'pos', labelAr: 'إيصالات POS', labelEn: 'POS receipts', color: '#0891b2', icon: '🖨' },
  { key: 'inventory', labelAr: 'تسوية مخزنية', labelEn: 'Inventory', color: '#0e7490', icon: '📦' },
] as const

const TYPE_BG: Record<string, string> = {
  invoice: '#ede9fe',
  receipt: '#ecfdf5',
  payment: '#fef2f2',
  journal: '#f5f3ff',
  purchase: '#fffbeb',
  pos: '#f0f9ff',
  inventory: '#ecfeff',
}

const LAYOUT_LABEL_AR: Record<string, string> = {
  classic: 'كلاسيك',
  modern: 'عصري',
  minimal: 'مينيمال',
  zatca: 'ZATCA',
  pro: 'احترافي',
  simple: 'مبسط',
  thermal: 'حراري',
  restaurant: 'مطعم',
  ecommerce: 'إلكتروني',
  po: 'أمر شراء',
  detailed: 'تفصيلي',
}

const LAYOUT_LABEL_EN: Record<string, string> = {
  classic: 'Classic',
  modern: 'Modern',
  minimal: 'Minimal',
  zatca: 'ZATCA',
  pro: 'Pro',
  simple: 'Simple',
  thermal: 'Thermal',
  restaurant: 'Restaurant',
  ecommerce: 'E‑commerce',
  po: 'PO',
  detailed: 'Detailed',
}

function layoutLabel(layout: string | undefined, ar: boolean): string {
  if (!layout) return ar ? 'كلاسيك' : 'Classic'
  return ar ? LAYOUT_LABEL_AR[layout] ?? layout : LAYOUT_LABEL_EN[layout] ?? layout
}

const EnhancedThumbnail: React.FC<{
  accent: string
  bg: string
  docType: string
  paperSize: string
  layout: string
}> = ({ accent, bg, docType, paperSize, layout }) => {
  const isThermal = paperSize?.includes('thermal')
  const w = isThermal ? 65 : 108
  const h = isThermal ? 140 : 148

  const renderContent = () => {
    if (docType === 'pos' && isThermal) {
      return (
        <>
          <div style={{ height: 6, background: accent, borderRadius: 2, marginBottom: 4 }} />
          <div style={{ height: 1, borderTop: '1px dashed #d1d5db', margin: '3px 0' }} />
          <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, marginBottom: 2 }} />
          <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, marginBottom: 2, width: '80%' }} />
          <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, marginBottom: 4, width: '90%' }} />
          <div style={{ height: 1, borderTop: '2px solid #374151', margin: '3px 0' }} />
          <div style={{ height: 8, background: '#374151', borderRadius: 2, width: '60%', margin: '0 auto' }} />
          <div style={{ height: 1, borderTop: '1px dashed #d1d5db', margin: '4px 0' }} />
          <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, width: '70%', margin: '0 auto' }} />
        </>
      )
    }

    if (docType === 'journal') {
      return (
        <>
          <div style={{ height: layout === 'detailed' ? 16 : 12, background: accent, borderRadius: 2, marginBottom: 6 }} />
          <div style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
            <div style={{ flex: 1, height: 4, background: '#e5e7eb', borderRadius: 1 }} />
            <div style={{ flex: 1, height: 4, background: '#e5e7eb', borderRadius: 1 }} />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 2 }}>
              <div
                style={{
                  flex: 1,
                  height: 3,
                  background: i % 2 === 0 ? '#dcfce7' : '#fee2e2',
                  borderRadius: 1,
                }}
              />
              <div style={{ flex: 1, height: 3, background: '#f3f4f6', borderRadius: 1 }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
            <div style={{ width: 24, height: 4, background: accent, borderRadius: 1, opacity: 0.7 }} />
            <div style={{ width: 24, height: 4, background: accent, borderRadius: 1, opacity: 0.7 }} />
          </div>
        </>
      )
    }

    if (docType === 'receipt' || docType === 'payment') {
      return (
        <>
          <div style={{ height: layout === 'pro' ? 20 : 12, background: accent, borderRadius: 2, marginBottom: 5 }} />
          <div style={{ height: 3, background: '#e5e7eb', borderRadius: 1, marginBottom: 2, width: '75%' }} />
          <div style={{ height: 3, background: '#e5e7eb', borderRadius: 1, marginBottom: 6, width: '55%' }} />
          <div
            style={{
              height: 14,
              background: accent,
              borderRadius: 2,
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 32, height: 2, background: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />
          </div>
          {[0, 1].map((i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <div style={{ width: '50%', height: 3, background: '#f3f4f6', borderRadius: 1 }} />
              <div style={{ width: '30%', height: 3, background: '#f3f4f6', borderRadius: 1 }} />
            </div>
          ))}
          <div style={{ marginTop: 6, height: 1, borderTop: '1px dashed #d1d5db' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
            <div style={{ width: '40%', height: 4, background: accent, borderRadius: 1, opacity: 0.8 }} />
            <div style={{ width: '30%', height: 4, background: accent, borderRadius: 1 }} />
          </div>
        </>
      )
    }

    return (
      <>
        <div
          style={{
            height: layout === 'minimal' ? 6 : layout === 'modern' ? 22 : 14,
            background: accent,
            borderRadius: 2,
            marginBottom: 5,
            display: 'flex',
            alignItems: 'center',
            padding: '0 4px',
          }}
        >
          {layout !== 'minimal' && (
            <div style={{ width: 18, height: 3, background: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
          <div style={{ flex: 1, height: 18, background: `${accent}18`, borderRadius: 3, padding: 3 }}>
            <div style={{ height: 2, background: '#d1d5db', borderRadius: 1, marginBottom: 2 }} />
            <div style={{ height: 2, background: '#d1d5db', borderRadius: 1, width: '70%' }} />
          </div>
          <div style={{ flex: 1, height: 18, background: '#f9fafb', borderRadius: 3, padding: 3 }}>
            <div style={{ height: 2, background: '#d1d5db', borderRadius: 1, marginBottom: 2 }} />
            <div style={{ height: 2, background: '#d1d5db', borderRadius: 1, width: '60%' }} />
          </div>
        </div>

        <div style={{ height: 6, background: accent, borderRadius: 2, marginBottom: 2, opacity: 0.9 }} />

        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 3,
              marginBottom: 2,
              background: i % 2 === 0 && layout === 'classic' ? '#f9fafb' : 'transparent',
              borderRadius: 1,
              padding: '1px 0',
            }}
          >
            <div style={{ flex: 2, height: 3, background: '#e5e7eb', borderRadius: 1 }} />
            <div style={{ flex: 1, height: 3, background: '#e5e7eb', borderRadius: 1 }} />
            <div style={{ flex: 1, height: 3, background: '#e5e7eb', borderRadius: 1 }} />
          </div>
        ))}

        <div style={{ marginTop: 5, display: 'flex', justifyContent: 'flex-end' }}>
          <div
            style={{
              width: '55%',
              height: 10,
              background: accent,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 28, height: 2, background: 'rgba(255,255,255,0.7)', borderRadius: 1 }} />
          </div>
        </div>
      </>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
      }}
    >
      <div
        style={{
          width: w,
          height: h,
          background: 'white',
          borderRadius: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          padding: 6,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {renderContent()}
      </div>
    </div>
  )
}

const TemplateCard: React.FC<{
  template: PrintTemplate
  langAr: boolean
  onEdit: (t: PrintTemplate) => void
  onDuplicate: (id: number) => void
  onDeleteRequest: (t: PrintTemplate) => void
  onSetDefault: (id: number) => void
  onExport: (t: PrintTemplate) => void
  onPreview: (t: PrintTemplate) => void
}> = ({ template, langAr, onEdit, onDuplicate, onDeleteRequest, onSetDefault, onExport, onPreview }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const typeInfo = DOC_TYPES.find((d) => d.key === template.document_type)
  const accent = (template.settings?.accent_color as string) ?? typeInfo?.color ?? '#6366f1'
  const bg = TYPE_BG[template.document_type] ?? '#f8fafc'
  const layout = (template.settings?.layout as string) ?? 'classic'
  const isThermal = template.paper_size?.includes('thermal')
  const paperLabel = isThermal
    ? template.paper_size === 'thermal_80'
      ? langAr
        ? '🧾 حراري 80mm'
        : '🧾 Thermal 80mm'
      : langAr
        ? '🧾 حراري 58mm'
        : '🧾 Thermal 58mm'
    : `📄 ${template.paper_size ?? 'A4'}`
  const orientLabel =
    template.orientation === 'landscape' ? (langAr ? 'أفقي' : 'Landscape') : langAr ? 'عمودي' : 'Portrait'

  return (
    <div
      className="group bg-white rounded-2xl overflow-hidden border-2 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5"
      style={{ borderColor: template.is_default ? accent : 'transparent' }}
    >
      <div className="relative h-44 cursor-pointer overflow-hidden" onClick={() => onEdit(template)}>
        <EnhancedThumbnail accent={accent} bg={bg} docType={template.document_type} paperSize={template.paper_size} layout={layout} />

        {template.is_default && (
          <span
            className="absolute top-2 end-2 text-[10px] px-2 py-0.5 rounded-full font-bold text-white shadow"
            style={{ background: accent }}
          >
            ★ {langAr ? 'افتراضي' : 'Default'}
          </span>
        )}

        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="bg-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg" style={{ color: accent }}>
            ✏️ {langAr ? 'فتح المحرر' : 'Open editor'}
          </span>
        </div>
      </div>

      <div className="px-3 pt-2.5 pb-1 border-t border-gray-100">
        <p className="text-sm font-bold text-gray-900 truncate">{template.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
          <p className="text-[11px] text-gray-400 truncate">
            {langAr ? typeInfo?.labelAr : typeInfo?.labelEn} | {paperLabel} | {orientLabel} | {layoutLabel(layout, langAr)}
          </p>
        </div>
      </div>

      <div className="px-3 pb-3 flex gap-1.5 mt-2">
        <button
          type="button"
          onClick={() => onEdit(template)}
          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ✏️ {langAr ? 'تحرير' : 'Edit'}
        </button>
        <button
          type="button"
          onClick={() => onDuplicate(template.id)}
          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          📋 {langAr ? 'نسخ' : 'Copy'}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="w-9 flex items-center justify-center py-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute end-0 bottom-full mb-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-20 min-w-[160px]">
              <button
                type="button"
                onClick={() => {
                  onSetDefault(template.id)
                  setMenuOpen(false)
                }}
                className="w-full text-start px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
              >
                ⭐ {langAr ? 'تعيين كافتراضي' : 'Set as default'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onExport(template)
                  setMenuOpen(false)
                }}
                className="w-full text-start px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
              >
                📤 {langAr ? 'تصدير' : 'Export'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onPreview(template)
                  setMenuOpen(false)
                }}
                className="w-full text-start px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
              >
                👁 {langAr ? 'معاينة / تحرير' : 'Preview / edit'}
              </button>
              <div className="border-t border-gray-100 my-1" />
              {!template.is_system && (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteRequest(template)
                    setMenuOpen(false)
                  }}
                  className="w-full text-start px-3 py-2 text-xs text-red-500 hover:bg-red-50 flex items-center gap-2"
                >
                  🗑 {langAr ? 'حذف' : 'Delete'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ListRow({
  template,
  langAr,
  onEdit,
  onDuplicate,
  onDeleteRequest,
  onSetDefault,
  onExport,
}: {
  template: PrintTemplate
  langAr: boolean
  onEdit: (t: PrintTemplate) => void
  onDuplicate: (id: number) => void
  onDeleteRequest: (t: PrintTemplate) => void
  onSetDefault: (id: number) => void
  onExport: (t: PrintTemplate) => void
}) {
  const typeInfo = DOC_TYPES.find((d) => d.key === template.document_type)
  const accent = (template.settings?.accent_color as string) ?? typeInfo?.color ?? '#6366f1'
  const bg = TYPE_BG[template.document_type] ?? '#f8fafc'
  const layout = (template.settings?.layout as string) ?? 'classic'

  return (
    <div
      className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 p-3 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onEdit(template)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onEdit(template)
      }}
    >
      <div className="w-20 h-24 shrink-0 rounded-lg overflow-hidden border border-gray-100">
        <EnhancedThumbnail accent={accent} bg={bg} docType={template.document_type} paperSize={template.paper_size} layout={layout} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-bold text-gray-900 truncate">{template.name}</p>
          {template.is_default && (
            <span className="text-[10px] px-2 py-0.5 rounded-full text-white shrink-0" style={{ background: accent }}>
              ★
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {langAr ? typeInfo?.labelAr : typeInfo?.labelEn} · {template.paper_size} · {layoutLabel(layout, langAr)}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onSetDefault(template.id)}
          className="p-2 rounded-lg border border-gray-200 text-xs hover:bg-gray-50"
          title={langAr ? 'افتراضي' : 'Default'}
        >
          ⭐
        </button>
        <button type="button" onClick={() => onDuplicate(template.id)} className="p-2 rounded-lg border border-gray-200 text-xs hover:bg-gray-50">
          📋
        </button>
        <button type="button" onClick={() => onExport(template)} className="p-2 rounded-lg border border-gray-200 text-xs hover:bg-gray-50">
          📤
        </button>
        {!template.is_system && (
          <button
            type="button"
            onClick={() => onDeleteRequest(template)}
            className="p-2 rounded-lg border border-red-100 text-xs text-red-500 hover:bg-red-50"
            title={langAr ? 'حذف' : 'Delete'}
          >
            🗑
          </button>
        )}
      </div>
    </div>
  )
}

export default function PrintTemplates() {
  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? 0
  const { lang, isRtl } = useLanguage()
  const langAr = lang === 'ar'
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [activeType, setActiveType] = useState<'all' | PrintDocumentType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [deleteTarget, setDeleteTarget] = useState<PrintTemplate | null>(null)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [seedSuccess, setSeedSuccess] = useState<string | null>(null)
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreviewData | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['print-templates', tenantId],
    queryFn: ({ signal }) => printTemplatesApi.list(tenantId, { signal }),
    enabled: tenantId > 0,
    retry: 1,
  })

  const templates = (data?.data ?? []) as PrintTemplate[]

  const filtered = useMemo(() => {
    let rows = activeType === 'all' ? templates : templates.filter((t) => t.document_type === activeType)
    const q = searchQuery.trim().toLowerCase()
    if (q) rows = rows.filter((t) => t.name.toLowerCase().includes(q))
    return rows
  }, [templates, activeType, searchQuery])

  const countOf = (type: string) => {
    if (type === 'all') return templates.length
    return templates.filter((t) => t.document_type === type).length
  }

  const activeColor = useMemo(() => {
    const dt = DOC_TYPES.find((d) => d.key === activeType)
    return dt?.color ?? '#6366f1'
  }, [activeType])

  const clearMut = useMutation({
    mutationFn: () => clearAllPrintTemplates(tenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-templates', tenantId] })
      setClearConfirmOpen(false)
      setSeedSuccess(langAr ? 'تم حذف جميع القوالب.' : 'All templates deleted.')
    },
    onError: () => setSeedError(langAr ? 'تعذر حذف القوالب' : 'Could not delete templates'),
  })

  const seedMut = useMutation({
    mutationFn: () => seedPrintTemplates(tenantId),
    onMutate: () => {
      setSeedError(null)
      setSeedSuccess(null)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-templates', tenantId] })
      setSeedConfirmOpen(false)
      setSeedSuccess(
        langAr
          ? 'تم حذف القوالب القديمة وإنشاء 14 قالبًا احترافيًا جديدًا.'
          : 'Old templates removed; 14 new professional templates created.',
      )
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '')
          : ''
      setSeedError(msg || (langAr ? 'تعذر إنشاء القوالب الافتراضية' : 'Could not seed templates'))
    },
  })

  const importMut = useMutation({
    mutationFn: (payload: ImportPreviewData) =>
      createPrintTemplate(tenantId, {
        name: payload.name.trim(),
        document_type: payload.document_type,
        paper_size: payload.paper_size,
        orientation: payload.orientation ?? 'portrait',
        margins: payload.margins ?? undefined,
        settings: {
          layout: 'imported',
          ...(payload.settings ?? {}),
        },
        sections: payload.sections ?? null,
        html_content: payload.html_content,
        blocks_json: payload.blocks_json ?? null,
        is_default: false,
      }),
    onMutate: () => setSeedError(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-templates', tenantId] })
      setImportModalOpen(false)
      setImportPreview(null)
      setSeedSuccess(langAr ? 'تم استيراد القالب بنجاح.' : 'Template imported successfully.')
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '')
          : ''
      setSeedError(msg || (langAr ? 'فشل في حفظ القالب المستورد' : 'Failed to save imported template'))
    },
  })

  const handleImportTemplate = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return

      try {
        const templateData = await parseImportTemplateFile(file)
        setImportPreview(templateData)
        setImportModalOpen(true)
        setSeedError(null)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : langAr ? 'تأكد من صحة الملف' : 'Check the file format'
        setSeedError(langAr ? `خطأ في استيراد الملف: ${message}` : `Import error: ${message}`)
      }
    },
    [langAr],
  )

  const handleConfirmImport = useCallback(() => {
    if (!importPreview?.name.trim()) {
      setSeedError(langAr ? 'أدخل اسم القالب' : 'Enter a template name')
      return
    }
    importMut.mutate(importPreview)
  }, [importPreview, importMut, langAr])

  const openNewPrintTemplate = useCallback(() => {
    const t = activeType === 'all' ? 'invoice' : activeType
    const qs = new URLSearchParams({ type: t, _nc: String(Date.now()) })
    navigate(`/settings/print-templates/designer?${qs.toString()}`, { state: { fresh: Date.now() } })
  }, [navigate, activeType])

  const setDefMut = useMutation({
    mutationFn: (id: number) => setDefaultPrintTemplate(tenantId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['print-templates', tenantId] }),
  })

  const dupMut = useMutation({
    mutationFn: (id: number) => duplicatePrintTemplate(tenantId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['print-templates', tenantId] }),
  })

  const delMut = useMutation({
    mutationFn: (id: number) => deletePrintTemplate(tenantId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-templates', tenantId] })
      setDeleteTarget(null)
      setSeedError(null)
      setSeedSuccess(langAr ? 'تم حذف القالب.' : 'Template deleted.')
    },
    onError: (e: unknown) => {
      setSeedError(
        apiErrorMessage(e, langAr ? 'تعذر حذف القالب' : 'Could not delete template'),
      )
    },
  })

  if (!tenantId) {
    return <div className="p-6 text-slate-500">{langAr ? 'اختر شركة' : 'Select a company'}</div>
  }

  const loadErrorMessage =
    isError && error && typeof error === 'object' && 'response' in error
      ? String((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? '')
      : isError
        ? langAr
          ? 'تعذر تحميل القوالب'
          : 'Failed to load templates'
        : ''

  const exportTemplate = (t: PrintTemplate) => {
    const payload = {
      id: t.id,
      name: t.name,
      document_type: t.document_type,
      paper_size: t.paper_size,
      orientation: t.orientation,
      margins: t.margins,
      settings: t.settings,
      sections: t.sections,
      html_content: t.html_content,
      is_default: t.is_default,
      is_system: t.is_system,
      sort_order: t.sort_order,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `print-template-${t.document_type}-${t.id}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-gray-50 -mx-[clamp(6px,1.5vw,10px)] px-[clamp(6px,1.5vw,10px)] py-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto w-full min-w-0">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Printer size={22} style={{ color: activeColor }} />
              {langAr ? 'قوالب الطباعة' : 'Print templates'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {langAr ? `${templates.length} قالب متاح` : `${templates.length} templates`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={langAr ? 'بحث في القوالب...' : 'Search templates...'}
                className="ps-9 pe-3 py-2 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 w-48 min-w-0"
              />
              <Search className="absolute top-1/2 -translate-y-1/2 start-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-3 py-2 ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                aria-pressed={viewMode === 'grid'}
                title={langAr ? 'شبكة' : 'Grid'}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                aria-pressed={viewMode === 'list'}
                title={langAr ? 'قائمة' : 'List'}
              >
                <ListIcon size={16} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setClearConfirmOpen(true)}
              disabled={clearMut.isPending || !templates.length}
              className="px-3 py-2 border border-red-200 rounded-xl text-xs text-red-700 hover:bg-red-50 bg-red-50/80 disabled:opacity-50 font-semibold"
            >
              🗑 {langAr ? 'حذف الكل' : 'Delete all'}
            </button>
            <button
              type="button"
              onClick={() => setSeedConfirmOpen(true)}
              disabled={seedMut.isPending}
              className="px-3 py-2 border border-amber-200 rounded-xl text-xs text-amber-800 hover:bg-amber-50 bg-amber-50/80 disabled:opacity-50 font-semibold"
            >
              📥 {langAr ? 'إعادة المكتبة' : 'Reset library'}
            </button>
            <label
              htmlFor="import-template-input"
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
              title={langAr ? 'استيراد قالب من ملف' : 'Import template from file'}
            >
              📥 {langAr ? 'استيراد' : 'Import'}
              <input
                ref={importInputRef}
                id="import-template-input"
                type="file"
                accept=".json,.html,.htm,.xml,.txt,.file"
                className="hidden"
                onChange={handleImportTemplate}
              />
            </label>
            <button
              type="button"
              onClick={() => openNewPrintTemplate()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              + {langAr ? 'قالب جديد' : 'New template'}
            </button>
          </div>
        </div>

        <div className="flex gap-1.5 flex-wrap mb-6 bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100 w-fit max-w-full">
          {DOC_TYPES.map((dt) => (
            <button
              key={dt.key}
              type="button"
              onClick={() => setActiveType(dt.key as 'all' | PrintDocumentType)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeType === dt.key ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              <span>{dt.icon}</span>
              <span>{langAr ? dt.labelAr : dt.labelEn}</span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold min-w-[20px] text-center ${
                  activeType === dt.key ? 'bg-white text-gray-900' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {countOf(dt.key)}
              </span>
            </button>
          ))}
        </div>

        {isError && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-semibold">{langAr ? 'خطأ في تحميل القوالب' : 'Failed to load templates'}</p>
            {loadErrorMessage && <p className="mt-1 text-red-700">{loadErrorMessage}</p>}
            <button type="button" onClick={() => void refetch()} className="mt-2 text-xs font-bold text-red-900 underline hover:no-underline">
              {langAr ? 'إعادة المحاولة' : 'Retry'}
            </button>
          </div>
        )}

        {seedSuccess && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 font-medium">
            {seedSuccess}
          </div>
        )}

        {seedError && <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{seedError}</div>}

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl h-72 animate-pulse border-2 border-transparent">
                <div className="h-44 bg-gray-100 rounded-t-2xl" />
                <div className="p-3">
                  <div className="h-3 bg-gray-100 rounded mb-2 w-3/4" />
                  <div className="h-2 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? null : templates.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-16 text-center shadow-sm">
            <p className="text-lg font-semibold text-gray-900">{langAr ? 'لا توجد قوالب بعد' : 'No templates yet'}</p>
            <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
              {langAr
                ? 'استخدم «إعادة المكتبة» لتحميل مجموعة القوالب الجاهزة، أو أنشئ قالبًا يدويًا.'
                : 'Use “Reset library” to load the built‑in template pack, or create a template manually.'}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setSeedConfirmOpen(true)}
                disabled={seedMut.isPending}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {seedMut.isPending ? '…' : langAr ? '📥 إعادة المكتبة' : '📥 Reset library'}
              </button>
              <button
                type="button"
                onClick={() => openNewPrintTemplate()}
                className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                + {langAr ? 'قالب جديد' : 'New template'}
              </button>
            </div>
            {import.meta.env.DEV && (
              <p className="mt-6 text-start text-[11px] text-gray-400" dir="ltr">
                tenantId={tenantId} · fetching={String(isFetching)}
              </p>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-2xl border border-gray-100">
            <span className="text-5xl mb-4">📄</span>
            <p className="text-lg font-medium mb-1">{langAr ? 'لا نتائج' : 'No matches'}</p>
            <p className="text-sm">{langAr ? 'جرّب بحثًا آخر أو غيّر التبويب' : 'Try another search or tab'}</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((tmpl) => (
              <TemplateCard
                key={tmpl.id}
                template={tmpl}
                langAr={langAr}
                onEdit={(t) => navigate(`/settings/print-templates/designer/${t.id}`)}
                onDuplicate={(id) => dupMut.mutate(id)}
                onDeleteRequest={(t) => setDeleteTarget(t)}
                onSetDefault={(id) => setDefMut.mutate(id)}
                onExport={exportTemplate}
                onPreview={(t) => navigate(`/settings/print-templates/designer/${t.id}`)}
              />
            ))}
            <div
              role="button"
              tabIndex={0}
              onClick={() => openNewPrintTemplate()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openNewPrintTemplate()
              }}
              className="border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40 transition-all min-h-[280px] group"
            >
              <div className="w-12 h-12 rounded-2xl bg-gray-100 group-hover:bg-indigo-100 flex items-center justify-center text-2xl transition-colors">+</div>
              <span className="text-sm text-gray-400 group-hover:text-indigo-500 font-medium transition-colors">
                {langAr ? 'قالب جديد' : 'New template'}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((tmpl) => (
              <ListRow
                key={tmpl.id}
                template={tmpl}
                langAr={langAr}
                onEdit={(t) => navigate(`/settings/print-templates/designer/${t.id}`)}
                onDuplicate={(id) => dupMut.mutate(id)}
                onDeleteRequest={setDeleteTarget}
                onSetDefault={(id) => setDefMut.mutate(id)}
                onExport={exportTemplate}
              />
            ))}
          </div>
        )}

        {clearConfirmOpen && (
          <ConfirmDialog
            title={langAr ? 'حذف جميع القوالب' : 'Delete all templates'}
            message={
              langAr
                ? `سيتم حذف جميع القوالب الحالية (${templates.length}) نهائيًا. يمكنك إنشاء قوالب جديدة لاحقًا من «+ قالب جديد». هل تريد المتابعة؟`
                : `Permanently delete all ${templates.length} templates. You can create new ones with "+ New template". Continue?`
            }
            confirmLabel={langAr ? 'نعم، احذف الكل' : 'Yes, delete all'}
            variant="danger"
            isLoading={clearMut.isPending}
            onConfirm={() => clearMut.mutate()}
            onCancel={() => setClearConfirmOpen(false)}
          />
        )}

        {seedConfirmOpen && (
          <ConfirmDialog
            title={langAr ? 'إعادة المكتبة' : 'Reset template library'}
            message={
              langAr
                ? 'سيتم حذف جميع القوالب الحالية واستبدالها بـ 14 قالبًا احترافيًا جديدًا (فاتورة، سند، POS، قيد، مشتريات، مخزون). هل تريد المتابعة؟'
                : 'All current templates will be deleted and replaced with 14 new professional templates. Continue?'
            }
            confirmLabel={langAr ? 'نعم، إعادة الإنشاء' : 'Yes, reset'}
            variant="danger"
            isLoading={seedMut.isPending}
            onConfirm={() => seedMut.mutate()}
            onCancel={() => setSeedConfirmOpen(false)}
          />
        )}

        {deleteTarget && (
          <ConfirmDialog
            title={langAr ? 'حذف القالب' : 'Delete template'}
            message={
              deleteTarget.is_system
                ? langAr
                  ? 'لا يمكن حذف قوالب النظام.'
                  : 'System templates cannot be deleted.'
                : deleteTarget.is_default
                  ? langAr
                    ? `حذف «${deleteTarget.name}»؟ سيتم تعيين قالب آخر من نفس النوع كافتراضي تلقائياً.`
                    : `Delete «${deleteTarget.name}»? Another template of the same type will become the default.`
                  : langAr
                    ? `حذف «${deleteTarget.name}»؟`
                    : `Delete «${deleteTarget.name}»?`
            }
            confirmLabel={langAr ? 'حذف' : 'Delete'}
            variant="danger"
            isLoading={delMut.isPending}
            overlayZClass="z-[60]"
            onConfirm={() => {
              if (deleteTarget.is_system) {
                setDeleteTarget(null)
                return
              }
              delMut.mutate(deleteTarget.id)
            }}
            onCancel={() => setDeleteTarget(null)}
          />
        )}

        {importModalOpen && importPreview && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            dir={isRtl ? 'rtl' : 'ltr'}
            role="dialog"
            aria-modal="true"
            onClick={() => !importMut.isPending && setImportModalOpen(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-[500px] max-h-[80vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 text-lg">📥 {langAr ? 'استيراد قالب' : 'Import template'}</h3>
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  disabled={importMut.isPending}
                  className="text-gray-400 hover:text-gray-600 text-xl disabled:opacity-50"
                  aria-label={langAr ? 'إغلاق' : 'Close'}
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                <p className="text-sm text-gray-500">
                  {langAr ? 'تحقق من المعلومات قبل الحفظ:' : 'Review details before saving:'}
                </p>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">{langAr ? 'اسم القالب' : 'Template name'}</label>
                  <input
                    value={importPreview.name}
                    onChange={(e) =>
                      setImportPreview((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">{langAr ? 'نوع المستند' : 'Document type'}</label>
                  <select
                    value={importPreview.document_type}
                    onChange={(e) =>
                      setImportPreview((prev) =>
                        prev ? { ...prev, document_type: normalizeDocumentType(e.target.value) } : prev,
                      )
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  >
                    {DOC_TYPES.filter((dt) => dt.key !== 'all').map((dt) => (
                      <option key={dt.key} value={dt.key}>
                        {langAr ? dt.labelAr : dt.labelEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">{langAr ? 'حجم الورق' : 'Paper size'}</label>
                  <select
                    value={importPreview.paper_size}
                    onChange={(e) =>
                      setImportPreview((prev) =>
                        prev ? { ...prev, paper_size: normalizePaperSize(e.target.value) } : prev,
                      )
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="A4">A4</option>
                    <option value="A5">A5</option>
                    <option value="thermal_80">{langAr ? 'حراري 80mm' : 'Thermal 80mm'}</option>
                    <option value="thermal_58">{langAr ? 'حراري 58mm' : 'Thermal 58mm'}</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    {langAr ? 'محتوى HTML' : 'HTML content'} ({importPreview.html_content.length}{' '}
                    {langAr ? 'حرف' : 'chars'})
                  </label>
                  <div className="bg-gray-50 rounded-xl p-3 text-xs font-mono text-gray-600 max-h-32 overflow-auto border border-gray-200 break-all">
                    {importPreview.html_content.substring(0, 300)}
                    {importPreview.html_content.length > 300 ? '…' : ''}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={importMut.isPending}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {importMut.isPending ? '…' : langAr ? '✅ حفظ القالب' : '✅ Save template'}
                </button>
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  disabled={importMut.isPending}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  {langAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
