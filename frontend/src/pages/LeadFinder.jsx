import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import Icon from '../components/ui/Icon';
import api, { formatNumber } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const PLAN_RUN_LIMITS = { trial: 50, free: 100, starter: 500, pro: 2500, growth: 2500, agency: 10000 };

const NICHES = [
  { id: 'finance',    name: 'Finance',    count: '3.2k', color: 'var(--lime)' },
  { id: 'tech',       name: 'Tech',       count: '2.8k', color: 'var(--sky)' },
  { id: 'fitness',    name: 'Fitness',    count: '1.6k', color: 'var(--coral)' },
  { id: 'cooking',    name: 'Cooking',    count: '1.9k', color: 'var(--cream)' },
  { id: 'gaming',     name: 'Gaming',     count: '1.2k', color: 'var(--violet)' },
  { id: 'design',     name: 'Design',     count: '832',  color: 'var(--sky)' },
  { id: 'travel',     name: 'Travel',     count: '692',  color: 'var(--coral)' },
  { id: 'beauty',     name: 'Beauty',     count: '540',  color: 'var(--coral)' },
  { id: 'edu',        name: 'Education',  count: '418',  color: 'var(--lime)' },
  { id: 'business',   name: 'Business',   count: '2.1k', color: 'var(--cream)' },
  { id: 'saas',       name: 'SaaS',       count: '920',  color: 'var(--sky)' },
  { id: 'realestate', name: 'Real Estate',count: '480',  color: 'var(--ok)' },
];

const DEFAULT_SUBREDDITS = [
  'entrepreneur', 'smallbusiness', 'marketing', 'digitalmarketing',
  'YoutubeCreators', 'podcasting', 'SaaS', 'startups', 'ecommerce', 'freelance',
];

function ScorePill({ score }) {
  const s = score >= 90 ? { bg: 'var(--coral-soft)', color: 'var(--coral)', border: 'var(--coral-border)' }
          : score >= 80 ? { bg: 'var(--lime-soft)',  color: 'var(--lime)',  border: 'var(--lime-border)'  }
          :               { bg: 'var(--surface-2)',  color: 'var(--text-2)', border: 'var(--line)'        };
  return (
    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: '2px 8px', borderRadius: 4 }}>
      {score}
    </span>
  );
}

export default function LeadFinder() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState('youtube');

  // PowerMode
  const [selectedNiches, setSelectedNiches] = useState(new Set(['finance']));
  const [pmTargetCount, setPmTargetCount] = useState(100);
  const [pmMinSubs, setPmMinSubs] = useState('');
  const [pmMaxSubs, setPmMaxSubs] = useState('');
  const [pmCountry, setPmCountry] = useState('');
  const [pmRunning, setPmRunning] = useState(false);
  const [pmDone, setPmDone] = useState(false);
  const [pmStatus, setPmStatus] = useState(null);
  const [pmPolling, setPmPolling] = useState(false);
  const pmStartTime = useRef(null);

  // YouTube
  const [ytForm, setYtForm] = useState({ keyword: '', min_subs: 1000, max_subs: 500000, min_views: 100, max_results: 50, country: '', emailOnly: false });
  const [ytLoading, setYtLoading] = useState(false);
  const [ytLeads, setYtLeads] = useState([]);
  const [ytProgress, setYtProgress] = useState(null);
  const [ytSelected, setYtSelected] = useState(new Set());
  const [ytSearched, setYtSearched] = useState(false);
  const [quotaError, setQuotaError] = useState(false);

  // CSV Upload
  const [csvFile, setCsvFile] = useState(null);
  const [csvRows, setCsvRows] = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvDone, setCsvDone] = useState(null);
  const csvInputRef = useRef(null);

  useEffect(() => {
    if (!pmRunning) {
      setPmDone(false);
      setPmStatus(null);
    }
  }, [selectedNiches]); // eslint-disable-line react-hooks/exhaustive-deps

  // PowerMode polling
  useEffect(() => {
    if (!pmPolling) return;
    pmStartTime.current = pmStartTime.current || Date.now();
    const id = setInterval(async () => {
      try {
        const { data } = await api.get('/scraper/powermode/status');
        setPmStatus(data);
        if (!data.running) {
          setPmPolling(false);
          setPmRunning(false);
          setPmDone(true);
          pmStartTime.current = null;
          if (data.targetReached) {
            toast.success(`Got all ${data.targetCount} leads with emails.`);
          } else if (data.quotaExhausted) {
            toast(`Found ${data.stats?.withEmail ?? 0}/${data.targetCount} leads — quota reached for today`, { icon: '⚡' });
          } else if (data.saved > 0 && !data.stopped) {
            if (data.fallbackNiche) {
              toast.success(`${data.saved} leads saved — niche not seeded yet, delivered top leads from other niches.`);
            } else {
              toast.success(`Done — ${data.saved} leads saved.`);
            }
          } else if (data.saved === 0 && data.error) {
            toast.error(data.error, { duration: 5000 });
          }
        }
      } catch {}
    }, 2000);
    return () => clearInterval(id);
  }, [pmPolling]);

  const handlePowerModeStart = async () => {
    const runLimit = PLAN_RUN_LIMITS[user?.plan || 'free'] ?? 100;
    const target = Math.min(pmTargetCount, runLimit);
    try {
      const niches = [...selectedNiches];
      await api.post('/scraper/powermode/start', {
        niches, targetCount: target,
        ...(pmMinSubs ? { minSubs: parseInt(pmMinSubs) } : {}),
        ...(pmMaxSubs ? { maxSubs: parseInt(pmMaxSubs) } : {}),
        ...(pmCountry ? { country: pmCountry.trim().toUpperCase() } : {}),
      });
      setPmRunning(true);
      setPmDone(false);
      pmStartTime.current = Date.now();
      setPmPolling(true);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'PowerMode failed to start';
      if (e.response?.data?.upgradeRequired) {
        toast.error(msg, { duration: 5000 });
      } else {
        toast.error(msg);
      }
    }
  };

  const handlePowerModeStop = async () => {
    try {
      await api.post('/scraper/powermode/stop');
      setPmPolling(false);
      setPmRunning(false);
      toast('PowerMode stopped');
    } catch {}
  };

  const parseCsv = text => {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase().replace(/\s+/g, '_'));
    return lines.slice(1).map(line => {
      const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || line.split(',');
      const row = {};
      headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
      return row;
    }).filter(r => r.channel_name || r.name || r.channelname);
  };

  const handleCsvFile = file => {
    if (!file) return;
    setCsvFile(file);
    setCsvDone(null);
    const reader = new FileReader();
    reader.onload = e => {
      const rows = parseCsv(e.target.result);
      setCsvRows(rows.map(r => ({
        channel_name: r.channel_name || r.name || r.channelname || '',
        email: r.email || r.email_address || '',
        subscriber_count: parseInt(r.subscriber_count || r.subscribers || r.subs || '0') || 0,
        channel_url: r.channel_url || r.url || r.channel_handle || '',
        niche: r.niche || r.category || '',
      })));
    };
    reader.readAsText(file);
  };

  const handleCsvImport = async () => {
    if (!csvRows.length) return;
    setCsvImporting(true);
    try {
      const { data } = await api.post('/leads/import', { leads: csvRows });
      setCsvDone(data);
      toast.success(`${data.added} leads imported.`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Import failed');
    } finally {
      setCsvImporting(false);
    }
  };

  const handleYtSearch = async e => {
    e.preventDefault();
    if (!ytForm.keyword.trim()) { toast.error('Enter a keyword first'); return; }
    setYtLoading(true); setYtLeads([]); setYtSelected(new Set()); setYtSearched(false);
    setQuotaError(false); setYtProgress('Preparing search...');
    try {
      const response = await fetch('/api/leads/scrape/youtube/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          keyword: ytForm.keyword, minSubs: ytForm.min_subs, maxSubs: ytForm.max_subs,
          minViews: ytForm.min_views, maxResults: ytForm.max_results,
          country: ytForm.country || undefined, emailOnly: ytForm.emailOnly,
        }),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${response.status}`);
      }
      if (!response.body || !response.body.getReader) {
        const text = await response.text();
        const lines = text.split('\n').filter(l => l.trim());
        const fallbackLeads = [];
        for (const line of lines) {
          let event; try { event = JSON.parse(line); } catch { continue; }
          if (event.type === 'lead') fallbackLeads.push(event.lead);
          else if (event.type === 'done' || event.type === 'complete') {
            const all = fallbackLeads.length ? fallbackLeads : (event.leads ?? []);
            setYtLeads(all); setYtSearched(true); setYtProgress(null);
            if (all.length > 0) toast.success(`${all.length} leads delivered`);
            else toast('0 leads found — try a different keyword');
          } else if (event.type === 'error') { toast.error(event.message || 'Failed'); }
        }
        setYtLoading(false); return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const accumulatedLeads = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let event; try { event = JSON.parse(line); } catch { continue; }
          if (event.type === 'progress') {
            setYtProgress(event.message);
          } else if (event.type === 'lead') {
            accumulatedLeads.push(event.lead);
            setYtLeads([...accumulatedLeads]);
            setYtSearched(true);
          } else if (event.type === 'done') {
            setYtLeads([...accumulatedLeads]);
            setYtSearched(true);
            setYtProgress(null);
            if (accumulatedLeads.length > 0) toast.success(`${accumulatedLeads.length} lead${accumulatedLeads.length !== 1 ? 's' : ''} delivered instantly`);
            else toast('0 leads found — try a broader keyword');
          } else if (event.type === 'complete') {
            const leads = event.leads ?? [];
            setYtLeads(leads);
            setYtSearched(true);
            setYtProgress(null);
            const n = event.added ?? leads.length;
            if (n > 0) toast.success(`${n} lead${n !== 1 ? 's' : ''} added.`);
            else toast('0 leads found — try a different keyword');
          } else if (event.type === 'error') {
            setYtProgress(null);
            if (event.error_code === 'quota_exhausted') setQuotaError(true);
            else toast.error(event.message || 'Scrape failed');
          }
        }
      }
    } catch (err) {
      setYtProgress(null);
      toast.error(err.message || 'Scrape failed');
    } finally {
      setYtLoading(false);
      setYtProgress(null);
    }
  };

  const currentLeads = ytLeads;
  const currentSelected = ytSelected;
  const toggleSelected = id => setYtSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const isLoading = ytLoading;

  const toggleNiche = id => {
    const n = new Set(selectedNiches);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelectedNiches(n);
  };

  return (
    <div className="page">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16,1,0.3,1] }}
        className="page__head"
      >
        <div>
          <h1 className="page__title">Lead Finder — <em>tell the agent who you want. It scrapes, enriches, scores.</em></h1>
        </div>
        <div className="page__actions">
          <AnimatePresence>
            {currentSelected.size > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="row"
                style={{ gap: 6 }}
              >
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="btn btn--ghost" onClick={() => toast.promise(api.post('/pitches/bulk-generate', { lead_ids: [...currentSelected] }), { loading: 'Generating...', success: 'Pitches queued!', error: 'Failed' })}>
                  <Icon name="sparkle" size={13} />Pitch {currentSelected.size}
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="btn btn--ghost" onClick={() => toast.promise(api.post('/emails/queue/bulk', { lead_ids: [...currentSelected] }), { loading: 'Adding...', success: 'Added to queue!', error: 'Failed' })}>
                  <Icon name="mail" size={13} />Queue {currentSelected.size}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Source tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {[
          { id: 'youtube', label: 'YouTube',    sub: 'channels + Shorts' },
          { id: 'upload',  label: 'Upload CSV', sub: 'import your own list' },
        ].map(t => (
          <div key={t.id} className={`tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)} style={{ padding: '10px 16px' }}>
            <div style={{ fontWeight: 500 }}>{t.label}</div>
            <div className="muted" style={{ fontSize: 10.5, marginTop: 1 }}>{t.sub}</div>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {/* ── YouTube: PowerMode + manual search ── */}
          {tab === 'youtube' && (
            <>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.35, ease: [0.16,1,0.3,1] }}
                className="pm"
              >
                <div className="pm__head">
                  <div className="pm__icon"><Icon name="bolt" size={18} /></div>
                  <div style={{ flex: 1 }}>
                    <div className="pm__title">PowerMode</div>
                    <div className="pm__sub">One-click discovery. Pick niches, hit go, watch it work.</div>
                  </div>
                  {pmRunning
                    ? <motion.button whileTap={{ scale: 0.97 }} className="btn btn--ghost btn--sm" onClick={handlePowerModeStop}><Icon name="pause" size={12} />Stop</motion.button>
                    : <button className="btn btn--ghost btn--sm"><Icon name="sliders" size={12} />Advanced filters</button>
                  }
                </div>

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
                  <div className="field">
                    <div className="field__label">Min subscribers</div>
                    <input className="input" type="number" placeholder="e.g. 10000" value={pmMinSubs} onChange={e => setPmMinSubs(e.target.value)} disabled={pmRunning} />
                  </div>
                  <div className="field">
                    <div className="field__label">Max subscribers</div>
                    <input className="input" type="number" placeholder="e.g. 500000" value={pmMaxSubs} onChange={e => setPmMaxSubs(e.target.value)} disabled={pmRunning} />
                  </div>
                  <div className="field">
                    <div className="field__label">Country (optional)</div>
                    <input className="input" placeholder="US, GB, IN…" value={pmCountry} onChange={e => setPmCountry(e.target.value)} disabled={pmRunning} maxLength={2} />
                  </div>
                </div>

                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 18, marginBottom: 8 }}>Pick niches</div>
                <div className="pm__niches">
                  {NICHES.map((n, i) => (
                    <motion.button
                      key={n.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.03 }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className={`pm__niche ${selectedNiches.has(n.id) ? 'is-active' : ''}`}
                      onClick={() => toggleNiche(n.id)}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.color, display: 'inline-block', flexShrink: 0 }} />
                      {n.name}
                      <span className="pill">{n.count}</span>
                    </motion.button>
                  ))}
                </div>

                {/* Target count input */}
                <div style={{ marginTop: 18, marginBottom: 4 }}>
                  <div className="field__label" style={{ marginBottom: 6 }}>How many leads do you want?</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      className="input"
                      type="number"
                      min={10}
                      max={PLAN_RUN_LIMITS[user?.plan || 'free'] ?? 100}
                      value={pmTargetCount}
                      onChange={e => setPmTargetCount(Math.max(10, Math.min(parseInt(e.target.value) || 10, PLAN_RUN_LIMITS[user?.plan || 'free'] ?? 100)))}
                      style={{ width: 100, fontFamily: 'var(--f-mono)', textAlign: 'center' }}
                      disabled={pmRunning}
                    />
                    <span className="muted" style={{ fontSize: 12 }}>
                      leads with verified emails · max {(PLAN_RUN_LIMITS[user?.plan || 'free'] ?? 100).toLocaleString()} on {user?.plan || 'free'} plan
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                    We'll keep searching until we find exactly <strong style={{ color: 'var(--lime)' }}>{pmTargetCount}</strong> leads with verified emails.
                  </div>
                </div>

                <motion.button
                  whileHover={!pmRunning ? { scale: 1.01, y: -1 } : {}}
                  whileTap={!pmRunning ? { scale: 0.98 } : {}}
                  className="pm__cta"
                  style={{ marginTop: 14 }}
                  onClick={handlePowerModeStart}
                  disabled={pmRunning}
                >
                  {pmRunning
                    ? <><span className="dot dot--pulse" style={{ background: '#0a0a0c', width: 8, height: 8 }} /> Finding leads with emails...</>
                    : <>
                        <Icon name="bolt" size={16} />
                        Find {pmTargetCount} {selectedNiches.size === 1 ? [...selectedNiches].map(id => NICHES.find(n => n.id === id)?.name || id)[0] : `${selectedNiches.size}-niche`} Leads
                        <span className="sub">with emails · {selectedNiches.size} niche{selectedNiches.size === 1 ? '' : 's'}</span>
                      </>
                  }
                </motion.button>

                <AnimatePresence>
                  {(pmRunning || pmDone) && pmStatus?.targetCount && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pm__feed"
                    >
                      {/* Progress */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                          <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
                            <span style={{ color: 'var(--ok)', fontSize: 22 }}>{pmStatus.stats?.withEmail ?? 0}</span>
                            <span className="muted"> / {pmStatus.targetCount} leads with emails</span>
                          </span>
                          <span className="muted mono" style={{ fontSize: 10 }}>
                            {pmDone
                              ? (pmStatus.targetReached ? 'Complete' : pmStatus.quotaExhausted ? 'Quota reached' : 'Done')
                              : (() => {
                                  const found = pmStatus.stats?.withEmail ?? 0;
                                  const elapsed = pmStartTime.current ? (Date.now() - pmStartTime.current) / 1000 : 0;
                                  if (found < 2 || elapsed < 10) return 'Estimating...';
                                  const rate = found / elapsed;
                                  const remaining = Math.ceil((pmStatus.targetCount - found) / rate);
                                  if (remaining <= 0) return 'Almost done';
                                  if (remaining < 60) return `~${remaining}s left`;
                                  return `~${Math.ceil(remaining / 60)} min left`;
                                })()
                            }
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}>
                          <motion.div
                            animate={{ width: `${Math.min(100, Math.round(((pmStatus.stats?.withEmail ?? 0) / pmStatus.targetCount) * 100))}%` }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                            style={{
                              height: '100%', borderRadius: 3,
                              background: pmStatus.targetReached ? 'var(--ok)' : pmStatus.quotaExhausted ? 'var(--warn)' : 'var(--lime)',
                            }}
                          />
                        </div>
                      </div>

                      {/* Status line */}
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        {pmDone ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span>
                              {pmStatus.targetReached
                                ? `All ${pmStatus.targetCount} leads saved to CRM.`
                                : pmStatus.quotaExhausted
                                  ? `Found ${pmStatus.stats?.withEmail ?? 0}/${pmStatus.targetCount} leads. Daily quota reached — come back tomorrow.`
                                  : pmStatus.saved === 0 && pmStatus.error
                                    ? pmStatus.error
                                    : `Found ${pmStatus.stats?.withEmail ?? 0} leads with emails.`}
                              {pmStatus.fallbackNiche && pmStatus.saved > 0 && (
                                <span className="muted" style={{ marginLeft: 6 }}>(niche not yet seeded — delivered top leads from other niches)</span>
                              )}
                            </span>
                            {pmStatus.saved > 0 && (
                              <>
                                <button className="btn btn--ghost btn--sm" onClick={async () => {
                                  try {
                                    const { data } = await api.get('/leads', { params: { limit: pmStatus.saved || 50, sort: 'created_at', order: 'desc' } });
                                    const arr = Array.isArray(data.leads) ? data.leads : Array.isArray(data) ? data : [];
                                    if (arr.length > 0) { setYtLeads(arr); setYtSearched(true); toast.success(`${arr.length} leads loaded`); }
                                  } catch { toast.error('Failed to load leads'); }
                                }}>
                                  View here <Icon name="eye" size={11} />
                                </button>
                                <button className="btn btn--ghost btn--sm" onClick={() => navigate('/crm')}>
                                  CRM <Icon name="arrowR" size={11} />
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="muted mono" style={{ fontSize: 10 }}>
                            {pmStatus.currentKeywords?.[0] ? `Searching "${pmStatus.currentKeywords[0]}"...` : 'Starting up...'}
                            {pmStatus.keywordsTotal > 0 && <span style={{ marginLeft: 8 }}>{pmStatus.keywordsDone ?? 0}/{pmStatus.keywordsTotal} keywords</span>}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Manual keyword search */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.35, ease: [0.16,1,0.3,1] }}
                className="card"
                style={{ marginBottom: 20 }}
              >
                <form onSubmit={handleYtSearch}>
                  <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Manual keyword search</div>
                  <div className="grid" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div className="field"><div className="field__label">Keyword *</div><input className="input" value={ytForm.keyword} onChange={e => setYtForm(f => ({ ...f, keyword: e.target.value }))} placeholder="e.g. business automation" required /></div>
                    <div className="field"><div className="field__label">Min Subs</div><input className="input" type="number" value={ytForm.min_subs} onChange={e => setYtForm(f => ({ ...f, min_subs: Number(e.target.value) }))} /></div>
                    <div className="field"><div className="field__label">Max Subs</div><input className="input" type="number" value={ytForm.max_subs} onChange={e => setYtForm(f => ({ ...f, max_subs: Number(e.target.value) }))} /></div>
                    <div className="field"><div className="field__label">Max Results</div><input className="input" type="number" value={ytForm.max_results} onChange={e => setYtForm(f => ({ ...f, max_results: Number(e.target.value) }))} /></div>
                    <div className="field"><div className="field__label">Min Views</div><input className="input" type="number" value={ytForm.min_views} onChange={e => setYtForm(f => ({ ...f, min_views: Number(e.target.value) }))} /></div>
                    <div className="field"><div className="field__label">Country</div><input className="input" value={ytForm.country} onChange={e => setYtForm(f => ({ ...f, country: e.target.value }))} placeholder="US" /></div>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={ytForm.emailOnly} onChange={e => setYtForm(f => ({ ...f, emailOnly: e.target.checked }))} />
                      <span style={{ fontSize: 12 }}>Email required</span>
                    </label>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      className="btn btn--primary"
                      type="submit"
                      disabled={ytLoading}
                    >
                      <Icon name="search" size={13} />
                      {ytLoading ? (ytProgress || 'Scanning...') : 'Find Leads'}
                    </motion.button>
                  </div>
                </form>
              </motion.div>

              <AnimatePresence>
                {quotaError && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="card"
                    style={{ borderColor: 'var(--coral-border)', background: 'var(--coral-soft)', marginBottom: 20 }}
                  >
                    <div className="row" style={{ gap: 12 }}>
                      <Icon name="clock" size={18} style={{ color: 'var(--warn)', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>YouTube API quota reached for today</div>
                        <div className="muted" style={{ fontSize: 12 }}>Daily limit resets at midnight Pacific Time. Add more API keys in Settings to continue.</div>
                      </div>
                      <button className="btn btn--ghost btn--sm" onClick={() => navigate('/settings')}>Add API Key</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* ── Upload CSV ── */}
          {tab === 'upload' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16,1,0.3,1] }}
              className="pm"
              style={{ marginBottom: 20 }}
            >
              <div className="pm__head">
                <div className="pm__icon"><Icon name="upload" size={18} /></div>
                <div style={{ flex: 1 }}>
                  <div className="pm__title">Upload CSV</div>
                  <div className="pm__sub">Import your own list. Required column: <span className="mono" style={{ fontSize: 11 }}>channel_name</span>. Optional: <span className="mono" style={{ fontSize: 11 }}>email, subscriber_count, channel_url, niche</span></div>
                </div>
              </div>

              <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                onChange={e => handleCsvFile(e.target.files[0])} />

              <AnimatePresence mode="wait">
                {!csvRows.length && !csvDone ? (
                  <motion.div
                    key="dropzone"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => csvInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); handleCsvFile(e.dataTransfer.files[0]); }}
                    style={{ padding: '40px', textAlign: 'center', border: '2px dashed var(--line)', borderRadius: 'var(--r)', marginTop: 12, cursor: 'pointer', transition: 'border-color .2s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--lime)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}
                  >
                    <motion.div
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <Icon name="upload" size={28} style={{ color: 'var(--text-3)', display: 'block', margin: '0 auto 10px' }} />
                    </motion.div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Drag & drop a CSV or click to browse</div>
                    <div className="muted" style={{ fontSize: 11 }}>Required: channel_name · Optional: email, subscriber_count, channel_url, niche</div>
                  </motion.div>
                ) : csvRows.length > 0 && !csvDone ? (
                  <motion.div key="preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <div style={{ marginTop: 14, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13 }}><strong style={{ color: 'var(--lime)' }}>{csvRows.length}</strong> leads ready to import · {csvRows.filter(r => r.email).length} have emails</span>
                      <button className="btn btn--ghost btn--sm" onClick={() => { setCsvRows([]); setCsvFile(null); }}>
                        <Icon name="x" size={11} />Clear
                      </button>
                    </div>
                    <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--r)', marginBottom: 14 }}>
                      <table className="tbl">
                        <thead>
                          <tr><th>Channel name</th><th>Email</th><th>Subs</th><th>Niche</th></tr>
                        </thead>
                        <tbody>
                          {csvRows.slice(0, 50).map((r, i) => (
                            <tr key={i}>
                              <td style={{ fontSize: 12.5 }}>{r.channel_name || '—'}</td>
                              <td className="mono" style={{ fontSize: 11, color: r.email ? 'var(--ok)' : 'var(--text-3)' }}>{r.email || '—'}</td>
                              <td className="num" style={{ fontSize: 12 }}>{r.subscriber_count ? r.subscriber_count.toLocaleString() : '—'}</td>
                              <td style={{ fontSize: 12 }}>{r.niche || '—'}</td>
                            </tr>
                          ))}
                          {csvRows.length > 50 && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', fontSize: 12 }}>+{csvRows.length - 50} more</td></tr>}
                        </tbody>
                      </table>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.01, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      className="pm__cta"
                      onClick={handleCsvImport}
                      disabled={csvImporting}
                    >
                      {csvImporting
                        ? <><span className="dot dot--pulse" style={{ background: '#0a0a0c', width: 8, height: 8 }} /> Importing...</>
                        : <><Icon name="upload" size={16} />Import {csvRows.length} leads to CRM</>
                      }
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{ marginTop: 14, padding: '14px 16px', background: 'var(--lime-soft)', border: '1px solid var(--lime-border)', borderRadius: 'var(--r)' }}
                  >
                    <div style={{ fontSize: 13, color: 'var(--lime)', fontWeight: 600, marginBottom: 4 }}>
                      Import complete — {csvDone?.added} leads added to CRM
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>{csvDone?.skipped} skipped (duplicates or missing name)</div>
                    <button className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} onClick={() => { setCsvRows([]); setCsvFile(null); setCsvDone(null); }}>
                      Import another file
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Loading state ── */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            <span className="dot dot--pulse" />
            {ytProgress || 'Scanning YouTube channels...'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results ── */}
      <AnimatePresence>
        {!isLoading && currentLeads.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16,1,0.3,1] }}
          >
            <div className="section-head">
              <h3>
                {currentLeads.length} creators found ·{' '}
                <span className="mono" style={{ color: 'var(--coral)' }}>
                  {currentLeads.filter(l => (l.lead_score ?? 0) >= 90).length} A+ score
                </span>
              </h3>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn--ghost btn--sm"><Icon name="filter" size={11} />Filter</button>
                <button className="btn btn--ghost btn--sm"><Icon name="sort" size={11} />Sort: Score</button>
                <button className="btn btn--ghost btn--sm"><Icon name="arrowDown" size={11} />Export CSV</button>
                {currentSelected.size > 0 && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="btn btn--sm"
                    style={{ background: 'var(--coral-soft)', color: 'var(--coral)', borderColor: 'var(--coral-border)' }}
                    onClick={() => toast.promise(api.post('/pitches/generate/bulk', { lead_ids: [...currentSelected] }), { loading: 'Generating...', success: 'Pitches queued!', error: 'Failed' })}
                  >
                    <Icon name="rocket" size={11} />Send to Pitch Gen
                  </motion.button>
                )}
              </div>
            </div>

            <div className="card" style={{ overflow: 'hidden' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox" onChange={e => {
                        setYtSelected(e.target.checked ? new Set(ytLeads.map(l => l.id)) : new Set());
                      }} />
                    </th>
                    <th>Creator</th>
                    <th>Niche</th><th className="num">Subs</th><th className="num">Est. CPM</th><th>Last upload</th>
                    <th>Email</th>
                    <th className="num">Score</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {currentLeads.map((lead, i) => (
                    <motion.tr
                      key={lead.id || i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.4), duration: 0.3 }}
                    >
                      <td>
                        <input type="checkbox" checked={currentSelected.has(lead.id)} onChange={() => toggleSelected(lead.id)} />
                      </td>
                      <td>
                        <div className="row" style={{ cursor: 'pointer', gap: 8 }} onClick={() => navigate(`/leads/${lead.id}`)}>
                          <span className="ava" style={{ fontSize: 11, flexShrink: 0 }}>
                            {(lead.channel_name || '?')[0].toUpperCase()}
                          </span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{lead.channel_name}</div>
                            {lead.email && <span className="mono" style={{ fontSize: 9, color: 'var(--ok)', letterSpacing: '.08em' }}>EMAIL FOUND</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--lime-soft)', color: 'var(--lime)', border: '1px solid var(--lime-border)' }}>
                          {lead.niche || 'General'}
                        </span>
                      </td>
                      <td className="num">{formatNumber(lead.subscriber_count ?? 0)}</td>
                      <td className="num" style={{ color: 'var(--lime)' }}>{lead.cpm ? `$${lead.cpm}` : '—'}</td>
                      <td className="muted" style={{ fontSize: 11.5 }}>{lead.days_since_upload ? `${lead.days_since_upload}d ago` : '—'}</td>
                      <td className="mono" style={{ color: lead.email ? 'var(--ok)' : 'var(--text-3)', fontSize: 13 }}>
                        {lead.email ? '✓' : '–'}
                      </td>
                      <td className="num"><ScorePill score={lead.lead_score ?? 0} /></td>
                      <td>
                        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn btn--ghost btn--sm" title="Analyze" onClick={() => navigate(`/leads/${lead.id}`)}>
                            <Icon name="eye" size={12} />
                          </button>
                          <button className="btn btn--ghost btn--sm" title="Pitch" onClick={() => navigate(`/pitch?lead=${lead.id}`)}>
                            <Icon name="sparkle" size={12} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      <AnimatePresence>
        {!isLoading && tab === 'youtube' && ytSearched && ytLeads.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="card"
            style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-3)', fontSize: 13 }}
          >
            Nothing came back. Try a different keyword, drop the subscriber floor, or turn off "email only".
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
