import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password, remember);
      if (!data.user?.onboarding_completed) return navigate('/onboarding');
      navigate('/');
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const googleError = params.get('error');
  const googleErrorMsg = googleError === 'google_not_configured'
    ? 'Google Sign-In is not set up. Use email/password instead.'
    : googleError ? 'Google sign-in failed. Try again.' : null;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <div style={styles.logoIcon}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="var(--bg)" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p style={styles.logoName}>Quelro</p>
            <p style={styles.logoSub}>OUTREACH OS</p>
          </div>
        </div>

        <h2 style={styles.title}>Welcome back.</h2>
        <p style={styles.subtitle}>Your leads are waiting.</p>

        {(error || googleErrorMsg) && (
          <div style={styles.errorBox}>{error || googleErrorMsg}</div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Email</label>
          <div style={styles.inputWrap}>
            <Mail size={14} style={styles.inputIcon} />
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required style={styles.input}
            />
          </div>

          <label style={styles.label}>Password</label>
          <div style={styles.inputWrap}>
            <Lock size={14} style={styles.inputIcon} />
            <input
              type={showPw ? 'text' : 'password'} value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required style={{ ...styles.input, paddingRight: 36 }}
            />
            <button type="button" onClick={() => setShowPw(s => !s)} style={styles.eyeBtn}>
              {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>

          <div style={styles.row}>
            <label style={styles.checkLabel}>
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="custom-checkbox" style={{ marginRight: 6 }} />
              Remember me
            </label>
            <Link to="/forgot-password" style={styles.link}>Forgot password?</Link>
          </div>

          <button type="submit" disabled={loading} style={styles.btn}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={styles.divider}><span style={styles.dividerText}>or continue with</span></div>

        <a href="/api/auth/google" style={styles.googleBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" style={{ marginRight: 8 }}>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </a>

        <Link to="/phone-login" style={styles.phoneBtn}>
          <Phone size={14} style={{ marginRight: 8 }} />
          Continue with Phone
        </Link>

        <p style={styles.footer}>
          Don't have an account?{' '}
          <Link to="/signup" style={styles.link}>Create one</Link>
        </p>
        <p style={{ ...styles.footer, fontSize: 11, color: 'var(--text-4)', marginTop: 8 }}>
          <Link to="/terms" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>Terms</Link>
          {' · '}
          <Link to="/privacy" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>Privacy</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: 16 },
  card: { width: '100%', maxWidth: 400, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '36px 32px' },
  logo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 },
  logoIcon: { width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg, var(--lime), var(--coral))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  logoText: { fontFamily: 'var(--f-sans)', fontSize: 14, fontWeight: 700, color: 'var(--bg)', letterSpacing: '-0.03em' },
  logoName: { fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 },
  logoSub: { fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600, letterSpacing: '0.14em', color: 'var(--text-muted)', margin: 0 },
  title: { fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' },
  errorBox: { background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--bad)', marginBottom: 16 },
  form: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 12, marginBottom: 4 },
  inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  inputIcon: { position: 'absolute', left: 11, color: 'var(--text-muted)', pointerEvents: 'none' },
  input: { width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '9px 12px 9px 34px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)' },
  eyeBtn: { position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 4 },
  checkLabel: { display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' },
  link: { fontSize: 12, color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 },
  btn: { marginTop: 16, padding: '11px', background: 'var(--lime)', border: 'none', borderRadius: 8, color: 'var(--bg)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--f-sans)' },
  divider: { display: 'flex', alignItems: 'center', margin: '20px 0', gap: 12 },
  dividerText: { fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '0 8px', whiteSpace: 'nowrap' },
  googleBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', marginBottom: 8, fontFamily: 'var(--font-body)' },
  phoneBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', marginBottom: 20, fontFamily: 'var(--font-body)' },
  footer: { textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', margin: 0 },
};
