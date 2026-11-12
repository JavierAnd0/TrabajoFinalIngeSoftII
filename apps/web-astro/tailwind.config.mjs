/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        usco: {
          wine: '#8B1E24',
          wineDark: '#5E1116',
          wineLight: '#A5252C',
          gold: '#D4AF37',
          goldLight: '#F3E5AB',
          goldDark: '#AA8822',
          slate: '#0F172A',
        },
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
        serif: ['"Instrument Serif"', 'Georgia', ' Cambria', 'serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
