/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary brand — neon green
        brand: {
          50:  '#f0fff4',
          100: '#ccffd9',
          200: '#99ffb9',
          300: '#55f285',
          400: '#00e676',
          500: '#00c85a',
          600: '#00a847',
          700: '#007d34',
          800: '#005524',
          900: '#003317',
        },
        // Surface hierarchy — black with green micro-tint
        dark: {
          900: '#000000',
          800: '#050905',
          700: '#08100a',
          600: '#0d180f',
          500: '#142016',
          400: '#1c2e1f',
          300: '#2a4030',
          200: '#3d5e47',
          100: '#5c8566',
        },
        // Accent colors
        neon: {
          green:  '#00ff87',
          lime:   '#69ff47',
          cyan:   '#00e5ff',
          red:    '#ff3d3d',
          orange: '#ff6b2b',
          gold:   '#ffd700',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-brand':   'linear-gradient(135deg, #00c85a 0%, #00e676 50%, #69ff47 100%)',
        'gradient-hot':     'linear-gradient(135deg, #ff3d3d, #ff6b2b)',
        'gradient-card':    'linear-gradient(145deg, #08100a 0%, #050905 100%)',
        'gradient-glow':    'radial-gradient(circle at 50% 0%, rgba(0,230,118,0.12) 0%, transparent 70%)',
        'dot-pattern':      'radial-gradient(circle, rgba(0,200,90,0.15) 1px, transparent 1px)',
      },
      boxShadow: {
        'card':        '0 1px 3px rgba(0,0,0,0.7), inset 0 1px 0 rgba(0,255,100,0.04)',
        'card-hover':  '0 0 0 1px rgba(0,200,90,0.3), 0 8px 32px rgba(0,0,0,0.6)',
        'brand':       '0 0 24px rgba(0,200,90,0.35)',
        'brand-lg':    '0 0 48px rgba(0,230,118,0.25)',
        'hot':         '0 0 16px rgba(255,61,61,0.4)',
        'inner-light': 'inset 0 1px 0 rgba(0,255,100,0.06)',
      },
      animation: {
        'fade-in':    'fadeIn 0.25s ease-out',
        'slide-up':   'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        'slide-in':   'slideIn 0.3s cubic-bezier(0.16,1,0.3,1)',
        'glow-pulse': 'glowPulse 2.5s ease-in-out infinite',
        'scan':       'scan 3s linear infinite',
        'float':      'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideIn:   { from: { opacity: '0', transform: 'translateX(16px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        glowPulse: { '0%,100%': { opacity: '0.6' }, '50%': { opacity: '1' } },
        scan:      { from: { transform: 'translateY(-100%)' }, to: { transform: 'translateY(100vh)' } },
        float:     { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-4px)' } },
      },
    },
  },
  plugins: [],
};
