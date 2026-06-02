/** ألوان مخططات Recharts حسب الوضع الليلي/النهاري */
export function getChartTheme(isDark: boolean) {
  return {
    grid: isDark ? '#334155' : '#e2e8f0',
    axis: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? '#1e293b' : '#ffffff',
    tooltipBorder: isDark ? '#475569' : '#e2e8f0',
    tooltipText: isDark ? '#f1f5f9' : '#1e293b',
    centerLabel: isDark ? '#94a3b8' : '#9ca3af',
    centerValue: isDark ? '#f1f5f9' : '#111827',
    legendBorder: isDark ? '#334155' : '#f3f4f6',
    legendHover: isDark ? '#334155' : '#f9fafb',
    legendText: isDark ? '#cbd5e1' : '#374151',
    progressTrack: isDark ? '#334155' : '#f3f4f6',
  }
}
