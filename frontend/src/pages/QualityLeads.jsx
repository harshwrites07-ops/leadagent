import React, { useState, useEffect, useCallback } from 'react';

const API = '/api/quality';

function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }
function pct(n) { return n == null ? '—' : `${n}%`; }
function score(n) { return n == null ? '—' : Number(n).toFixed(2); }

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value--mono" style={accent ? { color: accent } : {}}>{value}</div>
      {sub && <div className="stat__meta">{sub}</div>}
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
  const statusColor = data.status === 'passing' ? 'var(--ok)' : data.status === 'close' ? '#f5a623' : data.status === 'failing' ? 'var(--coral)' : 'var(--text-3)';
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

function LeadRow({ lead }) {
  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{lead.channel_name}</div>
        <div className="t-xs t-muted">{lead.niche || '—'} · {lead.email || 'no email'}</div>
      </td>
      <td className="mono">{fmt(lead.subscriber_count)}</td>
      <td className="mono t-lime" style={{ fontWeight: 700 }}>{score(lead.intent_score)}</td>
      <td>{lead.source || '—'}</td>
      <td className={lead.outreached ? 't-lime' : 't-muted'}>{lead.outreached ? 'SENT' : '—'}</td>
      <td>
        <a href={lead.channel_url} target="_blank" rel="noopener noreferrer" className="t-lime t-xs">View ↗</a>
      </td>
    </tr>
  );
}

function SignalRow({ label, val }) {
  const pctVal = val != null ? Math.round(val * 100) : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <span className="t-mono t-muted" style={{ fontSize: 10, width: 140 }}>{label}</span>
      <div className="bar" style={{ flex: 1 }}>
        {pctVal != null && <span style={{ width: `${pctVal}%` }} />}
      </div>
      <span className="t-mono t-lime" style={{ fontSize: 10, width: 30, textAlign: 'right' }}>{pctVal != null ? `${pctVal}` : '—'}</span>
    </div>
  );
}

export default function QualityLeads() {
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

  const TABS = ['dashboard', 'leads', 'signals', 'calibration', 'logs'];
  const nextRun = loopStatus?.next_cycle_at ? new Date(loopStatus.next_cycle_at).toLocaleTimeString() : '—';

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1360, margin: '0 auto' }}>
      <div className="page__head">
        <div>
          <h1 className="page__title">Quality Lead System</h1>
          <p className="page__sub">Intent ≥ 0.75 = HOT · Scraper runs every 2h</p>
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
          <button onClick={doRunNow} disabled={busy} className="btn btn--ghost btn--sm">Run Now</button>
          {loopStatus?.loop_active
            ? <button onClick={doStopLoop} disabled={busy} className="btn btn--danger btn--sm">Stop Loop</button>
            : <button onClick={doStartLoop} disabled={busy} className="btn btn--primary btn--sm">Start Loop</button>
          }
        </div>
      </div>

      {msg && (
        <div className="card" style={{ borderColor: 'var(--lime)', marginBottom: 16, padding: '10px 16px', color: 'var(--lime)', fontFamily: 'var(--f-mono)', fontSize: 12 }}>
          {msg}
        </div>
      )}

      <div className="tabs">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`tab ${tab === t ? 'active' : ''}`}>
            {t === 'signals' ? 'Buying Signals' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD TAB ── */}
      {tab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="grid g-4">
            <StatCard label="Quality Leads" value={fmt(dist?.quality_total ?? ((dist?.hot || 0) + (dist?.warm || 0)))} sub={`HOT ${fmt(dist?.hot)} · WARM ${fmt(dist?.warm)}`} accent="var(--lime)" />
            <StatCard label="Master Pool"   value={fmt(dist?.total_master)} sub={`${pct(dist?.quality_pct)} quality`} />
            <StatCard label="Buying Signals" value={fmt(stats?.buying_signals)} sub="from Reddit scans" accent="#f5a623" />
            <StatCard label="Archived (COLD)" value={fmt(dist?.cold)} sub="< 0.50 proxy score" />
          </div>

          {dist && (
            <div className="card" style={{ padding: 20 }}>
              <div className="t-mono t-muted" style={{ fontSize: 11, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Proxy Score Distribution — {fmt(dist.total_scored)} scored of {fmt(dist.total_master)} total
              </div>
              <TierBar hot_pct={dist.hot_pct} warm_pct={dist.warm_pct} cold_pct={dist.cold_pct} />
              <div className="t-mono" style={{ display: 'flex', gap: 24, marginTop: 12, fontSize: 11 }}>
                <span className="t-lime">HOT ≥0.75 {fmt(dist.hot)} ({pct(dist.hot_pct)})</span>
                <span style={{ color: '#f5a623' }}>WARM 0.50–0.75 {fmt(dist.warm)} ({pct(dist.warm_pct)})</span>
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
            </div>
          )}

          {stats?.by_niche?.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <div className="t-mono t-muted" style={{ fontSize: 11, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.1em' }}>HOT Leads by Niche</div>
              <div className="grid g-2">
                {stats.by_niche.slice(0, 10).map(n => (
                  <div key={n.niche} className="t-mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span className="t-muted" style={{ textTransform: 'capitalize' }}>{n.niche}</span>
                    <span className="t-lime" style={{ fontWeight: 700 }}>{fmt(n.count)}</span>
                  </div>
                ))}
              </div>
            </div>
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
            <div className="card" style={{ padding: 20 }}>
              <div className="t-mono t-muted" style={{ fontSize: 11, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Daily HOT Lead Growth (last 7 days)</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 60 }}>
                {stats.daily_growth.map(d => {
                  const max = Math.max(...stats.daily_growth.map(x => x.added), 1);
                  return (
                    <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                      <div style={{ width: '100%', background: 'var(--lime)', borderRadius: '2px 2px 0 0', height: `${(d.added / max) * 50}px`, minHeight: 2 }} />
                      <span className="t-mono t-muted" style={{ fontSize: 9 }}>{d.date.slice(5)}</span>
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
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {['all', 'hot', 'warm'].map(t => (
              <button key={t} onClick={() => { setTierFilter(t); setLeadsPage(1); }}
                className={`btn btn--sm ${tierFilter === t ? (t === 'hot' ? 'btn--coral' : t === 'warm' ? '' : 'btn--primary') : 'btn--ghost'}`}
                style={tierFilter === t && t === 'warm' ? { background: '#f5a623', color: '#0a0a0c', borderColor: '#f5a623', fontWeight: 700 } : undefined}
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
                      <div className="empty">
                        <div className="empty__title">No quality leads yet</div>
                        <div className="empty__desc">Go to the Calibration tab and click Populate to score your leads.</div>
                        <button className="btn btn--primary mt-12" onClick={() => setTab('calibration')}>
                          Go to Calibration →
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : leads.map(l => <LeadRow key={l.id} lead={l} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BUYING SIGNALS TAB ── */}
      {tab === 'signals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="row">
            <button onClick={doRedditScan} disabled={busy} className="btn btn--primary">
              {busy ? 'Scanning...' : 'Scan Reddit Now'}
            </button>
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
                ) : signals.map(s => (
                  <tr key={s.id}>
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
                    <td className={s.intent_classification === 'ACTIVE_SEEKING' ? 't-lime t-xs' : 't-xs'} style={s.intent_classification !== 'ACTIVE_SEEKING' ? { color: '#f5a623' } : {}}>{s.intent_classification}</td>
                    <td>{s.budget_mentioned || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CALIBRATION TAB ── */}
      {tab === 'calibration' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 8 }}>Weight Calibration</div>
            <p className="t-mono t-muted" style={{ fontSize: 11, margin: '0 0 16px' }}>
              Tests 5 weight configurations against your leads. Finds which gets 40-50% HOT rate.
            </p>
            <div className="row">
              <button onClick={doCalibrate} disabled={busy} className="btn btn--primary">{busy ? 'Calibrating...' : 'Run Calibration'}</button>
              <button onClick={() => doPopulate(true)} disabled={busy} className="btn btn--ghost" style={{ borderColor: 'var(--lime)', color: 'var(--lime)' }}>{busy ? 'Running...' : 'Dry Run (all leads)'}</button>
              <button onClick={() => doPopulate(false)} disabled={busy} className="btn btn--coral">{busy ? 'Running...' : 'POPULATE DB (score all leads)'}</button>
            </div>
          </div>

          {calibResult && (
            <div className="card" style={{ padding: 20 }}>
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
                        background: name === calibResult.recommended ? 'rgba(200,246,84,0.08)' : 'transparent',
                        border: name === calibResult.recommended ? '1px solid var(--lime)' : '1px solid var(--line)',
                      }}>
                        <span style={{ color: name === calibResult.recommended ? 'var(--lime)' : 'var(--text-2)', fontWeight: name === calibResult.recommended ? 700 : 400 }}>
                          {name === calibResult.recommended ? '★ ' : ''}{name.replace('_', ' ').toUpperCase()}
                        </span>
                        <TierBar hot_pct={r.hot_pct} warm_pct={r.warm_pct} cold_pct={r.cold_pct} />
                        <span className="t-lime">HOT {pct(r.hot_pct)}</span>
                        <span style={{ color: '#f5a623' }}>WARM {pct(r.warm_pct)}</span>
                        <span className="t-muted">COLD {pct(r.cold_pct)}</span>
                      </div>
                    ))}
                    <div className="t-mono t-lime" style={{ fontSize: 11, marginTop: 8 }}>
                      ★ Recommended: {calibResult.recommended} — closest to 40-50% HOT target
                    </div>
                  </div>
                )
              }
            </div>
          )}

          {popResult && (
            <div className="card" style={{ padding: 20 }}>
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
                <div className="t-mono" style={{ marginTop: 12, fontSize: 11, color: '#f5a623' }}>
                  ⚠ Only {popResult.hot_pct}% HOT (target 40-50%). Run calibration and try "option_a" or "option_b" weights.
                </div>
              )}
            </div>
          )}
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
              ) : logs.map(log => {
                const dur = log.completed_at && log.started_at
                  ? `${Math.round((new Date(log.completed_at) - new Date(log.started_at)) / 1000)}s` : '—';
                return (
                  <tr key={log.id}>
                    <td className="mono" style={{ fontSize: 11 }}>{new Date(log.started_at).toLocaleString()}</td>
                    <td style={{ textTransform: 'capitalize' }}>{log.scraper_type?.replace(/_/g, ' ')}</td>
                    <td>
                      <StatusDot status={log.status} />
                      <span style={{ color: log.status === 'completed' ? 'var(--lime)' : log.status === 'error' ? 'var(--coral)' : 'var(--text-2)' }}>{log.status}</span>
                    </td>
                    <td className="t-lime mono">{fmt(log.hot_added)}</td>
                    <td className="mono" style={{ color: '#f5a623' }}>{fmt(log.warm_archived)}</td>
                    <td className="t-muted mono">{fmt(log.cold_discarded)}</td>
                    <td className="t-muted mono">{dur}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
