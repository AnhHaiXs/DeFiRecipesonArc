/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['var(--font-dm-sans)', '"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['var(--font-space-grotesk)', '"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-jetbrains-mono)', '"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        /* Canvas */
        background:  '#0d1b2f',
        surface:     'rgba(255,255,255,0.065)',
        'surface-strong': 'rgba(255,255,255,0.10)',
        'surface-muted':  '#162236',
        'surface-alt':    'rgba(255,255,255,0.07)',

        /* Brand */
        card:        '#111d30',
        cardBorder:  'rgba(255,255,255,0.09)',

        /* Text */
        ink:    '#f0f6ff',
        'ink-2':'#c8daf0',
        muted:  '#8fa3bf',
        subtle: '#5c738a',

        /* Semantic */
        border:  'rgba(255,255,255,0.09)',
        'border-strong': 'rgba(172,198,233,0.30)',

        primary:       { DEFAULT: '#acc6e9', hover: '#ccddf5' },
        accent:        { DEFAULT: '#acc6e9', hover: '#ccddf5' },
        success:       { DEFAULT: '#6fcf97', bg: 'rgba(111,207,151,0.10)' },
        danger:        { DEFAULT: '#eb5757', bg: 'rgba(235,87,87,0.10)' },
        warning:       { DEFAULT: '#f2994a', bg: 'rgba(242,153,74,0.10)' },
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        glow:       '0 0 24px rgba(172,198,233,0.15)',
        'glow-sm':  '0 0 12px rgba(172,198,233,0.10)',
        'glow-success': '0 0 20px rgba(111,207,151,0.18)',
        card:       '0 4px 24px rgba(0,0,0,0.35)',
        'card-lg':  '0 8px 48px rgba(0,0,0,0.50)',
      },
      backgroundImage: {
        'canvas-gradient': 'linear-gradient(180deg, #0d1b2f 0%, #0d1b2f 58%, #122d45 100%)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
