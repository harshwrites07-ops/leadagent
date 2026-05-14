﻿import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Search, Zap, Copy, Check, ChevronDown, ChevronRight,
  MailPlus, Edit, Users, MessageSquare, CheckCircle,
  Loader, AlertCircle, RefreshCw, BookOpen, Target,
  Mail, Hash, Star,
} from 'lucide-react';
import api, { formatNumber, tempLabel, tempClass } from '../utils/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { key: 'deep_study', label: 'Deep Study', icon: BookOpen, desc: 'Analyzing channel & pain points' },
  { key: 'custom_offer', label: 'Custom Offer', icon: Target, desc: 'Crafting tailored value prop' },
  { key: 'cold_email', label: 'Cold Email', icon: Mail, desc: 'Writing personalized email' },
  { key: 'reddit_dm', label: 'Reddit DM', icon: MessageSquare, desc: 'Generating Reddit message' },
  { key: 'subject_variants', label: 'Subject Variants', icon: Hash, desc: 'Creating A/B subject lines' },
];

// ---------------------------------------------------------------------------
// Copy button with checkmark feedback
// ---------------------------------------------------------------------------
const CopyButton = ({ text, className = '' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`btn btn-ghost text-xs py-1 px-2 flex items-center gap-1 transition-colors ${className}`}
    >
      {copied ? (
        <><Check size={12} className="text-green-400" /> Copied</>
      ) : (
        <><Copy size={12} /> Copy</>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Collapsible section card
// ---------------------------------------------------------------------------
const SectionCard = ({ title, icon: Icon, iconColor = 'text-brand-400', defaultOpen = true, actions, children }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card mb-3">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <Icon size={16} className={iconColor} />
          <span className="text-slate-200 font-semibold text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {actions && <div onClick={e => e.stopPropagation()}>{actions}</div>}
          {open ? <ChevronDown size={15} className="text-slate-500" /> : <ChevronRight size={15} className="text-slate-500" />}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 border-t border-dark-700 pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Step progress indicator
// ---------------------------------------------------------------------------
const StepIndicator = ({ steps, currentStep, completedSteps }) => (
  <div className="flex items-center gap-0 mb-6">
    {STEPS.map((step, idx) => {
      const done = completedSteps.has(step.key);
      const active = currentStep === step.key;
      const Icon = step.icon;
      return (
        <div key={step.key} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                done
                  ? 'bg-green-500/20 border-2 border-green-500'
                  : active
                  ? 'bg-brand-600/20 border-2 border-brand-600 animate-pulse'
                  : 'bg-dark-700 border-2 border-dark-600'
              }`}
            >
              {done ? (
                <Check size={14} className="text-green-400" />
              ) : active ? (
                <Loader size={13} className="text-brand-400 animate-spin" />
              ) : (
                <Icon size={13} className="text-slate-500" />
              )}
            </div>
            <span className={`text-xs mt-1 whitespace-nowrap ${active ? 'text-brand-400' : done ? 'text-green-400' : 'text-slate-600'}`}>
              {step.label}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <div className={`h-0.5 w-8 mx-1 mb-5 transition-all duration-300 ${done ? 'bg-green-500' : 'bg-dark-600'}`} />
          )}
        </div>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Pitch score badge
// ---------------------------------------------------------------------------
const PitchScoreBadge = ({ score }) => {
  if (score == null) return null;
  const n = Number(score);
  const color = n >= 8 ? 'text-green-400 bg-green-400/10 border-green-500/30'
    : n >= 6 ? 'text-yellow-400 bg-yellow-400/10 border-yellow-500/30'
    : 'text-red-400 bg-red-400/10 border-red-500/30';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-bold ${color}`}>
      <Star size={11} />
      {n}/10
    </span>
  );
};

// ---------------------------------------------------------------------------
// Lead list item in left panel
// ---------------------------------------------------------------------------
const LeadListItem = ({ lead, selected, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 flex items-center gap-3 ${
      selected ? 'bg-brand-600/20 border border-brand-600/40' : 'hover:bg-dark-700 border border-transparent'
    }`}
  >
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-slate-200 text-sm font-medium truncate">{lead.channel_name}</span>
        {lead.pitch_id && <Check size={12} className="text-green-400 shrink-0" title="Pitch exists" />}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-slate-500 text-xs">{formatNumber(lead.subscriber_count ?? 0)} subs</span>
        <span className={`badge text-xs ${tempClass(lead.temperature)}`}>{tempLabel(lead.temperature)}</span>
      </div>
    </div>
    <ChevronRight size={13} className={`shrink-0 ${selected ? 'text-brand-400' : 'text-slate-600'}`} />
  </button>
);

// ---------------------------------------------------------------------------
// Empty state (no lead selected)
// ---------------------------------------------------------------------------
const NoLeadSelected = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex flex-col items-center justify-center h-full py-24 text-center"
  >
    <div className="w-16 h-16 rounded-2xl bg-dark-700 flex items-center justify-center mb-4">
      <Zap size={28} className="text-brand-400 opacity-60" />
    </div>
    <h3 className="text-white font-semibold text-lg mb-2">Select a Lead</h3>
    <p className="text-slate-400 text-sm max-w-xs">
      Choose a lead from the left panel to generate a fully personalized AI pitch. Each pitch includes
      deep study, a custom offer, cold email, and subject line variants.
    </p>
  </motion.div>
);

// ---------------------------------------------------------------------------
// Generation loading state
// ---------------------------------------------------------------------------
const GeneratingState = ({ currentStep, completedSteps }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="py-8"
  >
    <StepIndicator steps={STEPS} currentStep={currentStep} completedSteps={completedSteps} />
    <div className="card bg-dark-800 text-center py-10">
      <Loader size={32} className="text-brand-400 mx-auto mb-3 animate-spin" />
      <p className="text-white font-semibold">
        {STEPS.find(s => s.key === currentStep)?.desc ?? 'Generating pitch...'}
      </p>
      <p className="text-slate-400 text-sm mt-1">This usually takes 15–45 seconds</p>
    </div>
  </motion.div>
);

// ---------------------------------------------------------------------------
// Pitch content panels
// ---------------------------------------------------------------------------
const PitchContent = ({ pitch, lead, onRescore, onAddToQueue, onEditLead }) => {
  const [emailSubject, setEmailSubject] = useState(pitch?.cold_email?.subject ?? '');
  const [emailBody, setEmailBody] = useState(pitch?.cold_email?.body ?? '');
  const [rescoring, setRescoring] = useState(false);
  const [pitchScore, setPitchScore] = useState(pitch?.cold_email?.pitch_score);
  const [pitchFeedback, setPitchFeedback] = useState(pitch?.cold_email?.pitch_feedback ?? '');

  useEffect(() => {
    setEmailSubject(pitch?.cold_email?.subject ?? '');
    setEmailBody(pitch?.cold_email?.body ?? '');
    setPitchScore(pitch?.cold_email?.pitch_score);
    setPitchFeedback(pitch?.cold_email?.pitch_feedback ?? '');
  }, [pitch]);

  const handleRescore = async () => {
    setRescoring(true);
    try {
      const { data } = await api.post(`/pitches/${pitch.id}/rescore`, { body: emailBody });
      setPitchScore(data.pitch_score);
      setPitchFeedback(data.pitch_feedback ?? '');
      toast.success('Pitch rescored!');
    } catch (err) {
      toast.error(err.message || 'Rescore failed');
    } finally {
      setRescoring(false);
    }
  };

  const subjectVariants = pitch?.cold_email?.subject_variants ?? [];
  const completedSteps = new Set(STEPS.map(s => s.key));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <StepIndicator steps={STEPS} currentStep={null} completedSteps={completedSteps} />

      {/* Deep Study */}
      <SectionCard
        title="Deep Study"
        icon={BookOpen}
        iconColor="text-purple-400"
        actions={<CopyButton text={pitch?.deep_study ?? ''} />}
      >
        <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
          {pitch?.deep_study ?? <span className="text-slate-500 italic">No study data available.</span>}
        </div>
      </SectionCard>

      {/* Custom Offer */}
      <SectionCard
        title="Custom Offer"
        icon={Target}
        iconColor="text-blue-400"
        actions={<CopyButton text={pitch?.custom_offer ?? ''} />}
      >
        <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
          {pitch?.custom_offer ?? <span className="text-slate-500 italic">No offer generated.</span>}
        </div>
      </SectionCard>

      {/* Cold Email */}
      <SectionCard
        title="Cold Email"
        icon={Mail}
        iconColor="text-brand-400"
        actions={
          <div className="flex items-center gap-2">
            <PitchScoreBadge score={pitchScore} />
            <CopyButton text={`Subject: ${emailSubject}\n\n${emailBody}`} />
          </div>
        }
      >
        {/* Subject line */}
        <div className="mb-3">
          <label className="label text-xs mb-1">Subject Line</label>
          <input
            className="input text-sm"
            value={emailSubject}
            onChange={e => setEmailSubject(e.target.value)}
          />
        </div>

        {/* Body */}
        <div className="mb-3">
          <label className="label text-xs mb-1">Email Body</label>
          <textarea
            className="input text-sm resize-none"
            rows={10}
            value={emailBody}
            onChange={e => setEmailBody(e.target.value)}
          />
        </div>

        {/* Score feedback */}
        {pitchFeedback && (
          <div className="mb-3 bg-dark-800 rounded-lg p-3 border border-dark-600">
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">AI Feedback</p>
            <p className="text-slate-300 text-sm">{pitchFeedback}</p>
          </div>
        )}

        {/* Rescore */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={handleRescore}
            disabled={rescoring}
            className="btn btn-secondary text-xs flex items-center gap-1 py-1.5 px-3"
          >
            {rescoring ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Rescore
          </button>
          {pitchScore != null && <PitchScoreBadge score={pitchScore} />}
        </div>

        {/* Subject variants */}
        {subjectVariants.length > 0 && (
          <div>
            <p className="label text-xs mb-2">Subject Line Variants — click to use</p>
            <div className="flex flex-wrap gap-2">
              {subjectVariants.map((v, i) => (
                <button
                  key={i}
                  onClick={() => setEmailSubject(v)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    emailSubject === v
                      ? 'bg-brand-600/20 border-brand-600 text-brand-400'
                      : 'bg-dark-700 border-dark-600 text-slate-400 hover:text-slate-200 hover:border-dark-500'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Reddit DM — only if reddit lead */}
      {(lead?.source === 'reddit' || pitch?.reddit_dm) && (
        <SectionCard
          title="Reddit DM"
          icon={MessageSquare}
          iconColor="text-orange-400"
          actions={<CopyButton text={pitch?.reddit_dm ?? ''} />}
        >
          <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
            {pitch?.reddit_dm ?? <span className="text-slate-500 italic">No Reddit DM generated.</span>}
          </div>
        </SectionCard>
      )}

      {/* Actions row */}
      <div className="flex items-center gap-3 pt-2 border-t border-dark-700 mt-4">
        <button
          onClick={() => onAddToQueue(lead, { subject: emailSubject, body: emailBody })}
          className="btn btn-primary flex items-center gap-2 text-sm"
        >
          <MailPlus size={15} />
          Add to Email Queue
        </button>
        <button
          onClick={() => onEditLead(lead)}
          className="btn btn-secondary flex items-center gap-2 text-sm"
        >
          <Edit size={15} />
          Edit Lead
        </button>
      </div>
    </motion.div>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function PitchGenerator() {
  const navigate = useNavigate();

  // Lead list state
  const [leadSearch, setLeadSearch] = useState('');
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(true);

  // Selected lead
  const [selectedLead, setSelectedLead] = useState(null);
  const [existingPitch, setExistingPitch] = useState(null);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(null);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  // Load leads on mount
  useEffect(() => {
    const loadLeads = async () => {
      setLeadsLoading(true);
      try {
        const { data } = await api.get('/leads', { params: { limit: 200 } });
        setLeads(data.leads ?? []);
      } catch {
        toast.error('Failed to load leads');
      } finally {
        setLeadsLoading(false);
      }
    };
    loadLeads();
  }, []);

  // Preselect lead from query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const leadId = params.get('lead');
    if (leadId && leads.length > 0) {
      const found = leads.find(l => String(l.id) === String(leadId));
      if (found) handleSelectLead(found);
    }
  }, [leads]);

  const normalizePitch = (raw) => {
    if (!raw) return null;
    return {
      ...raw,
      subject_variants: Array.isArray(raw.subject_variants)
        ? raw.subject_variants
        : (() => { try { return JSON.parse(raw.subject_variants || '[]'); } catch { return []; } })(),
      cold_email: {
        subject: raw.email_subject || '',
        body: raw.cold_email || '',
        pitch_score: raw.pitch_score,
        pitch_feedback: raw.pitch_feedback || '',
        subject_variants: Array.isArray(raw.subject_variants)
          ? raw.subject_variants
          : (() => { try { return JSON.parse(raw.subject_variants || '[]'); } catch { return []; } })(),
      },
    };
  };

  const handleSelectLead = async (lead) => {
    setSelectedLead(lead);
    setExistingPitch(null);
    setCompletedSteps(new Set());
    setCurrentStep(null);
    try {
      const { data } = await api.get(`/pitches/by-lead/${lead.id}`);
      if (data?.pitch) {
        setExistingPitch(normalizePitch(data.pitch));
        setCompletedSteps(new Set(STEPS.map(s => s.key)));
      }
    } catch {
      // no pitch yet — that's fine
    }
  };

  const handleGenerate = async () => {
    if (!selectedLead) return;
    setGenerating(true);
    setExistingPitch(null);
    setCompletedSteps(new Set());
    setCurrentStep(STEPS[0].key);

    try {
      // Kick off generation. Backend streams or returns full pitch.
      // We animate through steps while waiting.
      const stepTimer = (step, delay) => new Promise(resolve =>
        setTimeout(() => {
          setCurrentStep(step);
          resolve();
        }, delay)
      );

      // Animate steps while API is processing
      const animationPromise = (async () => {
        const delays = [0, 6000, 14000, 22000, 30000];
        for (let i = 0; i < STEPS.length; i++) {
          await stepTimer(STEPS[i].key, i === 0 ? 0 : delays[i] - delays[i - 1]);
          setCompletedSteps(prev => {
            const n = new Set(prev);
            if (i > 0) n.add(STEPS[i - 1].key);
            return n;
          });
        }
      })();

      const apiPromise = api.post(`/pitches/generate/${selectedLead.id}`);
      const [{ data }] = await Promise.all([apiPromise, animationPromise]);

      setCompletedSteps(new Set(STEPS.map(s => s.key)));
      setCurrentStep(null);
      setExistingPitch(normalizePitch(data.pitch ?? data));

      setLeads(prev => prev.map(l =>
        l.id === selectedLead.id ? { ...l, pitch_id: data.pitch?.id ?? true } : l
      ));

      toast.success('Pitch generated successfully!');
    } catch (err) {
      toast.error(err.message ?? 'Generation failed');
      setCurrentStep(null);
    } finally {
      setGenerating(false);
    }
  };

  const handleAddToQueue = async (lead, emailData) => {
    try {
      await api.post('/emails/queue', {
        lead_id: lead.id,
        subject: emailData.subject,
        body: emailData.body,
      });
      toast.success(`${lead.channel_name} added to email queue!`);
    } catch (err) {
      toast.error(err.message || 'Failed to add to queue');
    }
  };

  const handleEditLead = (lead) => {
    navigate(`/leads/${lead.id}/edit`);
  };

  const filteredLeads = leads.filter(l =>
    !leadSearch.trim() ||
    (l.channel_name ?? l.username ?? '').toLowerCase().includes(leadSearch.toLowerCase())
  );

  return (
    <div className="p-6 max-w-screen-xl mx-auto h-full">
      <div className="mb-5">
        <h1 className="text-white text-2xl font-bold">
          <span className="text-gradient">Pitch Generator</span>
        </h1>
        <p className="text-slate-400 text-sm mt-0.5">
          AI-powered personalized pitches for every lead.
        </p>
      </div>

      <div className="flex gap-5" style={{ minHeight: 'calc(100vh - 160px)' }}>
        {/* ---------------------------------------------------------------- */}
        {/* LEFT PANEL "- Lead selector (30%)                                  */}
        {/* ---------------------------------------------------------------- */}
        <div
          className="card flex flex-col"
          style={{ flex: '0 0 30%', minWidth: 0, maxHeight: 'calc(100vh - 180px)' }}
        >
          <h3 className="section-title mb-3">Select Lead</h3>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-8 text-sm"
              placeholder="Search leads..."
              value={leadSearch}
              onChange={e => setLeadSearch(e.target.value)}
            />
          </div>

          {/* Lead list */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {leadsLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 bg-dark-700 rounded-lg animate-pulse" />
              ))
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-10">
                <Users size={28} className="text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">
                  {leadSearch ? 'No leads match your search.' : 'No leads found yet.'}
                </p>
                {!leadSearch && (
                  <button
                    className="btn btn-secondary text-xs mt-3"
                    onClick={() => navigate('/leads')}
                  >
                    Find Leads
                  </button>
                )}
              </div>
            ) : (
              filteredLeads.map(lead => (
                <LeadListItem
                  key={lead.id}
                  lead={lead}
                  selected={selectedLead?.id === lead.id}
                  onClick={() => handleSelectLead(lead)}
                />
              ))
            )}
          </div>

          {/* Lead count footer */}
          {!leadsLoading && leads.length > 0 && (
            <p className="text-slate-600 text-xs pt-3 border-t border-dark-700 mt-2">
              {filteredLeads.length} of {leads.length} leads shown
            </p>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* RIGHT PANEL "- Pitch content (70%)                                 */}
        {/* ---------------------------------------------------------------- */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ minWidth: 0, maxHeight: 'calc(100vh - 180px)' }}
        >
          {!selectedLead ? (
            <div className="card h-full">
              <NoLeadSelected />
            </div>
          ) : (
            <div>
              {/* Lead header */}
              <div className="card mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center text-brand-400 font-bold">
                    {(selectedLead.channel_name ?? selectedLead.username ?? 'L')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white font-semibold">{selectedLead.channel_name ?? selectedLead.username}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-slate-400 text-xs">
                        {formatNumber(selectedLead.subscriber_count ?? 0)} subs
                      </span>
                      <span className={`badge text-xs ${tempClass(selectedLead.temperature)}`}>
                        {tempLabel(selectedLead.temperature)}
                      </span>
                      {selectedLead.source && (
                        <span className="badge badge-blue text-xs">{selectedLead.source}</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {generating ? (
                    <><Loader size={15} className="animate-spin" /> Generating...</>
                  ) : existingPitch ? (
                    <><RefreshCw size={15} /> Regenerate Pitch</>
                  ) : (
                    <><Zap size={15} /> Study & Generate Pitch</>
                  )}
                </button>
              </div>

              {/* Generating animation */}
              {generating && (
                <GeneratingState currentStep={currentStep} completedSteps={completedSteps} />
              )}

              {/* Pitch content */}
              {!generating && existingPitch && (
                <PitchContent
                  pitch={existingPitch}
                  lead={selectedLead}
                  onRescore={() => {}}
                  onAddToQueue={handleAddToQueue}
                  onEditLead={handleEditLead}
                />
              )}

              {/* Ready state "- pitch not yet generated */}
              {!generating && !existingPitch && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="card text-center py-14"
                >
                  <Zap size={36} className="text-brand-400 mx-auto mb-3 opacity-70" />
                  <p className="text-white font-semibold text-lg mb-2">Ready to Generate</p>
                  <p className="text-slate-400 text-sm max-w-sm mx-auto mb-5">
                    Click <strong className="text-brand-400">Study & Generate Pitch</strong> above to run the full AI
                    pipeline "- deep channel analysis, custom offer, cold email, and subject variants.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {STEPS.map(step => (
                      <div key={step.key} className="flex items-center gap-1.5 bg-dark-700 rounded-full px-3 py-1.5">
                        <step.icon size={12} className="text-slate-500" />
                        <span className="text-slate-400 text-xs">{step.label}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
