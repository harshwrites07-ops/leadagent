import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import api, { formatNumber } from '../utils/api';

const GEN_STEPS = [
  { key: 'deep_study',       label: 'Brief',    n: 1, work: 'analyzing channel' },
  { key: 'custom_offer',     label: 'Research', n: 2, work: 'selecting angle' },
  { key: 'cold_email',       label: 'Variants', n: 3, work: 'writing' },
  { key: 'subject_variants', label: 'Sequence', n: 4, work: 'scoring variants' },
  { key: 'done',             label: 'Send',     n: 5, work: 'finalizing' },
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
    generation_method: raw.generation_method || 'marcus',
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

  // Pre-send checklist
  const [checklist, setChecklist] = useState(null);
  const [checklistLoading, setChecklistLoading] = useState(false);

  // Live quality gate progress (SSE)
  const [generatingStatus, setGeneratingStatus] = useState('');

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
    setChecklist(null);
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
        loadChecklist(lead.id);
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
    setGeneratingStatus('');

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
      // Use SSE endpoint so quality-gate progress events stream back in real time
      const response = await fetch(`/api/pitches/generate-stream/${selectedLead.id}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const text = await response.text();
        let msg = 'Generation failed';
        try { msg = JSON.parse(text).error || msg; } catch {}
        throw new Error(msg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let data = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (event.type === 'error') {
            const e = new Error(event.error || 'Generation failed');
            e.code = event.code || null;
            e.videoDataStatus = event.videoDataStatus || null;
            throw e;
          }
          if (event.type === 'status') setGeneratingStatus(event.message);
          if (event.type === 'progress') setGeneratingStatus(`Quality check ${event.attempt} of ${event.max} — score ${event.score}/100`);
          if (event.type === 'result') data = event;
        }
      }
      if (!data) throw new Error('Generation failed — no result received');

      animCancelled = true;
      setGeneratingStatus('');

      if (data.qualityRegenerated) {
        setQualityEnhancing(true);
        await new Promise(r => setTimeout(r, 800));
        setQualityEnhancing(false);
      }

      const p = normalizePitch(data.pitch ?? data);
      p.angle_used = data.angleUsed || p.signal_used || null;
      p.personalization_elements = data.personalizationElements || [];
      setPitch(p);
      setEmailSubject(p.email_subject);
      setEmailBody(p.cold_email_body);
      setCompletedSteps(new Set(GEN_STEPS.map(s => s.key)));
      setCurrentStep(null);
      if (selectedLead?.id) loadChecklist(selectedLead.id);
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, pitch_id: data.pitch?.id ?? true } : l));
      if (data.warning) toast(data.warning, { icon: '⚠️', duration: 6000 });
      if (p.generation_method === 'needs_human') {
        toast.error('AI generation failed 3x — no draft was produced. This needs a human rewrite.', { duration: 8000 });
      } else if (data.qualityWarning) {
        toast('Quality gate could not fully improve this pitch — review carefully.', { icon: '⚠️', duration: 5000 });
      } else if (data.qualityRegenerated) {
        toast.success(`Quality enhanced to ${data.qualityScore}/100`);
      } else {
        toast.success('Pitch generated!');
      }
    } catch (err) {
      animCancelled = true;
      setGeneratingStatus('');
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

  const loadChecklist = async (leadId) => {
    if (!leadId) return;
    setChecklistLoading(true);
    try {
      const { data } = await api.get(`/pitches/checklist/${leadId}`);
      setChecklist(data);
    } catch {}
    finally { setChecklistLoading(false); }
  };

  const handleAddToQueue = async () => {
    if (!selectedLead) return;
    // Load checklist if not yet loaded
    if (!checklist) await loadChecklist(selectedLead.id);
    try {
      await api.post('/emails/queue', { lead_id: selectedLead.id, subject: emailSubject, body: emailBody });
      toast.success(`${selectedLead.channel_name} added to email queue!`);
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.error === 'QUALITY_BLOCK') {
        setQualityBlocked(true);
        setBlockDetails({ score: errData.score, feedback: errData.feedback, message: errData.message });
        toast.error(`Blocked — pitch scored ${errData.score}/100 (minimum 70 required)`);
      } else if (errData?.code === 'FALLBACK_PITCH') {
        toast.error('This is a fallback template, not a Marcus draft — regenerate it before sending.', { duration: 6000 });
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

    let bulkSuccessCount = 0;
    for (let i = 0; i < toProcess.length; i++) {
      const lead = toProcess[i];
      setBulkProgress(p => ({ ...p, current: i + 1 }));
      try {
        const data = await generatePitchViaStream(lead.id);
        const p = normalizePitch(data.pitch ?? data);
        if (andSend && p) {
          await api.post('/emails/queue', { lead_id: lead.id, subject: p.email_subject, body: p.cold_email_body });
        }
        bulkSuccessCount++;
        const newResult = { lead, status: andSend ? 'queued' : 'generated', pitch: p };
        setBulkResults(prev => [...prev, newResult]);
        setPitchJobProgress(i + 1);
        setPitchJobResults(prev => [...prev, newResult]);
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message || 'Request failed';
        const errResult = { lead, status: 'error', error: errMsg };
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
    const bulkFailCount = toProcess.length - bulkSuccessCount;
    const bulkAction = andSend ? 'generated & queued' : 'generated';
    if (bulkFailCount === 0) toast.success(`Done! ${bulkSuccessCount} pitches ${bulkAction}`);
    else if (bulkSuccessCount === 0) toast.error(`All ${bulkFailCount} pitches failed — check errors above`);
    else toast(`${bulkSuccessCount} pitches ${bulkAction}, ${bulkFailCount} failed`, { icon: '⚠️', duration: 6000 });
  };

  // Generates a single pitch over the SSE endpoint instead of the plain POST route.
  // The plain route holds the connection open with zero bytes for the full research +
  // Marcus + up-to-5-attempt quality-gate pipeline, which routinely exceeds 100s — long
  // enough for Cloudflare's proxy to kill the connection and return a 524 to the browser.
  // The SSE endpoint sends periodic status/progress frames, keeping the connection alive.
  const generatePitchViaStream = async (leadId, onStatus) => {
    const response = await fetch(`/api/pitches/generate-stream/${leadId}`, { credentials: 'include' });
    if (!response.ok) {
      const text = await response.text();
      let msg = 'Generation failed';
      try { msg = JSON.parse(text).error || msg; } catch {}
      throw new Error(msg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let data = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }
        if (event.type === 'error') {
          const e = new Error(event.error || 'Generation failed');
          e.code = event.code || null;
          e.videoDataStatus = event.videoDataStatus || null;
          throw e;
        }
        if (event.type === 'status' && onStatus) onStatus(event.message);
        if (event.type === 'progress' && onStatus) onStatus(`Quality check ${event.attempt} of ${event.max} — score ${event.score}/100`);
        if (event.type === 'result') data = event;
      }
    }
    if (!data) throw new Error('Generation failed — no result received');
    return data;
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

    let streamDone = 0;
    let streamSuccessCount = 0;
    await Promise.allSettled(toProcess.map(async lead => {
      try {
        const data = await generatePitchViaStream(lead.id, message => {
          setStreamEmails(prev => prev.map(e => e.leadId === lead.id ? { ...e, statusMessage: message } : e));
        });
        const p = normalizePitch(data.pitch ?? data);
        streamSuccessCount++;
        setStreamEmails(prev => prev.map(e =>
          e.leadId === lead.id ? { ...e, status: 'done', data: { ...data, pitch: p } } : e
        ));
      } catch (err) {
        const errMsg = err.message || 'Request failed';
        setStreamEmails(prev => prev.map(e =>
          e.leadId === lead.id ? { ...e, status: 'error', error: errMsg, code: err.code || null, videoDataStatus: err.videoDataStatus || null } : e
        ));
      }
      streamDone++;
      setPitchJobProgress(streamDone);
    }));

    setPitchJobRunning(false);
    removeBackgroundTask('pitch-stream');
    const streamFailCount = toProcess.length - streamSuccessCount;
    if (streamFailCount === 0) toast.success(`Done! ${streamSuccessCount} pitches generated`);
    else if (streamSuccessCount === 0) toast.error(`All ${toProcess.length} pitches failed — check errors above`);
    else toast(`${streamSuccessCount} generated, ${streamFailCount} failed`, { icon: '⚠️', duration: 6000 });
  };

  // Re-runs generation for a single failed lead in the batch grid — the
  // backend safety net (live YouTube fetch) runs again here too, so a
  // transient quota/timeout failure has a real chance of succeeding on retry.
  const retryLeadGeneration = async (lead) => {
    setStreamEmails(prev => prev.map(e => e.leadId === lead.id ? { ...e, status: 'loading', error: null, code: null, statusMessage: 'Retrying...' } : e));
    try {
      const data = await generatePitchViaStream(lead.id, message => {
        setStreamEmails(prev => prev.map(e => e.leadId === lead.id ? { ...e, statusMessage: message } : e));
      });
      const p = normalizePitch(data.pitch ?? data);
      setStreamEmails(prev => prev.map(e => e.leadId === lead.id ? { ...e, status: 'done', data: { ...data, pitch: p } } : e));
    } catch (err) {
      setStreamEmails(prev => prev.map(e =>
        e.leadId === lead.id ? { ...e, status: 'error', error: err.message || 'Request failed', code: err.code || null, videoDataStatus: err.videoDataStatus || null } : e
      ));
    }
  };

  // Removes a lead from the batch grid without blocking review of the rest —
  // used when a lead's data gap isn't worth chasing right now.
  const skipLead = (leadId) => {
    setStreamEmails(prev => prev.filter(e => e.leadId !== leadId));
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
                style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)', marginBottom: 8, whiteSpace: 'nowrap' }}
              >
                FOR · {selectedLead.channel_name} · {formatNumber(selectedLead.subscriber_count ?? 0)} subs
              </motion.div>
            )}
          </AnimatePresence>
          <h1 className="page__title">Pitch Gen — <em>brief → research → draft → review → send.</em></h1>
        </div>
        <div className="page__actions">
          <button className="btn btn--ghost" onClick={() => setShowLeadPicker(o => !o)} style={{ whiteSpace: 'nowrap' }}>
            {selectedLead ? 'Change lead' : 'Select lead'}
          </button>
          {selectedLead && (
            <>
              <button className="btn btn--ghost btn--sm" style={{ whiteSpace: 'nowrap' }}>Save as template</button>
              <button className="btn btn--ghost btn--sm" style={{ whiteSpace: 'nowrap' }}>Next prospect</button>
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
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--lime)' }}>{selectedLeads.size} selected</span>
                  )}
                  <button className="btn btn--ghost btn--sm" onClick={() => setShowLeadPicker(false)}>
                    Close
                  </button>
                </div>
              </div>
              <div className="card__body">
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <input className="input" placeholder="Search leads..." value={leadSearch} onChange={e => setLeadSearch(e.target.value)} />
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
                        background: selectedLeads.has(lead.id) ? 'var(--surface-2)' : 'transparent',
                        border: `1px solid ${selectedLeads.has(lead.id) ? 'var(--line-3)' : 'transparent'}`,
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}
                    >
                      <input type="checkbox" checked={selectedLeads.has(lead.id)} onChange={() => toggleLeadSelect(lead.id)}
                        onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }} />
                      <span className="ava" style={{ fontSize: 11, flexShrink: 0 }}>{(lead.channel_name || '?')[0].toUpperCase()}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{lead.channel_name}</div>
                        <div className="muted" style={{ fontSize: 11 }}>{formatNumber(lead.subscriber_count ?? 0)} subs · {lead.temperature || 'cold'}{lead.email ? ' · has email' : ''}</div>
                      </div>
                      {lead.pitch_id && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', flexShrink: 0 }} />}
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
                      style={{ marginTop: 14, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{selectedLeads.size} lead{selectedLeads.size !== 1 ? 's' : ''} selected</span>
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
                      <button className="btn btn--ghost" style={{ whiteSpace: 'nowrap' }} onClick={handleStreamGenerate}>
                        Generate {selectedLeads.size} Pitch{selectedLeads.size !== 1 ? 'es' : ''}
                      </button>
                      <button
                        className="btn btn--primary"
                        style={{ whiteSpace: 'nowrap' }}
                        onClick={() => handleBulkGenerate(true)}
                      >
                        Generate & Send
                      </button>
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
                  New batch
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
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6 }}
                >
                  <span style={{ width: 6, height: 6, flexShrink: 0, borderRadius: '50%', background: r.status === 'error' ? 'var(--bad)' : 'var(--ok)' }} />
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
                Exit batch
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
              {streamEmails.map(({ leadId, lead, status, data, error, code, videoDataStatus, statusMessage }) => {
                const p = data?.pitch;
                const qs = p?.quality_score ?? null;
                const blocked = qs !== null && qs < 70;
                const qsColor = qs === null ? 'var(--text-3)' : blocked ? 'var(--bad)' : qs >= 85 ? 'var(--lime)' : 'var(--text-2)';

                if (status === 'loading') {
                  return (
                    <motion.div
                      key={leadId}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)' }}
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
                        <span className="muted" style={{ fontSize: 10 }}>{statusMessage || 'Generating...'}</span>
                      </div>
                    </motion.div>
                  );
                }

                if (status === 'error') {
                  const isNeedsResearch = code === 'NEEDS_RESEARCH';
                  const isIntakeBlocked = code === 'INTAKE_BLOCKED';
                  const isNeedsHuman = code === 'NEEDS_HUMAN';
                  return (
                    <motion.div key={leadId} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 4 }}>{lead.channel_name}</div>
                      <div className="muted" style={{ fontSize: 11, color: 'var(--bad)', marginBottom: 10 }}>
                        {isNeedsResearch || isIntakeBlocked || isNeedsHuman ? error : `Failed: ${error || 'Request failed — check Railway logs for details'}`}
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          className="btn btn--ghost btn--sm"
                          style={{ flex: 1 }}
                          disabled={videoDataStatus === 'channel_gone'}
                          title={videoDataStatus === 'channel_gone' ? 'Channel appears deleted or private — retry unlikely to help' : undefined}
                          onClick={() => retryLeadGeneration(lead)}
                        >
                          {isNeedsResearch ? 'Retry research' : 'Retry'}
                        </button>
                        <button className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={() => skipLead(leadId)}>
                          Skip this lead
                        </button>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div key={leadId} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                    style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span className="ava" style={{ fontSize: 10 }}>{(lead.channel_name || '?')[0].toUpperCase()}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{lead.channel_name}</div>
                        <div className="muted" style={{ fontSize: 11 }}>{formatNumber(lead.subscriber_count ?? 0)} subs</div>
                      </div>
                      {qs !== null && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: qsColor }} />
                          <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--f-mono)', color: qsColor }}>{qs}/100</span>
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 10, maxHeight: 80, overflow: 'hidden', position: 'relative' }}>
                      {(p?.cold_email_body || '').slice(0, 180)}{(p?.cold_email_body || '').length > 180 ? '…' : ''}
                    </div>
                    {blocked && (
                      <div style={{ fontSize: 10.5, color: 'var(--bad)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bad)', flexShrink: 0 }} />
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
                        <button className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={async () => {
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
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Select one or multiple leads to generate pitches</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Use checkboxes for bulk generation. Single lead = full edit mode.</div>
            <button
              className="btn btn--primary"
              onClick={() => setShowLeadPicker(true)}
            >
              Select lead
            </button>
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
                    {isDone ? '✓' : s.n}
                  </span>
                  <span>{s.label}</span>
                  {i < GEN_STEPS.length - 1 && <span className="muted" style={{ marginLeft: 'auto', fontSize: 10 }}>→</span>}
                </div>
              );
            })}
          </div>

          {/* Generating state — Marcus working, staged terminal lines */}
          <AnimatePresence>
            {(generating || qualityEnhancing) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="card"
                style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 16px', borderBottom: '1px solid var(--line)',
                  background: 'var(--surface)',
                }}>
                  <span className="dot dot--lime dot--pulse" style={{ width: 6, height: 6 }} />
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.08em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
                    Marcus is working
                  </span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-4)' }}>
                    ~60–120s
                  </span>
                </div>
                <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {GEN_STEPS.map((s, i) => {
                    const isDone = completedSteps.has(s.key);
                    const isCurrent = !isDone && (currentStep === s.key || stepIdx === i);
                    const isFuture = !isDone && !isCurrent;
                    return (
                      <div key={s.key} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        fontFamily: 'var(--f-mono)', fontSize: 12,
                        color: isDone ? 'var(--text-2)' : isCurrent ? 'var(--lime)' : 'var(--text-4)',
                        transition: 'color 200ms ease',
                      }}>
                        <span className={isDone ? 'dot' : isCurrent ? 'dot dot--lime dot--pulse' : 'dot dot--neutral'} style={{ width: 5, height: 5, flexShrink: 0, background: isDone ? 'var(--lime)' : undefined }} />
                        <span style={{ opacity: isFuture ? 0.55 : 1 }}>{s.work}{isCurrent ? '…' : ''}</span>
                      </div>
                    );
                  })}
                  {qualityEnhancing && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--lime)' }}>
                      <span className="dot dot--lime dot--pulse" style={{ width: 5, height: 5, flexShrink: 0 }} />
                      quality gate — rewriting to score 75+…
                    </div>
                  )}
                  {generatingStatus && (
                    <div style={{
                      marginTop: 8, paddingTop: 10, borderTop: '1px dashed var(--line)',
                      fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)',
                    }}>
                      {generatingStatus}
                    </div>
                  )}
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
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Ready to generate</div>
                <div className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
                  Click <strong style={{ color: 'var(--lime)' }}>Study & Generate</strong> to run deep channel analysis, craft a custom offer, and write the cold email.
                </div>
                <button
                  className="btn btn--primary"
                  onClick={handleGenerate}
                >
                  Study & Generate Pitch
                </button>
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
                    background: 'var(--surface)',
                    border: '1px solid var(--line-3)',
                    borderRadius: 'var(--r-md)', marginBottom: 16,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)', flexShrink: 0 }} />
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
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-3)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)' }} />Compiled
                      </span>
                    </div>
                    <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="field">
                        <div className="field__label">Goal</div>
                        <div style={{ padding: '8px 11px', background: 'var(--surface)', borderRadius: 'var(--r-sm)', fontSize: 12.5, border: '1px solid var(--line)' }}>
                          Book a call to discuss sponsorship
                        </div>
                      </div>
                      {pitch.custom_offer && (
                        <div className="field">
                          <div className="field__label">Custom offer</div>
                          <div style={{ padding: '8px 11px', background: 'var(--surface)', borderRadius: 'var(--r-sm)', fontSize: 12.5, border: '1px solid var(--line)', lineHeight: 1.55 }}>
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
                              style={{ fontSize: 12, color: 'var(--text-2)', gap: 8 }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', flexShrink: 0 }} />{s}
                            </motion.div>
                          ))}
                        </div>
                      </div>
                      <button className="btn btn--ghost btn--sm" style={{ justifyContent: 'center' }} onClick={handleGenerate} disabled={generating}>
                        Regenerate
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
                        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-4)' }}>click to use</span>
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
                              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-4)' }}>VARIANT {String.fromCharCode(65 + i)}</span>
                              {i === 0 && <span style={{ fontSize: 9.5, color: 'var(--lime)' }}>Recommended</span>}
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
                        <button className="btn btn--ghost btn--sm">Edit</button>
                        <button className="btn btn--ghost btn--sm" onClick={handleRescore} disabled={rescoring}>
                          {rescoring ? 'Rescoring...' : 'Rescore'}
                        </button>
                      </div>
                    </div>
                    <div className="card__body">
                      {/* Angle badge — shows which signal Marcus wrote from, per angleEngine.js's
                          MARCUS_ANGLES taxonomy. Older v3 signal ids are mapped for backward compat
                          with pitches generated before the angle-engine rewrite. */}
                      {(pitch.angle_used || pitch.signal_used) && (() => {
                        const ANGLE_LABELS = {
                          diagnosis:            '🩺 DIAGNOSIS',
                          unclaimed_window:     '🪟 UNCLAIMED WINDOW',
                          bottleneck_removal:   '🚧 BOTTLENECK REMOVAL',
                          specific_fit:         '🎯 SPECIFIC FIT',
                          risk_reframe:         '🛡️ RISK REFRAME',
                          social_proof_mirror:  '👥 SOCIAL PROOF MIRROR',
                          honest_observation:   '👁️ HONEST OBSERVATION',
                          value_drop:           '🎁 VALUE DROP',
                          // legacy v3 signal ids
                          confirmed_hiring:     '🎯 CONFIRMED HIRING SIGNAL',
                          video_drop:           '📉 VIDEO DROP DETECTED',
                          upload_gap:           '⏰ UPLOAD GAP DETECTED',
                          viral_gap:            '🚀 VIRAL GAP DETECTED',
                          ratio_gap:            '📊 VIEW RATIO SIGNAL',
                          frequency_slow:       '🐢 FREQUENCY SIGNAL',
                          growth_opportunity:   '⚠️ GENERIC (improve lead data)',
                        };
                        const angleKey = pitch.angle_used || pitch.signal_used;
                        const label = ANGLE_LABELS[angleKey] || angleKey.replace(/_/g, ' ').toUpperCase();
                        const elements = pitch.personalization_elements || [];
                        return (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              border: '1px solid var(--line)',
                              borderRadius: 'var(--r-sm)', padding: '4px 10px',
                              fontSize: 10, fontWeight: 700,
                              color: 'var(--lime)',
                              fontFamily: 'var(--f-mono)',
                              letterSpacing: '0.5px',
                            }}>
                              {label}
                            </div>
                            {elements.length > 0 && (
                              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 5 }}>
                                Generated from: {elements.join(' + ')}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* needs_human banner — Marcus V4 P0-5: no fallback template exists.
                          3 failed attempts land here with the reasons; a human rewrites or skips. */}
                      {pitch.generation_method === 'needs_human' && (
                        <div style={{
                          marginBottom: 14, padding: '10px 14px', borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--bad)', color: 'var(--bad)',
                          fontSize: 12, fontWeight: 700, fontFamily: 'var(--f-mono)',
                          display: 'flex', flexDirection: 'column', gap: 8,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bad)', flexShrink: 0 }} />
                              NEEDS HUMAN — AI generation failed 3x for this lead. No draft was produced.
                            </span>
                            <button
                              className="btn btn--ghost btn--sm"
                              style={{ flexShrink: 0 }}
                              onClick={handleGenerate}
                              disabled={generating}
                            >
                              Retry generation
                            </button>
                          </div>
                          {pitch.needs_human_reasons?.length > 0 && (
                            <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--text-3)', lineHeight: 1.5 }}>
                              {pitch.needs_human_reasons.map((f, i) => (
                                <div key={i}>Attempt {f.attempt}: {f.reason}</div>
                              ))}
                            </div>
                          )}
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
                                ? 'Needs polish'
                                : qs >= 90 ? 'Quality: Excellent'
                                : qs >= 85 ? 'Quality: Good'
                                : 'Quality: Enhanced';
                              const color = warn || qs < 70 ? 'var(--bad)' : qs >= 85 ? 'var(--lime)' : 'var(--text-2)';
                              return (
                                <motion.div
                                  key={label}
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    fontSize: 11, fontWeight: 600, fontFamily: 'var(--f-mono)',
                                    color,
                                  }}
                                >
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                  {label}
                                </motion.div>
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
                                  background: 'var(--surface)',
                                  border: '1px solid var(--line)',
                                  borderRadius: 'var(--r-sm)',
                                  display: 'flex', flexDirection: 'column', gap: 6,
                                }}>
                                  {/* Renders exclusively from the backend's check array — each row carries
                                      its own points_possible, so the UI never guesses a max. */}
                                  {(Array.isArray(pitch.quality_breakdown) ? pitch.quality_breakdown : []).map((check) => {
                                    const { name, points_awarded = 0, points_possible = 0, detail = '' } = check || {};
                                    const pct = points_possible > 0 ? Math.round((points_awarded / points_possible) * 100) : 0;
                                    const barColor = pct >= 75 ? 'var(--lime)' : pct >= 50 ? 'var(--warn)' : 'var(--bad)';
                                    return (
                                      <div key={name}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                          <span style={{ fontSize: 10, fontFamily: 'var(--f-mono)', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                                            {(name || '').replace(/_/g, ' ')}
                                          </span>
                                          <span style={{ fontSize: 10, fontFamily: 'var(--f-mono)', color: barColor }}>
                                            {points_awarded}/{points_possible}
                                          </span>
                                        </div>
                                        <div style={{ height: 3, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden', marginBottom: 2 }}>
                                          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: barColor, transition: 'width 0.4s ease' }} />
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-4)', lineHeight: 1.4 }}>{detail}</div>
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
                            fontSize: 20, fontWeight: 700,
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
                                background: selectedSubj === i ? 'var(--surface-2)' : 'var(--surface)',
                                borderColor: selectedSubj === i ? 'var(--line-3)' : 'var(--line)',
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
                          To {selectedLead.email || `${selectedLead.channel_name}@...`} · AI-personalized ·{' '}
                          {(() => {
                            const qs = pitch.quality_score ?? pitch.pitch_score;
                            return qs != null && qs < 70 ? 'needs polish before sending' : 'ready to send';
                          })()}
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
                              padding: '14px 16px',
                              background: 'var(--surface)',
                              border: '1px solid var(--bad)',
                              borderRadius: 'var(--r-md)',
                              color: 'var(--text)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, marginBottom: 4, color: 'var(--bad)' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bad)', flexShrink: 0 }} />
                              Blocked — Score too low to send ({pitch.quality_score ?? blockDetails?.score ?? '?'}/100)
                            </div>
                            <div style={{ fontSize: 11, marginBottom: 10, color: 'var(--text-3)' }}>
                              {blockDetails?.message || `This pitch scored below 70 and cannot be sent until rewritten. Click Rewrite to regenerate.`}
                            </div>
                            {Array.isArray(pitch.quality_breakdown) && pitch.quality_breakdown.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
                                {pitch.quality_breakdown
                                  .filter(c => (c?.points_awarded ?? 0) < (c?.points_possible ?? 0))
                                  .slice(0, 4)
                                  .map((c) => (
                                    <div key={c.name} style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                                      · {(c.name || '').replace(/_/g, ' ')}: {c.detail}
                                    </div>
                                  ))}
                              </div>
                            )}
                            <button
                              className="btn btn--ghost btn--sm"
                              onClick={handleGenerate}
                              disabled={generating}
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
                                borderRadius: 'var(--r-sm)', marginBottom: 6,
                                fontSize: 12, color: 'var(--text-2)',
                                cursor: 'pointer',
                                transition: 'all 150ms',
                              }}
                              onClick={() => copyToClipboard(s)}
                              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--line-3)'}
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

                      <div style={{ display: 'flex', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                        {[
                          { l: 'Pitch quality', v: pitch.quality_score >= 90 ? 'Excellent' : pitch.quality_score >= 85 ? 'Good' : pitch.quality_score >= 70 ? 'Enhanced' : (pitch.quality_score ?? pitch.pitch_score) != null ? 'Needs polish' : '—', c: 'var(--lime)' },
                          { l: 'Word count', v: String((emailBody || '').trim().split(/\s+/).filter(Boolean).length), c: 'var(--text)' },
                          { l: 'Read time', v: `${Math.max(1, Math.round((emailBody || '').trim().split(/\s+/).filter(Boolean).length / 200))} min`, c: 'var(--text)' },
                        ].map((m, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.08 + 0.1 }}
                            style={{
                              flex: 1, paddingRight: 16, marginRight: 16,
                              borderRight: i === 2 ? 'none' : '1px solid var(--line)',
                            }}
                          >
                            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-4)' }}>{m.l}</div>
                            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 18, fontWeight: 500, color: m.c, marginTop: 4 }}>{m.v}</div>
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
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-4)' }}>3 steps · skips on reply</span>
                    </div>
                    <div className="card__body" style={{ padding: 0 }}>
                      {[
                        { d: 'Day 2', l: 'Bump if no reply',   prev: '"Bumping this — should I close the loop or worth a quick chat?"' },
                        { d: 'Day 5', l: 'Different angle',    prev: '"Different approach: here\'s a case study from a creator your size."' },
                        { d: 'Day 9', l: 'Final break-up',     prev: '"Last note — happy to never bother you again, just say the word."' },
                      ].map((f, i) => (
                        <div key={i} style={{ padding: '14px 16px', borderBottom: i < 2 ? '1px solid var(--line)' : 'none', display: 'flex', gap: 14 }}>
                          <div style={{ width: 50, color: 'var(--text-3)', fontFamily: 'var(--f-mono)', fontSize: 11, paddingTop: 2, flexShrink: 0 }}>{f.d}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 2 }}>{f.l}</div>
                            <div className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>{f.prev}</div>
                          </div>
                          <button className="btn btn--ghost btn--sm">Edit</button>
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  {/* Pre-send checklist */}
                  {checklist && (
                    <div style={{ padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: checklist.canSend ? 'var(--lime)' : 'var(--bad)', marginBottom: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: checklist.canSend ? 'var(--ok)' : 'var(--bad)', flexShrink: 0 }} />
                        {checklist.canSend ? 'Ready to send' : 'Issues found'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {checklist.items.map((item, i) => (
                          <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: item.pass ? 'var(--ok)' : item.critical ? 'var(--bad)' : 'rgba(255,255,255,0.3)' }} />
                            <span style={{ fontSize: 12, color: item.pass ? 'var(--text-2)' : item.critical ? 'var(--bad)' : 'var(--text-3)', lineHeight: 1.6 }}>{item.label}</span>
                            {!item.pass && <span className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>— {item.detail}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
                            style={{ borderColor: 'var(--bad)', color: 'var(--bad)' }}
                            onClick={handleGenerate}
                            disabled={generating}
                          >
                            Rewrite
                          </button>
                          <button
                            className="btn btn--ghost"
                            style={{ opacity: 0.3, cursor: 'not-allowed', pointerEvents: 'none' }}
                            disabled
                          >
                            Queue for sending
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn btn--primary"
                          onClick={handleAddToQueue}
                        >
                          Queue for sending
                        </button>
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
