import { useState, useEffect, useCallback } from 'react';
import { Plus, Flame, Thermometer, Snowflake, ChevronRight, ChevronDown, BarChart2, Target, Zap, CheckCircle, AlertCircle, Phone, RefreshCw } from 'lucide-react';
import api from '../utils/api';

const TEMP_ICONS = { hot: Flame, warm: Thermometer, cold: Snowflake };

function TempBadge({ temp }) {
  const Icon = TEMP_ICONS[temp] || Snowflake;
  const cls = temp === 'hot' ? 'badge badge--coral' : temp === 'warm' ? 'badge badge--warn' : 'badge badge--neutral';
  return (
    <span className={cls} style={{ gap: 4 }}>
      <Icon size={9} />
      {(temp || 'cold').toUpperCase()}
    </span>
  );
}

function IntentBar({ score }) {
  const pct   = Math.round((score || 0) * 100);
  const color = score >= 0.75 ? 'var(--coral)' : score >= 0.50 ? '#f59e0b' : 'var(--text-4)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--line-2)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

function SignalGrid({ signals }) {
  if (!signals || !Object.keys(signals).length) return null;
  const labels = {
    upload_frequency: 'Upload Freq', view_growth: 'View Growth',
    title_keywords: 'Title KW', description_keywords: 'Desc KW',
    engagement_rate: 'Engagement', upload_consistency: 'Consistency',
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 10 }}>
      {Object.entries(signals).map(([key, val]) => (
        <div key={key} style={{ background: 'var(--bg)', borderRadius: 6, padding: '6px 8px' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-4)', letterSpacing: '0.08em', marginBottom: 2 }}>{labels[key] || key}</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: val >= 0.7 ? 'var(--lime)' : val >= 0.4 ? '#f59e0b' : 'var(--text-3)' }}>{Math.round(val * 100)}%</div>
        </div>
      ))}
    </div>
  );
}

function AngleCard({ angle, selected, onSelect }) {
  const isSelected = selected === angle.angle_name;
  return (
    <div
      onClick={() => onSelect(angle)}
      style={{
        border: `1px solid ${isSelected ? 'var(--lime)' : 'var(--line)'}`,
        borderRadius: 'var(--r)', padding: 14, cursor: 'pointer',
        background: isSelected ? 'rgba(200,246,84,0.06)' : 'var(--bg)',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--f-sans)', fontSize: 12, fontWeight: 600, color: isSelected ? 'var(--lime)' : 'var(--text-2)' }}>
          {angle.angle_name}
        </span>
        {isSelected && <CheckCircle size={13} style={{ color: 'var(--lime)' }} />}
      </div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>{angle.description}</div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-4)', marginBottom: 8 }}>SUBJECT: {angle.subject}</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'var(--f-sans)', borderTop: '1px solid var(--line)', paddingTop: 8 }}>
        {angle.full_email}
      </div>
    </div>
  );
}

function LeadRow({ cl, campaignId, onUpdate }) {
  const [expanded, setExpanded]      = useState(false);
  const [loading, setLoading]        = useState('');
  const [angles, setAngles]          = useState(cl.angles || []);
  const [selectedAngle, setSelected] = useState(cl.selected_angle);
  const [editSubject, setEditSubject] = useState(cl.email_subject_edited || cl.email_subject || '');
  const [editBody, setEditBody]      = useState(cl.email_body_edited || cl.email_body || '');
  const [callBooked, setCallBooked]  = useState(!!cl.call_booked);
  const [clientClosed, setClient]    = useState(!!cl.client_closed);

  const runPsychology = async () => {
    setLoading('psych');
    try {
      await api.post(`/campaigns/${campaignId}/psychology/${cl.lead_id}`);
      await runAngles();
    } catch (e) { alert('Psychology analysis failed: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(''); }
  };

  const runAngles = async () => {
    setLoading('angles');
    try {
      const { data } = await api.post(`/campaigns/${campaignId}/angles/${cl.lead_id}`);
      setAngles(data.angles || []);
      setSelected(data.selected_angle);
      const picked = (data.angles || []).find(a => a.angle_name === data.selected_angle) || data.angles?.[0];
      if (picked) { setEditSubject(picked.subject || ''); setEditBody(picked.full_email || ''); }
      onUpdate?.();
    } catch (e) { alert('Angle generation failed: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(''); }
  };

  const selectAngle = async (angle) => {
    setSelected(angle.angle_name);
    setEditSubject(angle.subject || '');
    setEditBody(angle.full_email || '');
    try {
      await api.post(`/campaigns/${campaignId}/select-angle/${cl.lead_id}`, {
        angle_name: angle.angle_name, email_subject: angle.subject, email_body: angle.full_email,
      });
    } catch {}
  };

  const saveEdits = async () => {
    try {
      await api.post(`/campaigns/${campaignId}/select-angle/${cl.lead_id}`, {
        angle_name: selectedAngle, email_subject: editSubject, email_body: editBody,
      });
    } catch {}
  };

  const trackEvent = async (updates) => {
    try { await api.post(`/campaigns/${campaignId}/track`, { lead_id: cl.lead_id, ...updates }); onUpdate?.(); }
    catch {}
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 8 }}>
      <div onClick={() => setExpanded(e => !e)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}>
        {cl.thumbnail_url && (
          <img src={cl.thumbnail_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontFamily: 'var(--f-sans)', fontWeight: 600, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cl.channel_name}
            </span>
            <TempBadge temp={cl.temperature} />
            {cl.email && <span className="badge badge--ok">EMAIL ✓</span>}
            {callBooked && <span className="badge badge--lime">CALL ✓</span>}
            {clientClosed && <span className="badge badge--coral">CLIENT ✓</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-3)' }}>{(cl.subscriber_count || 0).toLocaleString()} subs</span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-4)' }}>{(cl.avg_views || 0).toLocaleString()} avg views</span>
          </div>
        </div>
        <div style={{ width: 140, flexShrink: 0 }}>
          <IntentBar score={cl.intent_score} />
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-4)', marginTop: 3, textAlign: 'right' }}>
            {cl.intent_confidence?.toUpperCase()} CONFIDENCE
          </div>
        </div>
        <div style={{ color: 'var(--text-4)', flexShrink: 0 }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '16px 16px 20px' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
            REASON: {cl.intent_reason || '—'}
          </div>
          <SignalGrid signals={cl.intent_signals || {}} />

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={runPsychology} disabled={!!loading} className="btn btn--ghost">
              {loading === 'psych' ? <RefreshCw size={12} className="spin" /> : <Target size={12} />}
              {angles.length ? 'Re-analyze' : 'Analyze Psychology + Generate Angles'}
            </button>
            {angles.length > 0 && (
              <button onClick={runAngles} disabled={!!loading} className="btn btn--ghost">
                {loading === 'angles' ? <RefreshCw size={12} /> : <Zap size={12} />}
                Regenerate Angles
              </button>
            )}
          </div>

          {angles.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-4)', letterSpacing: '0.1em', marginBottom: 10 }}>SELECT AN ANGLE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {angles.map(a => <AngleCard key={a.angle_name} angle={a} selected={selectedAngle} onSelect={selectAngle} />)}
              </div>
            </div>
          )}

          {selectedAngle && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-4)', letterSpacing: '0.1em', marginBottom: 10 }}>EDIT EMAIL</div>
              <label className="field__label">SUBJECT</label>
              <input className="input" style={{ marginBottom: 10 }} value={editSubject} onChange={e => setEditSubject(e.target.value)} onBlur={saveEdits} placeholder="Email subject..." />
              <label className="field__label">BODY</label>
              <textarea className="input" style={{ minHeight: 160, resize: 'vertical', lineHeight: 1.6 }} value={editBody} onChange={e => setEditBody(e.target.value)} onBlur={saveEdits} placeholder="Email body..." />
              {cl.email_quality_score > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-4)' }}>EMAIL QUALITY</span>
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 600, color: cl.email_quality_score >= 70 ? 'var(--ok)' : cl.email_quality_score >= 50 ? '#f59e0b' : 'var(--bad)' }}>
                    {cl.email_quality_score}/100
                  </span>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 16, padding: 12, background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-4)', letterSpacing: '0.1em', marginBottom: 10 }}>OUTCOME TRACKING</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => { setCallBooked(v => !v); trackEvent({ call_booked: !callBooked }); }}
                className="btn btn--ghost"
                style={{ background: callBooked ? 'rgba(200,246,84,0.1)' : 'transparent', borderColor: callBooked ? 'var(--lime)' : 'var(--line)', color: callBooked ? 'var(--lime)' : 'var(--text-3)' }}
              >
                <Phone size={11} /> Call Booked
              </button>
              <button
                onClick={() => { setClient(v => !v); trackEvent({ client_closed: !clientClosed }); }}
                className="btn btn--ghost"
                style={{ background: clientClosed ? 'rgba(255,138,115,0.1)' : 'transparent', borderColor: clientClosed ? 'var(--coral)' : 'var(--line)', color: clientClosed ? 'var(--coral)' : 'var(--text-3)' }}
              >
                <CheckCircle size={11} /> Client Closed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    name: '', niche: '', service_type: 'video editing', credentials: '',
    ab_test_enabled: false, ab_variant_a: 'Problem Angle', ab_variant_b: 'Story Angle',
  });
  const [loading, setLoading] = useState(false);
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const submit = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.post('/campaigns', form);
      onCreate(data.campaign);
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520, padding: 32 }}>
        <h2 style={{ fontFamily: 'var(--f-serif)', fontStyle: 'italic', fontSize: 22, fontWeight: 400, color: 'var(--text)', margin: '0 0 24px' }}>
          New Campaign
        </h2>
        <label className="field__label">CAMPAIGN NAME</label>
        <input className="input" style={{ marginBottom: 14 }} placeholder="e.g. Finance Creators — June" value={form.name} onChange={e => set('name', e.target.value)} />
        <label className="field__label">TARGET NICHE</label>
        <input className="input" style={{ marginBottom: 14 }} placeholder="e.g. finance, fitness, tech" value={form.niche} onChange={e => set('niche', e.target.value)} />
        <label className="field__label">SERVICE TYPE</label>
        <select className="input" style={{ marginBottom: 14 }} value={form.service_type} onChange={e => set('service_type', e.target.value)}>
          <option value="video editing">Video Editing</option>
          <option value="thumbnail design">Thumbnail Design</option>
          <option value="scriptwriting">Scriptwriting</option>
          <option value="video production">Video Production</option>
          <option value="content strategy">Content Strategy</option>
        </select>
        <label className="field__label">YOUR BEST RESULT (optional — boosts email personalization)</label>
        <input className="input" style={{ marginBottom: 18 }} placeholder="e.g. Helped a finance creator go from 2% to 5% CTR in 6 weeks" value={form.credentials} onChange={e => set('credentials', e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 20 }}>
          <input type="checkbox" checked={form.ab_test_enabled} onChange={e => set('ab_test_enabled', e.target.checked)} />
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--f-sans)' }}>Enable A/B test (split leads between two angles)</span>
        </label>
        {form.ab_test_enabled && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            <div>
              <label className="field__label">VARIANT A</label>
              <select className="input" value={form.ab_variant_a} onChange={e => set('ab_variant_a', e.target.value)}>
                <option>Problem Angle</option><option>Story Angle</option><option>Growth Angle</option>
              </select>
            </div>
            <div>
              <label className="field__label">VARIANT B</label>
              <select className="input" value={form.ab_variant_b} onChange={e => set('ab_variant_b', e.target.value)}>
                <option>Story Angle</option><option>Problem Angle</option><option>Growth Angle</option>
              </select>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={submit} disabled={loading || !form.name.trim()}>
            {loading ? 'Creating…' : 'Create Campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddLeadsModal({ campaign, onClose, onDone }) {
  const [niche, setNiche]     = useState(campaign.niche || '');
  const [limit, setLimit]     = useState(200);
  const [minSubs, setMinSubs] = useState(5000);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);

  const run = async () => {
    setLoading(true); setResult(null);
    try {
      const { data } = await api.post(`/campaigns/${campaign.id}/add-leads`, { niche: niche || undefined, limit, min_subs: minSubs });
      setResult(data); onDone(data.campaign);
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520, padding: 32 }}>
        <h2 style={{ fontFamily: 'var(--f-serif)', fontStyle: 'italic', fontSize: 20, fontWeight: 400, color: 'var(--text)', margin: '0 0 20px' }}>
          Add Leads → Intent Score
        </h2>
        {result ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 40, color: 'var(--lime)', marginBottom: 12 }}>{result.added}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>leads scored and added</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24 }}>
              {[{ label: 'HOT', val: result.hot, color: 'var(--coral)' }, { label: 'WARM', val: result.warm, color: '#f59e0b' }, { label: 'COLD', val: result.cold, color: 'var(--text-3)' }].map(({ label, val, color }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 20, color }}>{val}</div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-4)' }}>{label}</div>
                </div>
              ))}
            </div>
            <button className="btn btn--primary" onClick={onClose}>View Leads</button>
          </div>
        ) : (
          <>
            <label className="field__label">NICHE FILTER (leave blank to include all your leads)</label>
            <input className="input" style={{ marginBottom: 14 }} placeholder="e.g. finance, fitness, tech" value={niche} onChange={e => setNiche(e.target.value)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <div>
                <label className="field__label">MAX LEADS TO SCORE</label>
                <select className="input" value={limit} onChange={e => setLimit(Number(e.target.value))}>
                  <option value={50}>50</option><option value={100}>100</option><option value={200}>200</option><option value={500}>500</option>
                </select>
              </div>
              <div>
                <label className="field__label">MIN SUBSCRIBERS</label>
                <select className="input" value={minSubs} onChange={e => setMinSubs(Number(e.target.value))}>
                  <option value={5000}>5K</option><option value={10000}>10K</option><option value={50000}>50K</option><option value={100000}>100K</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn--primary" onClick={run} disabled={loading}>{loading ? 'Scoring…' : 'Score Intent →'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CampaignCard({ campaign, onSelect }) {
  return (
    <div
      className="card"
      style={{ cursor: 'pointer', transition: 'border-color 0.15s', padding: 20 }}
      onClick={() => onSelect(campaign)}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--line-2)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--f-sans)', fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 3 }}>{campaign.name}</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-4)' }}>
            {campaign.niche ? `#${campaign.niche} · ` : ''}{campaign.service_type || 'video editing'}
            {campaign.ab_test_enabled ? ' · A/B TEST' : ''}
          </div>
        </div>
        <span className={`badge ${campaign.status === 'ready' ? 'badge--lime' : campaign.status === 'active' ? 'badge--ok' : campaign.status === 'analyzing' ? 'badge--warn' : 'badge--neutral'}`}>
          {(campaign.status || 'draft').toUpperCase()}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {[
          { label: 'LEADS',   value: campaign.total_leads || 0,   color: 'var(--text)' },
          { label: 'HOT',     value: campaign.hot_leads || 0,     color: 'var(--coral)' },
          { label: 'SENT',    value: campaign.emails_sent || 0,   color: 'var(--text)' },
          { label: 'REPLIED', value: `${campaign.reply_rate || 0}%`, color: campaign.reply_rate >= 40 ? 'var(--ok)' : 'var(--text-2)' },
          { label: 'CLIENTS', value: campaign.clients_closed || 0, color: campaign.clients_closed > 0 ? 'var(--lime)' : 'var(--text-3)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 18, fontWeight: 500, color }}>{value}</div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-4)', letterSpacing: '0.08em' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CampaignDetail({ campaign: initialCampaign, onBack }) {
  const [campaign, setCampaign]         = useState(initialCampaign);
  const [leads, setLeads]               = useState([]);
  const [tab, setTab]                   = useState('hot');
  const [loading, setLoading]           = useState(false);
  const [showAddLeads, setShowAddLeads] = useState(false);
  const [bulkLoading, setBulkLoading]   = useState(false);
  const [accuracy, setAccuracy]         = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/campaigns/${campaign.id}`);
      setCampaign(data.campaign); setLeads(data.leads || []);
    } catch {}
    finally { setLoading(false); }
  }, [campaign.id]);

  useEffect(() => { load(); }, [load]);

  const bulkAnalyze = async () => {
    setBulkLoading(true);
    try { await api.post(`/campaigns/${campaign.id}/bulk-analyze`, { limit: 20 }); await load(); }
    catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setBulkLoading(false); }
  };

  const checkAccuracy = async () => {
    try { const { data } = await api.get(`/campaigns/${campaign.id}/accuracy`); setAccuracy(data.accuracy); }
    catch {}
  };

  const hot      = leads.filter(l => l.temperature === 'hot');
  const warm     = leads.filter(l => l.temperature === 'warm');
  const cold     = leads.filter(l => l.temperature === 'cold');
  const displayed = tab === 'hot' ? hot : tab === 'warm' ? warm : cold;
  const replyRate = campaign.emails_sent > 0 ? Math.round((campaign.emails_replied / campaign.emails_sent) * 100) : 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onBack} className="btn btn--ghost btn--sm">← Back</button>
        <div>
          <h2 style={{ fontFamily: 'var(--f-serif)', fontStyle: 'italic', fontSize: 22, fontWeight: 400, color: 'var(--text)', margin: 0 }}>{campaign.name}</h2>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{campaign.niche ? `#${campaign.niche}` : ''} {campaign.service_type}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'TOTAL',      value: campaign.total_leads || 0 },
          { label: 'HOT',        value: campaign.hot_leads || 0,      color: 'var(--coral)' },
          { label: 'SENT',       value: campaign.emails_sent || 0 },
          { label: 'REPLY RATE', value: `${replyRate}%`,              color: replyRate >= 40 ? 'var(--ok)' : replyRate >= 20 ? '#f59e0b' : 'var(--text-3)' },
          { label: 'CALLS',      value: campaign.calls_booked || 0,   color: 'var(--lime)' },
          { label: 'CLIENTS',    value: campaign.clients_closed || 0, color: 'var(--coral)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat" style={{ textAlign: 'center', padding: '14px 16px' }}>
            <div className="stat__value--mono" style={{ color: color || 'var(--text)', fontSize: 22, marginTop: 0 }}>{value}</div>
            <div className="stat__label" style={{ marginBottom: 0, marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-4)' }}>
          AVG INTENT SCORE: {Math.round((campaign.avg_intent_score || 0) * 100)}%
          {campaign.avg_intent_score >= 0.75 && <span style={{ color: 'var(--ok)', marginLeft: 6 }}>✓ Above 75% target</span>}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowAddLeads(true)} className="btn btn--ghost"><Plus size={12} /> Add Leads + Score Intent</button>
        {leads.length > 0 && (
          <button onClick={bulkAnalyze} disabled={bulkLoading} className="btn btn--primary">
            {bulkLoading ? <RefreshCw size={12} /> : <Zap size={12} />}
            {bulkLoading ? 'Analyzing…' : 'Analyze Top 20'}
          </button>
        )}
      </div>

      <div className="tabs">
        {[
          { key: 'hot',  label: 'HOT',  count: hot.length,  Icon: Flame,       color: 'var(--coral)' },
          { key: 'warm', label: 'WARM', count: warm.length, Icon: Thermometer, color: '#f59e0b' },
          { key: 'cold', label: 'COLD', count: cold.length, Icon: Snowflake,   color: 'var(--text-3)' },
        ].map(({ key, label, count, Icon, color }) => (
          <button key={key} onClick={() => setTab(key)} className={`tab ${tab === key ? 'active' : ''}`}
            style={{ color: tab === key ? color : undefined, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon size={11} /> {label} ({count})
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {campaign.emails_replied > 0 && (
          <button onClick={checkAccuracy} className="btn btn--ghost btn--sm" style={{ marginBottom: 1 }}>
            <BarChart2 size={11} /> Check Algorithm Accuracy
          </button>
        )}
      </div>

      {accuracy && (
        <div className="card" style={{ marginBottom: 16, padding: 16, background: accuracy.overall_passing ? 'rgba(200,246,84,0.05)' : 'rgba(255,138,115,0.05)', borderColor: accuracy.overall_passing ? 'var(--lime)' : 'var(--coral)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            {accuracy.overall_passing ? <CheckCircle size={14} style={{ color: 'var(--lime)' }} /> : <AlertCircle size={14} style={{ color: 'var(--coral)' }} />}
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 600, color: accuracy.overall_passing ? 'var(--lime)' : 'var(--coral)' }}>
              ALGORITHM {accuracy.overall_passing ? 'PERFORMING WELL' : 'NEEDS ADJUSTMENT'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {Object.entries(accuracy.buckets).map(([key, b]) => b.total > 0 && (
              <div key={key} style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: 10 }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-4)', letterSpacing: '0.08em', marginBottom: 4 }}>{key.toUpperCase()} LEADS</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 16, color: b.passing ? 'var(--ok)' : 'var(--bad)' }}>{b.reply_rate}%</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-4)' }}>target: {b.target}% · {b.replied}/{b.total}</div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 10 }}>{accuracy.recommendation}</div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-4)', fontFamily: 'var(--f-mono)', fontSize: 12 }}>Loading leads…</div>
      ) : displayed.length === 0 ? (
        <div className="empty">
          <div className="empty__title">{leads.length === 0 ? 'No leads yet' : `No ${tab} leads`}</div>
          <div className="empty__desc">{leads.length === 0 ? 'Click "Add Leads + Score Intent" to get started.' : 'Try a different temperature tab.'}</div>
        </div>
      ) : (
        displayed.map(cl => <LeadRow key={`${cl.campaign_id}-${cl.lead_id}`} cl={cl} campaignId={campaign.id} onUpdate={load} />)
      )}

      {showAddLeads && (
        <AddLeadsModal
          campaign={campaign}
          onClose={() => setShowAddLeads(false)}
          onDone={(updated) => { setCampaign(updated); setShowAddLeads(false); load(); }}
        />
      )}
    </div>
  );
}

export default function Campaigns() {
  const [campaigns, setCampaigns]   = useState([]);
  const [selected, setSelected]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [overview, setOverview]     = useState(null);

  const loadCampaigns = async () => {
    try {
      const [cRes, sRes] = await Promise.all([api.get('/campaigns'), api.get('/campaigns/stats/overview')]);
      setCampaigns(cRes.data.campaigns || []);
      setOverview(sRes.data.stats || null);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { loadCampaigns(); }, []);

  if (selected) {
    return (
      <div style={{ padding: '28px 32px', maxWidth: 1360, margin: '0 auto' }}>
        <CampaignDetail campaign={selected} onBack={() => { setSelected(null); loadCampaigns(); }} />
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1360, margin: '0 auto' }}>
      <div className="page__head">
        <div>
          <h1 className="page__title">Campaigns</h1>
          <p className="page__sub">Intent Prediction · Psychology Analysis · A/B Testing</p>
        </div>
        <button className="btn btn--primary" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> New Campaign
        </button>
      </div>

      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'CAMPAIGNS',     value: overview.total_campaigns },
            { label: 'EMAILS SENT',   value: overview.total_sent },
            { label: 'TOTAL REPLIES', value: overview.total_replied },
            { label: 'REPLY RATE',    value: `${overview.reply_rate}%`, color: overview.reply_rate >= 40 ? 'var(--ok)' : 'var(--text-2)' },
            { label: 'CLIENTS',       value: overview.total_clients,    color: overview.total_clients > 0 ? 'var(--lime)' : 'var(--text)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="stat">
              <div className="stat__label">{label}</div>
              <div className="stat__value--mono" style={{ color: color || 'var(--text)', fontSize: 26 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-4)', fontFamily: 'var(--f-mono)', fontSize: 12 }}>Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <div className="empty">
          <Target size={32} className="empty__icon" />
          <div className="empty__title">No campaigns yet</div>
          <div className="empty__desc">Create a campaign to score intent, analyze psychology, and generate personalized emails.</div>
          <button className="btn btn--primary mt-12" onClick={() => setShowCreate(true)}><Plus size={13} /> Create First Campaign</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {campaigns.map(c => <CampaignCard key={c.id} campaign={c} onSelect={setSelected} />)}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreate={(c) => { setCampaigns(prev => [c, ...prev]); setShowCreate(false); setSelected(c); }}
        />
      )}
    </div>
  );
}
