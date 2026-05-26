import React, { useState, useEffect } from 'react';
import {
  Key, Mail, Building2, Sliders, Bot, PenLine,
  Eye, EyeOff, CheckCircle2, XCircle, Loader2, Plus, X,
  ChevronDown, ChevronUp, Save, Shield,
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

function TestButton({ onClick, status }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, flexShrink: 0,
      background: 'transparent', border: '1px solid var(--border-default)',
      color: status === 'ok' ? '#00E5A0' : status === 'error' ? '#FF4444' : 'var(--text-secondary)',
    }}>
      {status === 'loading' && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
      {status === 'ok' && <CheckCircle2 size={11} style={{ color: '#00E5A0' }} />}
      {status === 'error' && <XCircle size={11} style={{ color: '#FF4444' }} />}
      {!status && <Bot size={11} />}
      Test
    </button>
  );
}

function PasswordInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input type={show ? 'text' : 'password'} value={value} onChange={onChange}
        placeholder={placeholder || '••••••••••••'} style={{ ...inputSt, paddingRight: 36 }} />
      <button onClick={() => setShow(s => !s)} type="button" style={{
        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
      }}>
        {show ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  );
}

function TagInput({ values = [], onChange, placeholder }) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (!v || values.includes(v)) { setInput(''); return; }
    onChange([...values, v]); setInput('');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {values.map(v => (
          <span key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 99, fontSize: 11, color: 'var(--text-secondary)' }}>
            {v}
            <button onClick={() => onChange(values.filter(x => x !== v))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}><X size={9} /></button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...inputSt, flex: 1 }} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder || 'Type and press Enter'} />
        <button onClick={add} style={{ padding: '8px 14px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

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

export default function AdminSettings() {
  const { user } = useAuth();
  const [local, setLocal] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState({});
  const [inboxes, setInboxes] = useState([]);
  const [newInbox, setNewInbox] = useState({ email: '', from_name: '', host: 'smtp.gmail.com', port: 587, pass: '' });
  const [addingInbox, setAddingInbox] = useState(false);
  const [showAddInbox, setShowAddInbox] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);

  useEffect(() => {
    loadSettings();
    loadInboxes();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await api.get('/settings');
      setLocal(res.data.settings || {});
    } catch (e) {
      if (e.response?.status === 403) toast.error('Admin access required');
    }
  };

  const loadInboxes = async () => {
    try {
      const res = await api.get('/settings/inboxes');
      setInboxes(res.data.inboxes || []);
    } catch {}
  };

  const set = (key, value) => { setLocal(prev => ({ ...prev, [key]: value })); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/settings', local);
      setDirty(false);
      toast.success('Settings saved!');
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const testApi = async (type, payload) => {
    setTestStatus(s => ({ ...s, [type]: 'loading' }));
    try {
      const res = await api.post(`/settings/test/${type}`, payload);
      setTestStatus(s => ({ ...s, [type]: res.data.ok ? 'ok' : 'error' }));
      if (res.data.ok) toast.success(`${type} works!`);
      else toast.error(res.data.error || 'Test failed');
    } catch (e) { setTestStatus(s => ({ ...s, [type]: 'error' })); toast.error(e.message); }
  };

  const addInbox = async () => {
    if (!newInbox.email || !newInbox.pass) return toast.error('Email and password required');
    setAddingInbox(true);
    try {
      await api.post('/settings/inboxes', newInbox);
      toast.success(`Inbox ${newInbox.email} connected`);
      setNewInbox({ email: '', from_name: '', host: 'smtp.gmail.com', port: 587, pass: '' });
      setShowAddInbox(false);
      loadInboxes();
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    finally { setAddingInbox(false); }
  };

  const removeInbox = (email) => {
    setConfirmModal({
      title: 'Remove Inbox',
      message: `Remove ${email} from your inboxes?`,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.delete(`/settings/inboxes/${encodeURIComponent(email)}`);
          toast.success('Inbox removed');
          loadInboxes();
        } catch (e) { toast.error(e.message); }
      },
    });
  };

  const caseStudies = Array.isArray(local.case_studies) ? local.case_studies : [];
  const targetNiches = Array.isArray(local.target_niches) ? local.target_niches : [];
  const blacklistKeywords = Array.isArray(local.blacklist_keywords) ? local.blacklist_keywords : [];
  const blacklistChannels = Array.isArray(local.blacklist_channels) ? local.blacklist_channels : [];

  const gap = { display: 'flex', flexDirection: 'column', gap: 20 };
  const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  const row3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 };

  if (!user || user.role !== 'admin') {
    return (
      <div style={{ maxWidth: 400, margin: '80px auto', textAlign: 'center' }}>
        <Shield size={40} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
        <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Admin Access Required</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>This page is only accessible to administrators.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 96, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {confirmModal && <ConfirmModal {...confirmModal} onCancel={() => setConfirmModal(null)} />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>Admin Settings</h1>
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,69,0,0.1)', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', border: '1px solid rgba(255,69,0,0.2)' }}>ADMIN</span>
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.1em' }}>SYSTEM CONFIGURATION — NOT VISIBLE TO USERS</p>
        </div>
        {dirty && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#F5A623', background: 'rgba(245,166,35,0.1)', padding: '4px 12px', borderRadius: 99, border: '1px solid rgba(245,166,35,0.2)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#F5A623' }} />
            UNSAVED CHANGES
          </span>
        )}
      </div>

      {/* API Keys */}
      <Section icon={Key} title="API Keys">
        <div style={gap}>
          <div>
            <label style={labelSt}>YouTube Data API v3 Key</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><PasswordInput value={local.youtube_api_key || ''} onChange={e => set('youtube_api_key', e.target.value)} placeholder="AIzaSy..." /></div>
              <TestButton status={testStatus.youtube} onClick={() => testApi('youtube', { key: local.youtube_api_key })} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Get from Google Cloud Console → YouTube Data API v3</p>
          </div>
          <div>
            <label style={labelSt}>Google Gemini API Key (pitch generation)</label>
            <div style={{ flex: 1 }}><PasswordInput value={local.gemini_api_key || ''} onChange={e => set('gemini_api_key', e.target.value)} placeholder="AIzaSy..." /></div>
          </div>
          <div>
            <label style={labelSt}>Reddit API Credentials</label>
            <div style={{ ...row2, marginBottom: 8 }}>
              <div>
                <label style={labelSt}>Client ID</label>
                <input style={inputSt} value={local.reddit_client_id || ''} onChange={e => set('reddit_client_id', e.target.value)} placeholder="client_id" />
              </div>
              <div>
                <label style={labelSt}>Client Secret</label>
                <PasswordInput value={local.reddit_client_secret || ''} onChange={e => set('reddit_client_secret', e.target.value)} placeholder="client_secret" />
              </div>
            </div>
            <TestButton status={testStatus.reddit} onClick={() => testApi('reddit', { client_id: local.reddit_client_id, client_secret: local.reddit_client_secret })} />
          </div>
          <div>
            <label style={labelSt}>Anthropic (Claude) API Key</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><PasswordInput value={local.anthropic_api_key || ''} onChange={e => set('anthropic_api_key', e.target.value)} placeholder="sk-ant-..." /></div>
              <TestButton status={testStatus.claude} onClick={() => testApi('claude', { key: local.anthropic_api_key })} />
            </div>
          </div>
        </div>
      </Section>

      {/* SMTP Inboxes (fallback) */}
      <Section icon={Mail} title="SMTP Inboxes (Fallback)">
        <div style={gap}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Used when a user hasn't connected Gmail. Each inbox sends up to 150 emails/day.
          </p>
          <div>
            <label style={{ ...labelSt, marginBottom: 8 }}>Configured Inboxes ({inboxes.length})</label>
            {inboxes.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No inboxes configured.</p>}
            {inboxes.map(inbox => (
              <div key={inbox.email} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 6, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{inbox.email}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>{inbox.host}:{inbox.port}</span>
                </div>
                <button onClick={() => removeInbox(inbox.email)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF4444', padding: '4px' }}><X size={13} /></button>
              </div>
            ))}
          </div>

          {!showAddInbox ? (
            <button onClick={() => setShowAddInbox(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
              <Plus size={12} /> Add Inbox
            </button>
          ) : (
            <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={row2}>
                <div><label style={labelSt}>Email</label><input style={inputSt} type="email" value={newInbox.email} onChange={e => setNewInbox(p => ({ ...p, email: e.target.value }))} placeholder="you@gmail.com" /></div>
                <div><label style={labelSt}>From Name</label><input style={inputSt} value={newInbox.from_name} onChange={e => setNewInbox(p => ({ ...p, from_name: e.target.value }))} placeholder="ContentCrafterzz" /></div>
              </div>
              <div style={row3}>
                <div style={{ gridColumn: 'span 2' }}><label style={labelSt}>SMTP Host</label><input style={inputSt} value={newInbox.host} onChange={e => setNewInbox(p => ({ ...p, host: e.target.value }))} /></div>
                <div><label style={labelSt}>Port</label><input style={inputSt} type="number" value={newInbox.port} onChange={e => setNewInbox(p => ({ ...p, port: parseInt(e.target.value) }))} /></div>
              </div>
              <div><label style={labelSt}>App Password</label><PasswordInput value={newInbox.pass} onChange={e => setNewInbox(p => ({ ...p, pass: e.target.value }))} /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={addInbox} disabled={addingInbox} style={{ flex: 1, padding: '8px', borderRadius: 6, background: 'var(--gradient-orange)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {addingInbox ? 'Testing & Saving...' : 'Add Inbox'}
                </button>
                <button onClick={() => setShowAddInbox(false)} style={{ padding: '8px 14px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={{ ...row2, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
            <div>
              <label style={labelSt}>Daily Sending Limit (per user, no Gmail)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="range" min="10" max="500" step="10" value={local.daily_send_limit || 150} onChange={e => set('daily_send_limit', e.target.value)} style={{ flex: 1, accentColor: '#FF4500' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', minWidth: 32 }}>{local.daily_send_limit || 150}</span>
              </div>
            </div>
            <div><label style={labelSt}>Follow-up Delay (days)</label><input style={inputSt} type="number" min="1" value={local.followup_delay_days || 3} onChange={e => set('followup_delay_days', e.target.value)} /></div>
          </div>
          <div style={row3}>
            <div><label style={labelSt}>Delay Min (sec)</label><input style={inputSt} type="number" min="10" value={local.email_delay_min || 45} onChange={e => set('email_delay_min', e.target.value)} /></div>
            <div><label style={labelSt}>Delay Max (sec)</label><input style={inputSt} type="number" min="10" value={local.email_delay_max || 120} onChange={e => set('email_delay_max', e.target.value)} /></div>
            <div><label style={labelSt}>Max Follow-ups</label><input style={inputSt} type="number" min="1" max="10" value={local.max_followups || 3} onChange={e => set('max_followups', e.target.value)} /></div>
          </div>
        </div>
      </Section>

      {/* Default Agency Profile */}
      <Section icon={Building2} title="Default Agency Profile (System Defaults)">
        <div style={gap}>
          <div style={row2}>
            <div><label style={labelSt}>Agency Name</label><input style={inputSt} value={local.agency_name || ''} onChange={e => set('agency_name', e.target.value)} placeholder="ContentCrafterzz" /></div>
            <div><label style={labelSt}>Your Name</label><input style={inputSt} value={local.your_name || ''} onChange={e => set('your_name', e.target.value)} placeholder="Your name" /></div>
          </div>
          <div style={row2}>
            <div><label style={labelSt}>Your Role</label><input style={inputSt} value={local.your_role || ''} onChange={e => set('your_role', e.target.value)} placeholder="Founder" /></div>
            <div><label style={labelSt}>Portfolio URL</label><input style={inputSt} value={local.portfolio_url || ''} onChange={e => set('portfolio_url', e.target.value)} placeholder="https://..." /></div>
          </div>
          <div><label style={labelSt}>Pricing Range</label><input style={inputSt} value={local.pricing_range || ''} onChange={e => set('pricing_range', e.target.value)} placeholder="$500-$2,000/month" /></div>
          <div>
            <label style={labelSt}>Services Description</label>
            <textarea style={{ ...inputSt, height: 80, resize: 'none', lineHeight: 1.6 }} value={local.services_description || ''} onChange={e => set('services_description', e.target.value)} placeholder="Describe what you do..." />
          </div>
          <div>
            <label style={labelSt}>Case Studies / Results</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {caseStudies.map((cs, i) => (
                <div key={i} style={{ display: 'flex', gap: 8 }}>
                  <input style={{ ...inputSt, flex: 1, fontSize: 12 }} value={cs} onChange={e => { const arr = [...caseStudies]; arr[i] = e.target.value; set('case_studies', arr); }} placeholder="e.g. Helped FitnessGuru grow from 2K to 50K views in 60 days" />
                  <button onClick={() => set('case_studies', caseStudies.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF4444', padding: '0 4px' }}><X size={13} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => set('case_studies', [...caseStudies, ''])} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', fontSize: 11 }}>
              <Plus size={11} /> Add Case Study
            </button>
          </div>
          <div><label style={labelSt}>Target Niches</label><TagInput values={targetNiches} onChange={v => set('target_niches', v)} placeholder="fitness, real estate..." /></div>
          <div><label style={labelSt}>Average Deal Value ($)</label><input style={{ ...inputSt, width: 140 }} type="number" value={local.average_deal_value || 1000} onChange={e => set('average_deal_value', e.target.value)} /></div>
        </div>
      </Section>

      {/* Pitch Preferences */}
      <Section icon={PenLine} title="Pitch Preferences">
        <div style={gap}>
          <div>
            <label style={{ ...labelSt, marginBottom: 10 }}>Tone Preference</label>
            <ToggleGroup value={local.tone_preference || 'casual'} onChange={v => set('tone_preference', v)} options={[{ value: 'casual', label: 'Casual' }, { value: 'professional', label: 'Professional' }, { value: 'bold', label: 'Bold' }]} />
          </div>
          <div>
            <label style={{ ...labelSt, marginBottom: 10 }}>Offer Type</label>
            <ToggleGroup value={local.offer_type || 'free_trial'} onChange={v => set('offer_type', v)} options={[{ value: 'free_trial', label: 'Free Trial' }, { value: 'paid_upfront', label: 'Paid Upfront' }, { value: 'results_based', label: 'Results-Based' }]} />
          </div>
          <div>
            <label style={{ ...labelSt, marginBottom: 10 }}>Risk Reversal</label>
            <ToggleGroup value={local.risk_reversal || 'free_first_edit'} onChange={v => set('risk_reversal', v)} options={[{ value: 'free_first_edit', label: 'Free First Edit' }, { value: 'money_back', label: 'Money Back' }, { value: 'pay_after_results', label: 'Pay After Results' }]} />
          </div>
        </div>
      </Section>

      {/* Automation */}
      <Section icon={Sliders} title="Automation" defaultOpen={false}>
        <div style={gap}>
          {[
            { key: 'auto_scrape', label: 'Auto-scrape on schedule', desc: 'Scrape new leads every 6 hours for target niches' },
            { key: 'auto_generate_pitches', label: 'Auto-generate pitches', desc: 'Generate pitch immediately when a new lead is found' },
            { key: 'auto_queue_emails', label: 'Auto-add to email queue', desc: 'Automatically queue emails after pitch is generated' },
            { key: 'auto_followup', label: 'Auto follow-up', desc: 'Send follow-up emails to non-replies automatically' },
          ].map(({ key, label, desc }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</p>
              </div>
              <Toggle checked={local[key] === 'true' || local[key] === true} onChange={() => set(key, local[key] === 'true' || local[key] === true ? 'false' : 'true')} />
            </div>
          ))}
          <div><label style={labelSt}>Blacklist Keywords</label><TagInput values={blacklistKeywords} onChange={v => set('blacklist_keywords', v)} placeholder="spam, kids, prank..." /></div>
          <div><label style={labelSt}>Blacklist Channel IDs</label><TagInput values={blacklistChannels} onChange={v => set('blacklist_channels', v)} placeholder="UCxxxxxx..." /></div>
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
