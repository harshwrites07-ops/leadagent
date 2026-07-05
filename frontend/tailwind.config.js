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
        /* Clay-derived app tokens — namespaced so they never collide with
           landing-page/'s own Tailwind config (a separate build). Prefer
           these (e.g. bg-app-bg, text-app-accent) over the legacy names
           above in new app-interior code. */
        app: {
          bg:               'var(--app-bg)',
          'surface-1':      'var(--app-surface-1)',
          'surface-2':      'var(--app-surface-2)',
          border:           'var(--app-border)',
          'text-primary':   'var(--app-text-primary)',
          'text-secondary': 'var(--app-text-secondary)',
          'text-soft':      'var(--app-text-soft)',
          'text-muted':     'var(--app-text-muted)',
          accent:           'var(--app-accent)',
          'accent-hover':   'var(--app-accent-hover)',
          'accent-pressed': 'var(--app-accent-pressed)',
          warning:          'var(--app-warning)',
          danger:           'var(--app-danger)',
        },
      },
      fontFamily: {
        sans:    ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['General Sans', 'Inter Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'monospace'],
        serif:   ['General Sans', 'Inter Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'app-heading': ['Inter var', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'app-body':    ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm:      'var(--r-sm)',
        DEFAULT: 'var(--r)',
        md:      'var(--r-md)',
        lg:      'var(--r-lg)',
        xl:      'var(--r-xl)',
        'app-sm':   'var(--app-radius-sm)',
        'app-md':   'var(--app-radius-md)',
        'app-lg':   'var(--app-radius-lg)',
        'app-pill': 'var(--app-radius-pill)',
      },
      spacing: {
        'app-tight': 'var(--app-space-tight)',
        'app-1':     'var(--app-space-1)',
        'app-2':     'var(--app-space-2)',
        'app-3':     'var(--app-space-3)',
        'app-4':     'var(--app-space-4)',
      },
      boxShadow: {
        'app-card':  'var(--app-shadow-card)',
        'app-modal': 'var(--app-shadow-modal)',
        'app-focus': 'var(--app-shadow-focus)',
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
