import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCountUp } from '../hooks/useCountUp';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/ui/Icon';

const API = '/api/quality';

const SIGNAL_SOURCE_KEYS = ['description', 'email', 'upwork', 'twitter', 'community', 'google'];

function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }
function pct(n) { return n == null ? '—' : `${n}%`; }
function score(n) { return n == null ? '—' : Number(n).toFixed(2); }

function StatCard({ label, value, sub, accent, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.16,1,0.3,1] }}
      whileHover={{ y: -3 }}
      className="stat"
    >
      <div className="stat__label">{label}</div>
      <div className="stat__value--mono" style={accent ? { color: accent } : {}}>{value}</div>
      {sub && <div className="stat__meta">{sub}</div>}
    </motion.div>
  );
}

function TierBar({ hot_pct, warm_pct, cold_pct }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden', display: 'flex' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${hot_pct}%` }}
          transition={{ duration: 0.8, ease: [0.16,1,0.3,1] }}
          style={{ background: 'var(--lime)' }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${warm_pct}%` }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16,1,0.3,1] }}
          style={{ background: 'var(--warn)' }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${cold_pct}%` }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16,1,0.3,1] }}
          style={{ background: 'var(--text-3)' }}
        />
      </div>
      <span className="t-mono t-lime" style={{ fontSize: 11, minWidth: 40 }}>HOT {hot_pct}%</span>
    </div>
  );
}

function StatusDot({ status }) {
  const cls = status === 'completed' ? 'dot dot--ok' : status === 'running' ? 'dot dot--warn' : status === 'error' ? 'dot dot--coral' : 'dot dot--neutral';
  return <span className={cls} style={{ marginRight: 6, display: 'inline-block' }} />;
}

function ValidationBucket({ label, data }) {
  if (!data) return null;
  const statusColor = data.status === 'passing' ? 'var(--ok)' : data.status === 'close' ? 'var(--warn)' : data.status === 'failing' ? 'var(--coral)' : 'var(--text-3)';
  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="t-mono" style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase' }}>{label}</span>
        <span className="t-mono" style={{ fontSize: 10, color: statusColor, textTransform: 'uppercase' }}>{data.status?.replace(/_/g, ' ')}</span>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <div className="t-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{data.reply_rate != null ? `${data.reply_rate}%` : '—'}</div>
          <div className="t-mono t-muted" style={{ fontSize: 10 }}>reply rate</div>
        </div>
        <div>
          <div className="t-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-3)' }}>{data.target}%</div>
          <div className="t-mono t-muted" style={{ fontSize: 10 }}>target</div>
        </div>
        <div>
          <div className="t-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-2)' }}>{fmt(data.outreached)}</div>
          <div className="t-mono t-muted" style={{ fontSize: 10 }}>outreached</div>
        </div>
      </div>
    </div>
  );
}

function LeadRow({ lead, index = 0 }) {
  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4), duration: 0.3 }}
    >
      <td>
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>
          {lead.channel_name}
          {lead.reserved_for_me && (
            <span className="badge badge--lime t-xs" style={{ marginLeft: 6 }} title={`Reserved for you until ${lead.reserved_expires_at ? new Date(lead.reserved_expires_at).toLocaleString() : ''}`}>
              reserved for you · 48h
            </span>
          )}
        </div>
        <div className="t-xs t-muted">
          {lead.niche || '—'} · {lead.email || 'no email'}
          {/* Predicted reply rate (Session 3.3) — only ever rendered when the
              backend's non-negotiable n>=50 gate has already passed; below
              that threshold predicted_reply_rate is null and only the tier
              badge (elsewhere in this row) shows. */}
          {lead.predicted_reply_rate != null && (
            <span
              className="t-lime"
              style={{ marginLeft: 6 }}
              title={`Based on ${lead.predicted_reply_sample_size} similar sends (tier + lead type), shrunk toward the overall baseline`}
            >
              · ≈{lead.predicted_reply_rate}% predicted reply · based on {lead.predicted_reply_sample_size} similar sends
            </span>
          )}
        </div>
      </td>
      <td className="mono">{fmt(lead.subscriber_count)}</td>
      <td className="mono t-lime" style={{ fontWeight: 700 }}>{score(lead.intent_score)}</td>
      <td>{lead.source || '—'}</td>
      <td className={lead.outreached ? 't-lime' : 't-muted'}>{lead.outreached ? 'SENT' : '—'}</td>
      <td>
        <a href={lead.channel_url} target="_blank" rel="noopener noreferrer" className="t-lime t-xs">View ↗</a>
      </td>
    </motion.tr>
  );
}

function SignalRow({ label, val }) {
  const pctVal = val != null ? Math.round(val * 100) : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <span className="t-mono t-muted" style={{ fontSize: 10, width: 140 }}>{label}</span>
      <div className="bar" style={{ flex: 1 }}>
        {pctVal != null && <motion.span initial={{ width: 0 }} animate={{ width: `${pctVal}%` }} transition={{ duration: 0.6, ease: [0.16,1,0.3,1] }} />}
      </div>
      <span className="t-mono t-lime" style={{ fontSize: 10, width: 30, textAlign: 'right' }}>{pctVal != null ? `${pctVal}` : '—'}</span>
    </div>
  );
}

export default function QualityLeads() {
  const { user } = useAuth();
  const [tab, setTab]               = useState('dashboard');
  const [stats, setStats]           = useState(null);
  const [dist, setDist]             = useState(null);
  const [loopStatus, setLoopStatus] = useState(null);
  const [leads, setLeads]           = useState([]);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsPage, setLeadsPage]   = useState(1);
  const [signals, setSignals]       = useState([]);
  const [logs, setLogs]             = useState([]);
  const [validation, setValidation] = useState(null);
  const [calibResult, setCalibResult] = useState(null);
  const [popResult, setPopResult]   = useState(null);
  const [busy, setBusy]             = useState(false);
  const [msg, setMsg]               = useState('');
  const [nicheFilter, setNicheFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [niches, setNiches]         = useState([]);
  const [confirmedStats, setConfirmedStats] = useState(null);
  const [signalDrill, setSignalDrill] = useState(null); // { source, label, leads, total, loading, added: Set }
  const [addingAll, setAddingAll]   = useState(false);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  async function openSignalDrill(source, label) {
    if (!user?.is_admin) { flash('Admin access required to browse signal-matched leads'); return; }
    setSignalDrill({ source, label, leads: [], total: 0, loading: true, added: new Set() });
    try {
      const r = await fetch(`${API}/confirmed/leads?source=${source}&limit=200`).then(r => r.json());
      if (r.success) setSignalDrill(prev => prev && prev.source === source ? { ...prev, leads: r.leads, total: r.total, loading: false } : prev);
      else { flash(`Error: ${r.error}`); setSignalDrill(null); }
    } catch (e) { flash(`Error: ${e.message}`); setSignalDrill(null); }
  }

  async function addLeadToCrm(lead) {
    const r = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'youtube',
        channel_id: lead.creator_id,
        channel_name: lead.channel_name,
        subscriber_count: lead.subscriber_count,
        email: lead.email,
        niche: lead.niche,
        temperature: 'hot',
        lead_score: Math.round((lead.intent_score || 0.75) * 100),
        crm_stage: 'new_lead',
      }),
    }).then(r => r.json());
    if (r.success || r.error === 'Lead already exists') {
      setSignalDrill(prev => prev ? { ...prev, added: new Set(prev.added).add(lead.creator_id) } : prev);
      return true;
    }
    return false;
  }

  async function handleAddAllToCrm() {
    if (!signalDrill) return;
    setAddingAll(true);
    let added = 0;
    for (const lead of signalDrill.leads) {
      if (signalDrill.added.has(lead.creator_id)) continue;
      try { if (await addLeadToCrm(lead)) added++; } catch {}
    }
    setAddingAll(false);
    flash(`Added ${added} lead${added === 1 ? '' : 's'} to CRM pipeline`);
  }

  const load = useCallback(async () => {
    try {
      const [s, d, l, bs, lg, v, lp, n] = await Promise.all([
        fetch(`${API}/stats`).then(r => r.json()),
        fetch(`${API}/distribution`).then(r => r.json()),
        fetch(`${API}/loop/status`).then(r => r.json()),
        fetch(`${API}/buying-signals?limit=20`).then(r => r.json()),
        fetch(`${API}/scraper/logs`).then(r => r.json()),
        fetch(`${API}/validation`).then(r => r.json()),
        fetch(`${API}/leads?limit=50&page=${leadsPage}&tier=${tierFilter}${nicheFilter ? `&niche=${encodeURIComponent(nicheFilter)}` : ''}`).then(r => r.json()),
        fetch(`${API}/leads/niches`).then(r => r.json()),
      ]);
      setStats(s); setDist(d); setLoopStatus(l);
      setSignals(bs.signals || []); setLogs(Array.isArray(lg) ? lg.slice(0, 30) : []);
      setValidation(v);
      setLeads(lp.leads || []); setLeadsTotal(lp.total || 0);
      setNiches(n || []);
    } catch (e) { console.error(e); }
  }, [leadsPage, nicheFilter, tierFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 30000); return () => clearInterval(id); }, [load]);

  async function doCalibrate() {
    setBusy(true);
    try { const r = await fetch(`${API}/calibrate`, { method: 'POST' }).then(r => r.json()); setCalibResult(r); flash('Calibration complete — check results below'); }
    catch (e) { flash(`Error: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function doPopulate(dry) {
    setBusy(true);
    try {
      const r = await fetch(`${API}/populate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dry_run: dry }) }).then(r => r.json());
      setPopResult(r);
      if (!dry) { flash(`Population complete: ${r.hot} HOT leads added`); load(); }
      else flash(`Dry run: ${r.hot} would be HOT (${r.hot_pct}%)`);
    } catch (e) { flash(`Error: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function doRedditScan() {
    setBusy(true);
    try {
      const r = await fetch(`${API}/reddit/scan`, { method: 'POST' }).then(r => r.json());
      flash(`Reddit scan: found=${r.found} saved=${r.saved}${r.errors?.length ? ` errors=${r.errors.length}` : ''}`);
      load();
    } catch (e) { flash(`Error: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function doRunNow() {
    setBusy(true);
    try { await fetch(`${API}/loop/run-now`, { method: 'POST' }); flash('Scraper cycle triggered'); }
    catch (e) { flash(`Error: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function doStartLoop() { await fetch(`${API}/loop/start`, { method: 'POST' }); flash('Quality loop started'); load(); }
  async function doStopLoop()  { await fetch(`${API}/loop/stop`,  { method: 'POST' }); flash('Quality loop stopped'); load(); }

  async function handleRunConfirmedScan() {
    setBusy(true);
    try {
      const r = await fetch(`${API}/confirmed/scan`, { method: 'POST' }).then(r => r.json());
      if (r.success) {
        flash(`Confirmed scan complete — ${r.data.total_confirmed_signals || 0} total confirmed signals, ${r.data.final_hot_leads || 0} HOT leads`);
        load();
        fetch(`${API}/confirmed/stats`).then(r => r.json()).then(r => r.success && setConfirmedStats(r.data)).catch(() => {});
      }
    } catch (e) { flash(`Scan failed: ${e.message}`); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    fetch(`${API}/confirmed/stats`)
      .then(r => r.json())
      .then(r => { if (r.success) setConfirmedStats(r.data); })
      .catch(() => {});
  }, []);

  const TABS = ['dashboard', 'leads', 'signals', 'calibration', 'logs'];
  const nextRun = loopStatus?.next_cycle_at ? new Date(loopStatus.next_cycle_at).toLocaleTimeString() : '—';

  const animHot   = useCountUp(dist?.hot ?? 0, 800, 100);
  const animWarm  = useCountUp(dist?.warm ?? 0, 800, 200);
  const animTotal = useCountUp(dist?.total_master ?? 0, 800, 0);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1360, margin: '0 auto' }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16,1,0.3,1] }}
        className="page__head"
      >
        <div>
          <h1 className="page__title">Quality Lead System — <em>intent ≥ 0.75 = HOT</em></h1>
          <p className="page__sub">Scraper runs every 2h · {dist ? `${fmt(dist.hot)} HOT · ${fmt(dist.warm)} WARM · ${fmt(dist.total_master)} total` : 'Loading...'}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {loopStatus && (
            <div className="row" style={{ gap: 6 }}>
              <span className={`dot ${loopStatus.running ? 'dot--warn dot--pulse' : loopStatus.loop_active ? 'dot--ok dot--pulse' : 'dot--neutral'}`} />
              <span className="t-mono t-muted" style={{ fontSize: 11 }}>
                {loopStatus.running ? 'RUNNING' : loopStatus.loop_active ? `ACTIVE · next ${nextRun}` : 'STOPPED'}
              </span>
            </div>
          )}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={doRunNow} disabled={busy} className="btn btn--ghost btn--sm">Run Now</motion.button>
          {loopStatus?.loop_active
            ? <button onClick={doStopLoop} disabled={busy} className="btn btn--danger btn--sm">Stop Loop</button>
            : <motion.button whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }} onClick={doStartLoop} disabled={busy} className="btn btn--primary btn--sm">Start Loop</motion.button>
          }
        </div>
      </motion.div>

      <AnimatePresence>
        {msg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="card"
            style={{ borderColor: 'var(--lime)', marginBottom: 16, padding: '10px 16px', color: 'var(--lime)', fontFamily: 'var(--f-mono)', fontSize: 12 }}
          >
            {msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`tab ${tab === t ? 'active' : ''}`}>
            {t === 'signals' ? 'Buying Signals' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
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

          {/* ── DASHBOARD TAB ── */}
          {tab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="grid g-4">
                <StatCard label="Quality Leads" value={fmt(dist?.quality_total ?? ((dist?.hot || 0) + (dist?.warm || 0)))} sub={`HOT ${fmt(animHot)} · WARM ${fmt(animWarm)}`} accent="var(--lime)" delay={0} />
                <StatCard label="Master Pool"   value={fmt(animTotal)} sub={`${pct(dist?.quality_pct)} quality`} delay={0.06} />
                <StatCard label="Buying Signals" value={fmt(stats?.buying_signals)} sub="from Reddit scans" accent="var(--warn)" delay={0.12} />
                <StatCard label="Archived (COLD)" value={fmt(dist?.cold)} sub="< 0.50 proxy score" delay={0.18} />
              </div>

              {dist && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="card"
                  style={{ padding: 20 }}
                >
                  <div className="t-mono t-muted" style={{ fontSize: 11, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Proxy Score Distribution — {fmt(dist.total_scored)} scored of {fmt(dist.total_master)} total
                  </div>
                  <TierBar hot_pct={dist.hot_pct} warm_pct={dist.warm_pct} cold_pct={dist.cold_pct} />
                  <div className="t-mono" style={{ display: 'flex', gap: 24, marginTop: 12, fontSize: 11 }}>
                    <span className="t-lime">HOT ≥0.75 {fmt(dist.hot)} ({pct(dist.hot_pct)})</span>
                    <span style={{ color: 'var(--warn)' }}>WARM 0.50–0.75 {fmt(dist.warm)} ({pct(dist.warm_pct)})</span>
                    <span className="t-muted">COLD &lt;0.50 {fmt(dist.cold)} ({pct(dist.cold_pct)})</span>
                  </div>
                  <div className="t-mono t-muted" style={{ marginTop: 10, fontSize: 11 }}>
                    HOT + WARM = {fmt((dist.hot || 0) + (dist.warm || 0))} quality leads ({pct(dist.quality_pct)}) · Scored by niche tier + subscriber count
                  </div>
                  {(dist.quality_pct || 0) >= 40 && (
                    <div className="t-mono t-lime" style={{ marginTop: 6, fontSize: 11 }}>
                      ✓ {pct(dist.quality_pct)} quality rate — exceeds 40% target
                    </div>
                  )}
                </motion.div>
              )}

              {/* Confirmed HOT Signal Sources */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="card"
                style={{ padding: 20 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                      Confirmed HOT Signal Sources
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--f-mono)', marginTop: 2 }}>
                      Creators who LITERALLY said they need help
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="btn btn--primary btn--sm"
                    onClick={handleRunConfirmedScan}
                    disabled={busy}
                  >
                    {busy ? 'Scanning…' : 'Scan Now'}
                  </motion.button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  {[
                    {
                      label: 'Description Says "Hiring"',
                      icon: '📝',
                      description: 'Channel description contains hiring keywords',
                      value: confirmedStats?.description_hiring_signals ?? 0,
                      confidence: '85%',
                      color: 'var(--lime)',
                      active: true,
                    },
                    {
                      label: 'Business Email',
                      icon: '📧',
                      description: 'Has business@ collab@ hire@ email',
                      value: confirmedStats?.business_emails ?? 0,
                      confidence: '72%',
                      color: 'var(--ok)',
                      active: true,
                    },
                    {
                      label: 'Upwork Job Post',
                      icon: '💼',
                      description: 'Posted "need video editor" on Upwork',
                      value: confirmedStats?.upwork_jobs ?? 0,
                      confidence: '95%',
                      color: 'var(--coral)',
                      active: true,
                    },
                    {
                      label: 'Twitter Hiring Post',
                      icon: '🐦',
                      description: 'Tweeted "looking for editor"',
                      value: confirmedStats?.twitter_signals ?? 0,
                      confidence: '90%',
                      color: 'var(--sky)',
                      active: (confirmedStats?.twitter_signals ?? 0) > 0,
                    },
                    {
                      label: 'Community Post',
                      icon: '📺',
                      description: 'YouTube community post mentions hiring',
                      value: confirmedStats?.community_signals ?? 0,
                      confidence: '85%',
                      color: 'var(--lime)',
                      active: (confirmedStats?.community_signals ?? 0) > 0,
                    },
                    {
                      label: 'Google Found',
                      icon: '🔍',
                      description: 'Google indexed public hiring post',
                      value: confirmedStats?.google_signals ?? 0,
                      confidence: '88%',
                      color: 'var(--warn)',
                      active: true,
                    },
                  ].map(({ label, icon, description, value, confidence, color, active }, i) => (
                    <motion.button
                      key={label}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => openSignalDrill(SIGNAL_SOURCE_KEYS[i], label)}
                      title={user?.is_admin ? `View the ${value} lead${value === 1 ? '' : 's'} behind this signal` : 'Admin access required'}
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        background: active ? 'rgba(255,255,255,0.03)' : 'var(--surface-2, rgba(255,255,255,0.02))',
                        border: `1px solid ${active ? color + '30' : 'var(--line)'}`,
                        borderRadius: 12,
                        opacity: active ? 1 : 0.5,
                        transition: 'all 200ms',
                        textAlign: 'left',
                        cursor: 'pointer',
                        font: 'inherit',
                        color: 'inherit',
                      }}
                    >
                      <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: active ? 'var(--text)' : 'var(--text-3)', marginBottom: 4, lineHeight: 1.3 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 10, lineHeight: 1.5 }}>
                        {description}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 20, fontWeight: 900, fontFamily: 'var(--f-mono)', color: active ? color : 'var(--text-4)' }}>
                          {value.toLocaleString()}
                        </span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, fontFamily: 'var(--f-mono)',
                          background: active ? color + '18' : 'transparent',
                          color: active ? color : 'var(--text-4)',
                          padding: '2px 6px', borderRadius: 4, letterSpacing: '0.3px',
                        }}>
                          {confidence} INTENT
                        </span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>

              {stats?.by_niche?.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.4 }}
                  className="card"
                  style={{ padding: 20 }}
                >
                  <div className="t-mono t-muted" style={{ fontSize: 11, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.1em' }}>HOT Leads by Niche</div>
                  <div className="grid g-2">
                    {stats.by_niche.slice(0, 10).map(n => (
                      <div key={n.niche} className="t-mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span className="t-muted" style={{ textTransform: 'capitalize' }}>{n.niche}</span>
                        <span className="t-lime" style={{ fontWeight: 700 }}>{fmt(n.count)}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {validation && (
                <div>
                  <div className="t-mono t-muted" style={{ fontSize: 11, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Algorithm Validation (reply rate vs target)</div>
                  <div className="grid g-3">
                    <ValidationBucket label="HOT (target 60%)"  data={validation.hot} />
                    <ValidationBucket label="WARM (target 30%)" data={validation.warm} />
                    <ValidationBucket label="COLD (target 10%)" data={validation.cold} />
                  </div>
                </div>
              )}

              {stats?.daily_growth?.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                  className="card"
                  style={{ padding: 20 }}
                >
                  <div className="t-mono t-muted" style={{ fontSize: 11, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Daily HOT Lead Growth (last 7 days)</div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 60 }}>
                    {stats.daily_growth.map((d, i) => {
                      const max = Math.max(...stats.daily_growth.map(x => x.added), 1);
                      return (
                        <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                          <motion.div
                            initial={{ height: 2 }}
                            animate={{ height: `${(d.added / max) * 50}px` }}
                            transition={{ delay: i * 0.05, duration: 0.5, ease: [0.16,1,0.3,1] }}
                            style={{ width: '100%', background: 'var(--lime)', borderRadius: '2px 2px 0 0', minHeight: 2 }}
                          />
                          <span className="t-mono t-muted" style={{ fontSize: 9 }}>{d.date.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </div>
          )}

          {/* ── LEADS TAB ── */}
          {tab === 'leads' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {['all', 'hot', 'warm'].map(t => (
                  <button key={t} onClick={() => { setTierFilter(t); setLeadsPage(1); }}
                    className={`btn btn--sm ${tierFilter === t ? (t === 'hot' ? 'btn--coral' : t === 'warm' ? '' : 'btn--primary') : 'btn--ghost'}`}
                    style={tierFilter === t && t === 'warm' ? { background: 'var(--warn)', color: 'var(--on-accent)', borderColor: 'var(--warn)', fontWeight: 700 } : undefined}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
                <span className="t-mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{fmt(leadsTotal)} leads</span>
                <select value={nicheFilter} onChange={e => { setNicheFilter(e.target.value); setLeadsPage(1); }}
                  className="input" style={{ height: 28, padding: '0 8px', fontSize: 11, width: 'auto' }}>
                  <option value="">All niches</option>
                  {niches.map(n => <option key={n.niche} value={n.niche}>{n.niche} ({n.count})</option>)}
                </select>
                <div style={{ flex: 1 }} />
                <span className="t-mono t-muted" style={{ fontSize: 11 }}>Page {leadsPage}</span>
                <button onClick={() => setLeadsPage(p => Math.max(1, p - 1))} disabled={leadsPage === 1} className="btn btn--ghost btn--sm">←</button>
                <button onClick={() => setLeadsPage(p => p + 1)} className="btn btn--ghost btn--sm">→</button>
              </div>

              <div className="card" style={{ padding: 0 }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Channel</th><th>Subs</th><th>Intent</th><th>Source</th><th>Sent</th><th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <motion.div
                            animate={{ y: [0, -6, 0] }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                            className="empty"
                          >
                            <div className="empty__title">No quality leads yet</div>
                            <div className="empty__desc">Go to the Calibration tab and click Populate to score your leads.</div>
                            <button className="btn btn--primary mt-12" onClick={() => setTab('calibration')}>
                              Go to Calibration →
                            </button>
                          </motion.div>
                        </td>
                      </tr>
                    ) : leads.map((l, i) => <LeadRow key={l.id} lead={l} index={i} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── BUYING SIGNALS TAB ── */}
          {tab === 'signals' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="row">
                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={doRedditScan}
                  disabled={busy}
                  className="btn btn--primary"
                >
                  {busy ? 'Scanning...' : 'Scan Reddit Now'}
                </motion.button>
                <span className="t-mono t-muted" style={{ fontSize: 11 }}>
                  Monitors r/YouTubers, r/YoutubeContent, r/CreatorEconomy, r/NewTubers, r/Filmmakers
                </span>
              </div>

              <div className="card" style={{ padding: 0 }}>
                <table className="tbl">
                  <thead>
                    <tr><th>Source</th><th>Subreddit</th><th>Post</th><th>Classification</th><th>Budget</th></tr>
                  </thead>
                  <tbody>
                    {signals.length === 0 ? (
                      <tr><td colSpan={5}><div className="empty"><div className="empty__title">No buying signals yet</div><div className="empty__desc">Click "Scan Reddit Now" to find creators looking for services.</div></div></td></tr>
                    ) : signals.map((s, i) => (
                      <motion.tr
                        key={s.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.3 }}
                      >
                        <td className="mono" style={{ textTransform: 'uppercase', fontSize: 10 }}>{s.source}</td>
                        <td>r/{s.subreddit}</td>
                        <td>
                          <a href={s.post_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                            {s.post_title?.slice(0, 80)}{s.post_title?.length > 80 ? '…' : ''}
                          </a>
                          {s.channel_url && (
                            <div><a href={s.channel_url} target="_blank" rel="noopener noreferrer" className="t-lime t-xs">{s.channel_url.slice(0, 50)}</a></div>
                          )}
                        </td>
                        <td className={s.intent_classification === 'ACTIVE_SEEKING' ? 't-lime t-xs' : 't-xs'} style={s.intent_classification !== 'ACTIVE_SEEKING' ? { color: 'var(--warn)' } : {}}>{s.intent_classification}</td>
                        <td>{s.budget_mentioned || '—'}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── CALIBRATION TAB ── */}
          {tab === 'calibration' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="card"
                style={{ padding: 20 }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 8 }}>Weight Calibration</div>
                <p className="t-mono t-muted" style={{ fontSize: 11, margin: '0 0 16px' }}>
                  Tests 5 weight configurations against your leads. Finds which gets 40-50% HOT rate.
                </p>
                <div className="row">
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={doCalibrate} disabled={busy} className="btn btn--primary">{busy ? 'Calibrating...' : 'Run Calibration'}</motion.button>
                  <button onClick={() => doPopulate(true)} disabled={busy} className="btn btn--ghost" style={{ borderColor: 'var(--lime)', color: 'var(--lime)' }}>{busy ? 'Running...' : 'Dry Run (all leads)'}</button>
                  <button onClick={() => doPopulate(false)} disabled={busy} className="btn btn--coral">{busy ? 'Running...' : 'POPULATE DB (score all leads)'}</button>
                </div>
              </motion.div>

              <AnimatePresence>
                {calibResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="card"
                    style={{ padding: 20 }}
                  >
                    <div className="t-mono t-lime" style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
                      Calibration Result — {fmt(calibResult.total)} leads tested
                    </div>
                    {calibResult.error
                      ? <div className="t-coral t-mono" style={{ fontSize: 12 }}>{calibResult.error}</div>
                      : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {Object.entries(calibResult.results || {}).map(([name, r]) => (
                            <div key={name} className="t-mono" style={{
                              display: 'grid', gridTemplateColumns: '140px 1fr 80px 80px 80px', gap: 12,
                              padding: '10px 14px', borderRadius: 6, alignItems: 'center', fontSize: 11,
                              background: name === calibResult.recommended ? 'rgba(var(--lime-rgb),0.08)' : 'transparent',
                              border: name === calibResult.recommended ? '1px solid var(--lime)' : '1px solid var(--line)',
                            }}>
                              <span style={{ color: name === calibResult.recommended ? 'var(--lime)' : 'var(--text-2)', fontWeight: name === calibResult.recommended ? 700 : 400 }}>
                                {name === calibResult.recommended ? '★ ' : ''}{name.replace('_', ' ').toUpperCase()}
                              </span>
                              <TierBar hot_pct={r.hot_pct} warm_pct={r.warm_pct} cold_pct={r.cold_pct} />
                              <span className="t-lime">HOT {pct(r.hot_pct)}</span>
                              <span style={{ color: 'var(--warn)' }}>WARM {pct(r.warm_pct)}</span>
                              <span className="t-muted">COLD {pct(r.cold_pct)}</span>
                            </div>
                          ))}
                          <div className="t-mono t-lime" style={{ fontSize: 11, marginTop: 8 }}>
                            ★ Recommended: {calibResult.recommended} — closest to 40-50% HOT target
                          </div>
                        </div>
                      )
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {popResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="card"
                    style={{ padding: 20 }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', marginBottom: 12 }}>
                      {popResult.dry_run ? 'Dry Run Result' : 'Population Complete'}
                    </div>
                    <div className="grid g-4">
                      <StatCard label="Total Scored" value={fmt(popResult.total)} />
                      <StatCard label="HOT Added"    value={fmt(popResult.hot)} sub={pct(popResult.hot_pct)} accent="var(--lime)" />
                      <StatCard label="WARM Archived" value={fmt(popResult.warm)} />
                      <StatCard label="COLD Discarded" value={fmt(popResult.cold)} />
                    </div>
                    {popResult.hot_pct < 40 && (
                      <div className="t-mono" style={{ marginTop: 12, fontSize: 11, color: 'var(--warn)' }}>
                        ⚠ Only {popResult.hot_pct}% HOT (target 40-50%). Run calibration and try "option_a" or "option_b" weights.
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ── LOGS TAB ── */}
          {tab === 'logs' && (
            <div className="card" style={{ padding: 0 }}>
              <table className="tbl">
                <thead>
                  <tr><th>Started</th><th>Type</th><th>Status</th><th>HOT</th><th>WARM</th><th>COLD</th><th>Duration</th></tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={7}><div className="empty"><div className="empty__title">No scraper logs yet</div></div></td></tr>
                  ) : logs.map((log, i) => {
                    const dur = log.completed_at && log.started_at
                      ? `${Math.round((new Date(log.completed_at) - new Date(log.started_at)) / 1000)}s` : '—';
                    return (
                      <motion.tr
                        key={log.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.3 }}
                      >
                        <td className="mono" style={{ fontSize: 11 }}>{new Date(log.started_at).toLocaleString()}</td>
                        <td style={{ textTransform: 'capitalize' }}>{log.scraper_type?.replace(/_/g, ' ')}</td>
                        <td>
                          <StatusDot status={log.status} />
                          <span style={{ color: log.status === 'completed' ? 'var(--lime)' : log.status === 'error' ? 'var(--coral)' : 'var(--text-2)' }}>{log.status}</span>
                        </td>
                        <td className="t-lime mono">{fmt(log.hot_added)}</td>
                        <td className="mono" style={{ color: 'var(--warn)' }}>{fmt(log.warm_archived)}</td>
                        <td className="t-muted mono">{fmt(log.cold_discarded)}</td>
                        <td className="t-muted mono">{dur}</td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </motion.div>
      </AnimatePresence>

      {/* Signal drill-down modal */}
      <AnimatePresence>
        {signalDrill && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop"
            onClick={e => e.target === e.currentTarget && setSignalDrill(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.16,1,0.3,1] }}
              className="modal"
              style={{ maxWidth: 940, maxHeight: '82vh', display: 'flex', flexDirection: 'column', padding: 22 }}
            >
              <div className="modal__head" style={{ marginBottom: 4 }}>
                <div>
                  <div className="modal__title">{signalDrill.label}</div>
                  <div className="t-mono t-muted" style={{ fontSize: 11, marginTop: 2 }}>
                    {signalDrill.loading ? 'Loading…' : `${fmt(signalDrill.total)} matched lead${signalDrill.total === 1 ? '' : 's'}`}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {!signalDrill.loading && signalDrill.leads.length > 0 && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      className="btn btn--primary btn--sm"
                      disabled={addingAll}
                      onClick={handleAddAllToCrm}
                    >
                      {addingAll ? 'Adding…' : 'Add All to CRM'}
                    </motion.button>
                  )}
                  <button className="btn btn--ghost btn--sm" onClick={() => setSignalDrill(null)}>
                    <Icon name="x" size={12} />Close
                  </button>
                </div>
              </div>

              <div style={{ overflowY: 'auto', flex: 1, marginTop: 12 }}>
                {signalDrill.loading ? (
                  <div className="t-mono t-muted" style={{ padding: '24px 0', textAlign: 'center', fontSize: 12 }}>Loading matched leads…</div>
                ) : signalDrill.leads.length === 0 ? (
                  <div className="empty">
                    <div className="empty__title">No leads matched yet</div>
                    <div className="empty__desc">Run a Scan Now to look for this signal across the master pool.</div>
                  </div>
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Channel</th><th>Subs</th><th>Matched Signal</th><th>Intent</th><th>Link</th><th>CRM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {signalDrill.leads.map((l, i) => (
                        <motion.tr
                          key={l.signal_id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.25 }}
                        >
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{l.channel_name}</div>
                            <div className="t-xs t-muted">{l.niche || '—'} · {l.email || 'no email'}</div>
                          </td>
                          <td className="mono">{fmt(l.subscriber_count)}</td>
                          <td className="t-xs" style={{ maxWidth: 280 }}>{l.signal_text || '—'}</td>
                          <td className="mono t-lime" style={{ fontWeight: 700 }}>
                            {l.intent_score != null ? score(l.intent_score) : '—'}
                            {l.intent_tier && <span className="t-xs t-muted" style={{ marginLeft: 4 }}>{l.intent_tier}</span>}
                          </td>
                          <td>
                            <a href={l.channel_url} target="_blank" rel="noopener noreferrer" className="t-lime t-xs">View ↗</a>
                          </td>
                          <td>
                            {signalDrill.added.has(l.creator_id) ? (
                              <span className="t-lime t-xs"><Icon name="check" size={11} /> Added</span>
                            ) : (
                              <button className="btn btn--ghost btn--sm" onClick={() => addLeadToCrm(l)}>
                                <Icon name="plus" size={11} />Add to CRM
                              </button>
                            )}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
