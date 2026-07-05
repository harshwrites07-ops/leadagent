import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

export default function PhoneLogin() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [step, setStep] = useState('phone'); // phone | otp
  const [otpHint, setOtpHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const otpRefs = useRef([]);

  const sendOtp = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/phone-login', { phone_number: phone });
      setOtpHint(res.data.message || '');
      setStep('otp');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (i, val) => {
    const v = val.replace(/\D/g, '').slice(0, 1);
    const next = [...otp];
    next[i] = v;
    setOtp(next);
    if (v && i < 5) otpRefs.current[i + 1]?.focus();
    if (!v && i > 0) otpRefs.current[i - 1]?.focus();
  };

  const handleOtpPaste = e => {
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (paste.length === 6) {
      setOtp(paste.split(''));
      otpRefs.current[5]?.focus();
    }
  };

  const verifyOtp = async e => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) return setError('Enter the 6-digit code');
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/phone-login/verify', { phone_number: phone, code });
      await refreshUser();
      navigate('/');
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
          <div style={styles.logoIcon}><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="var(--on-accent)" strokeLinejoin="round"/></svg></div>
          <div>
            <p style={styles.logoName}>Quelro</p>
            <p style={styles.logoSub}>OUTREACH OS</p>
          </div>
        </div>

        {step === 'phone' ? (
          <>
            <h2 style={styles.title}>Phone Sign In</h2>
            <p style={styles.subtitle}>We'll send a verification code</p>
            {error && <div style={styles.errorBox}>{error}</div>}
            <form onSubmit={sendOtp} style={styles.form}>
              <label style={styles.label}>Phone Number</label>
              <div style={styles.inputWrap}>
                <Phone size={14} style={styles.inputIcon} />
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 234 567 8900" required style={styles.input} />
              </div>
              <button type="submit" disabled={loading} style={styles.btn}>
                {loading ? 'Sending...' : 'Send Code'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2 style={styles.title}>Enter Code</h2>
            <p style={styles.subtitle}>{otpHint || `Sent to ${phone}`}</p>
            {error && <div style={styles.errorBox}>{error}</div>}
            <form onSubmit={verifyOtp} style={styles.form}>
              <div style={styles.otpRow}>
                {otp.map((digit, i) => (
                  <input
                    key={i} ref={el => otpRefs.current[i] = el}
                    type="text" inputMode="numeric" maxLength={1} value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onPaste={handleOtpPaste}
                    onKeyDown={e => { if (e.key === 'Backspace' && !digit && i > 0) otpRefs.current[i - 1]?.focus(); }}
                    style={styles.otpInput}
                  />
                ))}
              </div>
              <button type="submit" disabled={loading} style={styles.btn}>
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
              <button type="button" onClick={() => { setStep('phone'); setOtp(['','','','','','']); setError(''); }} style={styles.backBtn}>
                Change number
              </button>
            </form>
          </>
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
  logoIcon: { width: 36, height: 36, borderRadius: 9, background: 'var(--lime)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(var(--lime-rgb),0.3)', flexShrink: 0 },
  logoText: { fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 900, color: 'var(--on-accent)', letterSpacing: '-0.03em' },
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
  otpRow: { display: 'flex', gap: 8, justifyContent: 'center', margin: '8px 0 4px' },
  otpInput: { width: 44, height: 52, background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', outline: 'none', fontFamily: 'var(--font-mono)' },
  btn: { marginTop: 16, padding: '11px', background: 'var(--lime)', border: 'none', borderRadius: 8, color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' },
  backBtn: { marginTop: 8, padding: '9px', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' },
  footer: { textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', margin: '20px 0 0' },
  link: { color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 },
};
