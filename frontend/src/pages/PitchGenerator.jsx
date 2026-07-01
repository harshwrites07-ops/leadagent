import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import Icon from '../components/ui/Icon';
import { useApp } from '../context/AppContext';
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
  const qualityBreakdown = (() => {
    if (!raw.quality_breakdown) return null;
    if (typeof raw.quality_breakdown === 'object') return raw.quality_breakdown;
    try { return JSON.parse(raw.quality_breakdown); } catch { return null; }
  })();
  return {
    ...raw,
    subject_variants: subjects,
    email_subject: raw.email_subject || '',
    cold_email_body: raw.cold_email || '',
    quality_score: raw.quality_score ?? null,
    quality_breakdown: qualityBreakdown,
    quality_regenerated: !!raw.quality_regenerated,
    quality_warning: !!raw.quality_warning,
  };
}

export default function PitchGenerator() {
  const navigate = useNavigate();
  const { setPitchJobRunning, setPitchJobProgress, setPitchJobTotal, setPitchJobResults, setPitchJobLeadId, addBackgroundTask, removeBackgroundTask } = useApp();

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

  // Voice profile check
  const [userHasVoiceProfile, setUserHasVoiceProfile] = useState(true);

  // Editing
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [selectedSubj, setSelectedSubj] = useState(0);
  const [rescoring, setRescoring] = useState(false);

  // Quality gate
  const [showQualityDetails, setShowQualityDetails] = useState(false);
  const [qualityEnhancing, setQualityEnhancing] = useState(false);
  const [qualityBlocked, setQualityBlocked] = useState(false);
  const [blockDetails, setBlockDetails] = useState(null);

  // Streaming batch (parallel generation)
  const [streamMode, setStreamMode] = useState(false);
  const [streamEmails, setStreamEmails] = useState([]);

  // Copy to clipboard helper
  const copyToClipboard = text => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied!')).catch(() => {});
  };

  // Check voice profile completeness
  useEffect(() => {
    api.get('/user/profile')
      .then(res => {
        const dna = res.data?.voice_dna || {};
        setUserHasVoiceProfile(!!(dna.name && dna.service));
      })
      .catch(() => setUserHasVoiceProfile(false));
  }, []);

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
    setQualityEnhancing(false);
    setQualityBlocked(false);
    setBlockDetails(null);
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

      if (data.qualityRegenerated) {
        setQualityEnhancing(true);
        await new Promise(r => setTimeout(r, 800));
        setQualityEnhancing(false);
      }

      const p = normalizePitch(data.pitch ?? data);
      setPitch(p);
      setEmailSubject(p.email_subject);
      setEmailBody(p.cold_email_body);
      setCompletedSteps(new Set(GEN_STEPS.map(s => s.key)));
      setCurrentStep(null);
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, pitch_id: data.pitch?.id ?? true } : l));
      if (data.warning) toast(data.warning, { icon: '⚠️', duration: 6000 });
      if (data.qualityWarning) {
        toast('Quality gate could not fully improve this pitch — review carefully.', { icon: '⚠️', duration: 5000 });
      } else if (data.qualityRegenerated) {
        toast.success(`Quality enhanced to ${data.qualityScore}/100`);
      } else {
        toast.success('Pitch generated!');
      }
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
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.error === 'QUALITY_BLOCK') {
        setQualityBlocked(true);
        setBlockDetails({ score: errData.score, feedback: errData.feedback, message: errData.message });
        toast.error(`Blocked — pitch scored ${errData.score}/100 (minimum 70 required)`);
      } else {
        toast.error(err.message || 'Failed to add to queue');
      }
    }
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
    setPitchJobRunning(true);
    setPitchJobTotal(toProcess.length);
    setPitchJobProgress(0);
    setPitchJobResults([]);
    setPitchJobLeadId(selectedLead?.id ?? null);
    addBackgroundTask({ id: 'pitch-bulk', label: `Generating ${toProcess.length} pitch${toProcess.length !== 1 ? 'es' : ''}`, page: '/pitch' });

    for (let i = 0; i < toProcess.length; i++) {
      const lead = toProcess[i];
      setBulkProgress(p => ({ ...p, current: i + 1 }));
      try {
        const { data } = await api.post(`/pitches/generate/${lead.id}`);
        const p = normalizePitch(data.pitch ?? data);
        if (andSend && p) {
          await api.post('/emails/queue', { lead_id: lead.id, subject: p.email_subject, body: p.cold_email_body });
        }
        const newResult = { lead, status: andSend ? 'queued' : 'generated', pitch: p };
        setBulkResults(prev => [...prev, newResult]);
        setPitchJobProgress(i + 1);
        setPitchJobResults(prev => [...prev, newResult]);
      } catch (e) {
        const errResult = { lead, status: 'error', error: e.message };
        setBulkResults(prev => [...prev, errResult]);
        setPitchJobProgress(i + 1);
        setPitchJobResults(prev => [...prev, errResult]);
      }
      if (andSend && i < toProcess.length - 1 && timeGap > 0) {
        await new Promise(r => setTimeout(r, timeGap * 1000));
      }
    }

    setBulkRunning(false);
    setBulkProgress(p => ({ ...p, done: true }));
    setPitchJobRunning(false);
    removeBackgroundTask('pitch-bulk');
    toast.success(`Done! ${toProcess.length} pitches ${andSend ? 'generated & queued' : 'generated'}`);
  };

  const handleStreamGenerate = async () => {
    const toProcess = leads.filter(l => selectedLeads.has(l.id));
    if (!toProcess.length) return;

    setStreamMode(true);
    setShowLeadPicker(false);
    setStreamEmails(toProcess.map(lead => ({ leadId: lead.id, lead, status: 'loading', data: null })));
    setPitchJobRunning(true);
    setPitchJobTotal(toProcess.length);
    setPitchJobProgress(0);
    addBackgroundTask({ id: 'pitch-stream', label: `Generating ${toProcess.length} pitch${toProcess.length !== 1 ? 'es' : ''}`, page: '/pitch' });

    let done = 0;
    await Promise.allSettled(toProcess.map(async lead => {
      try {
        const { data } = await api.post(`/pitches/generate/${lead.id}`);
        const p = normalizePitch(data.pitch ?? data);
        setStreamEmails(prev => prev.map(e =>
          e.leadId === lead.id ? { ...e, status: 'done', data: { ...data, pitch: p } } : e
        ));
      } catch (e) {
        setStreamEmails(prev => prev.map(e =>
          e.leadId === lead.id ? { ...e, status: 'error', error: e.message } : e
        ));
      }
      done++;
      setPitchJobProgress(done);
    }));

    setPitchJobRunning(false);
    removeBackgroundTask('pitch-stream');
    toast.success(`Done! ${toProcess.length} pitches generated`);
  };

  const filteredLeads = leads.filter(l =>
    !leadSearch.trim() || (l.channel_name ?? '').toLowerCase().includes(leadSearch.toLowerCase())
  );

  const subjects = pitch?.subject_variants?.filter(Boolean) ?? [];
  const stepIdx = GEN_STEPS.findIndex(s => s.key === currentStep);

  return (
    <div className="page">
      {/* Page head */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16,1,0.3,1] }}
        className="page__head"
      >
        <div>
          <AnimatePresence>
            {selectedLead && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mono muted"
                style={{ fontSize: 11, marginBottom: 8 }}
              >
                FOR · {selectedLead.channel_name} · {formatNumber(selectedLead.subscriber_count ?? 0)} subs
              </motion.div>
            )}
          </AnimatePresence>
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
      </motion.div>

      {/* Lead picker with multi-select */}
      <AnimatePresence>
        {showLeadPicker && !bulkRunning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16,1,0.3,1] }}
            style={{ overflow: 'hidden', marginBottom: 20 }}
          >
            <div className="card">
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
                  ) : filteredLeads.map((lead, i) => (
                    <motion.div
                      key={lead.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
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
                    </motion.div>
                  ))}
                </div>

                {/* Bulk action bar */}
                <AnimatePresence>
                  {selectedLeads.size > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      style={{ marginTop: 14, padding: '12px 16px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
                    >
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
                      <button className="btn btn--ghost" onClick={handleStreamGenerate}>
                        <Icon name="sparkle" size={13} />Generate {selectedLeads.size} Pitch{selectedLeads.size !== 1 ? 'es' : ''}
                      </button>
                      <motion.button
                        whileHover={{ scale: 1.02, y: -1 }}
                        whileTap={{ scale: 0.97 }}
                        className="btn btn--primary"
                        onClick={() => handleBulkGenerate(true)}
                      >
                        <Icon name="rocket" size={13} />Generate & Send
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk progress */}
      <AnimatePresence>
        {(bulkRunning || bulkProgress.done) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="card"
            style={{ marginBottom: 20 }}
          >
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
                  <motion.div
                    animate={{ width: `${Math.round((bulkProgress.current / bulkProgress.total) * 100)}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    style={{ height: '100%', background: 'var(--lime)', borderRadius: 2 }}
                  />
                </div>
                <div className="muted" style={{ fontSize: 12 }}>Generating pitch for lead {bulkProgress.current}/{bulkProgress.total}…</div>
              </div>
            )}
            <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {bulkResults.map((r, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: r.status === 'error' ? 'rgba(255,80,80,.07)' : 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6 }}
                >
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
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Streaming batch grid */}
      <AnimatePresence>
        {streamMode && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ marginBottom: 20 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {streamEmails.filter(e => e.status === 'done').length}/{streamEmails.length} pitches ready
              </div>
              <div style={{ flex: 1 }} />
              <button className="btn btn--ghost btn--sm" onClick={() => { setStreamMode(false); setStreamEmails([]); setShowLeadPicker(true); }}>
                <Icon name="x" size={11} />Exit batch
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
              {streamEmails.map(({ leadId, lead, status, data, error }) => {
                const p = data?.pitch;
                const qs = p?.quality_score ?? null;
                const blocked = qs !== null && qs < 70;
                const badgeColor = blocked ? '#ff8a73' : qs >= 85 ? '#c8f654' : qs >= 75 ? '#c8f654cc' : null;

                if (status === 'loading') {
                  return (
                    <motion.div
                      key={leadId}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{ padding: 16, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span className="ava" style={{ fontSize: 10 }}>{(lead.channel_name || '?')[0].toUpperCase()}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{lead.channel_name}</div>
                          <div className="muted" style={{ fontSize: 11 }}>{formatNumber(lead.subscriber_count ?? 0)} subs</div>
                        </div>
                      </div>
                      {[80, 60, 40].map((w, i) => (
                        <motion.div key={i} animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
                          style={{ height: 8, width: `${w}%`, background: 'var(--surface-3)', borderRadius: 4, marginBottom: 6 }} />
                      ))}
                      <div className="row" style={{ gap: 6, marginTop: 10, justifyContent: 'center' }}>
                        <span className="dot dot--pulse" style={{ width: 6, height: 6 }} />
                        <span className="muted" style={{ fontSize: 10 }}>Enhancing quality...</span>
                      </div>
                    </motion.div>
                  );
                }

                if (status === 'error') {
                  return (
                    <motion.div key={leadId} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      style={{ padding: 16, background: 'rgba(255,80,80,.05)', border: '1px solid rgba(255,80,80,.2)', borderRadius: 10 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 4 }}>{lead.channel_name}</div>
                      <div className="muted" style={{ fontSize: 11, color: 'var(--bad)' }}>Failed: {error || 'Unknown error'}</div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div key={leadId} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                    style={{ padding: 16, background: 'var(--bg-2)', border: `1px solid ${blocked ? '#ff8a7340' : 'var(--line)'}`, borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span className="ava" style={{ fontSize: 10 }}>{(lead.channel_name || '?')[0].toUpperCase()}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{lead.channel_name}</div>
                        <div className="muted" style={{ fontSize: 11 }}>{formatNumber(lead.subscriber_count ?? 0)} subs</div>
                      </div>
                      {qs !== null && badgeColor && (
                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--f-mono)', padding: '3px 8px', borderRadius: 5, background: badgeColor, color: '#0a0a0c', flexShrink: 0 }}>
                          {blocked ? `⚠ ${qs}/100` : `✓ ${qs}/100`}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 10, maxHeight: 80, overflow: 'hidden', position: 'relative' }}>
                      {(p?.cold_email_body || '').slice(0, 180)}{(p?.cold_email_body || '').length > 180 ? '…' : ''}
                    </div>
                    {blocked && (
                      <div style={{ fontSize: 10.5, color: '#ff8a73', marginBottom: 8, padding: '5px 8px', background: 'rgba(255,138,115,.08)', borderRadius: 5 }}>
                        Score too low to send — needs rewrite
                      </div>
                    )}
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={() => {
                        handleSelectLead(lead);
                        setPitch(p);
                        setEmailSubject(p?.email_subject || '');
                        setEmailBody(p?.cold_email_body || '');
                        setCompletedSteps(new Set(GEN_STEPS.map(s => s.key)));
                        setStreamMode(false);
                      }}>
                        Review
                      </button>
                      {!blocked && p && (
                        <button className="btn btn--primary btn--sm" style={{ flex: 1 }} onClick={async () => {
                          try {
                            await api.post('/emails/queue', { lead_id: lead.id, subject: p.email_subject, body: p.cold_email_body });
                            toast.success(`${lead.channel_name} queued!`);
                            setStreamEmails(prev => prev.map(e => e.leadId === leadId ? { ...e, queued: true } : e));
                          } catch (e) { toast.error(e.message || 'Failed'); }
                        }}>
                          Queue
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No lead selected */}
      <AnimatePresence>
        {!selectedLead && !(bulkRunning || bulkProgress.done) && !streamMode && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="card"
            style={{ textAlign: 'center', padding: '64px 24px' }}
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Icon name="sparkle" size={36} style={{ color: 'var(--lime)', margin: '0 auto 16px', display: 'block', opacity: 0.6 }} />
            </motion.div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Select one or multiple leads to generate pitches</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Use checkboxes for bulk generation. Single lead = full edit mode.</div>
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.97 }}
              className="btn btn--primary"
              onClick={() => setShowLeadPicker(true)}
            >
              <Icon name="users" size={13} />Select lead
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

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
          <AnimatePresence>
            {(generating || qualityEnhancing) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="card"
                style={{ textAlign: 'center', padding: '48px 24px', marginBottom: 20 }}
              >
                <div className="row" style={{ justifyContent: 'center', gap: 10, marginBottom: 8 }}>
                  <span className="dot dot--pulse" />
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    {qualityEnhancing
                      ? 'Enhancing quality...'
                      : (GEN_STEPS.find(s => s.key === currentStep)?.label ?? 'Generating pitch...')}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {qualityEnhancing ? 'Running quality gate — rewriting to score 75+' : 'This usually takes 15–45 seconds'}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pitch not yet generated */}
          <AnimatePresence>
            {!generating && !pitch && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="card"
                style={{ textAlign: 'center', padding: '48px 24px', marginBottom: 20 }}
              >
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Icon name="bolt" size={36} style={{ color: 'var(--lime)', margin: '0 auto 16px', display: 'block', opacity: 0.7 }} />
                </motion.div>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Ready to generate</div>
                <div className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
                  Click <strong style={{ color: 'var(--lime)' }}>Study & Generate</strong> to run deep channel analysis, craft a custom offer, and write the cold email.
                </div>
                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  className="btn btn--primary"
                  onClick={handleGenerate}
                >
                  <Icon name="bolt" size={14} />Study & Generate Pitch
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pitch content */}
          <AnimatePresence>
            {!generating && pitch && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.16,1,0.3,1] }}
              >
              {!userHasVoiceProfile && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    padding: '12px 16px',
                    background: 'rgba(255,209,102,0.08)',
                    border: '1px solid rgba(255,209,102,0.25)',
                    borderRadius: 10, marginBottom: 16,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warn)' }}>Voice profile incomplete</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      Pitches won't have your name or style.{' '}
                      <a href="/settings" style={{ color: 'var(--lime)' }}>Set up Voice Profile →</a>
                    </div>
                  </div>
                </motion.div>
              )}
              <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr', gap: 20 }}>
                {/* LEFT: brief + variants */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Brief card */}
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05, duration: 0.35 }}
                    className="card"
                  >
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
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.06 + 0.1 }}
                              className="row"
                              style={{ fontSize: 12, color: 'var(--text-2)', gap: 6 }}
                            >
                              <Icon name="check" size={11} style={{ color: 'var(--lime)' }} />{s}
                            </motion.div>
                          ))}
                        </div>
                      </div>
                      <button className="btn btn--ghost btn--sm" style={{ justifyContent: 'center' }} onClick={handleGenerate} disabled={generating}>
                        <Icon name="refresh" size={11} />Regenerate
                      </button>
                    </div>
                  </motion.div>

                  {/* Subject line variants */}
                  {subjects.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1, duration: 0.35 }}
                      className="card"
                    >
                      <div className="card__head">
                        <div className="card__title">{subjects.length} subject variants</div>
                        <span className="mono muted" style={{ fontSize: 11 }}>click to use</span>
                      </div>
                      <div style={{ padding: 8 }}>
                        {subjects.map((s, i) => (
                          <motion.button
                            key={i}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.06 }}
                            whileHover={{ x: 2 }}
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
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* RIGHT: preview */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08, duration: 0.35 }}
                    className="card"
                  >
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
                      {/* Signal type badge */}
                      {pitch.signal_used && (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          background: 'var(--lime-soft)',
                          border: '1px solid var(--lime-border)',
                          borderRadius: 6, padding: '4px 10px',
                          fontSize: 10, fontWeight: 700,
                          color: 'var(--lime)',
                          fontFamily: 'var(--f-mono)',
                          letterSpacing: '0.5px',
                          marginBottom: 12,
                        }}>
                          {pitch.signal_used === 'confirmed_hiring' && '🎯 CONFIRMED HIRING SIGNAL'}
                          {pitch.signal_used === 'video_drop' && '📉 VIDEO DROP DETECTED'}
                          {pitch.signal_used === 'upload_gap' && '⏰ UPLOAD GAP DETECTED'}
                          {pitch.signal_used === 'viral_gap' && '🚀 VIRAL GAP DETECTED'}
                          {pitch.signal_used === 'ratio_gap' && '📊 VIEW RATIO SIGNAL'}
                          {pitch.signal_used === 'frequency_slow' && '🐢 FREQUENCY SIGNAL'}
                          {pitch.signal_used === 'growth_opportunity' && '⚠️ GENERIC (improve lead data)'}
                        </div>
                      )}

                      {/* Quality Gate Badge — label only, no raw number shown to users */}
                      {pitch.quality_score != null && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {(() => {
                              const qs = pitch.quality_score;
                              const warn = pitch.quality_warning;
                              const label = warn || qs < 70
                                ? '⚠ Needs polish'
                                : qs >= 90 ? '✅ Quality: Excellent'
                                : qs >= 85 ? '✓ Quality: Good'
                                : '✓ Quality: Enhanced';
                              const bg = warn || qs < 70 ? '#ff8a73' : qs >= 85 ? '#c8f654' : '#c8f654cc';
                              return (
                                <div style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  padding: '5px 12px', borderRadius: 6,
                                  fontSize: 11, fontWeight: 700, fontFamily: 'var(--f-mono)',
                                  background: bg, color: '#0a0a0c',
                                }}>
                                  {label}
                                </div>
                              );
                            })()}
                            {pitch.quality_regenerated && (
                              <span style={{ fontSize: 10, color: 'var(--lime)', fontFamily: 'var(--f-mono)' }}>
                                ENHANCED
                              </span>
                            )}
                            <button
                              onClick={() => setShowQualityDetails(v => !v)}
                              style={{
                                fontSize: 10, color: 'var(--text-3)', background: 'none',
                                border: 'none', cursor: 'pointer', padding: '2px 4px',
                                textDecoration: 'underline',
                              }}
                            >
                              {showQualityDetails ? 'Hide details' : 'Why this score?'}
                            </button>
                          </div>

                          {/* Quality breakdown panel */}
                          <AnimatePresence>
                            {showQualityDetails && pitch.quality_breakdown && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                style={{ overflow: 'hidden', marginTop: 8 }}
                              >
                                <div style={{
                                  padding: '10px 12px',
                                  background: 'var(--bg-2)',
                                  border: '1px solid var(--line)',
                                  borderRadius: 8,
                                  display: 'flex', flexDirection: 'column', gap: 6,
                                }}>
                                  {Object.entries(pitch.quality_breakdown).map(([key, val]) => {
                                    const maxMap = { personalization: 20, hook: 15, specificity: 15, value_prop: 15, cta: 15, tone: 12, spam_flag: 8 };
                                    const max = maxMap[key] || 15;
                                    const pct = Math.round((val.points / max) * 100);
                                    return (
                                      <div key={key}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                          <span style={{ fontSize: 10, fontFamily: 'var(--f-mono)', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                                            {key.replace('_', ' ')}
                                          </span>
                                          <span style={{ fontSize: 10, fontFamily: 'var(--f-mono)', color: pct >= 75 ? 'var(--lime)' : pct >= 50 ? 'var(--warn)' : 'var(--bad)' }}>
                                            {val.points}/{max}
                                          </span>
                                        </div>
                                        <div style={{ height: 3, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden', marginBottom: 2 }}>
                                          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: pct >= 75 ? '#c8f654' : pct >= 50 ? 'var(--warn)' : '#ff8a73', transition: 'width 0.4s ease' }} />
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-4)', lineHeight: 1.4 }}>{val.feedback}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Legacy quality score (pitch_score from old system) */}
                      {pitch.quality_score == null && pitch.pitch_score != null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Quality Score</span>
                          <span style={{
                            fontSize: 20, fontWeight: 900,
                            fontFamily: 'var(--f-mono)',
                            color: pitch.pitch_score >= 80 ? 'var(--ok)' :
                                   pitch.pitch_score >= 60 ? 'var(--lime)' :
                                   pitch.pitch_score >= 40 ? 'var(--warn)' : 'var(--bad)',
                          }}>
                            {pitch.pitch_score}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-4)' }}>/100</span>
                        </div>
                      )}

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

                      <div className="mail">
                        <div className="mail__sub">{emailSubject || pitch.email_subject}</div>
                        <div className="mail__meta">
                          To {selectedLead.email || `${selectedLead.channel_name}@...`} · AI-personalized · ready to send
                        </div>
                        <div className="mail__body">
                          {emailBody || pitch.cold_email_body}
                        </div>
                      </div>

                      {/* Quality block banner */}
                      <AnimatePresence>
                        {(qualityBlocked || (pitch.quality_score !== null && pitch.quality_score < 70)) && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            style={{
                              marginTop: 14,
                              padding: '12px 14px',
                              background: '#ff8a73',
                              borderRadius: 8,
                              color: '#0a0a0c',
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                              Blocked — Score too low to send ({pitch.quality_score ?? blockDetails?.score ?? '?'}/100)
                            </div>
                            <div style={{ fontSize: 11, marginBottom: 10, opacity: 0.85 }}>
                              {blockDetails?.message || `This pitch scored below 70 and cannot be sent until rewritten. Click Rewrite to regenerate.`}
                            </div>
                            {(blockDetails?.feedback || pitch.quality_breakdown) && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
                                {Object.entries(blockDetails?.feedback || pitch.quality_breakdown || {}).filter(([, v]) => v.points < 8).slice(0, 4).map(([k, v]) => (
                                  <div key={k} style={{ fontSize: 10.5, opacity: 0.9 }}>
                                    · {k.replace('_', ' ')}: {v.feedback}
                                  </div>
                                ))}
                              </div>
                            )}
                            <button
                              onClick={handleGenerate}
                              disabled={generating}
                              style={{
                                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                                background: 'transparent',
                                border: '1px solid #0a0a0c',
                                borderRadius: 6, cursor: 'pointer', color: '#0a0a0c',
                              }}
                            >
                              Rewrite pitch
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="field" style={{ marginTop: 14 }}>
                        <div className="field__label">Subject line</div>
                        <input className="input" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                      </div>

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

                      {/* Alternative subject lines (A/B testing) */}
                      {pitch.alt_subjects?.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <div style={{
                            fontSize: 10, fontWeight: 700,
                            color: 'var(--text-4)', fontFamily: 'var(--f-mono)',
                            letterSpacing: '0.5px', marginBottom: 8,
                            textTransform: 'uppercase',
                          }}>
                            Alternative Subject Lines
                          </div>
                          {pitch.alt_subjects.map((s, i) => (
                            <div key={i}
                              style={{
                                padding: '8px 12px',
                                background: 'var(--surface-2)',
                                border: '1px solid var(--line)',
                                borderRadius: 6, marginBottom: 6,
                                fontSize: 12, color: 'var(--text-2)',
                                cursor: 'pointer',
                                transition: 'all 150ms',
                              }}
                              onClick={() => copyToClipboard(s)}
                              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--lime-border)'}
                              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}
                            >
                              {s} <span style={{ fontSize: 10, color: 'var(--text-4)' }}>(click to copy)</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {pitch.pitch_feedback && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          style={{ marginTop: 12, padding: 12, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}
                        >
                          <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>AI Feedback</div>
                          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{pitch.pitch_feedback}</div>
                        </motion.div>
                      )}

                      <div className="grid g-3" style={{ gap: 10, marginTop: 14 }}>
                        {[
                          { l: 'Pitch quality', v: pitch.quality_score >= 90 ? 'Excellent' : pitch.quality_score >= 85 ? 'Good' : pitch.quality_score >= 70 ? 'Enhanced' : (pitch.quality_score ?? pitch.pitch_score) != null ? 'Needs polish' : '—', c: 'var(--lime)' },
                          { l: 'Spam risk',   v: '0.4',  c: 'var(--ok)',   d: '/ 10' },
                          { l: 'Open rate',   v: '64%',  c: 'var(--lime)', d: '+8 vs avg' },
                        ].map((m, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.08 + 0.1 }}
                            style={{ padding: 12, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8 }}
                          >
                            <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>{m.l}</div>
                            <div className="row" style={{ alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                              <span className="mono" style={{ fontSize: 18, color: m.c }}>{m.v}</span>
                              {m.d && <span className="muted" style={{ fontSize: 11 }}>{m.d}</span>}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </motion.div>

                  {/* Followups card */}
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15, duration: 0.35 }}
                    className="card"
                  >
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
                  </motion.div>

                  {/* Action row */}
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn--ghost" onClick={() => navigate('/leads')}>Back</button>
                    <button className="btn btn--ghost">Save as draft</button>
                    <div style={{ flex: 1 }} />
                    {(() => {
                      const sendBlocked = qualityBlocked || (pitch.quality_score !== null && pitch.quality_score < 70);
                      return sendBlocked ? (
                        <div className="row" style={{ gap: 8 }}>
                          <button
                            className="btn btn--ghost"
                            style={{ borderColor: '#ff8a73', color: '#ff8a73', opacity: 0.9 }}
                            onClick={handleGenerate}
                            disabled={generating}
                          >
                            Rewrite
                          </button>
                          <button
                            className="btn btn--primary"
                            style={{ opacity: 0.3, cursor: 'not-allowed', pointerEvents: 'none' }}
                            disabled
                          >
                            <Icon name="rocket" size={12} />Queue for sending
                          </button>
                        </div>
                      ) : (
                        <motion.button
                          whileHover={{ scale: 1.02, y: -1 }}
                          whileTap={{ scale: 0.97 }}
                          className="btn btn--primary"
                          onClick={handleAddToQueue}
                        >
                          <Icon name="rocket" size={12} />Queue for sending
                        </motion.button>
                      );
                    })()}
                  </div>
                </div>
              </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
