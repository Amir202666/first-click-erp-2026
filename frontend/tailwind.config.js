/** @type {import('tailwindcss').Config}
 *  Accounting color system — semantic tokens from theme.css
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
        primary: {
          DEFAULT: 'var(--color-primary)',
          darkest: 'var(--color-primary-darkest)',
          dark: 'var(--color-primary-dark)',
          light: 'var(--color-primary-light)',
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
          DEFAULT: 'var(--color-success)',
          bg: 'var(--color-success-bg)',
          500: 'var(--color-success-500)',
          600: 'var(--color-success-600)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          bg: 'var(--color-danger-bg)',
          50: 'var(--color-danger-50, var(--color-danger-bg))',
          500: 'var(--color-danger-500)',
          600: 'var(--color-danger-600)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          bg: 'var(--color-warning-bg)',
          500: 'var(--color-warning-500)',
          600: 'var(--color-warning-600)',
        },
        neutral: {
          DEFAULT: 'var(--color-neutral)',
          bg: 'var(--color-neutral-bg)',
          50: 'var(--color-neutral-50)',
          100: 'var(--color-neutral-100)',
          200: 'var(--color-neutral-200)',
          300: 'var(--color-neutral-300)',
          500: 'var(--color-neutral-500)',
          700: 'var(--color-neutral-700)',
          900: 'var(--color-neutral-900)',
        },
        page: {
          DEFAULT: 'var(--color-bg-page)',
          surface: 'var(--color-bg-surface)',
        },
        sidebar: {
          DEFAULT: 'var(--color-sidebar-bg)',
        },
        teal: {
          DEFAULT: 'var(--color-teal)',
          dark: 'var(--color-teal-dark)',
          darkest: 'var(--color-teal-darkest)',
          light: 'var(--color-teal-light)',
          bg: 'var(--color-teal-bg)',
        },
        indigo: {
          DEFAULT: 'var(--color-indigo)',
          dark: 'var(--color-indigo-dark)',
          darkest: 'var(--color-indigo-darkest)',
          light: 'var(--color-indigo-light)',
        },
      },
    },
  },
  plugins: [],
}
