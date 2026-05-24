import { useEffect, useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { THEMES } from '../constants/palettes'
import type { ThemeMode } from '../types/theme'

function ThemePicker({ onClose }: { onClose?: () => void }) {
  const { config, setTheme, setMode, isDark } = useTheme()
  const [localId, setLocalId] = useState(config.themeId)
  const [localMode, setLocalMode] = useState<ThemeMode>(config.mode)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setLocalId(config.themeId)
    setLocalMode(config.mode)
  }, [config.themeId, config.mode])

  const preview = THEMES.find((t) => t.id === localId) ?? THEMES[0]

  const handleSelect = (id: string) => {
    setLocalId(id)
    setTheme(id)
  }

  const handleModeChange = (mode: ThemeMode) => {
    setLocalMode(mode)
    setMode(mode)
  }

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose?.()
    }, 1500)
  }

  const bg = isDark ? '#252d3d' : '#ffffff'
  const bd = isDark ? '#374151' : '#e5e7eb'
  const text = isDark ? '#f1f5f9' : '#1f2937'
  const muted = isDark ? '#64748b' : '#9ca3af'
  const cardBg = isDark ? '#1e2433' : '#f9fafb'

  const closeBtnStyle = preview.isLightSidebar
    ? { background: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.5)' }
    : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)' }

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-2xl border w-72 max-h-[min(90vh,560px)] flex flex-col min-h-0"
      style={{ background: bg, borderColor: bd }}
      dir="rtl"
    >
      <div
        className="px-4 py-3 flex items-center justify-between shrink-0"
        style={{ background: preview.sidebarBg }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">🎨</span>
          <span
            className="font-bold text-sm truncate"
            style={{ color: preview.sidebarText }}
          >
            إعدادات المظهر
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-sm transition-colors shrink-0"
            style={closeBtnStyle}
          >
            ×
          </button>
        )}
      </div>

      <div className="p-4 overflow-y-auto min-h-0 scrollbar-hide flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: muted }}>
          وضع العرض
        </p>
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {(
            [
              { value: 'light' as const, icon: '☀️', label: 'فاتح' },
              { value: 'dark' as const, icon: '🌙', label: 'ليلي' },
              { value: 'auto' as const, icon: '🔄', label: 'تلقائي' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleModeChange(opt.value)}
              className="flex flex-col items-center py-2 rounded-xl border-2 transition-all"
              style={{
                borderColor: localMode === opt.value ? preview.accent : bd,
                background: localMode === opt.value ? `${preview.accent}18` : cardBg,
                color: text,
              }}
            >
              <span className="text-lg leading-none mb-0.5">{opt.icon}</span>
              <span className="text-[10px] font-semibold">{opt.label}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-between items-center mb-2 gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ color: muted }}>
            الثيم
          </p>
          <div className="flex gap-2 text-[9px] shrink-0" style={{ color: muted }}>
            <span>داكن ({THEMES.filter((t) => !t.isLightSidebar).length})</span>
            <span>·</span>
            <span>فاتح ({THEMES.filter((t) => t.isLightSidebar).length})</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5 mb-4">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleSelect(t.id)}
              className="relative flex flex-col items-center py-2 px-1 rounded-xl border-2 transition-all text-center"
              style={{
                borderColor: localId === t.id ? t.accent : bd,
                background: localId === t.id ? `${t.accent}12` : cardBg,
                boxShadow: localId === t.id ? `0 0 0 2px ${t.accent}30` : 'none',
              }}
            >
              {localId === t.id && (
                <div
                  className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-white"
                  style={{ background: t.accent, fontSize: '8px' }}
                >
                  ✓
                </div>
              )}
              <div
                className="w-7 h-7 rounded-full border-2 border-white/80 mb-1"
                style={{
                  background: t.accent,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                }}
              />
              <span className="text-[9px] font-semibold leading-tight px-0.5" style={{ color: text }}>
                {t.label}
              </span>
              <div
                className="w-3 h-2 rounded-sm mt-1"
                style={{ background: t.sidebarBg, border: `1px solid ${bd}` }}
                title={t.isLightSidebar ? 'شريط جانبي: فاتح' : 'شريط جانبي: داكن'}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="w-full py-2.5 rounded-xl text-white text-sm font-bold transition-all"
          style={{
            background: saved
              ? '#059669'
              : `linear-gradient(135deg, ${preview.accent}, ${preview.accentDark})`,
            boxShadow: `0 4px 12px ${preview.accent}40`,
          }}
        >
          {saved ? '✓ تم الحفظ!' : '✓ حفظ الإعدادات'}
        </button>

        <p className="text-[9px] text-center mt-1.5" style={{ color: muted }}>
          يُطبَّق فوراً · يُحفظ تلقائياً
        </p>
      </div>
    </div>
  )
}

export default ThemePicker
