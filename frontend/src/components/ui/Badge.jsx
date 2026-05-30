import React from 'react';

const kinds = {
  lime:  { background: 'var(--lime-soft)',          color: 'var(--lime)',  border: '1px solid var(--lime-border)' },
  coral: { background: 'var(--coral-soft)',         color: 'var(--coral)', border: '1px solid var(--coral-border)' },
  ok:    { background: 'rgba(110,231,168,0.12)',    color: 'var(--ok)',    border: '1px solid rgba(110,231,168,0.3)' },
  warn:  { background: 'rgba(255,209,102,0.12)',    color: 'var(--warn)',  border: '1px solid rgba(255,209,102,0.3)' },
  bad:   { background: 'rgba(255,138,115,0.12)',    color: 'var(--bad)',   border: '1px solid rgba(255,138,115,0.3)' },
  ghost: { background: 'rgba(255,255,255,0.05)',    color: 'var(--text-2)', border: '1px solid var(--line)' },
};

export default function Badge({ kind = 'ghost', children, style, pulse, ...rest }) {
  const k = kinds[kind] || kinds.ghost;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99,
      fontFamily: 'var(--f-mono)', fontSize: 10.5, fontWeight: 500,
      letterSpacing: '0.04em',
      ...k, ...style,
    }} {...rest}>
      {pulse && (
        <span style={{
          width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
          background: k.color,
          animation: kind === 'coral' ? 'coralPulse 1.8s infinite' : 'statusPulse 1.8s infinite',
        }} />
      )}
      {children}
    </span>
  );
}
