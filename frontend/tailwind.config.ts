import type { Config } from 'tailwindcss';

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#3b78f0',
          blueDeep: '#2356c8',
          blueSoft: '#e8efff',
          navy: '#1a2f5e',
          navyDark: '#0f1d3c',
        },
        ink: {
          DEFAULT: '#18222e',
          soft: '#3c4a5a',
          faint: '#6b7a8d',
        },
        border: {
          DEFAULT: '#d8e0ea',
          soft: '#eaeef4',
        },
        surface: '#f6f8fb',
      },
      fontFamily: {
        sans: ['var(--font-ibm-plex-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-ibm-plex-mono)', 'monospace'],
      },
      keyframes: {
        spin: { to: { transform: 'rotate(360deg)' } },
        pop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        barflow: {
          '0%': { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '-200% center' },
        },
        toastIn: {
          '0%': { transform: 'translateX(110%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        spin: 'spin .7s linear infinite',
        pop: 'pop .25s ease both',
        barflow: 'barflow 1.8s linear infinite',
        toastIn: 'toastIn .3s ease both',
        fadeIn: 'fadeIn .3s ease both',
      },
    },
  },
  plugins: [],
} satisfies Config;
