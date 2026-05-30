import React from 'react';

export default function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--line)',
      borderRadius: 'var(--r)', padding: '8px 12px',
      fontFamily: 'var(--f-mono)', fontSize: 11,
    }}>
      {label && <div style={{ color: 'var(--text-2)', marginBottom: 4 }}>{label}</div>}
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--text-3)' }}>{entry.name}</span>
          <span style={{ marginLeft: 'auto', paddingLeft: 12 }}>{entry.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
