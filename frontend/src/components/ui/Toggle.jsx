import React from 'react';

export default function Toggle({ checked, onChange, disabled }) {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 99, flexShrink: 0,
        background: checked ? 'var(--lime)' : 'var(--surface-2)',
        border: '1px solid ' + (checked ? 'var(--lime)' : 'var(--line-2)'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        position: 'relative',
        transition: 'background .12s, border-color .12s',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 2, left: checked ? 17 : 2,
        width: 14, height: 14, borderRadius: '50%',
        background: checked ? '#0a0a0c' : 'var(--text-3)',
        transition: 'left .12s',
      }} />
    </div>
  );
}
