import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/* ── Trial expiry banner — shown at top of Layout when trial is running out ── */
export default function TrialBanner() {
  const { trialExpired, trialDaysLeft, user } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  // Don't show for paid plans or admin or if dismissed
  if (!user || user.is_admin) return null;
  const PAID = ['starter', 'pro', 'growth', 'agency'];
  if (PAID.includes(user.plan) && user.plan_status === 'active') return null;
  if (dismissed) return null;

  // Only show banner when ≤5 days left or expired
  if (!trialExpired && (trialDaysLeft === null || trialDaysLeft > 5)) return null;

  const urgent = trialExpired || trialDaysLeft <= 1;

  return (
    <div style={{
      background: urgent ? 'rgba(var(--lime-rgb),0.13)' : 'rgba(var(--lime-rgb),0.08)',
      borderBottom: `1px solid ${urgent ? 'rgba(var(--lime-rgb),0.32)' : 'rgba(var(--lime-rgb),0.22)'}`,
      padding: '9px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      fontSize: 13,
      color: urgent ? 'var(--coral)' : 'var(--lime)',
      flexShrink: 0,
    }}>
      <span style={{ fontWeight: 500 }}>
        {trialExpired
          ? '⚠️ Your free trial has ended — upgrade to keep sending.'
          : `⏳ ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left on your trial.`}
      </span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => navigate('/settings#billing')}
          style={{
            background: urgent ? 'var(--coral)' : 'var(--lime)',
            color: 'var(--on-accent)',
            border: 'none',
            borderRadius: 7,
            padding: '5px 14px',
            fontWeight: 700,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'var(--f-sans)',
            letterSpacing: '0.02em',
          }}
        >
          Upgrade now
        </button>
        {!trialExpired && (
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-3)',
              fontSize: 18,
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0 4px',
            }}
            aria-label="Dismiss"
          >×</button>
        )}
      </div>
    </div>
  );
}
