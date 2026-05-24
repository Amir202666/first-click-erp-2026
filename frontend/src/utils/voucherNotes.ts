/** سطر فاصل بين ملاحظة المستخدم والملخص الآلي للأسطر (شرطات متنوعة أو عنوان عربي). */
const AUTO_SUMMARY_HEADER =
  /\n\n(?:[\u2500\u2013\u2014\u2015\-]{3,}\n|تفاصيل الأسطر:\n)/u

/**
 * فصل ملاحظات المستخدم عن الملخص الآلي الذي كان يُضاف عند الحفظ (أسطر الحسابات).
 * يدعم فواصل CreateVoucher (─── / --- / …) وفاصل قوائم سندات القبض/الصرف (تفاصيل الأسطر).
 */
export function splitVoucherNotesFromAutoSummary(raw: string | null | undefined): {
  userNotes: string
  lineDescriptionsByIndex: Map<number, string>
} {
  if (!raw?.trim()) {
    return { userNotes: '', lineDescriptionsByIndex: new Map() }
  }
  const normalized = raw.replace(/\r\n/g, '\n')
  const m = normalized.match(AUTO_SUMMARY_HEADER)
  let userPart = normalized
  let summaryPart = ''
  if (m && m.index !== undefined) {
    userPart = normalized.slice(0, m.index)
    summaryPart = normalized.slice(m.index + m[0].length)
  }
  return {
    userNotes: userPart.trim(),
    lineDescriptionsByIndex: parseLineSummaryDescriptions(summaryPart),
  }
}

/** يستخرج وصف السطر الاختياري من كل سطر ملخص بصيغة: 1) اسم الحساب - مبلغ [- وصف] */
function parseLineSummaryDescriptions(summary: string): Map<number, string> {
  const map = new Map<number, string>()
  if (!summary.trim()) return map
  for (const line of summary.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const m = t.match(/^(\d+)\)\s+(.+?)\s+-\s+([0-9.,]+)\s*(?:-\s*(.*))?$/)
    if (m) {
      const lineIndex = parseInt(m[1], 10) - 1
      const desc = (m[4] ?? '').trim()
      if (desc) map.set(lineIndex, desc)
    }
  }
  return map
}
