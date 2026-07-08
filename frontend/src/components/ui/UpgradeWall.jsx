import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../../utils/api';

const EASE = [0.16, 1, 0.3, 1];

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$29',
    period: '/mo',
    leads: 'Unlimited lead extraction',
    emails: '500 emails/mo',
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49',
    period: '/mo',
    leads: 'Unlimited lead extraction',
    emails: '1,500 emails/mo',
    highlight: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '$149',
    period: '/mo',
    leads: 'Unlimited lead extraction',
    emails: '5,000 emails/mo',
    highlight: false,
  },
];

export default function UpgradeWall() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);

  const handleUpgrade = async (planId) => {
    setLoading(planId);
    try {
      const { data } = await api.post('/razorpay/create-subscription', { plan: planId });
      const { subscription_id, key, plan_name, user_name, user_email, user_contact } = data;

      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://checkout.razorpay.com/v1/checkout.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }

      const rzp = new window.Razorpay({
        key,
        subscription_id,
        name: 'Quelro',
        description: plan_name,
        prefill: { name: user_name, email: user_email, contact: user_contact },
        theme: { color: '#3ea2fd' },
        handler: async (response) => {
          try {
            await api.post('/razorpay/verify-payment', {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_signature: response.razorpay_signature,
              plan: planId,
            });
            window.location.reload();
          } catch (e) {
            alert(e.response?.data?.error || 'Payment verification failed');
          } finally {
            setLoading(null);
          }
        },
        modal: { ondismiss: () => setLoading(null) },
      });
      rzp.open();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to start checkout. Try again.');
      setLoading(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: EASE }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(10,10,12,0.92)',
        backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--app-space-3)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18, ease: EASE }}
        style={{ textAlign: 'center', maxWidth: 760, width: '100%' }}
      >
        {/* Logo */}
        <div style={{
          width: 48, height: 48, borderRadius: 'var(--app-radius-lg)',
          background: 'var(--app-accent)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto var(--app-space-2)',
        }}>
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none"><path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="#ffffff" strokeLinejoin="round"/></svg>
        </div>

        <h2 className="type-h1" style={{ color: 'var(--app-text-primary)', margin: '0 0 var(--app-space-1)' }}>
          Your free trial has ended.
        </h2>
        <p className="type-body-14" style={{ color: 'var(--app-text-secondary)', margin: '0 0 var(--app-space-4)' }}>
          Pick a plan to keep finding leads, generating pitches, and sending emails.
        </p>

        {/* Plans */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--app-space-2)', marginBottom: 'var(--app-space-3)' }}>
          {PLANS.map(plan => (
            <div key={plan.id} style={{
              background: plan.highlight ? 'var(--app-surface-2)' : 'var(--app-surface-1)',
              border: `1px solid ${plan.highlight ? 'var(--app-accent-border)' : 'var(--app-border)'}`,
              borderRadius: 'var(--app-radius-lg)',
              boxShadow: 'var(--app-shadow-card)',
              padding: 'var(--app-space-3) var(--app-space-2)',
              position: 'relative',
              textAlign: 'left',
            }}>
              {plan.highlight && (
                <div className="type-body-12" style={{
                  position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--app-accent)', color: '#ffffff',
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  padding: '3px var(--app-space-2)', borderRadius: 'var(--app-radius-pill)',
                }}>Most popular</div>
              )}
              <div className="type-h5" style={{ color: 'var(--app-text-primary)', marginBottom: 'var(--app-space-tight)' }}>{plan.name}</div>
              <div style={{ marginBottom: 'var(--app-space-2)' }}>
                <span style={{ fontFamily: 'var(--app-font-heading)', fontSize: 32, fontWeight: 700, color: plan.highlight ? 'var(--app-accent)' : 'var(--app-text-primary)' }}>{plan.price}</span>
                <span className="type-body-14" style={{ color: 'var(--app-text-muted)' }}>{plan.period}</span>
              </div>
              <div className="type-body-14" style={{ color: 'var(--app-text-secondary)', marginBottom: 'var(--app-space-tight)' }}>✓ {plan.leads}</div>
              <div className="type-body-14" style={{ color: 'var(--app-text-secondary)', marginBottom: 'var(--app-space-3)' }}>✓ {plan.emails}</div>
              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={!!loading}
                className="type-button"
                style={{
                  width: '100%',
                  background: plan.highlight ? 'var(--app-accent)' : 'var(--app-surface-2)',
                  color: plan.highlight ? '#ffffff' : 'var(--app-text-primary)',
                  border: `1px solid ${plan.highlight ? 'transparent' : 'var(--app-border)'}`,
                  borderRadius: 'var(--app-radius-pill)',
                  padding: '10px 0',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading && loading !== plan.id ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {loading === plan.id ? 'Redirecting…' : `Get ${plan.name}`}
              </button>
            </div>
          ))}
        </div>

        <p className="type-body-12" style={{ color: 'var(--app-text-muted)' }}>
          Cancel anytime · Secure checkout via Razorpay · <a href="/terms" target="_blank" style={{ color: 'var(--app-text-secondary)' }}>Terms</a> · <a href="/privacy" target="_blank" style={{ color: 'var(--app-text-secondary)' }}>Privacy</a>
        </p>
      </motion.div>
    </motion.div>
  );
}
