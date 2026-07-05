import { useEffect } from 'react';
import { motion } from 'framer-motion';

const EASE = [0.16, 1, 0.3, 1];

export default function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <motion.div
      onClick={onCancel}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: EASE }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--app-space-3)' }}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.18, ease: EASE }}
        style={{ background: 'var(--app-surface-1)', border: '1px solid var(--app-border)', borderRadius: 'var(--app-radius-lg)', padding: 'var(--app-space-3)', maxWidth: 400, width: '100%', boxShadow: 'var(--app-shadow-modal)' }}
      >
        <h3 className="type-h5" style={{ color: 'var(--app-text-primary)', margin: '0 0 var(--app-space-1)' }}>{title}</h3>
        <p className="type-body-14" style={{ color: 'var(--app-text-secondary)', margin: '0 0 var(--app-space-3)' }}>{message}</p>
        <div style={{ display: 'flex', gap: 'var(--app-space-1)', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            className="type-button-12"
            style={{ padding: '8px var(--app-space-2)', borderRadius: 'var(--app-radius-pill)', border: '1px solid var(--app-border)', background: 'transparent', color: 'var(--app-text-secondary)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="type-button"
            style={{ padding: '8px var(--app-space-2)', borderRadius: 'var(--app-radius-pill)', border: 'none', background: danger ? 'var(--app-danger)' : 'var(--app-accent)', color: '#ffffff', cursor: 'pointer' }}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
