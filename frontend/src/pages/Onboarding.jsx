import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { CheckCircle2, Loader2, Mail, ArrowRight, X } from 'lucide-react';

const NICHES = ['Gaming', 'Fitness', 'Finance', 'Tech', 'Travel', 'Food', 'Education', 'Lifestyle', 'Business', 'Entertainment', 'DIY/Crafts', 'Beauty', 'Sports', 'Pets', 'Music'];

const inputSt = {
  width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
  borderRadius: 8, padding: '10px 14px', fontSize: 14, color: 'var(--text-primary)',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)',
};

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    full_name: '', agency_name: '', role: 'Video Editor',
    target_niches: [], portfolio_url: '',
  });
  const [gmailAccounts, setGmailAccounts] = useState([]);
  const [loadingGmail, setLoadingGmail] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshUser } = useAuth();

  const set = k => v => setForm(f => ({ ...f, [k]: v }));
  const setInput = k => e => set(k)(e.target.value);

  const toggleNiche = (n) => {
    setForm(f => ({
      ...f,
      target_niches: f.target_niches.includes(n)
        ? f.target_niches.filter(x => x !== n)
        : [...f.target_niches, n],
    }));
  };

  // Load Gmail accounts on step 3
  useEffect(() => {
    if (step === 3) loadGmailAccounts();
  }, [step]);

  // Handle OAuth callback redirect to onboarding
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('gmail_connected') === '1') {
      loadGmailAccounts();
      navigate('/onboarding', { replace: true });
      setStep(3);
    } else if (params.get('gmail_error')) {
      setError('Gmail connection failed: ' + decodeURIComponent(params.get('gmail_error')));
      navigate('/onboarding', { replace: true });
    }
  }, [location.search]);

  const loadGmailAccounts = async () => {
    setLoadingGmail(true);
    try {
      const res = await api.get('/gmail/accounts');
      setGmailAccounts(res.data.accounts || []);
    } catch {}
    finally { setLoadingGmail(false); }
  };

  const connectGmail = async () => {
    setConnectingGmail(true);
    setError('');
    try {
      const res = await api.get('/gmail/auth-url');
      if (res.data.url) {
        window.location.href = res.data.url;
      } else {
        setError(res.data.error || 'Gmail not configured on this server yet.');
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to connect Gmail');
    } finally {
      setConnectingGmail(false);
    }
  };

  const finish = async () => {
    setLoading(true);
    setError('');
    try {
      await api.put('/auth/onboarding', {
        ...form,
        target_platforms: ['YouTube'],
      });
      await refreshUser();
      navigate('/');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setLoading(false);
    }
  };

  const TOTAL_STEPS = 4;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 480, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '40px 36px' }}>

        {/* Step progress */}
        <div style={{ display: 'flex', align: 'center', gap: 6, marginBottom: 32 }}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i < step ? 'var(--accent-primary)' : 'var(--border-strong)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Step 1: Profile */}
        {step === 1 && (
          <>
            <div style={{ marginBottom: 24 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--gradient-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 900, color: '#fff' }}>CC</span>
              </div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Welcome to ContentCrafterzz</h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Let's set up your outreach profile. This helps AI write pitches that sound like you.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5, fontFamily: 'var(--font-mono)' }}>YOUR NAME</label>
                  <input style={inputSt} value={form.full_name} onChange={setInput('full_name')} placeholder="Alex Johnson" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5, fontFamily: 'var(--font-mono)' }}>AGENCY NAME</label>
                  <input style={inputSt} value={form.agency_name} onChange={setInput('agency_name')} placeholder="ContentCrafterzz" />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5, fontFamily: 'var(--font-mono)' }}>YOUR ROLE</label>
                <select style={inputSt} value={form.role} onChange={setInput('role')}>
                  {['Video Editor', 'Founder', 'Freelancer', 'Agency Owner', 'Content Creator', 'Other'].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5, fontFamily: 'var(--font-mono)' }}>PORTFOLIO URL <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <input style={inputSt} value={form.portfolio_url} onChange={setInput('portfolio_url')} placeholder="https://yourportfolio.com" />
              </div>
            </div>
            <button onClick={() => setStep(2)} style={btnSt}>
              Continue <ArrowRight size={15} />
            </button>
          </>
        )}

        {/* Step 2: Target Niches */}
        {step === 2 && (
          <>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Which niches do you serve?</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Pick all that apply — AI will focus pitches on these creator types.</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
              {NICHES.map(n => (
                <button key={n} type="button" onClick={() => toggleNiche(n)} style={{
                  padding: '7px 14px', borderRadius: 99, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                  ...(form.target_niches.includes(n)
                    ? { background: 'rgba(255,69,0,0.12)', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)' }
                    : { background: 'var(--bg-card)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }),
                }}>
                  {n}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(1)} style={backBtnSt}>← Back</button>
              <button onClick={() => setStep(3)} style={btnSt}>
                Continue <ArrowRight size={15} />
              </button>
            </div>
          </>
        )}

        {/* Step 3: Connect Gmail */}
        {step === 3 && (
          <>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Connect your Gmail</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Emails send directly from your Gmail — higher deliverability, no spam filters.</p>
            </div>

            {loadingGmail ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />
              </div>
            ) : gmailAccounts.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {gmailAccounts.map(acc => (
                  <div key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)', borderRadius: 8 }}>
                    <CheckCircle2 size={16} style={{ color: '#00E5A0', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{acc.email}</span>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Connected · up to 500 emails/day</p>
                    </div>
                  </div>
                ))}
                <button onClick={connectGmail} disabled={connectingGmail} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12,
                  borderRadius: 8, background: 'transparent', border: '1.5px dashed var(--border-default)',
                  color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
                }}>
                  <Mail size={13} /> Add another Gmail
                </button>
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <button onClick={connectGmail} disabled={connectingGmail} style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: '16px', borderRadius: 10, cursor: connectingGmail ? 'wait' : 'pointer',
                  background: 'rgba(66,133,244,0.08)', border: '2px solid rgba(66,133,244,0.3)',
                  color: '#4285F4', fontSize: 15, fontWeight: 600, transition: 'all 0.15s', marginBottom: 10,
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(66,133,244,0.14)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(66,133,244,0.08)'; }}>
                  {connectingGmail ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={16} />}
                  Connect Gmail with Google
                </button>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                  We only request permission to send emails. You can disconnect anytime.
                </p>
              </div>
            )}

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: 8, fontSize: 12, color: '#FF6B6B', marginBottom: 16 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(2)} style={backBtnSt}>← Back</button>
              <button onClick={() => setStep(4)} style={{ ...btnSt, background: gmailAccounts.length > 0 ? 'var(--gradient-orange)' : 'var(--bg-elevated)', color: gmailAccounts.length > 0 ? '#fff' : 'var(--text-secondary)', border: gmailAccounts.length > 0 ? 'none' : '1px solid var(--border-default)', cursor: 'pointer' }}>
                {gmailAccounts.length > 0 ? 'Continue' : 'Skip for now'} <ArrowRight size={15} />
              </button>
            </div>
          </>
        )}

        {/* Step 4: Ready */}
        {step === 4 && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(0,229,160,0.1)', border: '2px solid #00E5A0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <CheckCircle2 size={28} style={{ color: '#00E5A0' }} />
              </div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>You're all set!</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                Your profile is ready. Start by finding your first leads — just paste a YouTube niche and we'll find channels to pitch.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {[
                { label: 'Profile configured', done: true },
                { label: 'Target niches selected', done: form.target_niches.length > 0 },
                { label: 'Gmail connected', done: gmailAccounts.length > 0 },
              ].map(({ label, done }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: done ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                  <CheckCircle2 size={14} style={{ color: done ? '#00E5A0' : 'var(--border-strong)', flexShrink: 0 }} />
                  {label}
                </div>
              ))}
            </div>

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: 8, fontSize: 12, color: '#FF6B6B', marginBottom: 16 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(3)} style={backBtnSt}>← Back</button>
              <button onClick={finish} disabled={loading} style={btnSt}>
                {loading ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Setting up...</> : <>Find First Leads <ArrowRight size={15} /></>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const btnSt = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '12px', background: 'var(--gradient-orange)', border: 'none',
  borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'var(--font-body)', transition: 'opacity 0.15s',
};

const backBtnSt = {
  padding: '12px 16px', background: 'none', border: '1px solid var(--border-subtle)',
  borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--font-body)',
};
