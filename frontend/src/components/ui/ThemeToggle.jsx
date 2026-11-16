import React, { useState, useEffect } from 'react';

const KEY = 'quelro-theme';

export function getStoredTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch (e) { /* storage blocked */ }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme) {
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
}

/* The theme only applies inside the signed-in app. Public pages (landing, login)
   stay dark: Layout mounts this, and unmounting restores the dark default. */
export function useAppTheme() {
  const [theme, setTheme] = useState(getStoredTheme);
  useEffect(() => {
    applyTheme(theme);
    return () => applyTheme('dark');
  }, [theme]);
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
    setTheme(next);
  };
  return [theme, toggle];
}

export default function ThemeToggle({ theme, onToggle }) {
  const isLight = theme === 'light';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      title={isLight ? 'Dark mode' : 'Light mode'}
      style={{
        width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center',
        cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--line-2)',
        color: 'var(--text-2)', transition: 'all 120ms', flexShrink: 0,
      }}
    >
      {isLight ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      )}
    </button>
  );
}
