/** هيكل تحميل بأبعاد ثابتة لصفحات الجداول — يقلّل القفز البصري (CLS) */
export default function TablePageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[420px]" aria-hidden>
      <div className="h-12 bg-slate-50 border-b border-slate-200" />
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse">
            <div className="h-4 bg-slate-200 rounded flex-1 max-w-[12rem]" />
            <div className="h-4 bg-slate-200 rounded flex-1 max-w-[10rem] hidden sm:block" />
            <div className="h-4 bg-slate-200 rounded w-24 hidden md:block" />
            <div className="h-6 bg-slate-200 rounded-full w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
