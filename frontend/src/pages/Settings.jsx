import React, { useState, useEffect } from 'react';
import {
  Key, Mail, Building2, Sliders, Bot, PenLine, Chrome,
  Eye, EyeOff, CheckCircle2, XCircle, Loader2, Plus, X,
  ChevronDown, ChevronUp, Save, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useApp } from '../context/AppContext';

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
        padding: '14px 20px', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'background 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon size={15} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-body)' }}>{title}</span>
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
          padding: '6px 16px', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
          ...(value === opt.value
            ? { background: 'rgba(255,69,0,0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(255,69,0,0.2)' }
            : { background: 'transparent', color: 'var(--text-muted)', border: '1px solid transparent' }),
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

export default function Settings() {
  const { settings: ctxSettings, saveSettings: ctxSave } = useApp();
  const [local, setLocal] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState({});

  useEffect(() => {
    if (ctxSettings && Object.keys(ctxSettings).length > 0) setLocal(ctxSettings);
  }, [ctxSettings]);

  const set = (key, value) => { setLocal(prev => ({ ...prev, [key]: value })); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try { await ctxSave(local); setDirty(false); toast.success('Settings saved!'); }
    catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const testApi = async (type, payload) => {
    setTestStatus(s => ({ ...s, [type]: 'loading' }));
    try {
      const res = await api.post(`/settings/test/${type}`, payload);
      setTestStatus(s => ({ ...s, [type]: res.data.ok ? 'ok' : 'error' }));
      if (res.data.ok) toast.success(`${type} API key works!`);
      else toast.error(res.data.error || 'Test failed');
    } catch (e) { setTestStatus(s => ({ ...s, [type]: 'error' })); toast.error(e.message); }
  };

  const caseStudies       = Array.isArray(local.case_studies)        ? local.case_studies        : [];
  const targetNiches      = Array.isArray(local.target_niches)       ? local.target_niches       : [];
  const blacklistKeywords = Array.isArray(local.blacklist_keywords)  ? local.blacklist_keywords  : [];
  const blacklistChannels = Array.isArray(local.blacklist_channels)  ? local.blacklist_channels  : [];

  const gap = { display: 'flex', flexDirection: 'column', gap: 20 };
  const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  const row3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 96, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>Settings</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.1em' }}>CONFIGURE YOUR OUTREACH OS</p>
        </div>
        {dirty && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#F5A623', background: 'rgba(245,166,35,0.1)', padding: '4px 12px', borderRadius: 99, border: '1px solid rgba(245,166,35,0.2)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#F5A623' }} />
            UNSAVED CHANGES
          </span>
        )}
      </div>

      {/* 1. API Keys */}
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
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Create a "script" app at reddit.com/prefs/apps</p>
          </div>
          <div>
            <label style={labelSt}>Anthropic (Claude) API Key</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><PasswordInput value={local.anthropic_api_key || ''} onChange={e => set('anthropic_api_key', e.target.value)} placeholder="sk-ant-..." /></div>
              <TestButton status={testStatus.claude} onClick={() => testApi('claude', { key: local.anthropic_api_key })} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Get from console.anthropic.com</p>
          </div>
        </div>
      </Section>

      {/* 2. Email / SMTP */}
      <Section icon={Mail} title="Email & SMTP">
        <div style={gap}>
          <div style={row2}>
            <div><label style={labelSt}>SMTP Host</label><input style={inputSt} value={local.smtp_host || ''} onChange={e => set('smtp_host', e.target.value)} placeholder="smtp.gmail.com" /></div>
            <div><label style={labelSt}>SMTP Port</label><input style={inputSt} type="number" value={local.smtp_port || 587} onChange={e => set('smtp_port', e.target.value)} /></div>
          </div>
          <div style={row2}>
            <div><label style={labelSt}>Email Address</label><input style={inputSt} type="email" value={local.smtp_user || ''} onChange={e => set('smtp_user', e.target.value)} placeholder="you@gmail.com" /></div>
            <div><label style={labelSt}>Password / App Password</label><PasswordInput value={local.smtp_pass || ''} onChange={e => set('smtp_pass', e.target.value)} /></div>
          </div>
          <div><label style={labelSt}>From Name</label><input style={inputSt} value={local.smtp_from_name || ''} onChange={e => set('smtp_from_name', e.target.value)} placeholder="Harsh | ContentCrafterzz" /></div>
          <TestButton status={testStatus.smtp} onClick={() => testApi('smtp', { host: local.smtp_host, port: local.smtp_port, user: local.smtp_user, pass: local.smtp_pass })} />
          <div style={{ ...row2, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
            <div>
              <label style={labelSt}>Daily Sending Limit</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="range" min="10" max="500" step="10" value={local.daily_send_limit || 150} onChange={e => set('daily_send_limit', e.target.value)} style={{ flex: 1, accentColor: '#FF4500' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', minWidth: 32 }}>{local.daily_send_limit || 150}</span>
              </div>
            </div>
            <div><label style={labelSt}>Max Follow-ups Per Lead</label><input style={inputSt} type="number" min="1" max="10" value={local.max_followups || 3} onChange={e => set('max_followups', e.target.value)} /></div>
          </div>
          <div style={row3}>
            <div><label style={labelSt}>Delay Min (sec)</label><input style={inputSt} type="number" min="10" value={local.email_delay_min || 45} onChange={e => set('email_delay_min', e.target.value)} /></div>
            <div><label style={labelSt}>Delay Max (sec)</label><input style={inputSt} type="number" min="10" value={local.email_delay_max || 120} onChange={e => set('email_delay_max', e.target.value)} /></div>
            <div><label style={labelSt}>Follow-up Delay (days)</label><input style={inputSt} type="number" min="1" value={local.followup_delay_days || 3} onChange={e => set('followup_delay_days', e.target.value)} /></div>
          </div>
        </div>
      </Section>

      {/* 3. Agency Profile */}
      <Section icon={Building2} title="Agency Profile">
        <div style={gap}>
          <div style={row2}>
            <div><label style={labelSt}>Agency Name</label><input style={inputSt} value={local.agency_name || ''} onChange={e => set('agency_name', e.target.value)} placeholder="ContentCrafterzz" /></div>
            <div><label style={labelSt}>Your Name</label><input style={inputSt} value={local.your_name || ''} onChange={e => set('your_name', e.target.value)} placeholder="Your name" /></div>
          </div>
          <div style={row2}>
            <div><label style={labelSt}>Your Role</label><input style={inputSt} value={local.your_role || ''} onChange={e => set('your_role', e.target.value)} placeholder="Founder" /></div>
            <div><label style={labelSt}>Portfolio URL</label><input style={inputSt} value={local.portfolio_url || ''} onChange={e => set('portfolio_url', e.target.value)} placeholder="https://yourportfolio.com" /></div>
          </div>
          <div><label style={labelSt}>Pricing Range</label><input style={inputSt} value={local.pricing_range || ''} onChange={e => set('pricing_range', e.target.value)} placeholder="$500-$2,000/month" /></div>
          <div>
            <label style={labelSt}>Services Description</label>
            <textarea style={{ ...inputSt, height: 80, resize: 'none', lineHeight: 1.6 }} value={local.services_description || ''} onChange={e => set('services_description', e.target.value)} placeholder="Describe what you do and for whom..." />
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
          <div><label style={labelSt}>Target Niches</label><TagInput values={targetNiches} onChange={v => set('target_niches', v)} placeholder="fitness, real estate, finance..." /></div>
          <div><label style={labelSt}>Average Deal Value ($)</label><input style={{ ...inputSt, width: 140 }} type="number" value={local.average_deal_value || 1000} onChange={e => set('average_deal_value', e.target.value)} /></div>
        </div>
      </Section>

      {/* 4. Pitch Preferences */}
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

      {/* 5. Automation */}
      <Section icon={Sliders} title="Automation" defaultOpen={false}>
        <div style={gap}>
          {[
            { key: 'auto_scrape',            label: 'Auto-scrape on schedule',    desc: 'Scrape new leads every 6 hours for target niches' },
            { key: 'auto_generate_pitches',  label: 'Auto-generate pitches',      desc: 'Generate pitch immediately when a new lead is found' },
            { key: 'auto_queue_emails',      label: 'Auto-add to email queue',    desc: 'Automatically queue emails after pitch is generated' },
            { key: 'auto_followup',          label: 'Auto follow-up',             desc: 'Send follow-up emails to non-replies automatically' },
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

      {/* 6. Chrome Extension */}
      <Section icon={Chrome} title="Chrome Extension" defaultOpen={false}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: 16, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,69,0,0.1)', border: '1px solid rgba(255,69,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Chrome size={18} style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Coming Soon: Chrome Extension</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>Add any YouTube channel as a lead with one click while browsing. Browse YouTube, see a creator you want to pitch — click the extension and they're instantly in your CRM.</p>
            <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 99, background: 'rgba(123,97,255,0.1)', color: '#7B61FF', border: '1px solid rgba(123,97,255,0.25)', fontFamily: 'var(--font-mono)' }}>IN DEVELOPMENT</span>
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
