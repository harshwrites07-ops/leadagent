import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Icon from '../components/ui/Icon';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ui/ConfirmModal';

export default function Settings() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState('profile');

  const [profile, setProfile] = useState({
    full_name: '', agency_name: '', role: 'Video Editor',
    target_niches: [], portfolio_url: '', best_result: '', pricing_range: '$500-$2000/month',
  });
  const [prefs, setPrefs] = useState({
    email_tone: 'casual', outreach_goal: 'get_reply', signature: '',
    daily_email_limit: 150, min_email_delay: 45, max_email_delay: 120,
    followups_enabled: true, max_followups: 3, followup_delay_days: 3,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [gmailAccounts, setGmailAccounts] = useState([]);
  const [gmailLimit, setGmailLimit] = useState(4);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);

  const [billing, setBilling] = useState(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(null);

  useEffect(() => {
    loadSettings();
    loadGmailAccounts();
    loadBilling();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('upgraded') === 'true') {
      toast.success('Plan upgraded!', { duration: 5000 });
      loadBilling();
      navigate('/settings', { replace: true });
    } else if (params.get('gmail_connected') === '1') {
      toast.success('Gmail account connected!');
      loadGmailAccounts();
      navigate('/settings', { replace: true });
    } else if (params.get('gmail_error')) {
      toast.error('Gmail connection failed: ' + decodeURIComponent(params.get('gmail_error')));
      navigate('/settings', { replace: true });
    }
  }, [location.search]);

  const loadSettings = async () => {
    try {
      const res = await api.get('/settings/me');
      if (res.data.profile) setProfile(p => ({ ...p, ...res.data.profile }));
      if (res.data.preferences) setPrefs(p => ({ ...p, ...res.data.preferences }));
    } catch {}
  };

  const loadGmailAccounts = async () => {
    try {
      const res = await api.get('/gmail/accounts');
      setGmailAccounts(res.data.accounts || []);
      setGmailLimit(res.data.limit || 4);
    } catch {}
  };

  const loadBilling = async () => {
    try {
      const res = await api.get('/stripe/subscription');
      setBilling(res.data);
    } catch {}
  };

  const setP = (k, v) => { setProfile(p => ({ ...p, [k]: v })); setDirty(true); };
  const setPr = (k, v) => { setPrefs(p => ({ ...p, [k]: v })); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/settings/me', { profile, preferences: prefs });
      setDirty(false);
      toast.success('Settings saved');
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const connectGmail = async () => {
    setConnectingGmail(true);
    try {
      const res = await api.get('/gmail/auth-url');
      if (res.data.url) window.location.href = res.data.url;
      else toast.error(res.data.error || 'Failed to get OAuth URL');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to connect Gmail');
    } finally {
      setConnectingGmail(false);
    }
  };

  const disconnectGmail = (id) => {
    setConfirmModal({
      title: 'Disconnect Gmail',
      message: 'Disconnect this Gmail account from your outreach system?',
      confirmLabel: 'Disconnect',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.delete(`/gmail/accounts/${id}`);
          toast.success('Account disconnected');
          loadGmailAccounts();
        } catch (e) { toast.error(e.message); }
      },
    });
  };

  const reconnectGmail = async (id) => {
    try {
      const res = await api.post(`/gmail/accounts/${id}/reconnect`);
      if (res.data.url) window.location.href = res.data.url;
    } catch (e) { toast.error(e.message); }
  };

  const openPortal = async () => {
    setLoadingPortal(true);
    try {
      const res = await api.post('/stripe/create-portal');
      window.location.href = res.data.url;
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to open billing portal');
      setLoadingPortal(false);
    }
  };

  const startCheckout = async (planKey) => {
    setLoadingCheckout(planKey);
    try {
      const res = await api.post('/stripe/create-checkout', { plan: planKey });
      window.location.href = res.data.url;
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to start checkout');
      setLoadingCheckout(null);
    }
  };

  const planName = billing?.plan || 'free';

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      {confirmModal && <ConfirmModal {...confirmModal} onCancel={() => setConfirmModal(null)} />}

      <div className="page__head">
        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Workspace</div>
          <h1 className="page__title">Settings</h1>
        </div>
        {dirty && (
          <div className="page__actions">
            <button className="btn btn--sm" onClick={save} disabled={saving}>
              <Icon name={saving ? 'refresh' : 'check'} size={11} />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
      </div>

      <div className="tabs" style={{ marginBottom: 24 }}>
        {[
          { id: 'profile', l: 'Profile' },
          { id: 'mailboxes', l: 'Mailboxes & sending' },
          { id: 'integrations', l: 'Integrations' },
          { id: 'team', l: 'Team & roles' },
          { id: 'plan', l: 'Plan & billing' },
        ].map(t => (
          <div key={t.id} className={`tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)}>{t.l}</div>
        ))}
      </div>

      {/* Profile */}
      {tab === 'profile' && (
        <div className="card">
          <div className="card__body">
            <div className="grid g-2" style={{ gap: 14 }}>
              <div className="field">
                <div className="field__label">Full Name</div>
                <input className="input" value={profile.full_name} onChange={e => setP('full_name', e.target.value)} placeholder="Your name" />
              </div>
              <div className="field">
                <div className="field__label">Agency / Brand</div>
                <input className="input" value={profile.agency_name} onChange={e => setP('agency_name', e.target.value)} placeholder="ContentCrafterzz" />
              </div>
              <div className="field">
                <div className="field__label">Your Role</div>
                <select className="input" value={profile.role} onChange={e => setP('role', e.target.value)}>
                  {['Video Editor', 'Founder', 'Freelancer', 'Agency Owner', 'Content Creator', 'Other'].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="field">
                <div className="field__label">Pricing Range</div>
                <select className="input" value={profile.pricing_range} onChange={e => setP('pricing_range', e.target.value)}>
                  {['$200-$500/month', '$500-$2000/month', '$2000-$5000/month', '$5000+/month', 'Custom'].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <div className="field__label">Portfolio URL</div>
              <input className="input" value={profile.portfolio_url} onChange={e => setP('portfolio_url', e.target.value)} placeholder="https://yourportfolio.com" />
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <div className="field__label">Best Result (used in pitches)</div>
              <textarea className="input" rows={3}
                style={{ resize: 'vertical', fontFamily: 'var(--f-sans)', lineHeight: 1.6 }}
                value={profile.best_result}
                onChange={e => setP('best_result', e.target.value.slice(0, 200))}
                placeholder="e.g. Helped a fitness channel grow from 2K to 50K views in 60 days"
              />
              <div className="muted" style={{ fontSize: 10, textAlign: 'right', marginTop: 4 }}>
                {(profile.best_result || '').length}/200
              </div>
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <div className="field__label">Sender signature</div>
              <textarea className="input" rows={4}
                style={{ resize: 'vertical', fontFamily: 'var(--f-sans)', lineHeight: 1.6 }}
                value={prefs.signature || ''}
                onChange={e => setPr('signature', e.target.value)}
                placeholder={'— Your Name\nFounder, Your Agency\nWe match brands with creators who actually convert.'}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mailboxes */}
      {tab === 'mailboxes' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card__head">
              <div className="card__title">Connected mailboxes</div>
              <button className="btn btn--sm" onClick={connectGmail} disabled={connectingGmail}>
                <Icon name="plus" size={11} />{connectingGmail ? 'Connecting…' : 'Connect Gmail'}
              </button>
            </div>
            <div>
              {gmailAccounts.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>No mailboxes connected yet.</div>
                  <button className="btn btn--sm" onClick={connectGmail} disabled={connectingGmail}>
                    <Icon name="plus" size={11} />Connect Gmail
                  </button>
                </div>
              ) : gmailAccounts.map((acc, i, arr) => {
                const sent = acc.emails_sent_today || 0;
                const limit = acc.daily_limit || 150;
                const warmth = acc.warmth_score || 85;
                const isActive = acc.status === 'active';
                return (
                  <div key={acc.id} style={{
                    padding: 16, borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none',
                    display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 0.6fr', gap: 18, alignItems: 'center',
                  }}>
                    <div className="row" style={{ gap: 12 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)' }}>
                        G
                      </div>
                      <div className="mono" style={{ fontSize: 12 }}>{acc.email}</div>
                    </div>
                    <div>
                      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="muted" style={{ fontSize: 10 }}>WARMTH</span>
                        <span className="mono" style={{ fontSize: 11 }}>{warmth}%</span>
                      </div>
                      <div className="bar"><span style={{ width: `${warmth}%` }} /></div>
                    </div>
                    <div>
                      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="muted" style={{ fontSize: 10 }}>TODAY</span>
                        <span className="mono" style={{ fontSize: 11 }}>{sent} / {limit}</span>
                      </div>
                      <div className="bar"><span style={{ width: `${Math.min((sent / limit) * 100, 100)}%`, background: 'var(--cream)' }} /></div>
                    </div>
                    <div>
                      {isActive
                        ? <span className="badge badge--lime"><span className="dot dot--pulse" />Sending</span>
                        : <span className="badge badge--warn">Revoked</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {!isActive && (
                        <button className="btn btn--ghost btn--sm" onClick={() => reconnectGmail(acc.id)}>
                          <Icon name="refresh" size={11} />
                        </button>
                      )}
                      <button className="btn btn--ghost btn--sm" onClick={() => disconnectGmail(acc.id)}>
                        <Icon name="x" size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <div className="card__title">Sending rules</div>
            </div>
            <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { l: 'Send window', v: 'Mon–Fri · 9:00 → 17:30 (recipient TZ)' },
                { l: 'Random gap between sends', v: `${prefs.min_email_delay}s – ${prefs.max_email_delay}s` },
                { l: 'Skip if reply detected', v: 'On', good: true },
                { l: 'Pause if bounce rate >', v: '2%' },
                { l: 'Daily warmup volume', v: 'Auto · +2 / day until target' },
                { l: 'Rotate sender mailbox', v: 'Round-robin across healthy mailboxes', good: true },
              ].map((r, i) => (
                <div key={i} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{r.l}</span>
                  <span className="mono" style={{ fontSize: 12, color: r.good ? 'var(--lime)' : 'var(--text)' }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Integrations */}
      {tab === 'integrations' && (
        <div className="card">
          <div className="card__body" style={{ padding: 0 }}>
            {[
              { n: 'Google Workspace', s: `Connected · ${gmailAccounts.length} mailbox${gmailAccounts.length !== 1 ? 'es' : ''}`, on: gmailAccounts.length > 0, ic: 'mail' },
              { n: 'YouTube Data API', s: 'Connected · quota / day', on: true, ic: 'youtube' },
              { n: 'Hunter (emails)', s: 'Connected · email discovery', on: true, ic: 'globe' },
              { n: 'Apollo (emails)', s: 'Connected · enrichment + verify', on: true, ic: 'globe' },
              { n: 'Smartlead SMTP', s: 'Not connected', on: false, ic: 'mail' },
              { n: 'Slack', s: 'Send reply alerts to #outreach', on: false, ic: 'bell' },
              { n: 'Zapier / Make', s: 'Webhook out · 0 active flows', on: false, ic: 'link' },
            ].map((it, i, arr) => (
              <div key={i} className="row" style={{ padding: 16, borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none', gap: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', color: it.on ? 'var(--lime)' : 'var(--text-3)' }}>
                  <Icon name={it.ic} size={14} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{it.n}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{it.s}</div>
                </div>
                {it.on
                  ? <span className="badge badge--lime"><Icon name="check" size={11} />Connected</span>
                  : <button className="btn btn--sm">Connect</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team */}
      {tab === 'team' && (
        <div className="card">
          <div className="card__body" style={{ padding: 0 }}>
            <div className="row" style={{ padding: 14, borderBottom: '1px solid var(--line)', gap: 14 }}>
              <div style={{ position: 'relative' }}>
                <span className="ava" style={{ width: 32, height: 32, fontSize: 12, minWidth: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-3)', color: '#0a0a0c' }}>
                  {(user?.email || 'Y')[0].toUpperCase()}
                </span>
                <span style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: '50%', background: 'var(--lime)', border: '2px solid var(--surface)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{user?.email?.split('@')[0] || 'You'}</div>
                <div className="mono muted" style={{ fontSize: 11 }}>{user?.email || ''}</div>
              </div>
              <span className="badge badge--coral">Owner</span>
              <button className="btn btn--ghost btn--sm"><Icon name="moreH" size={12} /></button>
            </div>
            <div style={{ padding: 16, borderTop: '1px solid var(--line)' }}>
              <button className="btn btn--sm" disabled><Icon name="plus" size={12} />Invite teammate</button>
            </div>
          </div>
        </div>
      )}

      {/* Plan & billing */}
      {tab === 'plan' && (
        <>
          <div className="card" style={{ marginBottom: 16, padding: 24 }}>
            <div className="row" style={{ gap: 14, marginBottom: 14 }}>
              <span className="badge badge--coral">{planName} plan</span>
              <span className="mono muted" style={{ fontSize: 11 }}>
                {billing?.price ? `$${billing.price} / month` : ''}{billing?.reset_date ? ` · renews ${billing.reset_date}` : ''}
              </span>
            </div>
            <div style={{ fontSize: 28, fontFamily: 'var(--f-serif)', fontStyle: 'italic', letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 16 }}>
              {planName === 'agency'
                ? 'Unlimited emails, unlimited mailboxes, unlimited CRM.'
                : planName === 'growth'
                ? 'Up to 5,000 emails / mo, 4 mailboxes, 10k AI credits, unlimited CRM.'
                : planName === 'starter'
                ? 'Up to 500 emails / mo, 2 mailboxes, 2k AI credits.'
                : 'Free plan — limited access.'}
            </div>
            {billing?.usage && (
              <div className="grid g-3" style={{ gap: 14 }}>
                {[
                  { l: 'Emails this month', v: billing.usage.emails?.used || 0, max: billing.usage.emails?.limit || 500, c: 'var(--lime)' },
                  { l: 'AI credits', v: billing.usage.ai_credits?.used || billing.usage.leads?.used || 0, max: billing.usage.ai_credits?.limit || billing.usage.leads?.limit || 2000, c: 'var(--coral)' },
                  { l: 'Leads found', v: billing.usage.leads?.used || 0, max: billing.usage.leads?.limit || 500, c: 'var(--cream)' },
                ].map((m, i) => {
                  const pct = m.max && m.max !== Infinity ? Math.min((m.v / m.max) * 100, 100) : 0;
                  return (
                    <div key={i} style={{ padding: 14, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8 }}>
                      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>{m.l}</span>
                        <span className="mono" style={{ fontSize: 11 }}>{m.v.toLocaleString()} / {m.max === Infinity ? '∞' : m.max.toLocaleString()}</span>
                      </div>
                      <div className="bar"><span style={{ width: `${pct}%`, background: m.c }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
            {billing?.has_billing && (
              <button className="btn btn--ghost btn--sm" style={{ marginTop: 16 }} onClick={openPortal} disabled={loadingPortal}>
                <Icon name="link" size={11} />{loadingPortal ? 'Opening…' : 'Manage billing'}
              </button>
            )}
          </div>

          <div className="grid g-3" style={{ gap: 14 }}>
            {[
              { key: 'starter', n: 'Starter', p: '$49', leads: '500 emails' },
              { key: 'growth', n: 'Growth', p: '$199', leads: '5,000 emails' },
              { key: 'agency', n: 'Agency', p: '$599', leads: 'Unlimited' },
            ].map((plan, i) => {
              const current = planName === plan.key;
              const isLoading = loadingCheckout === plan.key;
              return (
                <div key={i} className="card" style={{
                  padding: 20,
                  border: current ? '1px solid var(--coral-border)' : '1px solid var(--line)',
                  background: current ? 'var(--coral-soft)' : 'var(--surface)',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{plan.n}</div>
                  <div className="row" style={{ alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
                    <span className="serif" style={{ fontSize: 32, letterSpacing: '-0.02em' }}>{plan.p}</span>
                    <span className="muted" style={{ fontSize: 11 }}>/ mo</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>{plan.leads}</div>
                  {current
                    ? <span className="badge badge--coral">Current</span>
                    : (
                      <button
                        className="btn btn--sm"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => startCheckout(plan.key)}
                        disabled={isLoading}
                      >
                        {isLoading ? 'Loading…' : 'Switch'}
                      </button>
                    )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
