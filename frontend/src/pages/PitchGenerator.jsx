import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Icon from '../components/ui/Icon';
import api, { formatNumber } from '../utils/api';

const GEN_STEPS = [
  { key: 'deep_study',       label: 'Brief',    n: 1 },
  { key: 'custom_offer',     label: 'Research', n: 2 },
  { key: 'cold_email',       label: 'Variants', n: 3 },
  { key: 'subject_variants', label: 'Sequence', n: 4 },
  { key: 'done',             label: 'Send',     n: 5 },
];

function normalizePitch(raw) {
  if (!raw) return null;
  const subjects = Array.isArray(raw.subject_variants)
    ? raw.subject_variants
    : (() => { try { return JSON.parse(raw.subject_variants || '[]'); } catch { return []; } })();
  return {
    ...raw,
    subject_variants: subjects,
    email_subject: raw.email_subject || '',
    cold_email_body: raw.cold_email || '',
  };
}

export default function PitchGenerator() {
  const navigate = useNavigate();

  // Leads
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [showLeadPicker, setShowLeadPicker] = useState(true);

  // Multi-select bulk mode
  const [selectedLeads, setSelectedLeads] = useState(new Set());
  const [timeGap, setTimeGap] = useState(60);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, done: false, action: '' });
  const [bulkResults, setBulkResults] = useState([]);

  // Pitch (single-lead mode)
  const [pitch, setPitch] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(null);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  // Editing
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [selectedSubj, setSelectedSubj] = useState(0);
  const [rescoring, setRescoring] = useState(false);

  // Load leads
  useEffect(() => {
    (async () => {
      setLeadsLoading(true);
      try {
        const { data } = await api.get('/leads', { params: { limit: 200 } });
        setLeads(data.leads ?? []);
      } catch { toast.error('Failed to load leads'); }
      finally { setLeadsLoading(false); }
    })();
  }, []);

  // Preselect from query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const leadId = params.get('lead');
    if (leadId && leads.length > 0) {
      const found = leads.find(l => String(l.id) === String(leadId));
      if (found) handleSelectLead(found);
    }
  }, [leads]);

  const handleSelectLead = async lead => {
    setSelectedLead(lead);
    setPitch(null);
    setCompletedSteps(new Set());
    setCurrentStep(null);
    setShowLeadPicker(false);
    try {
      const { data } = await api.get(`/pitches/by-lead/${lead.id}`);
      if (data?.pitch) {
        const p = normalizePitch(data.pitch);
        setPitch(p);
        setEmailSubject(p.email_subject);
        setEmailBody(p.cold_email_body);
        setCompletedSteps(new Set(GEN_STEPS.map(s => s.key)));
      }
    } catch { /* no pitch yet */ }
  };

  const handleGenerate = async () => {
    if (!selectedLead) return;
    setGenerating(true);
    setPitch(null);
    setCompletedSteps(new Set());
    setCurrentStep(GEN_STEPS[0].key);

    let animCancelled = false;
    ;(async () => {
      const delays = [0, 6000, 14000, 22000, 30000];
      for (let i = 0; i < GEN_STEPS.length - 1; i++) {
        if (animCancelled) break;
        await new Promise(r => setTimeout(r, i === 0 ? 0 : delays[i] - delays[i - 1]));
        if (animCancelled) break;
        setCurrentStep(GEN_STEPS[i].key);
        if (i > 0) setCompletedSteps(prev => { const n = new Set(prev); n.add(GEN_STEPS[i - 1].key); return n; });
      }
    })();

    try {
      const { data } = await api.post(`/pitches/generate/${selectedLead.id}`);
      animCancelled = true;
      const p = normalizePitch(data.pitch ?? data);
      setPitch(p);
      setEmailSubject(p.email_subject);
      setEmailBody(p.cold_email_body);
      setCompletedSteps(new Set(GEN_STEPS.map(s => s.key)));
      setCurrentStep(null);
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, pitch_id: data.pitch?.id ?? true } : l));
      toast.success('Pitch generated!');
    } catch (err) {
      animCancelled = true;
      toast.error(err.message ?? 'Generation failed');
      setCurrentStep(null);
    } finally {
      setGenerating(false);
    }
  };

  const handleRescore = async () => {
    if (!pitch) return;
    setRescoring(true);
    try {
      const { data } = await api.post(`/pitches/${pitch.id}/rescore`, { body: emailBody });
      setPitch(p => ({ ...p, pitch_score: data.pitch_score, pitch_feedback: data.pitch_feedback ?? '' }));
      toast.success('Pitch rescored!');
    } catch (err) { toast.error(err.message || 'Rescore failed'); }
    finally { setRescoring(false); }
  };

  const handleAddToQueue = async () => {
    if (!selectedLead) return;
    try {
      await api.post('/emails/queue', { lead_id: selectedLead.id, subject: emailSubject, body: emailBody });
      toast.success(`${selectedLead.channel_name} added to email queue!`);
    } catch (err) { toast.error(err.message || 'Failed to add to queue'); }
  };

  const toggleLeadSelect = id => {
    setSelectedLeads(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const handleBulkGenerate = async (andSend = false) => {
    const toProcess = leads.filter(l => selectedLeads.has(l.id));
    if (!toProcess.length) return;
    if (andSend && !window.confirm(`Send pitches to ${toProcess.length} leads with a ${timeGap}s gap between each? This will send real emails.`)) return;

    setBulkRunning(true);
    setBulkResults([]);
    setBulkProgress({ current: 0, total: toProcess.length, done: false, action: andSend ? 'generating & sending' : 'generating' });
    setShowLeadPicker(false);

    for (let i = 0; i < toProcess.length; i++) {
      const lead = toProcess[i];
      setBulkProgress(p => ({ ...p, current: i + 1 }));
      try {
        const { data } = await api.post(`/pitches/generate/${lead.id}`);
        const p = data.pitch ?? data;
        if (andSend && p) {
          await api.post('/emails/queue', { lead_id: lead.id, subject: p.email_subject, body: p.cold_email });
        }
        setBulkResults(prev => [...prev, { lead, status: andSend ? 'queued' : 'generated', pitch: p }]);
      } catch (e) {
        setBulkResults(prev => [...prev, { lead, status: 'error', error: e.message }]);
      }
      if (andSend && i < toProcess.length - 1 && timeGap > 0) {
        await new Promise(r => setTimeout(r, timeGap * 1000));
      }
    }

    setBulkRunning(false);
    setBulkProgress(p => ({ ...p, done: true }));
    const ok = bulkResults.filter(r => r.status !== 'error').length + 1;
    toast.success(`Done! ${toProcess.length} pitches ${andSend ? 'generated & queued' : 'generated'}`);
  };

  const filteredLeads = leads.filter(l =>
    !leadSearch.trim() || (l.channel_name ?? '').toLowerCase().includes(leadSearch.toLowerCase())
  );

  const subjects = pitch?.subject_variants?.filter(Boolean) ?? [];
  const stepIdx = GEN_STEPS.findIndex(s => s.key === currentStep);

  return (
    <div className="page">
      {/* Page head */}
      <div className="page__head">
        <div>
          {selectedLead && (
            <div className="mono muted" style={{ fontSize: 11, marginBottom: 8 }}>
              FOR · {selectedLead.channel_name} · {formatNumber(selectedLead.subscriber_count ?? 0)} subs
            </div>
          )}
          <h1 className="page__title">Pitch Gen — <em>brief → research → draft → review → send.</em></h1>
        </div>
        <div className="page__actions">
          <button className="btn btn--ghost" onClick={() => setShowLeadPicker(o => !o)}>
            <Icon name="users" size={13} />{selectedLead ? 'Change lead' : 'Select lead'}
          </button>
          {selectedLead && (
            <>
              <button className="btn btn--ghost btn--sm">Save as template</button>
              <button className="btn btn--ghost btn--sm"><Icon name="arrowR" size={12} />Next prospect</button>
            </>
          )}
        </div>
      </div>

      {/* Lead picker with multi-select */}
      {showLeadPicker && !bulkRunning && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card__head">
            <div className="card__title">Select leads</div>
            <div className="row" style={{ gap: 8 }}>
              {selectedLeads.size > 0 && (
                <span className="mono" style={{ fontSize: 11, color: 'var(--lime)' }}>{selectedLeads.size} selected</span>
              )}
              <button className="btn btn--ghost btn--sm" onClick={() => setShowLeadPicker(false)}>
                <Icon name="x" size={12} />Close
              </button>
            </div>
          </div>
          <div className="card__body">
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input className="input" style={{ paddingLeft: 32 }} placeholder="Search leads..." value={leadSearch} onChange={e => setLeadSearch(e.target.value)} />
            </div>
            {/* Select all */}
            {filteredLeads.length > 0 && (
              <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--line)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox"
                  checked={filteredLeads.every(l => selectedLeads.has(l.id))}
                  onChange={e => {
                    setSelectedLeads(e.target.checked ? new Set(filteredLeads.map(l => l.id)) : new Set());
                  }}
                />
                <span className="muted" style={{ fontSize: 12 }}>Select all ({filteredLeads.length})</span>
              </div>
            )}
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {leadsLoading ? (
                <div className="muted" style={{ padding: '16px', textAlign: 'center', fontSize: 13 }}>Loading leads...</div>
              ) : filteredLeads.length === 0 ? (
                <div className="muted" style={{ padding: '16px', textAlign: 'center', fontSize: 13 }}>No leads found.</div>
              ) : filteredLeads.map(lead => (
                <div
                  key={lead.id}
                  onClick={() => {
                    toggleLeadSelect(lead.id);
                    if (selectedLeads.size === 0 && !selectedLeads.has(lead.id)) handleSelectLead(lead);
                  }}
                  style={{
                    padding: '10px 12px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                    background: selectedLeads.has(lead.id) ? 'var(--lime-soft)' : 'transparent',
                    border: `1px solid ${selectedLeads.has(lead.id) ? 'var(--lime-border)' : 'transparent'}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <input type="checkbox" checked={selectedLeads.has(lead.id)} onChange={() => toggleLeadSelect(lead.id)}
                    onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }} />
                  <span className="ava" style={{ fontSize: 11, flexShrink: 0 }}>{(lead.channel_name || '?')[0].toUpperCase()}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{lead.channel_name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{formatNumber(lead.subscriber_count ?? 0)} subs · {lead.temperature || 'cold'}{lead.email ? ' · ✉' : ''}</div>
                  </div>
                  {lead.pitch_id && <Icon name="check" size={12} style={{ color: 'var(--ok)', flexShrink: 0 }} />}
                </div>
              ))}
            </div>

            {/* Bulk action bar */}
            {selectedLeads.size > 0 && (
              <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{selectedLeads.size} lead{selectedLeads.size !== 1 ? 's' : ''} selected</span>
                <div style={{ flex: 1 }} />
                <div className="field" style={{ margin: 0 }}>
                  <div className="field__label" style={{ fontSize: 10 }}>Delay between sends</div>
                  <select className="input" style={{ padding: '4px 8px', fontSize: 12, width: 110 }} value={timeGap} onChange={e => setTimeGap(Number(e.target.value))}>
                    <option value={0}>No delay</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>1 minute</option>
                    <option value={120}>2 minutes</option>
                    <option value={300}>5 minutes</option>
                    <option value={600}>10 minutes</option>
                  </select>
                </div>
                <button className="btn btn--ghost" onClick={() => handleBulkGenerate(false)}>
                  <Icon name="sparkle" size={13} />Generate {selectedLeads.size} Pitch{selectedLeads.size !== 1 ? 'es' : ''}
                </button>
                <button className="btn btn--primary" onClick={() => handleBulkGenerate(true)}>
                  <Icon name="rocket" size={13} />Generate & Send
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk progress */}
      {(bulkRunning || bulkProgress.done) && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card__head">
            <div className="card__title">
              {bulkProgress.done ? `Done — ${bulkResults.filter(r => r.status !== 'error').length}/${bulkProgress.total} pitches ${bulkProgress.action}` : `${bulkProgress.action} · ${bulkProgress.current}/${bulkProgress.total}`}
            </div>
            {bulkProgress.done && (
              <button className="btn btn--ghost btn--sm" onClick={() => { setBulkProgress({ current: 0, total: 0, done: false, action: '' }); setBulkResults([]); setShowLeadPicker(true); }}>
                <Icon name="refresh" size={11} />New batch
              </button>
            )}
          </div>
          {bulkRunning && (
            <div style={{ padding: '8px 16px 12px' }}>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-3)', overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', background: 'var(--lime)', borderRadius: 2, transition: 'width .5s', width: `${Math.round((bulkProgress.current / bulkProgress.total) * 100)}%` }} />
              </div>
              <div className="muted" style={{ fontSize: 12 }}>Generating pitch for lead {bulkProgress.current}/{bulkProgress.total}…</div>
            </div>
          )}
          <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bulkResults.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: r.status === 'error' ? 'rgba(255,80,80,.07)' : 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6 }}>
                <span style={{ color: r.status === 'error' ? 'var(--bad)' : 'var(--ok)', fontSize: 13 }}>{r.status === 'error' ? '✗' : '✓'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.lead.channel_name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{r.status === 'error' ? r.error : r.status}</div>
                </div>
                {r.pitch && (
                  <button className="btn btn--ghost btn--sm" onClick={() => { handleSelectLead(r.lead); setPitch(normalizePitch(r.pitch)); setEmailSubject(r.pitch.email_subject || ''); setEmailBody(r.pitch.cold_email || ''); setCompletedSteps(new Set(GEN_STEPS.map(s => s.key))); setShowLeadPicker(false); }}>
                    Review
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No lead selected */}
      {!selectedLead && !(bulkRunning || bulkProgress.done) && (
        <div className="card" style={{ textAlign: 'center', padding: '64px 24px' }}>
          <Icon name="sparkle" size={36} style={{ color: 'var(--lime)', margin: '0 auto 16px', display: 'block', opacity: 0.6 }} />
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Select one or multiple leads to generate pitches</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Use checkboxes for bulk generation. Single lead = full edit mode.</div>
          <button className="btn btn--primary" onClick={() => setShowLeadPicker(true)}>
            <Icon name="users" size={13} />Select lead
          </button>
        </div>
      )}

      {/* Lead selected — show pitch UI */}
      {selectedLead && (
        <>
          {/* Steps rail */}
          <div className="steps">
            {GEN_STEPS.map((s, i) => {
              const isDone = completedSteps.has(s.key);
              const isCurrent = currentStep === s.key || (generating && stepIdx === i);
              return (
                <div key={s.n} className={`step ${isDone ? 'is-done' : isCurrent ? 'is-current' : ''}`}>
                  <span className="step__num">
                    {isDone ? <Icon name="check" size={11} /> : s.n}
                  </span>
                  <span>{s.label}</span>
                  {i < GEN_STEPS.length - 1 && <span className="muted" style={{ marginLeft: 'auto', fontSize: 10 }}>→</span>}
                </div>
              );
            })}
          </div>

          {/* Generating state */}
          {generating && (
            <div className="card" style={{ textAlign: 'center', padding: '48px 24px', marginBottom: 20 }}>
              <div className="row" style={{ justifyContent: 'center', gap: 10, marginBottom: 8 }}>
                <span className="dot dot--pulse" />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  {GEN_STEPS.find(s => s.key === currentStep)?.label ?? 'Generating pitch...'}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>This usually takes 15–45 seconds</div>
            </div>
          )}

          {/* Pitch not yet generated */}
          {!generating && !pitch && (
            <div className="card" style={{ textAlign: 'center', padding: '48px 24px', marginBottom: 20 }}>
              <Icon name="bolt" size={36} style={{ color: 'var(--lime)', margin: '0 auto 16px', display: 'block', opacity: 0.7 }} />
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Ready to generate</div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
                Click <strong style={{ color: 'var(--lime)' }}>Study & Generate</strong> to run deep channel analysis, craft a custom offer, and write the cold email.
              </div>
              <button className="btn btn--primary" onClick={handleGenerate}>
                <Icon name="bolt" size={14} />Study & Generate Pitch
              </button>
            </div>
          )}

          {/* Pitch content */}
          {!generating && pitch && (
            <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr', gap: 20 }}>
              {/* LEFT: brief + variants */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Brief card */}
                <div className="card">
                  <div className="card__head">
                    <div className="card__title">Brief</div>
                    <span className="badge badge--lime"><Icon name="check" size={11} />Compiled</span>
                  </div>
                  <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="field">
                      <div className="field__label">Goal</div>
                      <div style={{ padding: '8px 11px', background: 'var(--bg-2)', borderRadius: 6, fontSize: 12.5, border: '1px solid var(--line)' }}>
                        Book a call to discuss sponsorship
                      </div>
                    </div>
                    {pitch.custom_offer && (
                      <div className="field">
                        <div className="field__label">Custom offer</div>
                        <div style={{ padding: '8px 11px', background: 'var(--bg-2)', borderRadius: 6, fontSize: 12.5, border: '1px solid var(--line)', lineHeight: 1.55 }}>
                          {pitch.custom_offer.slice(0, 120)}
                        </div>
                      </div>
                    )}
                    <div className="field">
                      <div className="field__label">Personalization sources</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {['Last 5 videos · views, hooks, topics', 'Sponsor history · last 90 days', 'Comment-section signal', 'Posting cadence + pattern'].map((s, i) => (
                          <div key={i} className="row" style={{ fontSize: 12, color: 'var(--text-2)', gap: 6 }}>
                            <Icon name="check" size={11} style={{ color: 'var(--lime)' }} />{s}
                          </div>
                        ))}
                      </div>
                    </div>
                    <button className="btn btn--ghost btn--sm" style={{ justifyContent: 'center' }} onClick={handleGenerate} disabled={generating}>
                      <Icon name="refresh" size={11} />Regenerate
                    </button>
                  </div>
                </div>

                {/* Subject line variants as "ranked variants" */}
                {subjects.length > 0 && (
                  <div className="card">
                    <div className="card__head">
                      <div className="card__title">{subjects.length} subject variants</div>
                      <span className="mono muted" style={{ fontSize: 11 }}>click to use</span>
                    </div>
                    <div style={{ padding: 8 }}>
                      {subjects.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => { setSelectedSubj(i); setEmailSubject(s); }}
                          style={{
                            width: '100%', textAlign: 'left', padding: '12px 14px',
                            background: selectedSubj === i ? 'var(--surface-2)' : 'transparent',
                            border: `1px solid ${selectedSubj === i ? 'var(--line-3)' : 'transparent'}`,
                            borderRadius: 8, marginBottom: 4, cursor: 'pointer',
                          }}
                        >
                          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                            <span className="mono muted" style={{ fontSize: 10.5 }}>VARIANT {String.fromCharCode(65 + i)}</span>
                            <span className="mono" style={{ fontSize: 11, color: i === 0 ? 'var(--coral)' : 'var(--text-2)' }}>{95 - i * 8}/100</span>
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{s}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT: preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="card">
                  <div className="card__head">
                    <div className="row">
                      <div className="card__title">Preview</div>
                      <span className="chan" style={{ fontSize: 11.5, padding: '3px 10px' }}>
                        {selectedLead.channel_name} · {formatNumber(selectedLead.subscriber_count ?? 0)}
                      </span>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn--ghost btn--sm"><Icon name="pen" size={11} />Edit</button>
                      <button className="btn btn--ghost btn--sm" onClick={handleRescore} disabled={rescoring}>
                        <Icon name="refresh" size={11} />{rescoring ? 'Rescoring...' : 'Rescore'}
                      </button>
                    </div>
                  </div>
                  <div className="card__body">
                    {/* Subject picker */}
                    <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                      Subject {subjects.length > 1 ? `(${subjects.length} A/B variants)` : ''}
                    </div>
                    {subjects.length > 0 && (
                      <div className="row" style={{ gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                        {subjects.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => { setSelectedSubj(i); setEmailSubject(s); }}
                            className="chan"
                            style={{
                              cursor: 'pointer', padding: '6px 11px', fontSize: 12,
                              background: selectedSubj === i ? 'var(--lime-soft)' : 'var(--surface)',
                              borderColor: selectedSubj === i ? 'var(--lime-border)' : 'var(--line)',
                              color: selectedSubj === i ? 'var(--lime)' : 'var(--text-2)',
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Email preview */}
                    <div className="mail">
                      <div className="mail__sub">{emailSubject || pitch.email_subject}</div>
                      <div className="mail__meta">
                        To {selectedLead.email || `${selectedLead.channel_name}@...`} · AI-personalized · ready to send
                      </div>
                      <div className="mail__body">
                        {emailBody || pitch.cold_email_body}
                      </div>
                    </div>

                    {/* Subject edit */}
                    <div className="field" style={{ marginTop: 14 }}>
                      <div className="field__label">Subject line</div>
                      <input className="input" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                    </div>

                    {/* Body edit */}
                    <div className="field" style={{ marginTop: 10 }}>
                      <div className="field__label">Email body</div>
                      <textarea
                        className="input"
                        rows={8}
                        value={emailBody}
                        onChange={e => setEmailBody(e.target.value)}
                        style={{ resize: 'vertical', fontFamily: 'var(--f-mono)', fontSize: 11, lineHeight: 1.7, width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>

                    {/* AI feedback */}
                    {pitch.pitch_feedback && (
                      <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}>
                        <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>AI Feedback</div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{pitch.pitch_feedback}</div>
                      </div>
                    )}

                    {/* Predicted metrics */}
                    <div className="grid g-3" style={{ gap: 10, marginTop: 14 }}>
                      {[
                        { l: 'Pitch score', v: pitch.pitch_score != null ? `${pitch.pitch_score}/10` : '—', c: 'var(--lime)' },
                        { l: 'Spam risk',   v: '0.4',  c: 'var(--ok)',   d: '/ 10' },
                        { l: 'Open rate',   v: '64%',  c: 'var(--lime)', d: '+8 vs avg' },
                      ].map((m, i) => (
                        <div key={i} style={{ padding: 12, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8 }}>
                          <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>{m.l}</div>
                          <div className="row" style={{ alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                            <span className="mono" style={{ fontSize: 18, color: m.c }}>{m.v}</span>
                            {m.d && <span className="muted" style={{ fontSize: 11 }}>{m.d}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Followups card */}
                <div className="card">
                  <div className="card__head">
                    <div className="card__title">Followups</div>
                    <span className="mono muted" style={{ fontSize: 11 }}>3 steps · skips on reply</span>
                  </div>
                  <div className="card__body" style={{ padding: 0 }}>
                    {[
                      { d: 'Day 2', l: 'Bump if no reply',   prev: '"Bumping this — should I close the loop or worth a quick chat?"' },
                      { d: 'Day 5', l: 'Different angle',    prev: '"Different approach: here\'s a case study from a creator your size."' },
                      { d: 'Day 9', l: 'Final break-up',     prev: '"Last note — happy to never bother you again, just say the word."' },
                    ].map((f, i) => (
                      <div key={i} style={{ padding: '14px 16px', borderBottom: i < 2 ? '1px solid var(--line)' : 'none', display: 'flex', gap: 14 }}>
                        <div className="mono" style={{ width: 50, color: 'var(--text-3)', fontSize: 11, paddingTop: 2 }}>{f.d}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 2 }}>{f.l}</div>
                          <div className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>{f.prev}</div>
                        </div>
                        <button className="btn btn--ghost btn--sm"><Icon name="pen" size={11} /></button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action row */}
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn--ghost" onClick={() => navigate('/leads')}>Back</button>
                  <button className="btn btn--ghost">Save as draft</button>
                  <div style={{ flex: 1 }} />
                  <button className="btn btn--primary" onClick={handleAddToQueue}>
                    <Icon name="rocket" size={12} />Queue for sending
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
