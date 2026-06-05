import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$49',
    period: '/mo',
    leads: 'Unlimited lead extraction',
    emails: '2,000 emails/mo',
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$199',
    period: '/mo',
    leads: 'Unlimited lead extraction',
    emails: '10,000 emails/mo',
    highlight: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '$599',
    period: '/mo',
    leads: 'Unlimited lead extraction',
    emails: 'Unlimited emails',
    highlight: false,
  },
];

export default function UpgradeWall() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);

  const handleUpgrade = async (planId) => {
    setLoading(planId);
    try {
      const { data } = await api.post('/stripe/create-checkout', { plan: planId });
      if (data.url) window.location.href = data.url;
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to start checkout. Try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(10,10,12,0.92)',
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 760, width: '100%' }}>
        {/* Logo */}
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'var(--lime)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <span style={{ fontWeight: 900, fontSize: 18, color: '#0a0a0c', fontFamily: 'var(--f-sans)' }}>CC</span>
        </div>

        <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 32, color: 'var(--text)', margin: '0 0 8px', fontStyle: 'italic' }}>
          Your free trial has ended.
        </h2>
        <p style={{ color: 'var(--text-2)', fontSize: 15, margin: '0 0 36px' }}>
          Pick a plan to keep finding leads, generating pitches, and sending emails.
        </p>

        {/* Plans */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 28 }}>
          {PLANS.map(plan => (
            <div key={plan.id} style={{
              background: plan.highlight ? 'var(--surface-2)' : 'var(--surface)',
              border: `1px solid ${plan.highlight ? 'var(--lime-border)' : 'var(--line)'}`,
              borderRadius: 14,
              padding: '28px 24px',
              position: 'relative',
              textAlign: 'left',
            }}>
              {plan.highlight && (
                <div style={{
                  position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--lime)', color: '#0a0a0c',
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
                  padding: '3px 12px', borderRadius: 99,
                  fontFamily: 'var(--f-mono)',
                }}>MOST POPULAR</div>
              )}
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>{plan.name}</div>
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: plan.highlight ? 'var(--lime)' : 'var(--text)', fontFamily: 'var(--f-sans)' }}>{plan.price}</span>
                <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{plan.period}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>✓ {plan.leads}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24 }}>✓ {plan.emails}</div>
              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={!!loading}
                style={{
                  width: '100%',
                  background: plan.highlight ? 'var(--lime)' : 'var(--surface-3)',
                  color: plan.highlight ? '#0a0a0c' : 'var(--text)',
                  border: `1px solid ${plan.highlight ? 'transparent' : 'var(--line-2)'}`,
                  borderRadius: 8,
                  padding: '10px 0',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading && loading !== plan.id ? 0.5 : 1,
                  fontFamily: 'var(--f-sans)',
                  transition: 'opacity 0.15s',
                }}
              >
                {loading === plan.id ? 'Redirecting…' : `Get ${plan.name}`}
              </button>
            </div>
          ))}
        </div>

        <p style={{ color: 'var(--text-4)', fontSize: 12 }}>
          Cancel anytime · Secure checkout via Stripe · <a href="/terms" target="_blank" style={{ color: 'var(--text-3)' }}>Terms</a> · <a href="/privacy" target="_blank" style={{ color: 'var(--text-3)' }}>Privacy</a>
        </p>
      </div>
    </div>
  );
}
