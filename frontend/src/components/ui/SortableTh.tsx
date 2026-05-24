import type { ReactNode } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { SortState } from '../../hooks/useClientSort'

/** spread: عنوان + أيقونة في طرفي الخلية (مناسب للنصوص مع اتجاه الجدول). cluster*: مجموعة مدمجة في الوسط أو عند النهاية المنطقية (أرقام/حالة). */
export type SortableThHeaderLayout = 'spread' | 'clusterCenter' | 'clusterEnd'

type Props<K extends string> = {
  label: ReactNode
  sortKey: K
  sortState: SortState<K>
  onToggle: (key: K) => void
  className?: string
  /** Use fixed width classes to avoid layout shift. */
  widthClassName?: string
  /** تخطيط زر الرأس — الافتراضي spread مع justify-content: space-between */
  headerLayout?: SortableThHeaderLayout
  /** إذا false يُعرض عنوان الرأس كاملاً مع التفاف بدلاً من القص (…) */
  truncateLabel?: boolean
  /** حشو أقل لرأس الجدول (صفوف أقصر قليلاً) */
  compact?: boolean
  /** حشو مطابق لخلايا الجدول الشائعة (px-2 py-1) لمحاذاة الرأس مع البيانات */
  dense?: boolean
  /** تلميح عند التمرير (مثلاً اسم الشهر الكامل) */
  title?: string
}

export default function SortableTh<K extends string>({
  label,
  sortKey,
  sortState,
  onToggle,
  className,
  widthClassName,
  headerLayout = 'spread',
  truncateLabel = true,
  compact = false,
  dense = false,
  title,
}: Props<K>) {
  const active = sortState?.key === sortKey
  const dir = active ? sortState?.direction : null
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown

  const pad = dense ? 'px-2 py-1' : compact ? 'px-3 py-1.5' : 'px-4 py-2'
  const baseBtn = `group w-full min-w-0 ${pad} hover:bg-slate-100/70 dark:hover:bg-slate-700/60 transition-colors select-none`

  const layoutBtn =
    headerLayout === 'spread'
      ? `${baseBtn} flex items-center justify-between gap-2`
      : headerLayout === 'clusterCenter'
        ? `${baseBtn} flex items-center justify-center gap-1.5`
        : `${baseBtn} flex items-center justify-end gap-1.5`

  const labelClass =
    headerLayout === 'spread'
      ? truncateLabel
        ? 'min-w-0 flex-1 truncate text-start'
        : 'min-w-0 flex-1 whitespace-normal text-start leading-tight break-words'
      : headerLayout === 'clusterCenter'
        ? truncateLabel
          ? 'min-w-0 max-w-full truncate whitespace-nowrap text-center'
          : 'min-w-0 flex-1 max-w-full whitespace-normal text-center leading-tight break-words px-0.5'
        : truncateLabel
          ? 'min-w-0 max-w-full truncate whitespace-nowrap text-end'
          : 'min-w-0 flex-1 max-w-full whitespace-normal text-end leading-tight break-words px-0.5'

  return (
    <th className={`${widthClassName ?? ''} ${className ?? ''}`.trim()}>
      <button type="button" title={title} onClick={() => onToggle(sortKey)} className={layoutBtn}>
        <span className={labelClass}>{label}</span>
        <span className={`shrink-0 opacity-60 group-hover:opacity-90 ${active ? 'opacity-90' : ''}`}>
          <Icon size={14} />
        </span>
      </button>
    </th>
  )
}
