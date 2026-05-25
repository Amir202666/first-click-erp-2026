import type { ItemImportSettings } from '../../../types/itemImport'

interface StepImportSettingsProps {
  lang: 'ar' | 'en'
  settings: ItemImportSettings
  onChange: (settings: ItemImportSettings) => void
}

export default function StepImportSettings({ lang, settings, onChange }: StepImportSettingsProps) {
  const isAr = lang === 'ar'

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-700">{isAr ? 'إعدادات الاستيراد' : 'Import settings'}</p>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={settings.skipDuplicates}
          disabled={settings.updateExisting}
          onChange={(e) => onChange({ ...settings, skipDuplicates: e.target.checked })}
        />
        {isAr ? 'تخطي الأصناف المكررة (نفس الكود)' : 'Skip duplicates (same code)'}
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={settings.updateExisting}
          onChange={(e) => onChange({
            ...settings,
            updateExisting: e.target.checked,
            skipDuplicates: e.target.checked ? false : settings.skipDuplicates,
          })}
        />
        {isAr ? 'تحديث الأصناف الموجودة بنفس الكود' : 'Update existing items (same code)'}
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={settings.createCategories}
          onChange={(e) => onChange({ ...settings, createCategories: e.target.checked })}
        />
        {isAr ? 'إنشاء الفئات تلقائياً إذا لم تكن موجودة' : 'Auto-create missing categories'}
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={settings.createUnits}
          onChange={(e) => onChange({ ...settings, createUnits: e.target.checked })}
        />
        {isAr ? 'إنشاء وحدات القياس تلقائياً' : 'Auto-create missing units'}
      </label>
    </div>
  )
}
