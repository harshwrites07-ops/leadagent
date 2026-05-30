import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Mail, CheckCircle } from 'lucide-react';
import api from '../utils/api';

export default function Verify() {
  const [params] = useSearchParams();
  const email = params.get('email') || '';
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const resend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await api.post('/auth/resend-verification', { email });
      setResent(true);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <Mail size={28} color="var(--accent-primary)" />
        </div>
        <h2 style={styles.title}>Check your email</h2>
        <p style={styles.subtitle}>
          We sent a verification link to<br />
          <strong style={{ color: 'var(--text-primary)' }}>{email || 'your email'}</strong>
        </p>

        {error && <div style={styles.errorBox}>{error}</div>}
        {resent && (
          <div style={styles.successBox}>
            <CheckCircle size={14} style={{ marginRight: 6 }} />
            Verification email resent!
          </div>
        )}

        <div style={styles.steps}>
          <div style={styles.step}>1. Open the email from ContentCrafterzz</div>
          <div style={styles.step}>2. Click the "Verify Email" button</div>
          <div style={styles.step}>3. You'll be redirected to complete setup</div>
        </div>

        <button onClick={resend} disabled={resending || resent} style={styles.resendBtn}>
          {resending ? 'Sending...' : resent ? 'Sent!' : 'Resend email'}
        </button>

        <p style={styles.footer}>
          <Link to="/login" style={styles.link}>← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: 16 },
  card: { width: '100%', maxWidth: 380, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '36px 32px', textAlign: 'center' },
  iconWrap: { width: 64, height: 64, borderRadius: 16, background: 'rgba(var(--lime-rgb),0.08)', border: '1px solid rgba(var(--lime-rgb),0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' },
  title: { fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6 },
  errorBox: { background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#FF4444', marginBottom: 16, textAlign: 'left' },
  successBox: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--ok-rgb),0.1)', border: '1px solid rgba(var(--ok-rgb),0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--ok)', marginBottom: 16 },
  steps: { background: 'var(--bg-card)', borderRadius: 10, padding: '14px 16px', marginBottom: 20, textAlign: 'left' },
  step: { fontSize: 12, color: 'var(--text-secondary)', padding: '4px 0', lineHeight: 1.5 },
  resendBtn: { width: '100%', padding: '10px', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 20, fontFamily: 'var(--font-body)' },
  footer: { fontSize: 13, color: 'var(--text-muted)', margin: 0 },
  link: { color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 },
};
