import { useState, useEffect, useRef } from 'react';
import { Zap, X, Loader, ChevronDown, ChevronUp, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api';

const GAP_PRESETS = [
  { label: '10 sec', secs: 10 },
  { label: 'No gap', secs: 0 },
  { label: '1 min', secs: 60 },
  { label: '2 min', secs: 120 },
  { label: '5 min', secs: 300 },
  { label: '10 min', secs: 600 },
  { label: '15 min', secs: 900 },
  { label: '30 min', secs: 1800 },
  { label: '1 hour', secs: 3600 },
];

const QUICK_DELAYS = [
  { label: '10 sec', secs: 10 },
  { label: '1 min',  secs: 60 },
  { label: '2 min',  secs: 120 },
  { label: '5 min',  secs: 300 },
];

const INBOX_COUNT = 4;

const WARMUP_STAGES = [
  { maxDays: 7,    perInbox: 20,  gap: 300, label: 'Week 1 — Warming',  color: '#00B8D4', desc: '20/inbox · 5 min gap' },
  { maxDays: 14,   perInbox: 30,  gap: 180, label: 'Week 2 — Building', color: 'var(--lime)', desc: '30/inbox · 3 min gap' },
  { maxDays: 21,   perInbox: 40,  gap: 120, label: 'Week 3 — Growing',  color: 'var(--warn)', desc: '40/inbox · 2 min gap' },
  { maxDays: 30,   perInbox: 60,  gap: 60,  label: 'Month 1 — Strong',  color: '#FF6B35', desc: '60/inbox · 1 min gap' },
  { maxDays: 60,   perInbox: 100, gap: 30,  label: 'Month 2 — Trusted', color: '#00C853', desc: '100/inbox · 30s gap'  },
  { maxDays: 9999, perInbox: 150, gap: 0,   label: 'Established',       color: 'var(--ok)', desc: '150/inbox · no gap'   },
];

function getWarmupStage(firstSentDate) {
  if (!firstSentDate) return WARMUP_STAGES[0];
  const days = Math.floor((Date.now() - new Date(firstSentDate)) / 86400000);
  return WARMUP_STAGES.find(s => days <= s.maxDays) || WARMUP_STAGES[WARMUP_STAGES.length - 1];
}

const DOT_COLORS = { start: '#00B8D4', studying: 'var(--lime)', generated: 'var(--warn)', sent: 'var(--ok)', failed: '#FF4444', done: 'var(--ok)', waiting: '#FF9500', info: '#888' };

function FeedItem({ item }) {
  const color = item.type === 'failed' ? '#FF6666' : item.type === 'sent' || item.type === 'done' ? 'var(--ok)' : item.type === 'waiting' ? '#FF9500' : 'var(--text-secondary)';
  const time = new Date(item.time).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minHeight: 18 }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: DOT_COLORS[item.type] || '#555', marginTop: 5, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)', color, lineHeight: 1.5, wordBreak: 'break-all' }}>{item.message}</span>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{time}</span>
    </div>
  );
}

export default function PowerSendOverlay({ onClose, leadIds = null, maxLeads = 100 }) {
  const [phase, setPhase] = useState('confirm');  // confirm | running | done
  const [count, setCount] = useState(leadIds ? leadIds.length : maxLeads);
  const [perAccountLimit, setPerAccountLimit] = useState(0);
  const [gapSeconds, setGapSeconds] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [warmup, setWarmup] = useState(null);
  const [sentToday, setSentToday] = useState(0);
  const [jobId, setJobId] = useState(null);
  const [stats, setStats] = useState({ studied: 0, generated: 0, sent: 0, failed: 0, total: 0 });
  const [feed, setFeed] = useState([]);
  const [inboxes, setInboxes] = useState([]);
  const [skipInboxes, setSkipInboxes] = useState([]);
  const pollRef = useRef(null);
  const feedRef = useRef(null);

  // Load warmup stage + check for an already-running job when overlay opens
  useEffect(() => {
    api.get('/emails/stats').then(r => {
      setWarmup(getWarmupStage(r.data.first_sent_date));
      setSentToday(r.data.sent_today || 0);
    }).catch(() => {});

    api.get('/emails/inboxes').then(r => {
      if (r.data.inboxes) setInboxes(r.data.inboxes);
    }).catch(() => {});

    api.get('/pitches/power-send/active').then(r => {
      if (r.data.job) {
        setJobId(r.data.job.id);
        const s = r.data.job.status;
        setPhase(s === 'running' ? 'running' : 'done');
        syncJobState(r.data.job);
        if (s === 'running') startPolling(r.data.job.id);
      }
    }).catch(() => {});
  }, []);

  // Cleanup poll on unmount
  useEffect(() => () => clearInterval(pollRef.current), []);

  function syncJobState(job) {
    setStats({
      studied: job.studied || 0,
      generated: job.generated || 0,
      sent: job.sent || 0,
      failed: job.failed || 0,
      total: job.total || 0,
    });
    try { setFeed(JSON.parse(job.log || '[]')); } catch {}
  }

  function startPolling(id) {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/pitches/power-send/${id}`);
        if (!data.job) return;
        syncJobState(data.job);
        if (data.job.status !== 'running') {
          clearInterval(pollRef.current);
          setPhase(data.job.status === 'interrupted' ? 'interrupted' : 'done');
        }
      } catch {}
    }, 2000);
  }

  const activeInboxCount = (inboxes.length || INBOX_COUNT) - skipInboxes.length;
  const effectiveCount = perAccountLimit > 0
    ? Math.min(leadIds ? leadIds.length : count, perAccountLimit * activeInboxCount)
    : (leadIds ? leadIds.length : count);

  const estMins = Math.ceil(effectiveCount * (21 + gapSeconds) / 60);

  const applySafeDefaults = () => {
    if (!warmup) return;
    setPerAccountLimit(warmup.perInbox);
    setGapSeconds(warmup.gap);
    setShowAdvanced(true);
  };

  const startPowerSend = async () => {
    try {
      const { data } = await api.post('/pitches/power-send', {
        lead_ids: leadIds || null,
        max_leads: effectiveCount,
        per_account_limit: perAccountLimit,
        gap_seconds: gapSeconds,
        skip_inboxes: skipInboxes,
      });
      if (!data.success) throw new Error(data.error || 'Failed to start');
      setJobId(data.job_id);
      setPhase('running');
      startPolling(data.job_id);
    } catch (err) {
      toast.error(`Failed to start: ${err.message}`);
    }
  };

  const stopJob = async () => {
    if (!jobId) return;
    await api.post(`/pitches/power-send/${jobId}/stop`).catch(() => {});
    clearInterval(pollRef.current);
    setPhase('done');
  };

  const dismissInterrupted = async () => {
    if (jobId) await api.post(`/pitches/power-send/${jobId}/dismiss`).catch(() => {});
    onClose();
  };

  const resumeJob = async () => {
    if (!jobId) return;
    try {
      await api.post(`/pitches/power-send/${jobId}/dismiss`).catch(() => {});
      const { data: jobData } = await api.get(`/pitches/power-send/${jobId}`);
      const settings = { ...JSON.parse(jobData.job?.settings || '{}'), gap_seconds: 0 };
      const { data } = await api.post('/pitches/power-send', settings);
      if (!data.success) throw new Error(data.error);
      setJobId(data.job_id);
      setStats({ studied: 0, generated: 0, sent: 0, failed: 0, total: 0 });
      setFeed([]);
      setPhase('running');
      startPolling(data.job_id);
    } catch (err) {
      toast.error(`Resume failed: ${err.message}`);
    }
  };

  const pct = stats.total > 0 ? Math.round(((stats.sent + stats.failed) / stats.total) * 100) : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 560, maxHeight: 'calc(100vh - 32px)', background: 'var(--bg-surface)', borderRadius: 14, border: '1px solid rgba(var(--lime-rgb),0.2)', boxShadow: '0 0 60px rgba(var(--lime-rgb),0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(var(--lime-rgb),0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gradient-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(var(--lime-rgb),0.4)', flexShrink: 0 }}>
              <Zap size={20} color="#0a0a0c" />
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: 'var(--text-primary)', margin: 0 }}>Power Email Mode</h2>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent-primary)', letterSpacing: '0.18em', marginTop: 2 }}>AI-POWERED BULK OUTREACH</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {phase === 'running' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(var(--ok-rgb),0.1)', border: '1px solid rgba(var(--ok-rgb),0.3)', borderRadius: 6, padding: '4px 10px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ok)', letterSpacing: '0.1em' }}>RUNNING IN BACKGROUND</span>
              </div>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Confirm phase */}
        {phase === 'confirm' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>
              Generate hyper-personalized pitches with <strong style={{ color: 'var(--lime)' }}>Marcus AI</strong> and send across your connected inboxes. <strong style={{ color: 'var(--text-primary)' }}>Runs in background — close this window anytime.</strong>
            </p>

            {/* Warmup banner */}
            {warmup && (
              <div style={{ background: 'rgba(var(--ok-rgb),0.06)', border: '1px solid rgba(var(--ok-rgb),0.25)', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: warmup.color, boxShadow: `0 0 6px ${warmup.color}` }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: warmup.color, letterSpacing: '0.12em' }}>{warmup.label.toUpperCase()}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                    Safe max: <strong style={{ color: 'var(--text-primary)' }}>{warmup.perInbox * (inboxes.length || INBOX_COUNT)}/day</strong>
                    <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>·</span>
                    {warmup.desc}
                    {sentToday > 0 && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>({sentToday} sent today)</span>}
                  </p>
                </div>
              </div>
            )}

            {/* Count selector */}
            {!leadIds && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(var(--lime-rgb),0.25)', borderRadius: 10, padding: '16px 18px' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.14em', marginBottom: 10 }}>HOW MANY EMAILS TO SEND?</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {[10, 25, 50, 100, 200, 500].map(n => (
                    <button key={n} onClick={() => setCount(n)} style={{ flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: count === n ? 'var(--gradient-orange)' : 'var(--bg-elevated)', border: count === n ? 'none' : '1px solid var(--border-default)', color: count === n ? '#0a0a0c' : 'var(--text-secondary)', boxShadow: count === n ? '0 0 14px rgba(var(--lime-rgb),0.3)' : 'none', transition: 'all 0.15s' }}>
                      {n}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Custom:</span>
                  <input type="number" min={1} max={600} value={count} onChange={e => setCount(Math.min(600, Math.max(1, parseInt(e.target.value) || 1)))} style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '7px 12px', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, outline: 'none', textAlign: 'center' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>max 600</span>
                </div>
              </div>
            )}

            {/* Quick delay selector */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '14px 16px' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 10 }}>EMAIL DELAY TIMER</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {QUICK_DELAYS.map(({ label, secs }) => (
                  <button key={secs} onClick={() => setGapSeconds(secs)} style={{ flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: gapSeconds === secs ? 'var(--gradient-orange)' : 'var(--bg-elevated)', border: gapSeconds === secs ? 'none' : '1px solid var(--border-default)', color: gapSeconds === secs ? '#0a0a0c' : 'var(--text-secondary)', boxShadow: gapSeconds === secs ? '0 0 10px rgba(var(--lime-rgb),0.25)' : 'none' }}>
                    {label}
                  </button>
                ))}
              </div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 8 }}>
                {gapSeconds === 0 ? 'No delay — sends back to back' : `Wait ${gapSeconds < 60 ? `${gapSeconds}s` : `${gapSeconds / 60}min`} between each email`}
              </p>
            </div>

            {/* Delivery Controls */}
            <div style={{ border: '1px solid rgba(var(--lime-rgb),0.2)', borderRadius: 10, overflow: 'hidden' }}>
              <button onClick={() => setShowAdvanced(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', background: 'rgba(var(--lime-rgb),0.05)', border: 'none', cursor: 'pointer' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'var(--accent-primary)' }}>DELIVERY CONTROLS</span>
                {showAdvanced ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
              </button>
              {showAdvanced && (
                <div style={{ padding: '16px 18px', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 8 }}>MAX EMAILS PER INBOX (0 = UNLIMITED)</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="number" min={0} max={150} value={perAccountLimit} onChange={e => setPerAccountLimit(Math.max(0, parseInt(e.target.value) || 0))} style={{ width: 80, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, outline: 'none', textAlign: 'center' }} />
                      {perAccountLimit > 0
                        ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{activeInboxCount} × {perAccountLimit} = <strong style={{ color: 'var(--accent-primary)' }}>{activeInboxCount * perAccountLimit} total max</strong></span>
                        : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No per-inbox limit</span>}
                    </div>
                  </div>
                  <div>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 8 }}>GAP BETWEEN EMAILS</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {GAP_PRESETS.map(({ label, secs }) => (
                        <button key={secs} onClick={() => setGapSeconds(secs)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: gapSeconds === secs ? 'var(--gradient-orange)' : 'var(--bg-elevated)', border: gapSeconds === secs ? 'none' : '1px solid var(--border-default)', color: gapSeconds === secs ? '#0a0a0c' : 'var(--text-secondary)', boxShadow: gapSeconds === secs ? '0 0 10px rgba(var(--lime-rgb),0.25)' : 'none' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {inboxes.length > 0 && (
                    <div>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 8 }}>SENDING INBOXES (UNCHECK TO SKIP)</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {inboxes.map((inbox, idx) => {
                          const skipped = skipInboxes.includes(inbox.email);
                          const riskColor = inbox.bounceRate >= 8 ? '#FF4444' : inbox.bounceRate >= 4 ? '#FF9500' : 'var(--ok)';
                          const toggle = () => setSkipInboxes(prev =>
                            prev.includes(inbox.email) ? prev.filter(e => e !== inbox.email) : [...prev, inbox.email]
                          );
                          return (
                            <div key={inbox.email} onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 7, cursor: 'pointer', background: skipped ? 'rgba(255,68,68,0.06)' : 'var(--bg-elevated)', border: `1px solid ${skipped ? 'rgba(255,68,68,0.25)' : 'var(--border-default)'}`, opacity: skipped ? 0.6 : 1, transition: 'all 0.15s' }}>
                              <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${skipped ? '#666' : 'var(--accent-primary)'}`, background: skipped ? 'transparent' : 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {!skipped && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                              </div>
                              <span style={{ flex: 1, fontSize: 12, color: skipped ? 'var(--text-muted)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inbox.email}</span>
                              {inbox.sentCount > 0 && (
                                <span style={{ fontSize: 10, color: riskColor, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                                  {inbox.bounceRate}% bounce
                                  {inbox.bounceRate >= 8 && <span style={{ marginLeft: 4 }}>⚠</span>}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                ['Leads targeted', leadIds ? `${leadIds.length} selected` : perAccountLimit > 0 ? `${effectiveCount} (capped)` : `Top ${count} HOT leads`],
                ['AI persona', 'Marcus AI'],
                ['Sending accounts', `${activeInboxCount}/${inboxes.length || INBOX_COUNT} inboxes active`],
                ['Est. time', `~${estMins} min${estMins !== 1 ? 's' : ''}`],
              ].map(([label, val]) => (
                <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '12px 16px' }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: 4 }}>{label.toUpperCase()}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{val}</p>
                </div>
              ))}
            </div>

          </div>
          {/* Sticky send button */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', gap: 10, flexShrink: 0 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 13 }}>
              Cancel
            </button>
            <button onClick={startPowerSend} style={{ flex: 2, padding: '11px', borderRadius: 8, cursor: 'pointer', background: 'var(--gradient-orange)', color: '#0a0a0c', border: 'none', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 0 24px rgba(var(--lime-rgb),0.3)' }}>
              <Zap size={16} /> Fire {effectiveCount} Emails
            </button>
          </div>
          </div>
        )}

        {/* Interrupted phase */}
        {phase === 'interrupted' && (
          <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,165,0,0.15)', border: '1px solid rgba(255,165,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>⚡</div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>Job Interrupted</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                The server restarted while the job was running.<br />
                <strong style={{ color: 'var(--ok)' }}>{stats.sent} emails were already sent</strong> — they won't be re-sent.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <button onClick={dismissInterrupted} style={{ flex: 1, padding: '12px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 13 }}>Close</button>
              <button onClick={resumeJob} style={{ flex: 2, padding: '12px', borderRadius: 8, cursor: 'pointer', background: 'var(--gradient-orange)', color: '#0a0a0c', border: 'none', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 0 20px rgba(var(--lime-rgb),0.25)' }}>
                <Zap size={16} /> Resume Remaining
              </button>
            </div>
          </div>
        )}

        {/* Running / Done phase */}
        {(phase === 'running' || phase === 'done') && (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Counters */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'STUDIED',   val: stats.studied,   color: '#00B8D4' },
                { label: 'GENERATED', val: stats.generated, color: 'var(--lime)' },
                { label: 'SENT',      val: stats.sent,      color: 'var(--ok)' },
                { label: 'FAILED',    val: stats.failed,    color: '#FF4444' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: 'var(--bg-card)', border: `1px solid ${color}30`, borderRadius: 8, padding: '14px 0', textAlign: 'center' }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 700, color, lineHeight: 1, margin: 0 }}>{val}</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.14em', marginTop: 6 }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--gradient-orange)', borderRadius: 99, width: `${pct}%`, transition: 'width 0.6s ease' }} />
            </div>
            {stats.total > 0 && (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: -8 }}>
                {stats.sent + stats.failed} / {stats.total} processed ({pct}%)
              </p>
            )}

            {/* Live feed */}
            <div ref={feedRef} style={{ height: 200, overflowY: 'auto', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border-subtle)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {feed.length === 0 && phase === 'running' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
                  <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Starting job...
                </div>
              )}
              {feed.map((item, i) => <FeedItem key={i} item={item} />)}
            </div>

            {phase === 'running' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: 8, cursor: 'pointer', background: 'rgba(var(--ok-rgb),0.1)', border: '1px solid rgba(var(--ok-rgb),0.3)', color: 'var(--ok)', fontSize: 13, fontWeight: 600 }}>
                  Close Window (job keeps running)
                </button>
                <button onClick={stopJob} style={{ flex: 1, padding: '12px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', color: '#FF6666', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Square size={13} /> Stop Job
                </button>
              </div>
            )}

            {phase === 'done' && (
              <button onClick={onClose} style={{ padding: '12px', borderRadius: 8, cursor: 'pointer', background: 'var(--gradient-orange)', color: '#0a0a0c', border: 'none', fontSize: 14, fontWeight: 700, boxShadow: '0 0 20px rgba(var(--lime-rgb),0.25)' }}>
                Done — Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
