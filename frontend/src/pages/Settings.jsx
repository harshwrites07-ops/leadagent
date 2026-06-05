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
  const [tab, setTab] = useState('voice');

  const [profile, setProfile] = useState({
    full_name: '', agency_name: '', role: 'Video Editor',
    target_niches: [], portfolio_url: '', best_result: '', pricing_range: '$500-$2000/month',
  });

  // Voice profile state
  const [voice, setVoice] = useState({
    service_type: '', one_liner: '', experience_years: '', best_result: '',
    target_niches: [], pricing_range: '', personality_traits: [],
    outreach_goal: '', origin_story: '', unique_difference: '',
  });
  const [voiceDNA, setVoiceDNA] = useState(null);
  const [savingVoice, setSavingVoice] = useState(false);
  const [previewEmail, setPreviewEmail] = useState(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
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
    // Load voice profile from user
    try {
      const me = await api.get('/auth/me');
      const u = me.data.user;
      setVoice({
        service_type: u.service_type || '',
        one_liner: u.one_liner || '',
        experience_years: u.experience_years || '',
        best_result: u.best_result || '',
        target_niches: (() => { try { return JSON.parse(u.target_niches || '[]'); } catch { return []; } })(),
        pricing_range: u.pricing_range || '',
        personality_traits: (() => { try { return JSON.parse(u.personality_traits || '[]'); } catch { return []; } })(),
        outreach_goal: u.outreach_goal || '',
        origin_story: u.origin_story || '',
        unique_difference: u.unique_difference || '',
      });
      try { setVoiceDNA(JSON.parse(u.voice_dna || '{}')); } catch {}
    } catch {}
  };

  const setV = (k, v) => setVoice(prev => ({ ...prev, [k]: v }));

  const toggleVoiceChip = (key, val, max = 99) => {
    setVoice(prev => {
      const arr = prev[key];
      if (arr.includes(val)) return { ...prev, [key]: arr.filter(x => x !== val) };
      if (arr.length >= max) return { ...prev, [key]: [...arr.slice(1), val] };
      return { ...prev, [key]: [...arr, val] };
    });
  };

  const saveVoiceProfile = async () => {
    setSavingVoice(true);
    try {
      const res = await api.put('/auth/profile', voice);
      if (res.data.voice_dna) setVoiceDNA(res.data.voice_dna);
      toast.success('Voice profile updated — DNA rebuilt');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save');
    } finally {
      setSavingVoice(false);
    }
  };

  const generatePreviewEmail = async () => {
    setGeneratingPreview(true);
    try {
      // Pick a random lead with email
      const leadsRes = await api.get('/leads?limit=10&hasEmail=true');
      const leads = leadsRes.data?.leads || [];
      if (!leads.length) { toast.error('No leads with emails found — add some leads first'); setGeneratingPreview(false); return; }
      const lead = leads[Math.floor(Math.random() * leads.length)];
      const pitchRes = await api.post(`/pitches/generate/${lead.id}`);
      setPreviewEmail({ lead, pitch: pitchRes.data.pitch });
    } catch (e) {
      toast.error('Failed to generate preview');
    } finally {
      setGeneratingPreview(false);
    }
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
      toast.success('Saved.');
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
          { id: 'voice', l: 'Voice Profile' },
          { id: 'profile', l: 'Account' },
          { id: 'mailboxes', l: 'Mailboxes & sending' },
          { id: 'integrations', l: 'Integrations' },
          { id: 'plan', l: 'Plan & billing' },
        ].map(t => (
          <div key={t.id} className={`tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)}>{t.l}</div>
        ))}
      </div>

      {/* Voice Profile */}
      {tab === 'voice' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Completeness banner */}
          {(() => {
            const filled = [voice.service_type, voice.best_result, voice.one_liner, voice.pricing_range, voice.outreach_goal, voice.personality_traits.length > 0, voice.unique_difference].filter(Boolean).length;
            const total  = 7;
            const pct    = Math.round((filled / total) * 100);
            if (pct === 100) return null;
            return (
              <div style={{ padding: '12px 16px', background: 'rgba(200,246,84,0.06)', border: '1px solid var(--lime-border)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                    Your email system is {pct}% configured
                  </div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    Fill in all fields below for the best email quality. Missing: {[
                      !voice.service_type && 'what you sell',
                      !voice.best_result && 'best result',
                      !voice.one_liner && 'one-liner',
                      !voice.pricing_range && 'pricing range',
                      !voice.outreach_goal && 'outreach goal',
                      !voice.personality_traits.length && 'personality',
                      !voice.unique_difference && 'what makes you different',
                    ].filter(Boolean).join(', ')}
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--f-mono)', color: 'var(--lime)' }}>{pct}%</div>
              </div>
            );
          })()}

          {/* DNA Preview Card */}
          {voiceDNA?.communicationStyle && (
            <div className="card" style={{ background: 'rgba(var(--lime-rgb),0.04)', borderColor: 'var(--lime-border)' }}>
              <div className="card__head">
                <div>
                  <div className="card__title">Your Voice Profile</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    Last updated: {voiceDNA.builtAt ? new Date(voiceDNA.builtAt).toLocaleDateString() : 'today'}
                  </div>
                </div>
                <button className="btn btn--ghost btn--sm" onClick={generatePreviewEmail} disabled={generatingPreview}>
                  {generatingPreview ? 'Generating...' : '⚡ Preview email'}
                </button>
              </div>
              <div className="card__body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Writing style', value: voiceDNA.communicationStyle },
                  { label: 'Email tone', value: voiceDNA.emailTone },
                  { label: 'Social proof', value: voiceDNA.socialProof },
                  { label: 'Your angle', value: voiceDNA.uniqueDifference || voiceDNA.identity },
                ].map(row => row.value ? (
                  <div key={row.label} style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)' }}>
                    <div className="muted mono" style={{ fontSize: 9, letterSpacing: '.1em', marginBottom: 4 }}>{row.label.toUpperCase()}</div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{row.value}</div>
                  </div>
                ) : null)}
              </div>
            </div>
          )}

          {/* Preview email modal */}
          {previewEmail && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <div style={{ maxWidth: 560, width: '100%', background: 'var(--bg-surface)', borderRadius: 14, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Preview — {previewEmail.lead.channel_name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>This is what your emails will sound like</div>
                  </div>
                  <button className="btn btn--ghost btn--sm" onClick={() => setPreviewEmail(null)}>✕</button>
                </div>
                <div style={{ padding: 24 }}>
                  <div style={{ marginBottom: 12 }}>
                    <span className="muted" style={{ fontSize: 11 }}>SUBJECT</span>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{previewEmail.pitch?.email_subject}</div>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.8, padding: '16px 20px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)' }}>
                    {previewEmail.pitch?.email_body || previewEmail.pitch?.cold_email || previewEmail.pitch?.body || '(no body generated)'}
                  </div>
                  {previewEmail.pitch?.word_count && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{previewEmail.pitch.word_count} words</span>
                      <span>Score: {previewEmail.pitch?.pitch_score || previewEmail.pitch?.quality_score || '—'}/100</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Editable fields */}
          <div className="card">
            <div className="card__head"><div className="card__title">About you</div></div>
            <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="field">
                <div className="field__label">What do you sell to YouTube creators?</div>
                <input className="input" value={voice.service_type} onChange={e => setV('service_type', e.target.value)}
                  placeholder="e.g. video editing, thumbnail design, sponsorships, coaching..." />
              </div>
              <div className="field">
                <div className="field__label">Describe yourself in one sentence <span className="muted">({voice.one_liner.length}/150)</span></div>
                <textarea className="input" rows={2} maxLength={150} style={{ resize: 'none' }}
                  value={voice.one_liner} onChange={e => setV('one_liner', e.target.value)}
                  placeholder="e.g. I help finance creators look as professional as their ideas deserve" />
              </div>
              <div className="field">
                <div className="field__label">How long have you been doing this?</div>
                <select className="input" value={voice.experience_years} onChange={e => setV('experience_years', e.target.value)}>
                  <option value="">Select...</option>
                  {[['just_starting','Just starting out (under 1 year)'],['getting_established','1-3 years'],['experienced','3-5 years'],['veteran','5+ years']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__head"><div className="card__title">Your best result</div></div>
            <div className="card__body">
              <div className="field">
                <div className="field__label">Best result for a client <span className="muted">({voice.best_result.length}/300)</span></div>
                <textarea className="input" rows={3} maxLength={300} style={{ resize: 'none' }}
                  value={voice.best_result} onChange={e => setV('best_result', e.target.value)}
                  placeholder="Be specific with numbers. e.g. Helped a fitness channel increase watch time by 60% in 30 days" />
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <div className="field__label">Typical pricing <span className="muted" style={{ fontWeight: 400 }}>(never shown to creators)</span></div>
                <select className="input" value={voice.pricing_range} onChange={e => setV('pricing_range', e.target.value)}>
                  <option value="">Select...</option>
                  {['Under $500/month or project','$500 - $1,500/month','$1,500 - $3,500/month','$3,500 - $7,000/month','$7,000+/month','I work on project rates'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__head"><div className="card__title">Your communication style</div></div>
            <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="field">
                <div className="field__label">How would your best friend describe you? <span className="muted">(up to 3)</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {['Direct and no-nonsense','Warm and friendly','Analytical and data-driven','Creative and energetic','Calm and thoughtful','Funny and casual','Professional and polished','Bold and confident','Laid-back and approachable'].map(t => (
                    <button key={t} type="button" onClick={() => toggleVoiceChip('personality_traits', t, 3)}
                      style={{ padding: '6px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer', border: `1px solid ${voice.personality_traits.includes(t) ? 'var(--lime-border)' : 'var(--line)'}`, background: voice.personality_traits.includes(t) ? 'var(--lime-soft)' : 'var(--surface-2)', color: voice.personality_traits.includes(t) ? 'var(--lime)' : 'var(--text-2)', fontWeight: voice.personality_traits.includes(t) ? 600 : 400 }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <div className="field__label">Main outreach goal</div>
                {[['get_reply','Start a conversation (get a reply)'],['book_call','Book a discovery call'],['close_deal','Close a deal directly']].map(([val, label]) => (
                  <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: `1px solid ${voice.outreach_goal === val ? 'var(--lime-border)' : 'var(--line)'}`, borderRadius: 8, cursor: 'pointer', background: voice.outreach_goal === val ? 'var(--lime-soft)' : 'transparent', marginBottom: 6 }}>
                    <input type="radio" checked={voice.outreach_goal === val} onChange={() => setV('outreach_goal', val)} style={{ accentColor: 'var(--lime)' }} />
                    <span style={{ fontSize: 13 }}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__head"><div className="card__title">Your story</div></div>
            <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <div className="field__label">Why did you start doing this? <span className="muted">({voice.origin_story.length}/300)</span></div>
                <textarea className="input" rows={3} maxLength={300} style={{ resize: 'none' }}
                  value={voice.origin_story} onChange={e => setV('origin_story', e.target.value)}
                  placeholder="e.g. Started editing videos to pay for college. Now I help creators tell better stories." />
              </div>
              <div className="field">
                <div className="field__label">What makes you different? <span className="muted">({voice.unique_difference.length}/300)</span></div>
                <textarea className="input" rows={3} maxLength={300} style={{ resize: 'none' }}
                  value={voice.unique_difference} onChange={e => setV('unique_difference', e.target.value)}
                  placeholder="e.g. I only take 3 clients at a time so every creator gets my full attention." />
              </div>
            </div>
          </div>

          <button className="btn btn--lime btn--lg" onClick={saveVoiceProfile} disabled={savingVoice} style={{ alignSelf: 'flex-end', minWidth: 200 }}>
            {savingVoice ? 'Saving & rebuilding...' : 'Save voice profile'}
          </button>
        </div>
      )}

      {/* Account (formerly Profile) */}
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
                <input className="input" value={profile.agency_name} onChange={e => setP('agency_name', e.target.value)} placeholder="Quelro" />
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
            {/* Gmail */}
            <div className="row" style={{ padding: 16, gap: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', color: gmailAccounts.length > 0 ? 'var(--lime)' : 'var(--text-3)' }}>
                <Icon name="mail" size={14} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Gmail</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {gmailAccounts.length > 0
                    ? `${gmailAccounts.length} mailbox${gmailAccounts.length !== 1 ? 'es' : ''} connected — used for sending outreach emails`
                    : 'Connect your Gmail to send outreach emails directly from your account'}
                </div>
              </div>
              {gmailAccounts.length > 0
                ? <span className="badge badge--lime"><Icon name="check" size={11} />Connected</span>
                : (
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={async () => {
                      setConnectingGmail(true);
                      try {
                        const { data } = await api.get('/gmail/auth-url');
                        if (data.url) window.location.href = data.url;
                      } catch { toast.error('Failed to start Gmail connect'); }
                      finally { setConnectingGmail(false); }
                    }}
                    disabled={connectingGmail}
                  >
                    {connectingGmail ? 'Redirecting…' : 'Connect Gmail'}
                  </button>
                )}
            </div>
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
