import { useEffect } from 'react';

export default function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 12, padding: '24px', maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
      >
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>{title}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: danger ? '#FF4444' : 'var(--gradient-orange)', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)', fontWeight: 600 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
