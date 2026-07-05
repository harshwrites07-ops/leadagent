import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle, XCircle } from 'lucide-react';
import api from '../utils/api';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) { setStatus('error'); setError('Invalid verification link'); return; }
    api.post('/auth/verify-email', { token })
      .then(() => {
        setStatus('success');
        setTimeout(() => navigate('/'), 2500);
      })
      .catch(e => {
        setStatus('error');
        setError(e.response?.data?.error || e.message || 'Verification failed');
      });
  }, [token]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {status === 'verifying' && (
          <>
            <div style={styles.spinner} />
            <h2 style={styles.title}>Verifying...</h2>
            <p style={styles.subtitle}>Please wait</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div style={{ ...styles.iconWrap, background: 'rgba(var(--ok-rgb),0.08)', border: '1px solid rgba(var(--ok-rgb),0.2)' }}>
              <CheckCircle size={28} color="var(--ok)" />
            </div>
            <h2 style={styles.title}>Email verified!</h2>
            <p style={styles.subtitle}>Redirecting to the app...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ ...styles.iconWrap, background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)' }}>
              <XCircle size={28} color="var(--bad)" />
            </div>
            <h2 style={styles.title}>Verification failed</h2>
            <p style={styles.subtitle}>{error}</p>
            <Link to="/login" style={styles.btn}>Go to Login</Link>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: 16 },
  card: { width: '100%', maxWidth: 360, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '40px 32px', textAlign: 'center' },
  iconWrap: { width: 64, height: 64, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' },
  spinner: { width: 40, height: 40, border: '3px solid var(--border-subtle)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' },
  title: { fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' },
  btn: { display: 'inline-block', padding: '10px 24px', background: 'var(--lime)', borderRadius: 8, color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, textDecoration: 'none' },
};
