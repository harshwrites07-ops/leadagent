import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  User, Mail, Sliders, CreditCard, Plus, Trash2,
  CheckCircle2, XCircle, Loader2, RefreshCw, ExternalLink,
  ChevronDown, ChevronUp, Save, X, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ui/ConfirmModal';

const inputSt = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
  borderRadius: 6, padding: '8px 12px', color: 'var(--text-primary)',
  fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none',
  width: '100%', boxSizing: 'border-box',
};
const labelSt = {
  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
  letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase',
  display: 'block', marginBottom: 6,
};

function Section({ icon: Icon, title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon size={15} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{title}</span>
        </div>
        {open ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
      </button>
      {open && <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>{children}</div>}
    </div>
  );
}

function ToggleGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 7, padding: 3, width: 'fit-content' }}>
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)} style={{
          padding: '6px 16px', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', border: 'none',
          ...(value === opt.value
            ? { background: 'rgba(255,69,0,0.1)', color: 'var(--accent-primary)', outline: '1px solid rgba(255,69,0,0.2)' }
            : { background: 'transparent', color: 'var(--text-muted)' }),
        }}>{opt.label}</button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <div onClick={onChange} style={{ position: 'relative', width: 36, height: 20, borderRadius: 10, background: checked ? '#FF4500' : 'var(--bg-elevated)', border: '1px solid var(--border-default)', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2, left: checked ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
    </div>
  );
}

function TagInput({ values = [], onChange, placeholder, suggestions = [] }) {
  const [input, setInput] = useState('');
  const [showSug, setShowSug] = useState(false);
  const add = (v) => {
    v = (v || input).trim();
    if (!v || values.includes(v)) { setInput(''); return; }
    onChange([...values, v]); setInput('');
  };
  const filtered = suggestions.filter(s => !values.includes(s) && s.toLowerCase().includes(input.toLowerCase()));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {values.map(v => (
          <span key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 10px', background: 'rgba(255,69,0,0.08)', border: '1px solid rgba(255,69,0,0.2)', borderRadius: 99, fontSize: 11, color: 'var(--accent-primary)' }}>
            {v}
            <button onClick={() => onChange(values.filter(x => x !== v))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}><X size={9} /></button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...inputSt, flex: 1 }} value={input}
          onChange={e => { setInput(e.target.value); setShowSug(true); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); setShowSug(false); } }}
          onFocus={() => setShowSug(true)}
          onBlur={() => setTimeout(() => setShowSug(false), 150)}
          placeholder={placeholder} />
        <button onClick={() => add()} style={{ padding: '8px 14px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
          <Plus size={13} />
        </button>
      </div>
      {showSug && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 6, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {filtered.slice(0, 8).map(s => (
            <button key={s} onMouseDown={() => { add(s); setShowSug(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GmailCard({ account, onDisconnect, onReconnect }) {
  const isActive = account.status === 'active';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(66,133,244,0.12)', border: '1px solid rgba(66,133,244,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#4285F4' }}>{account.email[0].toUpperCase()}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.email}</span>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: isActive ? '#00E5A0' : '#FF4444', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: isActive ? '#00E5A0' : '#FF4444', fontFamily: 'var(--font-mono)' }}>{isActive ? 'ACTIVE' : 'REVOKED'}</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {account.emails_sent_today} / {account.daily_limit} sent today
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {!isActive && (
          <button onClick={() => onReconnect(account.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, background: 'rgba(255,69,0,0.1)', border: '1px solid rgba(255,69,0,0.2)', color: 'var(--accent-primary)', fontSize: 11, cursor: 'pointer' }}>
            <RefreshCw size={10} /> Reconnect
          </button>
        )}
        <button onClick={() => onDisconnect(account.id)} style={{ padding: '5px 8px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border-default)', color: '#FF4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

const PLAN_COLORS = { trial: '#888', free: '#888', starter: '#4285F4', pro: '#FF4500', growth: '#00E5A0', agency: '#FF4500' };
const NICHES = ['Gaming', 'Fitness', 'Finance', 'Tech', 'Travel', 'Food', 'Education', 'Lifestyle', 'Business', 'Entertainment', 'DIY/Crafts', 'Beauty', 'Sports', 'Pets', 'Music'];

export default function Settings() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [profile, setProfile] = useState({
    full_name: '', agency_name: '', role: 'Video Editor',
    target_niches: [], portfolio_url: '', best_result: '', pricing_range: '$500-$2000/month',
  });
  const [prefs, setPrefs] = useState({
    email_tone: 'casual', outreach_goal: 'get_reply',
    daily_email_limit: 150, min_email_delay: 45, max_email_delay: 120,
    followups_enabled: true, max_followups: 3, followup_delay_days: 3,
  });
  const [plan, setPlan] = useState({ name: 'free', leads_used: 0, emails_used: 0 });
  const [billing, setBilling] = useState(null);
  const [gmailAccounts, setGmailAccounts] = useState([]);
  const [gmailLimit, setGmailLimit] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  useEffect(() => {
    loadSettings();
    loadGmailAccounts();
    loadBilling();
  }, []);

  // Handle OAuth and Stripe redirect params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('upgraded') === 'true') {
      toast.success('Plan upgraded! Welcome to your new plan.', { duration: 5000 });
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

  const loadBilling = async () => {
    try {
      const res = await api.get('/stripe/subscription');
      setBilling(res.data);
    } catch {}
  };

  const loadSettings = async () => {
    try {
      const res = await api.get('/settings/me');
      if (res.data.profile) setProfile(p => ({ ...p, ...res.data.profile }));
      if (res.data.preferences) setPrefs(p => ({ ...p, ...res.data.preferences }));
      if (res.data.plan) setPlan(res.data.plan);
    } catch {}
  };

  const loadGmailAccounts = async () => {
    try {
      const res = await api.get('/gmail/accounts');
      setGmailAccounts(res.data.accounts || []);
      setGmailLimit(res.data.limit || 0);
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

  const reconnectGmail = async (id) => {
    try {
      const res = await api.post(`/gmail/accounts/${id}/reconnect`);
      if (res.data.url) window.location.href = res.data.url;
    } catch (e) {
      toast.error(e.message);
    }
  };

  const planName = billing?.plan || plan.name || 'free';
  const planColor = PLAN_COLORS[planName] || '#888';

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 96, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {confirmModal && <ConfirmModal {...confirmModal} onCancel={() => setConfirmModal(null)} />}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>Settings</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.1em' }}>YOUR ACCOUNT & PREFERENCES</p>
        </div>
        {dirty && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#F5A623', background: 'rgba(245,166,35,0.1)', padding: '4px 12px', borderRadius: 99, border: '1px solid rgba(245,166,35,0.2)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#F5A623' }} />
            UNSAVED
          </span>
        )}
      </div>

      {/* 1. My Profile */}
      <Section icon={User} title="My Profile">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelSt}>Full Name</label>
              <input style={inputSt} value={profile.full_name} onChange={e => setP('full_name', e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <label style={labelSt}>Agency / Brand Name</label>
              <input style={inputSt} value={profile.agency_name} onChange={e => setP('agency_name', e.target.value)} placeholder="ContentCrafterzz" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelSt}>Your Role</label>
              <select style={{ ...inputSt }} value={profile.role} onChange={e => setP('role', e.target.value)}>
                {['Video Editor', 'Founder', 'Freelancer', 'Agency Owner', 'Content Creator', 'Other'].map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>Pricing Range</label>
              <select style={{ ...inputSt }} value={profile.pricing_range} onChange={e => setP('pricing_range', e.target.value)}>
                {['$200-$500/month', '$500-$2000/month', '$2000-$5000/month', '$5000+/month', 'Custom'].map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={labelSt}>Portfolio URL</label>
            <input style={inputSt} value={profile.portfolio_url} onChange={e => setP('portfolio_url', e.target.value)} placeholder="https://yourportfolio.com" />
          </div>
          <div>
            <label style={labelSt}>Best Result (used in pitches)</label>
            <textarea style={{ ...inputSt, height: 70, resize: 'none', lineHeight: 1.6 }}
              value={profile.best_result}
              onChange={e => setP('best_result', e.target.value.slice(0, 200))}
              placeholder="e.g. Helped a fitness channel grow from 2K to 50K views in 60 days"
            />
            <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
              {(profile.best_result || '').length}/200
            </div>
          </div>
          <div>
            <label style={labelSt}>Target Niches</label>
            <TagInput
              values={profile.target_niches}
              onChange={v => setP('target_niches', v)}
              placeholder="Type a niche or select below"
              suggestions={NICHES}
            />
          </div>
        </div>
      </Section>

      {/* 2. Connected Email Accounts */}
      <Section icon={Mail} title="Connected Email Accounts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              Emails send directly from your Gmail — no shared servers, better deliverability.
            </p>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: 4, flexShrink: 0, marginLeft: 8 }}>
              {gmailAccounts.length}/{gmailLimit} connected
            </span>
          </div>

          {gmailAccounts.map(acc => (
            <GmailCard key={acc.id} account={acc} onDisconnect={disconnectGmail} onReconnect={reconnectGmail} />
          ))}

          {gmailAccounts.length < gmailLimit ? (
            <button onClick={connectGmail} disabled={connectingGmail} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px', borderRadius: 8, cursor: connectingGmail ? 'wait' : 'pointer',
              background: 'transparent', border: '2px dashed var(--border-default)',
              color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500,
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.color = 'var(--accent-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
              {connectingGmail ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
              Connect Gmail Account
            </button>
          ) : gmailLimit === 0 ? (
            <div style={{ padding: 16, borderRadius: 8, background: 'rgba(255,69,0,0.06)', border: '1px solid rgba(255,69,0,0.15)', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Gmail sending is not available on the free plan.
              </p>
              <button style={{ padding: '7px 18px', borderRadius: 6, background: 'var(--gradient-orange)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Upgrade to Starter →
              </button>
            </div>
          ) : (
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                Plan limit reached ({gmailLimit} accounts). Upgrade to add more.
              </p>
            </div>
          )}
        </div>
      </Section>

      {/* 3. Outreach Preferences */}
      <Section icon={Sliders} title="Outreach Preferences">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={{ ...labelSt, marginBottom: 10 }}>Email Tone</label>
            <ToggleGroup value={prefs.email_tone} onChange={v => setPr('email_tone', v)}
              options={[{ value: 'casual', label: 'Casual' }, { value: 'professional', label: 'Professional' }, { value: 'bold', label: 'Bold' }]} />
          </div>
          <div>
            <label style={{ ...labelSt, marginBottom: 10 }}>Outreach Goal</label>
            <ToggleGroup value={prefs.outreach_goal} onChange={v => setPr('outreach_goal', v)}
              options={[{ value: 'get_reply', label: 'Get a Reply' }, { value: 'book_call', label: 'Book a Call' }, { value: 'close_deal', label: 'Close Deal' }]} />
          </div>
          <div>
            <label style={labelSt}>Daily Email Limit</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
              <input type="range" min="10" max="500" step="10" value={prefs.daily_email_limit}
                onChange={e => setPr('daily_email_limit', parseInt(e.target.value))}
                style={{ flex: 1, accentColor: '#FF4500' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', minWidth: 40 }}>
                {prefs.daily_email_limit}
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>emails per day across all accounts</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelSt}>Min Delay (sec)</label>
              <input style={inputSt} type="number" min="10" value={prefs.min_email_delay}
                onChange={e => setPr('min_email_delay', parseInt(e.target.value) || 45)} />
            </div>
            <div>
              <label style={labelSt}>Max Delay (sec)</label>
              <input style={inputSt} type="number" min="10" value={prefs.max_email_delay}
                onChange={e => setPr('max_email_delay', parseInt(e.target.value) || 120)} />
            </div>
          </div>
          <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', margin: 0, marginBottom: 2 }}>Auto Follow-ups</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Automatically follow up with non-replies</p>
              </div>
              <Toggle checked={prefs.followups_enabled} onChange={() => setPr('followups_enabled', !prefs.followups_enabled)} />
            </div>
            {prefs.followups_enabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelSt}>Max Follow-ups</label>
                  <input style={inputSt} type="number" min="1" max="10" value={prefs.max_followups}
                    onChange={e => setPr('max_followups', parseInt(e.target.value) || 3)} />
                </div>
                <div>
                  <label style={labelSt}>Delay Between (days)</label>
                  <input style={inputSt} type="number" min="1" value={prefs.followup_delay_days}
                    onChange={e => setPr('followup_delay_days', parseInt(e.target.value) || 3)} />
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* 4. Plan & Billing */}
      <Section icon={CreditCard} title="Plan & Billing" defaultOpen={true}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Past due warning */}
          {billing?.plan_status === 'past_due' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.25)', borderRadius: 8 }}>
              <AlertCircle size={16} style={{ color: '#FF4444', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#FF4444', margin: 0 }}>Payment failed</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Update your payment method to restore full access.</p>
              </div>
              <button onClick={openPortal} disabled={loadingPortal} style={{ padding: '6px 14px', borderRadius: 6, background: '#FF4444', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                Fix Now
              </button>
            </div>
          )}

          {/* Current plan row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 8, border: `1px solid ${planColor}33` }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 800, color: planColor, textTransform: 'uppercase' }}>
                  {billing?.plan || planName}
                </span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${planColor}22`, color: planColor, fontFamily: 'var(--font-mono)' }}>
                  {(billing?.plan_status || 'ACTIVE').toUpperCase()}
                </span>
                {billing?.trial_days_left > 0 && (billing?.plan === 'trial' || billing?.plan === 'free') && (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(245,166,35,0.12)', color: '#F5A623', fontFamily: 'var(--font-mono)', border: '1px solid rgba(245,166,35,0.2)' }}>
                    {billing.trial_days_left}d LEFT
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                Usage resets {billing?.reset_date ? `on ${billing.reset_date}` : 'monthly'}
              </p>
            </div>
            {billing?.has_billing ? (
              <button onClick={openPortal} disabled={loadingPortal} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: loadingPortal ? 'wait' : 'pointer', flexShrink: 0 }}>
                {loadingPortal ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <ExternalLink size={12} />}
                Manage Billing
              </button>
            ) : null}
          </div>

          {/* Usage progress bars */}
          {billing?.usage && [
            { label: 'Leads Found', used: billing.usage.leads.used, limit: billing.usage.leads.limit, color: '#00E5A0' },
            { label: 'Emails Sent', used: billing.usage.emails.used, limit: billing.usage.emails.limit, color: '#4285F4' },
          ].map(({ label, used, limit, color }) => {
            const pct = limit === Infinity || limit === 0 ? 0 : Math.min((used / limit) * 100, 100);
            const near = pct >= 90;
            return (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: near ? '#FF4444' : 'var(--text-muted)' }}>
                    {(used || 0).toLocaleString()} / {limit === Infinity ? '∞' : (limit || 0).toLocaleString()}
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: near ? '#FF4444' : color, borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
              </div>
            );
          })}

          {/* Pricing cards */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>Upgrade Your Plan</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { key: 'starter', name: 'Starter', price: '$29', per: '/mo', leads: '500', emails: '500', badge: null },
                { key: 'pro', name: 'Pro', price: '$79', per: '/mo', leads: '5,000', emails: '2,500', badge: 'Most Popular' },
                { key: 'agency', name: 'Agency', price: '$149', per: '/mo', leads: '10,000', emails: 'Unlimited', badge: null },
              ].map(({ key, name, price, per, leads, emails, badge }) => {
                const isCurrent = billing?.plan === key;
                const isLoading = loadingCheckout === key;
                return (
                  <div key={key} style={{
                    position: 'relative', padding: '16px 14px', borderRadius: 10,
                    background: badge ? 'rgba(255,69,0,0.06)' : 'var(--bg-elevated)',
                    border: badge ? '1px solid rgba(255,69,0,0.3)' : '1px solid var(--border-subtle)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    {badge && (
                      <span style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: 'var(--gradient-orange)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 10px', borderRadius: 99, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                        {badge}
                      </span>
                    )}
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{name}</p>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: badge ? 'var(--accent-primary)' : 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>{price}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{per}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{leads} leads/mo</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{emails} emails/mo</span>
                    </div>
                    <button
                      onClick={() => !isCurrent && startCheckout(key)}
                      disabled={isCurrent || isLoading}
                      style={{
                        padding: '8px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: isCurrent ? 'default' : 'pointer',
                        background: isCurrent ? 'var(--bg-card)' : (badge ? 'var(--gradient-orange)' : 'transparent'),
                        color: isCurrent ? 'var(--text-muted)' : (badge ? '#fff' : 'var(--text-secondary)'),
                        border: isCurrent ? '1px solid var(--border-subtle)' : (badge ? 'none' : '1px solid var(--border-default)'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        marginTop: 'auto',
                      }}>
                      {isLoading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                      {isCurrent ? 'Current Plan' : 'Upgrade'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      {/* Sticky save */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 40 }}>
        <button onClick={save} disabled={!dirty || saving} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 8,
          cursor: (!dirty || saving) ? 'not-allowed' : 'pointer',
          background: dirty ? 'var(--gradient-orange)' : 'var(--bg-elevated)',
          color: dirty ? '#fff' : 'var(--text-muted)',
          border: dirty ? 'none' : '1px solid var(--border-default)',
          fontSize: 13, fontWeight: 600, boxShadow: dirty ? '0 4px 16px rgba(255,69,0,0.35)' : 'none',
          transition: 'all 0.2s',
        }}>
          {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : <><Save size={14} /> Save Settings</>}
        </button>
      </div>
    </div>
  );
}
