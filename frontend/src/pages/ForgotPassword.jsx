import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, CheckCircle } from 'lucide-react';
import api from '../utils/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="#0a0a0c" strokeLinejoin="round"/></svg></div>
          <div>
            <p style={styles.logoName}>Quelro</p>
            <p style={styles.logoSub}>OUTREACH OS</p>
          </div>
        </div>

        {!sent ? (
          <>
            <h2 style={styles.title}>Reset password</h2>
            <p style={styles.subtitle}>Enter your email and we'll send a reset link</p>
            {error && <div style={styles.errorBox}>{error}</div>}
            <form onSubmit={handleSubmit} style={styles.form}>
              <label style={styles.label}>Email</label>
              <div style={styles.inputWrap}>
                <Mail size={14} style={styles.inputIcon} />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required style={styles.input} />
              </div>
              <button type="submit" disabled={loading} style={styles.btn}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={styles.successIcon}><CheckCircle size={28} color="var(--ok)" /></div>
            <h2 style={styles.title}>Check your inbox</h2>
            <p style={styles.subtitle}>
              If an account exists for <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>, you'll receive a reset link shortly.
            </p>
          </div>
        )}

        <p style={styles.footer}>
          <Link to="/login" style={styles.link}>← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: 16 },
  card: { width: '100%', maxWidth: 380, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '36px 32px' },
  logo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 },
  logoIcon: { width: 36, height: 36, borderRadius: 9, background: 'var(--gradient-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(var(--lime-rgb),0.3)', flexShrink: 0 },
  logoText: { fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 900, color: '#0a0a0c', letterSpacing: '-0.03em' },
  logoName: { fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 },
  logoSub: { fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600, letterSpacing: '0.14em', color: 'var(--text-muted)', margin: 0 },
  title: { fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6 },
  errorBox: { background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#FF4444', marginBottom: 16 },
  successIcon: { width: 64, height: 64, borderRadius: 16, background: 'rgba(var(--ok-rgb),0.08)', border: '1px solid rgba(var(--ok-rgb),0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' },
  form: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 12, marginBottom: 4 },
  inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  inputIcon: { position: 'absolute', left: 11, color: 'var(--text-muted)', pointerEvents: 'none' },
  input: { width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '9px 12px 9px 34px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)' },
  btn: { marginTop: 16, padding: '11px', background: 'var(--gradient-orange)', border: 'none', borderRadius: 8, color: '#0a0a0c', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' },
  footer: { textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', margin: '20px 0 0' },
  link: { color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 },
};
