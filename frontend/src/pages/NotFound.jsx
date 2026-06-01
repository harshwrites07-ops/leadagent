import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)',
      fontFamily: 'var(--f-sans)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 24, flexDirection: 'column', textAlign: 'center',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, background: 'var(--lime)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
      }}>
        <span style={{ fontWeight: 900, fontSize: 18, color: '#0a0a0c' }}>CC</span>
      </div>

      <div style={{
        fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.14em',
        color: 'var(--text-3)', marginBottom: 12,
      }}>ERROR 404</div>

      <h1 style={{
        fontFamily: 'var(--f-serif)', fontSize: 38, fontStyle: 'italic',
        color: 'var(--text)', margin: '0 0 12px',
      }}>Page not found.</h1>

      <p style={{ color: 'var(--text-2)', fontSize: 15, margin: '0 0 32px', maxWidth: 360 }}>
        The page you're looking for doesn't exist or has been moved.
      </p>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'var(--surface-2)', border: '1px solid var(--line-2)',
            color: 'var(--text-2)', borderRadius: 8, padding: '10px 20px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--f-sans)',
          }}
        >
          ← Go back
        </button>
        <Link to="/" style={{
          background: 'var(--lime)', color: '#0a0a0c', borderRadius: 8,
          padding: '10px 20px', fontSize: 13, fontWeight: 700,
          textDecoration: 'none', fontFamily: 'var(--f-sans)',
        }}>
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
