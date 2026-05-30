import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/ui/Icon';
import api from '../utils/api';

const STEPS = [
  { title: 'Welcome to ContentCrafterzz', sub: 'Built for agencies running outreach to creators.' },
  { title: 'Connect your mailbox',         sub: 'Outpost rotates across multiple senders to protect deliverability.' },
  { title: 'Tell us who you sell to',      sub: 'We use this to scrape, score, and personalize.' },
  { title: 'Draft your pitch',             sub: 'You write the brief. The agent writes the emails.' },
  { title: 'Ready to launch',              sub: 'Your first campaign is one click away.' },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    full_name: '', agency_name: '', role: 'Video Editor',
    target_niches: [], portfolio_url: '',
    what_you_sell: '', niche: '', sub_range: '', geography: '', cadence: '',
    pitch_brief: '',
  });
  const [gmailAccounts, setGmailAccounts] = useState([]);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshUser } = useAuth();

  useEffect(() => {
    if (step === 1) loadGmailAccounts();
  }, [step]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('gmail_connected') === '1') {
      loadGmailAccounts();
      navigate('/onboarding', { replace: true });
      setStep(1);
    } else if (params.get('gmail_error')) {
      setError('Gmail connection failed: ' + decodeURIComponent(params.get('gmail_error')));
      navigate('/onboarding', { replace: true });
    }
  }, [location.search]);

  const loadGmailAccounts = async () => {
    try {
      const res = await api.get('/gmail/accounts');
      setGmailAccounts(res.data.accounts || []);
    } catch {}
  };

  const connectGmail = async () => {
    setConnectingGmail(true);
    setError('');
    try {
      const res = await api.get('/gmail/auth-url');
      if (res.data.url) window.location.href = res.data.url;
      else setError(res.data.error || 'Gmail not configured on this server yet.');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to connect Gmail');
    } finally {
      setConnectingGmail(false);
    }
  };

  const finish = async () => {
    setFinishing(true);
    setError('');
    try {
      await api.put('/auth/onboarding', {
        full_name: form.full_name,
        agency_name: form.agency_name,
        role: form.role,
        target_niches: form.target_niches,
        portfolio_url: form.portfolio_url,
        target_platforms: ['YouTube'],
        pitch_brief: form.pitch_brief,
        what_you_sell: form.what_you_sell,
      });
      await refreshUser();
      navigate('/');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setFinishing(false);
    }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="onb">
      <div className="onb__card">
        {/* Header */}
        <div style={{ padding: '24px 28px 12px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="sb__logo" style={{ width: 30, height: 30 }}><span>c</span></div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>ContentCrafterzz Outreach OS</div>
            <div className="muted mono" style={{ fontSize: 10.5 }}>Setup · {step + 1} of {STEPS.length}</div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn btn--ghost btn--sm" onClick={() => navigate('/')}>
            <Icon name="x" size={12} />Skip
          </button>
        </div>

        {/* Progress bars */}
        <div style={{ display: 'flex', gap: 4, padding: '0 28px 24px' }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? 'var(--lime)' : 'var(--surface-3)' }} />
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: '8px 28px 28px' }}>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Step {step + 1}</div>
          <h2 className="page__title" style={{ fontSize: 32, marginBottom: 6 }}>{STEPS[step].title}</h2>
          <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 24 }}>{STEPS[step].sub}</div>

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="grid g-3" style={{ gap: 12 }}>
              {[
                { ic: 'sparkle', t: 'AI agents do the work',  d: 'Scrape, study, write, send, follow up. You stay strategic.' },
                { ic: 'flame',   t: 'Deliverability-first',   d: 'Built-in warmup, rotation, and inbox placement monitoring.' },
                { ic: 'bar',     t: 'Honest analytics',        d: 'Cost per meeting. Pipeline value. Nothing vanity.' },
              ].map((f, i) => (
                <div key={i} style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'var(--bg-2)' }}>
                  <div style={{ color: 'var(--lime)', marginBottom: 10 }}><Icon name={f.ic} size={18} /></div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{f.t}</div>
                  <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{f.d}</div>
                </div>
              ))}
            </div>
          )}

          {/* Step 1: Connect mailbox */}
          {step === 1 && (
            <div className="col" style={{ gap: 10 }}>
              {gmailAccounts.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  {gmailAccounts.map(acc => (
                    <div key={acc.id} style={{ padding: '12px 16px', border: '1px solid var(--lime-border)', borderRadius: 'var(--r)', background: 'var(--lime-soft)', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
                      <span className="badge badge--lime"><Icon name="check" size={11} /></span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{acc.email}</div>
                        <div className="muted" style={{ fontSize: 11.5 }}>Connected · up to {acc.daily_limit || 500} emails/day</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {[
                { n: 'Google Workspace', d: 'Recommended · OAuth in 1 click', primary: true, action: connectGmail },
                { n: 'Microsoft 365',    d: 'Outlook & Exchange · OAuth', primary: false, action: null },
                { n: 'Custom SMTP / IMAP', d: 'Smartlead, Mailreef, your own server', primary: false, action: null },
              ].map((p, i) => (
                <div key={i}
                  onClick={p.action ? p.action : undefined}
                  style={{
                    padding: 16,
                    border: `1px solid ${p.primary ? 'var(--lime-border)' : 'var(--line)'}`,
                    borderRadius: 'var(--r)',
                    background: p.primary ? 'var(--lime-soft)' : 'var(--surface)',
                    display: 'flex', alignItems: 'center', gap: 14,
                    cursor: p.action ? 'pointer' : 'default',
                    opacity: p.action ? 1 : 0.5,
                  }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-2)', display: 'grid', placeItems: 'center', fontFamily: 'var(--f-mono)', fontSize: 13, color: p.primary ? 'var(--lime)' : 'var(--text-2)' }}>
                    {p.n[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{p.n}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{connectingGmail && p.primary ? 'Redirecting…' : p.d}</div>
                  </div>
                  <Icon name="chev" size={14} />
                </div>
              ))}
              {error && (
                <div style={{ padding: '10px 14px', background: 'rgba(255,100,100,0.1)', border: '1px solid rgba(255,100,100,0.25)', borderRadius: 8, fontSize: 12, color: 'var(--bad)', marginTop: 4 }}>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Who you sell to */}
          {step === 2 && (
            <div className="col" style={{ gap: 14 }}>
              <div className="field">
                <div className="field__label">Your name & agency</div>
                <div className="grid g-2" style={{ gap: 10 }}>
                  <input className="input" placeholder="Full name" value={form.full_name} onChange={e => set('full_name', e.target.value)} />
                  <input className="input" placeholder="Agency name" value={form.agency_name} onChange={e => set('agency_name', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <div className="field__label">What do you sell?</div>
                <input className="input" placeholder="e.g. AI thumbnail design for YouTubers" value={form.what_you_sell} onChange={e => set('what_you_sell', e.target.value)} />
              </div>
              <div className="field">
                <div className="field__label">Who's your ideal creator?</div>
                <div className="grid g-2" style={{ gap: 10 }}>
                  <input className="input" placeholder="Niche" value={form.niche} onChange={e => set('niche', e.target.value)} />
                  <input className="input" placeholder="Sub range (e.g. 50k–500k)" value={form.sub_range} onChange={e => set('sub_range', e.target.value)} />
                  <input className="input" placeholder="Geography (e.g. US, UK)" value={form.geography} onChange={e => set('geography', e.target.value)} />
                  <input className="input" placeholder="Posting cadence (e.g. 1+ / week)" value={form.cadence} onChange={e => set('cadence', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Draft pitch */}
          {step === 3 && (
            <div className="col" style={{ gap: 12 }}>
              <div className="field">
                <div className="field__label">Your one-line pitch</div>
                <textarea className="input" rows={3}
                  style={{ fontFamily: 'var(--f-sans)', lineHeight: 1.6 }}
                  value={form.pitch_brief}
                  onChange={e => set('pitch_brief', e.target.value)}
                  placeholder="e.g. We pay $28 CPM for 60-sec mid-roll placements on Finance YouTube channels (50k–500k subs)."
                />
              </div>
              <div style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'var(--bg-2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Icon name="sparkle" size={14} style={{ color: 'var(--lime)', flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                  We'll turn this into ~50 personalized variants per send — referencing each creator's latest video, tone, and sponsor history.
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Ready to launch */}
          {step === 4 && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ display: 'inline-grid', placeItems: 'center', width: 84, height: 84, borderRadius: 28, background: 'var(--lime-soft)', border: '1px solid var(--lime-border)', color: 'var(--lime)', marginBottom: 18 }}>
                <Icon name="rocket" size={36} />
              </div>
              <div className="page__title" style={{ fontSize: 30, marginBottom: 10 }}>You're set up.</div>
              <div className="muted" style={{ fontSize: 13.5, maxWidth: 420, margin: '0 auto' }}>
                Your profile is ready. Start finding leads and let the agent handle the rest.
              </div>
              {error && (
                <div style={{ padding: '10px 14px', background: 'rgba(255,100,100,0.1)', border: '1px solid rgba(255,100,100,0.25)', borderRadius: 8, fontSize: 12, color: 'var(--bad)', marginTop: 16 }}>
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '18px 28px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-2)' }}>
          <span className="muted" style={{ fontSize: 11.5 }}>Takes ~3 minutes. Skip anytime.</span>
          <div style={{ flex: 1 }} />
          {step > 0 && (
            <button className="btn btn--sm" onClick={() => setStep(s => s - 1)}>Back</button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn btn--sm" onClick={() => setStep(s => s + 1)}>
              Continue <Icon name="arrowR" size={12} />
            </button>
          ) : (
            <button className="btn btn--sm" onClick={finish} disabled={finishing}>
              <Icon name="rocket" size={12} />{finishing ? 'Launching…' : 'Launch first campaign'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
