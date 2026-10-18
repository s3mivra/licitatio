/** @type {import('tailwindcss').Config} */
const INK = '#0b1020';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eff4ff', 100: '#dbe6fe', 600: '#1d4ed8', 700: '#1e40af', 800: '#1e3a8a', 900: '#172554' },
        // Neo-brutalist palette: ink outlines, safety yellow accent, warm paper background
        ink: INK,
        accent: { 100: '#fff7c2', 200: '#ffee80', 300: '#ffe45c', 400: '#ffd60a', 500: '#f5c400' },
        paper: '#faf8f2',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Space Grotesk Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        caret: { '0%, 49%': { opacity: '1' }, '50%, 100%': { opacity: '0' } },
        'pulse-ring': { '0%': { opacity: '0.55', transform: 'scale(1)' }, '70%, 100%': { opacity: '0', transform: 'scale(2.6)' } },
        drop: { '0%': { opacity: '0', transform: 'translateY(-14px)' }, '100%': { opacity: '1', transform: 'none' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-33.3333%)' } },
        enter: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: {
        caret: 'caret 1s step-end infinite',
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
        drop: 'drop 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        marquee: 'marquee 40s linear infinite',
        enter: 'enter 0.6s ease-out both',
      },
      boxShadow: {
        // hard offset shadows, no blur
        'brut-xs': `2px 2px 0 0 ${INK}`,
        'brut-sm': `3px 3px 0 0 ${INK}`,
        brut: `4px 4px 0 0 ${INK}`,
        'brut-lg': `6px 6px 0 0 ${INK}`,
        'brut-xl': `8px 8px 0 0 ${INK}`,
      },
    },
  },
  plugins: [],
};
