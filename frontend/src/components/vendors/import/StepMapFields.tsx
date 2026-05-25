import type { VendorFieldMapping, VendorImportFieldKey } from '../../../types/vendorImport'
import { VENDOR_IMPORT_FIELDS } from '../../../types/vendorImport'

interface StepMapFieldsProps {
  lang: 'ar' | 'en'
  mapping: VendorFieldMapping[]
  onChange: (mapping: VendorFieldMapping[]) => void
}

export default function StepMapFields({ lang, mapping, onChange }: StepMapFieldsProps) {
  const isAr = lang === 'ar'

  const updateField = (fileColumn: string, systemField: VendorImportFieldKey | null) => {
    onChange(mapping.map((m) => (m.fileColumn === fileColumn ? { ...m, systemField } : m)))
  }

  const nameMapped = mapping.some((m) => m.systemField === 'name')

  return (
    <div className="space-y-4">
      {!nameMapped ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {isAr ? 'يجب ربط عمود بـ «اسم المورد» للمتابعة' : 'Map at least one column to Vendor name'}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? 'عمود في ملفك' : 'File column'}</th>
              <th className="px-4 py-2 text-start">{isAr ? 'حقل في النظام' : 'System field'}</th>
            </tr>
          </thead>
          <tbody>
            {mapping.map((m) => (
              <tr key={m.fileColumn} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{m.fileColumn}</td>
                <td className="px-4 py-2">
                  <select
                    value={m.systemField ?? ''}
                    onChange={(e) => updateField(m.fileColumn, (e.target.value || null) as VendorImportFieldKey | null)}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">{isAr ? '— تجاهل —' : '— Ignore —'}</option>
                    {VENDOR_IMPORT_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {isAr ? f.labelAr : f.labelEn}{f.required ? ' *' : ''}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function isNameFieldMapped(mapping: VendorFieldMapping[]): boolean {
  return mapping.some((m) => m.systemField === 'name')
}
