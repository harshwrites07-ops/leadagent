import React, { useState, useEffect, useCallback } from 'react';

const API = '/api/quality';

function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }
function pct(n) { return n == null ? '—' : `${n}%`; }
function score(n) { return n == null ? '—' : Number(n).toFixed(2); }

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)',
      padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-3)', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 22, fontWeight: 700, color: accent || 'var(--text-1)' }}>{value}</span>
      {sub && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)' }}>{sub}</span>}
    </div>
  );
}

function TierBar({ hot_pct, warm_pct, cold_pct }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${hot_pct}%`, background: 'var(--lime)', transition: 'width 0.4s' }} />
        <div style={{ width: `${warm_pct}%`, background: '#f5a623', transition: 'width 0.4s' }} />
        <div style={{ width: `${cold_pct}%`, background: 'var(--text-3)', transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--lime)', minWidth: 40 }}>HOT {hot_pct}%</span>
    </div>
  );
}

function StatusDot({ status }) {
  const color = status === 'completed' ? 'var(--lime)' : status === 'running' ? '#f5a623' : status === 'error' ? 'var(--coral)' : 'var(--text-3)';
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, marginRight: 6 }} />;
}

function ValidationBucket({ label, data }) {
  if (!data) return null;
  const statusColor = data.status === 'passing' ? 'var(--lime)' : data.status === 'close' ? '#f5a623' : data.status === 'failing' ? 'var(--coral)' : 'var(--text-3)';
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '14px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: statusColor, textTransform: 'uppercase' }}>{data.status?.replace(/_/g, ' ')}</span>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>
            {data.reply_rate != null ? `${data.reply_rate}%` : '—'}
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-3)' }}>reply rate</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text-3)' }}>{data.target}%</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-3)' }}>target</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text-2)' }}>{fmt(data.outreached)}</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-3)' }}>outreached</div>
        </div>
      </div>
    </div>
  );
}

function LeadRow({ lead }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 70px 100px',
      gap: 12, alignItems: 'center', padding: '10px 16px',
      borderBottom: '1px solid var(--line)', fontSize: 12, fontFamily: 'var(--f-mono)',
    }}>
      <div>
        <div style={{ color: 'var(--text-1)', fontWeight: 600 }}>{lead.channel_name}</div>
        <div style={{ color: 'var(--text-3)', fontSize: 10 }}>{lead.niche || '—'} · {lead.email || 'no email'}</div>
      </div>
      <div style={{ color: 'var(--text-2)' }}>{fmt(lead.subscriber_count)}</div>
      <div style={{ color: 'var(--lime)', fontWeight: 700 }}>{score(lead.intent_score)}</div>
      <div style={{ color: 'var(--text-2)' }}>{lead.source || '—'}</div>
      <div style={{ color: lead.outreached ? 'var(--lime)' : 'var(--text-3)' }}>{lead.outreached ? 'SENT' : '—'}</div>
      <div>
        <a href={lead.channel_url} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--lime)', textDecoration: 'none', fontSize: 10 }}>
          View ↗
        </a>
      </div>
    </div>
  );
}

function SignalRow({ label, val }) {
  const pctVal = val != null ? Math.round(val * 100) : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-3)', width: 140 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
        {pctVal != null && <div style={{ width: `${pctVal}%`, height: '100%', background: 'var(--lime)' }} />}
      </div>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--lime)', width: 30, textAlign: 'right' }}>
        {pctVal != null ? `${pctVal}` : '—'}
      </span>
    </div>
  );
}

export default function QualityLeads() {
  const [tab, setTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [dist, setDist] = useState(null);
  const [loopStatus, setLoopStatus] = useState(null);
  const [leads, setLeads] = useState([]);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsPage, setLeadsPage] = useState(1);
  const [signals, setSignals] = useState([]);
  const [logs, setLogs] = useState([]);
  const [validation, setValidation] = useState(null);
  const [calibResult, setCalibResult] = useState(null);
  const [popResult, setPopResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [nicheFilter, setNicheFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [niches, setNiches] = useState([]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

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
  }, [leadsPage, nicheFilter]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  async function doCalibrate() {
    setBusy(true);
    try {
      const r = await fetch(`${API}/calibrate`, { method: 'POST' }).then(r => r.json());
      setCalibResult(r);
      flash('Calibration complete — check results below');
    } catch (e) { flash(`Error: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function doPopulate(dry) {
    setBusy(true);
    try {
      const r = await fetch(`${API}/populate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: dry }),
      }).then(r => r.json());
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
    try {
      await fetch(`${API}/loop/run-now`, { method: 'POST' });
      flash('Scraper cycle triggered');
    } catch (e) { flash(`Error: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function doStartLoop() {
    await fetch(`${API}/loop/start`, { method: 'POST' });
    flash('Quality loop started'); load();
  }

  async function doStopLoop() {
    await fetch(`${API}/loop/stop`, { method: 'POST' });
    flash('Quality loop stopped'); load();
  }

  const TABS = ['dashboard', 'leads', 'signals', 'calibration', 'logs'];

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--f-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            Quality Lead System
          </h1>
          <p style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>
            Intent ≥ 0.75 = HOT · Target 40-50% of master pool · Scraper runs every 2h
          </p>
        </div>

        {/* Loop control */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {loopStatus && (
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-3)' }}>
              <StatusDot status={loopStatus.running ? 'running' : loopStatus.loop_active ? 'active' : 'idle'} />
              {loopStatus.running ? 'RUNNING' : loopStatus.loop_active ? 'ACTIVE' : 'STOPPED'}
              {loopStatus.loop_active && loopStatus.next_cycle_at && (
                <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>
                  · next {new Date(loopStatus.next_cycle_at).toLocaleTimeString()}
                </span>
              )}
            </span>
          )}
          <button onClick={doRunNow} disabled={busy}
            style={{ fontFamily: 'var(--f-mono)', fontSize: 11, padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-2)' }}>
            Run Now
          </button>
          {loopStatus?.loop_active
            ? <button onClick={doStopLoop} disabled={busy} style={{ fontFamily: 'var(--f-mono)', fontSize: 11, padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--coral)', borderRadius: 6, cursor: 'pointer', color: 'var(--coral)' }}>Stop Loop</button>
            : <button onClick={doStartLoop} disabled={busy} style={{ fontFamily: 'var(--f-mono)', fontSize: 11, padding: '6px 12px', background: 'var(--lime)', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#0a0a0c', fontWeight: 700 }}>Start Loop</button>
          }
        </div>
      </div>

      {msg && (
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, background: 'var(--surface)', border: '1px solid var(--lime)', borderRadius: 6, padding: '10px 16px', marginBottom: 16, color: 'var(--lime)' }}>
          {msg}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--line)' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 11, padding: '8px 16px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: tab === t ? 'var(--lime)' : 'var(--text-3)',
              borderBottom: tab === t ? '2px solid var(--lime)' : '2px solid transparent',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: -1,
            }}>
            {t === 'signals' ? 'Buying Signals' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD TAB ── */}
      {tab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Top stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <StatCard label="Quality Leads" value={fmt(dist?.quality_total ?? (dist?.hot + dist?.warm))} sub={`HOT ${fmt(dist?.hot)} · WARM ${fmt(dist?.warm)}`} accent="var(--lime)" />
            <StatCard label="Master Pool" value={fmt(dist?.total_master)} sub={`${pct(dist?.quality_pct)} quality`} />
            <StatCard label="Buying Signals" value={fmt(stats?.buying_signals)} sub="from Reddit scans" accent="#f5a623" />
            <StatCard label="Archived (COLD)" value={fmt(dist?.cold)} sub="< 0.50 proxy score" />
          </div>

          {/* Distribution bar */}
          {dist && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 20 }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Proxy Score Distribution — {fmt(dist.total_scored)} scored of {fmt(dist.total_master)} total
              </div>
              <TierBar hot_pct={dist.hot_pct} warm_pct={dist.warm_pct} cold_pct={dist.cold_pct} />
              <div style={{ display: 'flex', gap: 24, marginTop: 12, fontFamily: 'var(--f-mono)', fontSize: 11 }}>
                <span style={{ color: 'var(--lime)' }}>HOT ≥0.75 {fmt(dist.hot)} ({pct(dist.hot_pct)})</span>
                <span style={{ color: '#f5a623' }}>WARM 0.50–0.75 {fmt(dist.warm)} ({pct(dist.warm_pct)})</span>
                <span style={{ color: 'var(--text-3)' }}>COLD &lt;0.50 {fmt(dist.cold)} ({pct(dist.cold_pct)})</span>
              </div>
              <div style={{ marginTop: 10, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)' }}>
                HOT + WARM = {fmt((dist.hot || 0) + (dist.warm || 0))} quality leads ({pct(dist.quality_pct)}) · Scored by niche tier + subscriber count (proxy signals — no video data in master pool)
              </div>
              {(dist.quality_pct || 0) >= 40 && (
                <div style={{ marginTop: 6, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--lime)' }}>
                  ✓ {pct(dist.quality_pct)} quality rate — exceeds 40% target
                </div>
              )}
            </div>
          )}

          {/* By niche */}
          {stats?.by_niche?.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 20 }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                HOT Leads by Niche
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {stats.by_niche.slice(0, 10).map(n => (
                  <div key={n.niche} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--f-mono)', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-2)', textTransform: 'capitalize' }}>{n.niche}</span>
                    <span style={{ color: 'var(--lime)', fontWeight: 700 }}>{fmt(n.count)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validation */}
          {validation && (
            <div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Algorithm Validation (reply rate vs target)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <ValidationBucket label="HOT (target 60%)" data={validation.hot} />
                <ValidationBucket label="WARM (target 30%)" data={validation.warm} />
                <ValidationBucket label="COLD (target 10%)" data={validation.cold} />
              </div>
            </div>
          )}

          {/* Daily growth */}
          {stats?.daily_growth?.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 20 }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Daily HOT Lead Growth (last 7 days)
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 60 }}>
                {stats.daily_growth.map(d => {
                  const max = Math.max(...stats.daily_growth.map(x => x.added), 1);
                  return (
                    <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                      <div style={{ width: '100%', background: 'var(--lime)', borderRadius: '2px 2px 0 0', height: `${(d.added / max) * 50}px`, minHeight: 2 }} />
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-3)' }}>{d.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LEADS TAB ── */}
      {tab === 'leads' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {['all', 'hot', 'warm'].map(t => (
              <button key={t} onClick={() => { setTierFilter(t); setLeadsPage(1); }}
                style={{
                  fontFamily: 'var(--f-mono)', fontSize: 11, padding: '5px 12px',
                  background: tierFilter === t ? (t === 'hot' ? 'var(--lime)' : t === 'warm' ? '#f5a623' : 'var(--text-2)') : 'var(--surface)',
                  color: tierFilter === t ? '#0a0a0c' : 'var(--text-2)',
                  border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer',
                  fontWeight: tierFilter === t ? 700 : 400,
                }}>
                {t.toUpperCase()}
              </button>
            ))}
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--text-2)' }}>
              {fmt(leadsTotal)} leads
            </span>
            <select value={nicheFilter} onChange={e => { setNicheFilter(e.target.value); setLeadsPage(1); }}
              style={{ fontFamily: 'var(--f-mono)', fontSize: 11, padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--text-2)', cursor: 'pointer' }}>
              <option value="">All niches</option>
              {niches.map(n => <option key={n.niche} value={n.niche}>{n.niche} ({n.count})</option>)}
            </select>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
              Page {leadsPage}
            </span>
            <button onClick={() => setLeadsPage(p => Math.max(1, p - 1))} disabled={leadsPage === 1}
              style={{ fontFamily: 'var(--f-mono)', fontSize: 11, padding: '5px 10px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-2)' }}>
              ←
            </button>
            <button onClick={() => setLeadsPage(p => p + 1)}
              style={{ fontFamily: 'var(--f-mono)', fontSize: 11, padding: '5px 10px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-2)' }}>
              →
            </button>
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 70px 100px',
            gap: 12, padding: '8px 16px', fontFamily: 'var(--f-mono)', fontSize: 10,
            color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em',
            borderBottom: '1px solid var(--line)',
          }}>
            <span>Channel</span><span>Subs</span><span>Intent</span><span>Source</span><span>Sent</span><span>Link</span>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
            {leads.length === 0
              ? <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--text-3)' }}>
                  No HOT leads yet. Run population from the Calibration tab.
                </div>
              : leads.map(l => <LeadRow key={l.id} lead={l} />)
            }
          </div>
        </div>
      )}

      {/* ── BUYING SIGNALS TAB ── */}
      {tab === 'signals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={doRedditScan} disabled={busy}
              style={{ fontFamily: 'var(--f-mono)', fontSize: 12, padding: '8px 16px', background: 'var(--lime)', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#0a0a0c', fontWeight: 700 }}>
              {busy ? 'Scanning...' : 'Scan Reddit Now'}
            </button>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)' }}>
              Monitors r/YouTubers, r/YoutubeContent, r/CreatorEconomy, r/NewTubers, r/Filmmakers
            </span>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '80px 100px 1fr 120px 100px',
              gap: 12, padding: '10px 16px', fontFamily: 'var(--f-mono)', fontSize: 10,
              color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em',
              borderBottom: '1px solid var(--line)', background: 'var(--bg)',
            }}>
              <span>Source</span><span>Subreddit</span><span>Post</span><span>Classification</span><span>Budget</span>
            </div>

            {signals.length === 0
              ? <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--text-3)' }}>
                  No buying signals yet. Click "Scan Reddit Now".
                </div>
              : signals.map(s => (
                  <div key={s.id} style={{
                    display: 'grid', gridTemplateColumns: '80px 100px 1fr 120px 100px',
                    gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line)',
                    fontFamily: 'var(--f-mono)', fontSize: 11,
                  }}>
                    <span style={{ color: 'var(--text-3)', textTransform: 'uppercase' }}>{s.source}</span>
                    <span style={{ color: 'var(--text-2)' }}>r/{s.subreddit}</span>
                    <div>
                      <a href={s.post_url} target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--text-1)', textDecoration: 'none' }}>
                        {s.post_title?.slice(0, 80)}{s.post_title?.length > 80 ? '…' : ''}
                      </a>
                      {s.channel_url && (
                        <div style={{ marginTop: 3 }}>
                          <a href={s.channel_url} target="_blank" rel="noopener noreferrer"
                            style={{ color: 'var(--lime)', fontSize: 10, textDecoration: 'none' }}>
                            {s.channel_url.slice(0, 50)}
                          </a>
                        </div>
                      )}
                    </div>
                    <span style={{
                      color: s.intent_classification === 'ACTIVE_SEEKING' ? 'var(--lime)' : '#f5a623',
                      fontSize: 10,
                    }}>
                      {s.intent_classification}
                    </span>
                    <span style={{ color: 'var(--text-2)' }}>{s.budget_mentioned || '—'}</span>
                  </div>
                ))
            }
          </div>
        </div>
      )}

      {/* ── CALIBRATION TAB ── */}
      {tab === 'calibration' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 20 }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
              Weight Calibration
            </div>
            <p style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)', margin: '0 0 16px' }}>
              Tests 5 weight configurations against your 639 leads. Finds which gets 40-50% HOT rate.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={doCalibrate} disabled={busy}
                style={{ fontFamily: 'var(--f-mono)', fontSize: 12, padding: '10px 20px', background: 'var(--lime)', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#0a0a0c', fontWeight: 700 }}>
                {busy ? 'Calibrating...' : 'Run Calibration'}
              </button>
              <button onClick={() => doPopulate(true)} disabled={busy}
                style={{ fontFamily: 'var(--f-mono)', fontSize: 12, padding: '10px 20px', background: 'var(--surface)', border: '1px solid var(--lime)', borderRadius: 6, cursor: 'pointer', color: 'var(--lime)' }}>
                {busy ? 'Running...' : 'Dry Run (all 21K leads)'}
              </button>
              <button onClick={() => doPopulate(false)} disabled={busy}
                style={{ fontFamily: 'var(--f-mono)', fontSize: 12, padding: '10px 20px', background: 'var(--coral)', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#fff', fontWeight: 700 }}>
                {busy ? 'Running...' : 'POPULATE DB (score all leads)'}
              </button>
            </div>
          </div>

          {/* Calibration result */}
          {calibResult && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 20 }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 700, color: 'var(--lime)', marginBottom: 12 }}>
                Calibration Result — {fmt(calibResult.total)} leads tested
              </div>
              {calibResult.error
                ? <div style={{ color: 'var(--coral)', fontFamily: 'var(--f-mono)', fontSize: 12 }}>{calibResult.error}</div>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(calibResult.results || {}).map(([name, r]) => (
                      <div key={name} style={{
                        display: 'grid', gridTemplateColumns: '140px 1fr 80px 80px 80px',
                        gap: 12, padding: '10px 14px',
                        background: name === calibResult.recommended ? 'rgba(200,246,84,0.08)' : 'transparent',
                        border: name === calibResult.recommended ? '1px solid var(--lime)' : '1px solid var(--line)',
                        borderRadius: 6, alignItems: 'center', fontFamily: 'var(--f-mono)', fontSize: 11,
                      }}>
                        <span style={{ color: name === calibResult.recommended ? 'var(--lime)' : 'var(--text-2)', fontWeight: name === calibResult.recommended ? 700 : 400 }}>
                          {name === calibResult.recommended ? '★ ' : ''}{name.replace('_', ' ').toUpperCase()}
                        </span>
                        <TierBar hot_pct={r.hot_pct} warm_pct={r.warm_pct} cold_pct={r.cold_pct} />
                        <span style={{ color: 'var(--lime)' }}>HOT {pct(r.hot_pct)}</span>
                        <span style={{ color: '#f5a623' }}>WARM {pct(r.warm_pct)}</span>
                        <span style={{ color: 'var(--text-3)' }}>COLD {pct(r.cold_pct)}</span>
                      </div>
                    ))}
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--lime)', marginTop: 8 }}>
                      ★ Recommended: {calibResult.recommended} — closest to 40-50% HOT target
                    </div>
                  </div>
                )
              }
            </div>
          )}

          {/* Population result */}
          {popResult && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 20 }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 700, color: 'var(--text-1)', marginBottom: 12 }}>
                {popResult.dry_run ? 'Dry Run Result' : 'Population Complete'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <StatCard label="Total Scored" value={fmt(popResult.total)} />
                <StatCard label="HOT Added" value={fmt(popResult.hot)} sub={pct(popResult.hot_pct)} accent="var(--lime)" />
                <StatCard label="WARM Archived" value={fmt(popResult.warm)} />
                <StatCard label="COLD Discarded" value={fmt(popResult.cold)} />
              </div>
              {popResult.hot_pct < 40 && (
                <div style={{ marginTop: 12, fontFamily: 'var(--f-mono)', fontSize: 11, color: '#f5a623' }}>
                  ⚠ Only {popResult.hot_pct}% HOT (target 40-50%). Run calibration and try "option_a" or "option_b" weights.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── LOGS TAB ── */}
      {tab === 'logs' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '140px 120px 80px 70px 70px 70px 100px',
            gap: 12, padding: '10px 16px', fontFamily: 'var(--f-mono)', fontSize: 10,
            color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em',
            borderBottom: '1px solid var(--line)', background: 'var(--bg)',
          }}>
            <span>Started</span><span>Type</span><span>Status</span><span>HOT</span><span>WARM</span><span>COLD</span><span>Duration</span>
          </div>

          {logs.length === 0
            ? <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--text-3)' }}>
                No scraper logs yet.
              </div>
            : logs.map(log => {
                const dur = log.completed_at && log.started_at
                  ? `${Math.round((new Date(log.completed_at) - new Date(log.started_at)) / 1000)}s`
                  : '—';
                return (
                  <div key={log.id} style={{
                    display: 'grid', gridTemplateColumns: '140px 120px 80px 70px 70px 70px 100px',
                    gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line)',
                    fontFamily: 'var(--f-mono)', fontSize: 11,
                  }}>
                    <span style={{ color: 'var(--text-2)' }}>{new Date(log.started_at).toLocaleString()}</span>
                    <span style={{ color: 'var(--text-2)', textTransform: 'capitalize' }}>{log.scraper_type?.replace(/_/g, ' ')}</span>
                    <span>
                      <StatusDot status={log.status} />
                      <span style={{ color: log.status === 'completed' ? 'var(--lime)' : log.status === 'error' ? 'var(--coral)' : 'var(--text-2)' }}>
                        {log.status}
                      </span>
                    </span>
                    <span style={{ color: 'var(--lime)' }}>{fmt(log.hot_added)}</span>
                    <span style={{ color: '#f5a623' }}>{fmt(log.warm_archived)}</span>
                    <span style={{ color: 'var(--text-3)' }}>{fmt(log.cold_discarded)}</span>
                    <span style={{ color: 'var(--text-3)' }}>{dur}</span>
                  </div>
                );
              })
          }
        </div>
      )}
    </div>
  );
}
