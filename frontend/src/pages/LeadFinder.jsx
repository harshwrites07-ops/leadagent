import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [pmRunning, setPmRunning] = useState(false);
  const [pmDone, setPmDone] = useState(false);
  const [pmStatus, setPmStatus] = useState(null);
  const [pmPolling, setPmPolling] = useState(false);
  const [pmFeed, setPmFeed] = useState([]);

  // YouTube
  const [ytForm, setYtForm] = useState({ keyword: '', min_subs: 1000, max_subs: 500000, min_views: 100, max_results: 50, country: '', emailOnly: false });
  const [ytLoading, setYtLoading] = useState(false);
  const [ytLeads, setYtLeads] = useState([]);
  const [ytProgress, setYtProgress] = useState(null);
  const [ytSelected, setYtSelected] = useState(new Set());
  const [ytSearched, setYtSearched] = useState(false);
  const [quotaError, setQuotaError] = useState(false);

  // Reddit
  const [rdKeyword, setRdKeyword] = useState('');
  const [rdSubreddits, setRdSubreddits] = useState(new Set(DEFAULT_SUBREDDITS));
  const [rdLoading, setRdLoading] = useState(false);
  const [rdLeads, setRdLeads] = useState([]);
  const [rdSelected, setRdSelected] = useState(new Set());

  // Viral
  const [viralKeyword, setViralKeyword] = useState('');
  const [viralLoading, setViralLoading] = useState(false);
  const [viralLeads, setViralLeads] = useState([]);

  // Competitor
  const [compForm, setCompForm] = useState({ competitor: '', keywords: '' });
  const [compLoading, setCompLoading] = useState(false);
  const [compLeads, setCompLeads] = useState([]);

  // PowerMode polling
  useEffect(() => {
    if (!pmPolling) return;
    const id = setInterval(async () => {
      try {
        const { data } = await api.get('/scraper/powermode/status');
        setPmStatus(data);
        if (data.recentLeads?.length) {
          setPmFeed(prev => {
            const existing = new Set(prev.map(f => f.name));
            const newOnes = data.recentLeads
              .filter(l => !existing.has(l.channel_name))
              .map(l => ({ name: l.channel_name, subs: l.subscriber_count, temp: l.temperature, hasEmail: l.hasEmail, email: l.email }));
            return [...prev, ...newOnes].slice(-30);
          });
        }
        if (!data.running) {
          setPmPolling(false);
          setPmRunning(false);
          setPmDone(true);
          if (data.targetReached) {
            toast.success(`Found all ${data.targetCount} leads with emails!`);
          } else if (data.quotaExhausted) {
            toast(`Found ${data.stats?.withEmail ?? 0}/${data.targetCount} leads — quota reached for today`, { icon: '⚡' });
          } else if (data.saved > 0 && !data.stopped) {
            toast.success(`PowerMode complete — ${data.saved} leads saved!`);
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
      await api.post('/scraper/powermode/start', { niches, targetCount: target });
      setPmRunning(true);
      setPmDone(false);
      setPmFeed([]);
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

  // YouTube search (streaming)
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
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
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
          } else if (event.type === 'complete') {
            setYtLeads(event.leads ?? []);
            setYtSearched(true);
            setYtProgress(null);
            const n = event.added ?? 0;
            if (n > 0) toast.success(`Found ${n} qualified lead${n !== 1 ? 's' : ''}!`);
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

  const handleRdSearch = async e => {
    e.preventDefault();
    if (!rdKeyword.trim()) { toast.error('Enter a keyword first'); return; }
    setRdLoading(true); setRdLeads([]); setRdSelected(new Set());
    try {
      const { data } = await api.post('/leads/scrape/reddit', { keyword: rdKeyword, subreddits: [...rdSubreddits] });
      setRdLeads(data.leads ?? []);
      toast.success(`Found ${data.leads?.length ?? 0} Reddit leads!`);
    } catch (err) { toast.error(err.message ?? 'Scrape failed'); }
    finally { setRdLoading(false); }
  };

  const handleViralDetect = async e => {
    e.preventDefault();
    if (!viralKeyword.trim()) { toast.error('Enter a niche keyword'); return; }
    setViralLoading(true); setViralLeads([]);
    try {
      const { data } = await api.post('/scraper/viral-detector', { keyword: viralKeyword });
      setViralLeads(data.viral_leads ?? []);
      toast.success(`Found ${data.viral_leads?.length ?? 0} viral opportunities!`);
    } catch (err) { toast.error(err.message ?? 'Detection failed'); }
    finally { setViralLoading(false); }
  };

  const handleCompSpy = async e => {
    e.preventDefault();
    if (!compForm.competitor.trim()) { toast.error('Enter a competitor name'); return; }
    setCompLoading(true); setCompLeads([]);
    try {
      const { data } = await api.post('/scraper/competitor-spy', {
        competitor_name: compForm.competitor,
        competitor_keywords: compForm.keywords,
      });
      setCompLeads(data.leads ?? []);
      toast.success(`Found ${data.leads?.length ?? 0} competitor leads!`);
    } catch (err) { toast.error(err.message ?? 'Spy failed'); }
    finally { setCompLoading(false); }
  };

  const currentLeads = tab === 'youtube' ? ytLeads
    : tab === 'reddit' ? rdLeads
    : tab === 'viral' ? viralLeads
    : compLeads;

  const currentSelected = tab === 'youtube' ? ytSelected : tab === 'reddit' ? rdSelected : new Set();

  const toggleSelected = id => {
    if (tab === 'youtube') setYtSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    else if (tab === 'reddit') setRdSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const isLoading = tab === 'youtube' ? ytLoading
    : tab === 'reddit' ? rdLoading
    : tab === 'viral' ? viralLoading
    : compLoading;

  const toggleNiche = id => {
    const n = new Set(selectedNiches);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelectedNiches(n);
  };

  const toggleRdSub = sub => {
    const n = new Set(rdSubreddits);
    n.has(sub) ? n.delete(sub) : n.add(sub);
    setRdSubreddits(n);
  };

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Lead Finder — <em>tell the agent who you want. It scrapes, enriches, scores.</em></h1>
        </div>
        <div className="page__actions">
          {currentSelected.size > 0 && (
            <>
              <button className="btn btn--ghost" onClick={() => toast.promise(api.post('/pitches/generate/bulk', { lead_ids: [...currentSelected] }), { loading: 'Generating...', success: 'Pitches queued!', error: 'Failed' })}>
                <Icon name="sparkle" size={13} />Pitch {currentSelected.size}
              </button>
              <button className="btn btn--ghost" onClick={() => toast.promise(api.post('/emails/queue/bulk', { lead_ids: [...currentSelected] }), { loading: 'Adding...', success: 'Added to queue!', error: 'Failed' })}>
                <Icon name="mail" size={13} />Queue {currentSelected.size}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Source tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {[
          { id: 'youtube',    label: 'YouTube',    sub: 'channels + Shorts' },
          { id: 'reddit',     label: 'Reddit',     sub: 'authors + subreddits' },
          { id: 'viral',      label: 'Viral',      sub: 'trending in your niche' },
          { id: 'competitor', label: 'Competitor', sub: 'who they sponsor' },
          { id: 'upload',     label: 'Upload CSV', sub: 'enrich your list' },
        ].map(t => (
          <div key={t.id} className={`tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)} style={{ padding: '10px 16px' }}>
            <div style={{ fontWeight: 500 }}>{t.label}</div>
            <div className="muted" style={{ fontSize: 10.5, marginTop: 1 }}>{t.sub}</div>
          </div>
        ))}
      </div>

      {/* ── YouTube: PowerMode + manual search ── */}
      {tab === 'youtube' && (
        <>
          <div className="pm">
            <div className="pm__head">
              <div className="pm__icon"><Icon name="bolt" size={18} /></div>
              <div style={{ flex: 1 }}>
                <div className="pm__title">PowerMode</div>
                <div className="pm__sub">One-click discovery. Pick niches, hit go, watch it work.</div>
              </div>
              {pmRunning
                ? <button className="btn btn--ghost btn--sm" onClick={handlePowerModeStop}><Icon name="pause" size={12} />Stop</button>
                : <button className="btn btn--ghost btn--sm"><Icon name="sliders" size={12} />Advanced filters</button>
              }
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
              <div className="field"><div className="field__label">Sub range</div><input className="input" defaultValue="50k – 500k" /></div>
              <div className="field"><div className="field__label">Geo</div><input className="input" defaultValue="US, UK, CA, AU" /></div>
              <div className="field"><div className="field__label">Posting cadence</div><input className="input" defaultValue="≥ 1 / week" /></div>
              <div className="field"><div className="field__label">Last upload</div><input className="input" defaultValue="within 14 days" /></div>
            </div>

            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 18, marginBottom: 8 }}>Pick niches</div>
            <div className="pm__niches">
              {NICHES.map(n => (
                <button key={n.id} className={`pm__niche ${selectedNiches.has(n.id) ? 'is-active' : ''}`} onClick={() => toggleNiche(n.id)}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.color, display: 'inline-block', flexShrink: 0 }} />
                  {n.name}
                  <span className="pill">{n.count}</span>
                </button>
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

            <button className="pm__cta" style={{ marginTop: 14 }} onClick={handlePowerModeStart} disabled={pmRunning}>
              {pmRunning
                ? <><span className="dot dot--pulse" style={{ background: '#0a0a0c', width: 8, height: 8 }} /> Finding leads with emails...</>
                : <>
                    <Icon name="bolt" size={16} />
                    Find {pmTargetCount} {selectedNiches.size === 1 ? [...selectedNiches].map(id => NICHES.find(n => n.id === id)?.name || id)[0] : `${selectedNiches.size}-niche`} Leads
                    <span className="sub">with emails · {selectedNiches.size} niche{selectedNiches.size === 1 ? '' : 's'}</span>
                  </>
              }
            </button>

            {(pmRunning || pmDone) && (
              <div className="pm__feed">
                {/* Target progress bar */}
                {pmStatus?.targetCount && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
                        <span style={{ color: 'var(--ok)', fontSize: 22 }}>{pmStatus.stats?.withEmail ?? 0}</span>
                        <span className="muted"> / {pmStatus.targetCount} leads with emails</span>
                      </span>
                      <span className="muted mono" style={{ fontSize: 10 }}>
                        {pmDone
                          ? pmStatus.targetReached ? 'Complete' : pmStatus.quotaExhausted ? 'Quota reached' : 'Done'
                          : `${Math.round(((pmStatus.stats?.withEmail ?? 0) / pmStatus.targetCount) * 100)}%`
                        }
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3, transition: 'width .5s ease',
                        background: pmStatus.targetReached ? 'var(--ok)' : pmStatus.quotaExhausted ? 'var(--warn)' : 'var(--lime)',
                        width: `${Math.min(100, Math.round(((pmStatus.stats?.withEmail ?? 0) / pmStatus.targetCount) * 100))}%`,
                      }} />
                    </div>
                  </div>
                )}

                {/* Completion message */}
                {pmDone && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 'var(--r)', marginBottom: 12, fontSize: 13,
                    background: pmStatus?.targetReached ? 'var(--lime-soft)' : 'var(--surface-2)',
                    border: `1px solid ${pmStatus?.targetReached ? 'var(--lime-border)' : 'var(--line)'}`,
                    color: pmStatus?.targetReached ? 'var(--lime)' : 'var(--text-2)',
                  }}>
                    {pmStatus?.targetReached
                      ? `Found all ${pmStatus.targetCount} leads with emails!`
                      : pmStatus?.quotaExhausted
                        ? `Found ${pmStatus.stats?.withEmail ?? 0}/${pmStatus.targetCount} leads. Daily quota reached — come back tomorrow.`
                        : `Found ${pmStatus.stats?.withEmail ?? 0} leads with emails.`
                    }
                    {pmStatus?.saved > 0 && (
                      <button className="btn btn--ghost btn--sm" style={{ marginLeft: 10 }} onClick={() => navigate('/crm')}>
                        View in CRM <Icon name="arrowR" size={11} />
                      </button>
                    )}
                  </div>
                )}

                {/* Live stats counters */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
                  {[
                    { label: 'FOUND', value: pmStatus?.total ?? 0, color: 'var(--lime)' },
                    { label: 'EMAILS', value: pmStatus?.stats?.withEmail ?? 0, color: 'var(--ok)' },
                    { label: 'HOT', value: pmStatus?.stats?.hot ?? 0, color: 'var(--coral)' },
                    { label: 'WARM', value: pmStatus?.stats?.warm ?? 0, color: 'var(--sky)' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', textAlign: 'center' }}>
                      <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div className="muted mono" style={{ fontSize: 9, letterSpacing: '.08em' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Keyword progress */}
                {pmRunning && pmStatus?.keywordsTotal > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span className="muted mono" style={{ fontSize: 10 }}>
                        {pmStatus.currentKeywords?.[0] ? `Searching "${pmStatus.currentKeywords[0]}"...` : 'Starting...'}
                      </span>
                      <span className="muted mono" style={{ fontSize: 10 }}>{pmStatus.keywordsDone ?? 0}/{pmStatus.keywordsTotal} keywords</span>
                    </div>
                    <div style={{ height: 2, borderRadius: 1, background: 'var(--surface-3)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: 'var(--lime)', opacity: .5, borderRadius: 1, width: `${Math.round(((pmStatus.keywordsDone ?? 0) / (pmStatus.keywordsTotal ?? 1)) * 100)}%`, transition: 'width .4s ease' }} />
                    </div>
                  </div>
                )}

                <div className="row" style={{ marginBottom: 6, justifyContent: 'space-between' }}>
                  <div className="row" style={{ gap: 6 }}>
                    <Icon name="bolt" size={11} style={{ color: 'var(--lime)' }} />
                    <span className="mono" style={{ fontSize: 10, color: 'var(--lime)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Live feed</span>
                  </div>
                  <span className="muted mono" style={{ fontSize: 10 }}>{pmStatus?.saved ?? 0} saved to CRM</span>
                </div>
                {pmFeed.filter(f => f.hasEmail).map((f, i) => (
                  <div key={i} className={`pm__feed-row ${i === 0 && pmRunning ? 'is-new' : ''}`}>
                    <span className="ts">{new Date().toTimeString().slice(3, 8)}</span>
                    <span style={{ color: 'var(--ok)' }}>✉</span>
                    <span>{f.name} · {f.subs >= 1000000 ? `${(f.subs / 1000000).toFixed(1)}M` : f.subs >= 1000 ? `${Math.round(f.subs / 1000)}k` : (f.subs ?? '?')} · {f.email || 'email found'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manual keyword search */}
          <div className="card" style={{ marginBottom: 20 }}>
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
                <button className="btn btn--primary" type="submit" disabled={ytLoading}>
                  <Icon name="search" size={13} />
                  {ytLoading ? (ytProgress || 'Scanning...') : 'Find Leads'}
                </button>
              </div>
            </form>
          </div>

          {quotaError && (
            <div className="card" style={{ borderColor: 'var(--coral-border)', background: 'var(--coral-soft)', marginBottom: 20 }}>
              <div className="row" style={{ gap: 12 }}>
                <Icon name="clock" size={18} style={{ color: 'var(--warn)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>YouTube API quota reached for today</div>
                  <div className="muted" style={{ fontSize: 12 }}>Daily limit resets at midnight Pacific Time. Try Reddit Scraper instead.</div>
                </div>
                <button className="btn btn--ghost btn--sm" onClick={() => setTab('reddit')}>Try Reddit</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Reddit ── */}
      {tab === 'reddit' && (
        <div className="pm" style={{ marginBottom: 20 }}>
          <div className="pm__head">
            <div className="pm__icon"><Icon name="globe" size={18} /></div>
            <div style={{ flex: 1 }}>
              <div className="pm__title">Reddit Scraper</div>
              <div className="pm__sub">Find prospects posting about their pain points in relevant subreddits.</div>
            </div>
          </div>
          <form onSubmit={handleRdSearch}>
            <div className="field" style={{ marginBottom: 16, maxWidth: 420 }}>
              <div className="field__label">Keyword *</div>
              <input className="input" placeholder="e.g. struggling with email marketing" value={rdKeyword} onChange={e => setRdKeyword(e.target.value)} required />
            </div>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Subreddits</div>
            <div className="pm__niches">
              {DEFAULT_SUBREDDITS.map(sub => (
                <button key={sub} type="button" className={`pm__niche ${rdSubreddits.has(sub) ? 'is-active' : ''}`} onClick={() => toggleRdSub(sub)}>
                  r/{sub}
                </button>
              ))}
            </div>
            <button className="pm__cta" type="submit" disabled={rdLoading}>
              {rdLoading
                ? <><span className="dot dot--pulse" style={{ background: '#0a0a0c', width: 8, height: 8 }} /> Scanning Reddit...</>
                : <><Icon name="search" size={16} />Find Reddit Leads</>
              }
            </button>
          </form>
        </div>
      )}

      {/* ── Viral ── */}
      {tab === 'viral' && (
        <div className="pm" style={{ marginBottom: 20 }}>
          <div className="pm__head">
            <div className="pm__icon"><Icon name="flame" size={18} /></div>
            <div style={{ flex: 1 }}>
              <div className="pm__title">Viral Detector</div>
              <div className="pm__sub">Identifies channels with a recent video performing far above their average.</div>
            </div>
          </div>
          <form onSubmit={handleViralDetect}>
            <div className="grid" style={{ gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'flex-end' }}>
              <div className="field">
                <div className="field__label">Niche keyword *</div>
                <input className="input" placeholder="e.g. dropshipping" value={viralKeyword} onChange={e => setViralKeyword(e.target.value)} required />
              </div>
              <button className="pm__cta" type="submit" disabled={viralLoading} style={{ marginTop: 0, flexShrink: 0 }}>
                {viralLoading ? 'Detecting...' : <><Icon name="bolt" size={16} />Detect Viral</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Competitor ── */}
      {tab === 'competitor' && (
        <div className="pm" style={{ marginBottom: 20 }}>
          <div className="pm__head">
            <div className="pm__icon"><Icon name="eye" size={18} /></div>
            <div style={{ flex: 1 }}>
              <div className="pm__title">Competitor Spy</div>
              <div className="pm__sub">Find channels in your competitor's audience you haven't approached yet.</div>
            </div>
          </div>
          <form onSubmit={handleCompSpy}>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div className="field"><div className="field__label">Competitor Name / Channel *</div><input className="input" value={compForm.competitor} onChange={e => setCompForm(f => ({ ...f, competitor: e.target.value }))} placeholder="e.g. vidIQ" required /></div>
              <div className="field"><div className="field__label">Keywords (comma-separated, optional)</div><input className="input" value={compForm.keywords} onChange={e => setCompForm(f => ({ ...f, keywords: e.target.value }))} placeholder="e.g. youtube growth, video editing" /></div>
            </div>
            <button className="pm__cta" type="submit" disabled={compLoading}>
              {compLoading ? 'Scanning...' : <><Icon name="search" size={16} />Spy</>}
            </button>
          </form>
        </div>
      )}

      {/* ── Upload CSV ── */}
      {tab === 'upload' && (
        <div className="pm" style={{ marginBottom: 20 }}>
          <div className="pm__head">
            <div className="pm__icon"><Icon name="upload" size={18} /></div>
            <div style={{ flex: 1 }}>
              <div className="pm__title">Upload CSV</div>
              <div className="pm__sub">Import your own lead list and let the agent enrich, score, and qualify each one.</div>
            </div>
          </div>
          <div style={{ padding: '32px', textAlign: 'center', border: '2px dashed var(--line-2)', borderRadius: 'var(--r)', marginTop: 12 }}>
            <Icon name="upload" size={24} style={{ color: 'var(--text-3)', marginBottom: 10, display: 'block', margin: '0 auto 10px' }} />
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>Drag & drop a CSV or click to browse</div>
            <div className="muted" style={{ fontSize: 11 }}>Required columns: channel_name, channel_url</div>
          </div>
        </div>
      )}

      {/* ── Loading state ── */}
      {isLoading && (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span className="dot dot--pulse" />
          {tab === 'youtube' ? (ytProgress || 'Scanning YouTube channels...')
            : tab === 'reddit' ? 'Scanning Reddit threads...'
            : tab === 'viral' ? 'Detecting viral spikes...'
            : 'Running competitor analysis...'}
        </div>
      )}

      {/* ── Results ── */}
      {!isLoading && currentLeads.length > 0 && (
        <>
          <div className="section-head">
            <h3>
              {currentLeads.length} {tab === 'viral' ? 'viral opportunities' : 'creators found'} ·{' '}
              <span className="mono" style={{ color: 'var(--coral)' }}>
                {tab === 'viral'
                  ? 'URGENT'
                  : `${currentLeads.filter(l => (l.lead_score ?? 0) >= 90).length} A+ score`
                }
              </span>
            </h3>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn--ghost btn--sm"><Icon name="filter" size={11} />Filter</button>
              <button className="btn btn--ghost btn--sm"><Icon name="sort" size={11} />Sort: Score</button>
              <button className="btn btn--ghost btn--sm"><Icon name="arrowDown" size={11} />Export CSV</button>
              {currentSelected.size > 0 && (
                <button
                  className="btn btn--sm"
                  style={{ background: 'var(--coral-soft)', color: 'var(--coral)', borderColor: 'var(--coral-border)' }}
                  onClick={() => toast.promise(api.post('/pitches/generate/bulk', { lead_ids: [...currentSelected] }), { loading: 'Generating...', success: 'Pitches queued!', error: 'Failed' })}
                >
                  <Icon name="rocket" size={11} />Send to Pitch Gen
                </button>
              )}
            </div>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="tbl">
              <thead>
                <tr>
                  {tab !== 'viral' && (
                    <th style={{ width: 32 }}>
                      <input type="checkbox" onChange={e => {
                        if (tab === 'youtube') setYtSelected(e.target.checked ? new Set(ytLeads.map(l => l.id)) : new Set());
                        else if (tab === 'reddit') setRdSelected(e.target.checked ? new Set(rdLeads.map(l => l.id)) : new Set());
                      }} />
                    </th>
                  )}
                  <th>
                    {tab === 'reddit' ? 'User' : 'Creator'}
                  </th>
                  {tab === 'reddit' && <><th>Subreddit</th><th>Post Title</th></>}
                  {tab === 'viral' && <><th className="num">Viral Multiplier</th><th>Viral Video</th><th>Urgency</th></>}
                  {(tab === 'youtube' || tab === 'competitor') && (
                    <><th>Niche</th><th className="num">Subs</th><th className="num">Est. CPM</th><th>Last upload</th></>
                  )}
                  <th>Email</th>
                  {tab !== 'viral' && tab !== 'reddit' && <th className="num">Score</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {currentLeads.map((lead, i) => (
                  <tr key={lead.id || i}>
                    {tab !== 'viral' && (
                      <td>
                        <input type="checkbox" checked={currentSelected.has(lead.id)} onChange={() => toggleSelected(lead.id)} />
                      </td>
                    )}
                    <td>
                      <div className="row" style={{ cursor: 'pointer', gap: 8 }} onClick={() => tab !== 'viral' && navigate(`/leads/${lead.id}`)}>
                        <span className="ava" style={{ fontSize: 11, flexShrink: 0 }}>
                          {((tab === 'reddit' ? (lead.reddit_username || lead.channel_name) : lead.channel_name) || '?')[0].toUpperCase()}
                        </span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {tab === 'reddit' ? `u/${lead.reddit_username || lead.channel_name}` : lead.channel_name}
                          </div>
                          {lead.email && <span className="mono" style={{ fontSize: 9, color: 'var(--ok)', letterSpacing: '.08em' }}>EMAIL FOUND</span>}
                        </div>
                      </div>
                    </td>

                    {tab === 'reddit' && (
                      <>
                        <td>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--lime-soft)', color: 'var(--lime)', border: '1px solid var(--lime-border)', fontFamily: 'var(--f-mono)' }}>
                            r/{lead.reddit_subreddit || '—'}
                          </span>
                        </td>
                        <td style={{ maxWidth: 200 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                            {lead.reddit_post_title || '—'}
                          </div>
                        </td>
                      </>
                    )}

                    {tab === 'viral' && (
                      <>
                        <td className="num">
                          <span className="mono" style={{ color: 'var(--coral)', fontSize: 14, fontWeight: 700 }}>
                            {lead.viral_multiplier ?? '—'}x
                          </span>
                        </td>
                        <td style={{ maxWidth: 240 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                            {lead.viral_video_title}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 99, background: 'var(--coral-soft)', color: 'var(--coral)', border: '1px solid var(--coral-border)', fontFamily: 'var(--f-mono)', fontWeight: 700 }}>
                            URGENT
                          </span>
                        </td>
                      </>
                    )}

                    {(tab === 'youtube' || tab === 'competitor') && (
                      <>
                        <td>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--lime-soft)', color: 'var(--lime)', border: '1px solid var(--lime-border)' }}>
                            {lead.niche || 'General'}
                          </span>
                        </td>
                        <td className="num">{formatNumber(lead.subscriber_count ?? 0)}</td>
                        <td className="num" style={{ color: 'var(--lime)' }}>{lead.cpm ? `$${lead.cpm}` : '—'}</td>
                        <td className="muted" style={{ fontSize: 11.5 }}>
                          {lead.days_since_upload ? `${lead.days_since_upload}d ago` : '—'}
                        </td>
                      </>
                    )}

                    <td className="mono" style={{ color: lead.email ? 'var(--ok)' : 'var(--text-3)', fontSize: 13 }}>
                      {lead.email ? '✓' : '–'}
                    </td>

                    {tab !== 'viral' && tab !== 'reddit' && (
                      <td className="num"><ScorePill score={lead.lead_score ?? 0} /></td>
                    )}

                    <td>
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        {tab !== 'viral' && (
                          <button className="btn btn--ghost btn--sm" title="Analyze" onClick={() => navigate(`/leads/${lead.id}`)}>
                            <Icon name="eye" size={12} />
                          </button>
                        )}
                        <button className="btn btn--ghost btn--sm" title="Pitch" onClick={() => navigate(`/pitch-generator?lead=${lead.id}`)}>
                          <Icon name="sparkle" size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Empty state */}
      {!isLoading && tab === 'youtube' && ytSearched && ytLeads.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-3)', fontSize: 13 }}>
          0 leads found — try a broader keyword or wider subscriber range.
        </div>
      )}
    </div>
  );
}
