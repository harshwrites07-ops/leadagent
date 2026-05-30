import React from 'react';

const sizes = { sm: 22, md: 28, lg: 36, xl: 48 };

function hashColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const palette = ['var(--lime)', 'var(--coral)', 'var(--ok)', 'var(--sky)', 'var(--violet)', 'var(--warn)'];
  return palette[Math.abs(h) % palette.length];
}

export default function Avatar({ name = '', size = 'md', src, style }) {
  const px = sizes[size] || sizes.md;
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  const bg = hashColor(name);
  const isLight = bg === 'var(--lime)' || bg === 'var(--ok)' || bg === 'var(--warn)';

  if (src) {
    return (
      <img src={src} alt={name} style={{ width: px, height: px, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, ...style }} />
    );
  }

  return (
    <div style={{
      width: px, height: px, borderRadius: '50%', flexShrink: 0,
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: px * 0.38, fontWeight: 600, fontFamily: 'var(--f-sans)',
      color: isLight ? '#0a0a0c' : 'var(--text)',
      ...style,
    }}>
      {initials}
    </div>
  );
}
