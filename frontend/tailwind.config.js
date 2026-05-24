/** @type {import('tailwindcss').Config}
 *  لغة تصميم موحدة: Primary, Success, Danger, Neutral — Cairo بوزن 400 (بدون عريض) — 8px radius
 */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        thin: '400',
        extralight: '400',
        light: '400',
        normal: '400',
        medium: '400',
        semibold: '400',
        bold: '400',
        extrabold: '400',
        black: '400',
      },
      borderRadius: {
        app: '8px',
      },
      spacing: {
        'app': '8px',
        'app-2': '16px',
        'app-3': '24px',
        'app-4': '32px',
      },
      colors: {
        /** جميع الدرجات مربوطة بمتغيرات يحدّثها ThemeContext حتى تعمل كل سمات الألوان */
        primary: {
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          300: 'var(--color-primary-300)',
          400: 'var(--color-primary-400)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
          800: 'var(--color-primary-800)',
          900: 'var(--color-primary-900)',
          950: 'var(--color-primary-950)',
        },
        success: {
          500: 'var(--color-success-500)',
          600: 'var(--color-success-600)',
        },
        danger: {
          50: 'var(--color-danger-50, #fef2f2)',
          500: 'var(--color-danger-500)',
          600: 'var(--color-danger-600)',
        },
        neutral: {
          50: 'var(--color-neutral-50)',
          100: 'var(--color-neutral-100)',
          200: 'var(--color-neutral-200)',
          300: 'var(--color-neutral-300)',
          500: 'var(--color-neutral-500)',
          700: 'var(--color-neutral-700)',
          900: 'var(--color-neutral-900)',
        },
        /** مرجع سمة Enhanced Green (يمكن استخدامها صراحةً في المكوّنات) */
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        sidebar: {
          DEFAULT: 'var(--color-sidebar-bg)',
          active: '#0f2d4a',
        },
      },
    },
  },
  plugins: [],
}
