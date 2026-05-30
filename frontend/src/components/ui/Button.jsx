import React from 'react';

const sizes = {
  sm: { height: 26, padding: '0 10px', fontSize: 12, gap: 4 },
  md: { height: 32, padding: '0 14px', fontSize: 13, gap: 6 },
  lg: { height: 40, padding: '0 20px', fontSize: 13, gap: 7 },
};

const variants = {
  primary:   { background: 'var(--lime)',       color: '#0a0a0c',     border: 'none' },
  secondary: { background: 'transparent',       color: 'var(--text)', border: '1px solid var(--line-2)' },
  ghost:     { background: 'transparent',       color: 'var(--text-2)', border: 'none' },
  coral:     { background: 'var(--coral-soft)', color: 'var(--coral)', border: '1px solid var(--coral-border)' },
  danger:    { background: 'rgba(255,138,115,0.1)', color: 'var(--bad)', border: '1px solid rgba(255,138,115,0.3)' },
};

const hoverVariants = {
  primary:   { background: 'var(--lime-2)' },
  secondary: { background: 'var(--hover)', borderColor: 'var(--line-3)' },
  ghost:     { background: 'var(--hover)', color: 'var(--text)' },
  coral:     { background: 'rgba(255,138,115,0.22)' },
  danger:    { background: 'rgba(255,138,115,0.2)' },
};

export default function Button({ variant = 'secondary', size = 'md', children, style, disabled, onClick, type = 'button', ...rest }) {
  const [hovered, setHovered] = React.useState(false);
  const sz = sizes[size] || sizes.md;
  const vr = variants[variant] || variants.secondary;
  const hv = hoverVariants[variant] || {};

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: sz.gap, height: sz.height, padding: sz.padding,
        fontSize: sz.fontSize, fontWeight: 500, fontFamily: 'var(--f-sans)',
        borderRadius: 'var(--r)', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1, whiteSpace: 'nowrap',
        transition: 'background .12s, border-color .12s, color .12s',
        textDecoration: 'none',
        ...vr,
        ...(hovered && !disabled ? hv : {}),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
