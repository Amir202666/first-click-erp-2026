import { useMemo, useState } from 'react'
import type { VendorImportRowParsed } from '../../../types/vendorImport'

type Filter = 'all' | 'valid' | 'error' | 'duplicate'

interface StepPreviewProps {
  lang: 'ar' | 'en'
  rows: VendorImportRowParsed[]
}

export default function StepPreview({ lang, rows }: StepPreviewProps) {
  const isAr = lang === 'ar'
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(() => ({
    valid: rows.filter((r) => r._status === 'valid').length,
    error: rows.filter((r) => r._status === 'error').length,
    duplicate: rows.filter((r) => r._status === 'duplicate').length,
  }), [rows])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter((r) => r._status === filter)
  }, [rows, filter])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-green-100 px-3 py-1 text-green-800">
          ✅ {counts.valid} {isAr ? 'صحيح' : 'valid'}
        </span>
        <span className="rounded-full bg-red-100 px-3 py-1 text-red-800">
          ❌ {counts.error} {isAr ? 'خطأ' : 'errors'}
        </span>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
          ⏭ {counts.duplicate} {isAr ? 'مكرر' : 'duplicate'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'valid', 'error', 'duplicate'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1 text-xs ${
              filter === f ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {f === 'all' ? (isAr ? 'الكل' : 'All')
              : f === 'valid' ? (isAr ? 'صحيح' : 'Valid')
                : f === 'error' ? (isAr ? 'خطأ' : 'Errors')
                  : (isAr ? 'مكرر' : 'Duplicate')}
          </button>
        ))}
      </div>

      <div className="max-h-[360px] overflow-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-start">#</th>
              <th className="px-3 py-2 text-start">{isAr ? 'اسم المورد' : 'Name'}</th>
              <th className="px-3 py-2 text-start">{isAr ? 'الهاتف' : 'Phone'}</th>
              <th className="px-3 py-2 text-start">{isAr ? 'البريد' : 'Email'}</th>
              <th className="px-3 py-2 text-start">{isAr ? 'الحالة' : 'Status'}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r._rowIndex} className="border-t border-slate-100">
                <td className="px-3 py-2">{r._rowIndex}</td>
                <td className="px-3 py-2">{r.name || '—'}</td>
                <td className="px-3 py-2">{r.phone || r.mobile || '—'}</td>
                <td className="px-3 py-2">{r.email || '—'}</td>
                <td className="px-3 py-2">
                  {r._status === 'valid' ? '✅' : r._status === 'duplicate' ? '⏭' : '❌'}
                  {r._errors.length > 0 ? (
                    <span className="ms-1 text-xs text-red-600">{r._errors.join(' · ')}</span>
                  ) : r._status === 'duplicate' ? (
                    <span className="ms-1 text-xs text-amber-600">{isAr ? 'موجود مسبقاً' : 'Already exists'}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function countValidPreviewRows(rows: VendorImportRowParsed[]): number {
  return rows.filter((r) => r._status === 'valid').length
}
