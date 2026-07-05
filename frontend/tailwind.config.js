/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      'var(--bg)',
        surface: 'var(--surface)',
        line:    'var(--line)',
        text:    'var(--text)',
        heading: 'var(--heading)',
        muted:   'var(--text-2)',
        accent:  'var(--lime)',
        lime:    'var(--lime)',
        coral:   'var(--coral)',
        ok:      'var(--ok)',
        warn:    'var(--warn)',
        bad:     'var(--bad)',
      },
      fontFamily: {
        sans:    ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['General Sans', 'Inter Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'monospace'],
        serif:   ['General Sans', 'Inter Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm:      'var(--r-sm)',
        DEFAULT: 'var(--r)',
        md:      'var(--r-md)',
        lg:      'var(--r-lg)',
        xl:      'var(--r-xl)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34,1.56,0.64,1)',
        smooth: 'cubic-bezier(0.16,1,0.3,1)',
      },
      animation: {
        'fade-up':  'fadeUp 300ms cubic-bezier(0.16,1,0.3,1)',
        'fade-in':  'fadeIn 200ms ease-out',
        'slide-in': 'slideIn 300ms cubic-bezier(0.16,1,0.3,1)',
        'float':    'float 8s ease-in-out infinite',
        'shimmer':  'shimmer 1.5s infinite',
        'spin':     'spin 1s linear infinite',
        'modal-in': 'modalIn 250ms cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
};
