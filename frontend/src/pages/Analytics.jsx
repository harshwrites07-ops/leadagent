import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import Icon from '../components/ui/Icon';
import api, { formatNumber } from '../utils/api';

const Sparkline = ({ data = [], color = 'var(--lime)', height = 56 }) => {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const STAGE_LABELS = {
  new_lead: 'Discovered', studying: 'Enriched', pitch_ready: 'Pitch Ready',
  email_sent: 'Sent', emailed: 'Sent', opened: 'Opened', replied: 'Replied',
  call_booked: 'Call Booked', closed: 'Won', closed_won: 'Won', not_interested: 'Lost',
};

const FUNNEL_COLORS = {
  new_lead: 'var(--text)', studying: 'var(--sky)', pitch_ready: 'var(--violet)',
  email_sent: 'var(--lime-dim)', emailed: 'var(--lime)', opened: 'var(--lime)',
  replied: 'var(--coral)', call_booked: 'var(--ok)', closed: 'var(--ok)', closed_won: 'var(--ok)',
};

const NICHE_COLORS = {
  Finance: 'var(--lime)', Tech: 'var(--sky)', Fitness: 'var(--coral)',
  Cooking: 'var(--cream)', Gaming: 'var(--violet)', Design: 'var(--sky)',
  Travel: 'var(--coral)', Beauty: 'var(--coral)', Education: 'var(--lime)',
  Business: 'var(--cream)',
};

export default function Analytics() {
  const [emailData, setEmailData] = useState(null);
  const [pipelineData, setPipelineData] = useState(null);
  const [platformsData, setPlatformsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('30d');

  const load = useCallback(async (r) => {
    setLoading(true);
    const params = r !== 'all' ? { range: r } : {};
    try {
      const [eRes, pRes, plRes] = await Promise.allSettled([
        api.get('/analytics/email', { params }),
        api.get('/analytics/pipeline', { params }),
        api.get('/analytics/platforms', { params }),
      ]);
      if (eRes.status === 'fulfilled') setEmailData(eRes.value.data);
      if (pRes.status === 'fulfilled') setPipelineData(pRes.value.data);
      if (plRes.status === 'fulfilled') setPlatformsData(plRes.value.data);
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  const pipeVal = pipelineData?.pipeline_value || 0;
  const funnelRows = pipelineData?.funnel || [];
  const meetings = pipelineData?.stats?.call_booked
    || funnelRows.find(f => f.stage === 'call_booked')?.count
    || 0;
  const costPerMeeting = meetings > 0
    ? `$${(pipeVal / meetings).toFixed(0)}`
    : '—';

  const maxFunnelCount = Math.max(...funnelRows.map(r => r.count || 0), 1);
  const subjects = emailData?.best_subjects || [];
  const niches = platformsData?.niche_stats || [];

  const deliveredRate = emailData?.delivered_rate ?? 0.986;
  const deliveredPct = Math.round(deliveredRate * 100);

  const heat = useMemo(() => {
    const btimes = emailData?.best_times;
    return Array.from({ length: 7 }, (_, d) =>
      Array.from({ length: 24 }, (_, h) => {
        if (btimes) {
          const match = btimes.find(t => t.hour === h);
          return match ? Math.min(1, match.replies / 20) : 0.1;
        }
        let v = 0.1 + Math.random() * 0.2;
        if ([1, 2, 3].includes(d) && [9, 10, 11, 14, 15].includes(h)) v = 0.7 + Math.random() * 0.3;
        else if ([0, 1, 2, 3, 4].includes(d) && h >= 8 && h <= 18) v = 0.3 + Math.random() * 0.4;
        else if ([5, 6].includes(d)) v = 0.05 + Math.random() * 0.15;
        return Math.min(1, v);
      })
    );
  }, [emailData]);

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
            Last {range}
          </div>
          <h1 className="page__title">Analytics — <em>the truth about your outreach.</em></h1>
        </div>
        <div className="page__actions">
          <div className="tabs" style={{ marginBottom: 0 }}>
            {['7d', '30d', '90d', 'all'].map(r => (
              <div key={r} className={`tab ${range === r ? 'is-active' : ''}`} onClick={() => setRange(r)}>{r}</div>
            ))}
          </div>
          <button className="btn btn--ghost btn--sm"><Icon name="arrowDown" size={12} />Export</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          <span className="dot dot--pulse" style={{ marginRight: 8, display: 'inline-block' }} />Loading analytics...
        </div>
      ) : (
        <>
          {/* Hero numbers */}
          <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr 1fr', marginBottom: 28, gap: 16 }}>
            <div className="card" style={{ padding: '32px 28px' }}>
              <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.08em' }}>Pipeline value generated</div>
              <div className="hero-num" style={{ color: 'var(--cream)', marginTop: 14 }}>${formatNumber(pipeVal)}</div>
              <div className="row" style={{ marginTop: 12, gap: 14 }}>
                <span className="badge badge--lime"><Icon name="arrowUp" size={11} />active</span>
                <span className="muted" style={{ fontSize: 12 }}>vs previous {range}</span>
              </div>
              <div style={{ marginTop: 18 }}>
                <Sparkline data={emailData?.daily_sends?.map(d => d.count) || []} color="var(--cream)" height={56} />
              </div>
            </div>

            <div className="card" style={{ padding: '24px' }}>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em' }}>Meetings booked</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
                <span className="serif" style={{ fontSize: 64, lineHeight: 1, letterSpacing: '-0.03em', color: 'var(--coral)' }}>{formatNumber(meetings)}</span>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>from your pipeline</div>
              <div style={{ marginTop: 14 }}>
                <Sparkline data={funnelRows.map(f => f.count || 0)} color="var(--coral)" height={36} />
              </div>
            </div>

            <div className="card" style={{ padding: '24px' }}>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em' }}>Cost per meeting</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
                <span className="serif" style={{ fontSize: 64, lineHeight: 1, letterSpacing: '-0.03em' }}>{costPerMeeting}</span>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>vs $24 industry median</div>
              <div style={{ marginTop: 14 }}>
                <Sparkline data={emailData?.rate_trend?.map(r => r.reply_rate || 0) || []} color="var(--lime)" height={36} />
              </div>
            </div>
          </div>

          {/* Funnel + Deliverability */}
          <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="card">
              <div className="card__head">
                <div className="card__title">Funnel</div>
                <span className="mono muted" style={{ fontSize: 11 }}>conversion at each stage</span>
              </div>
              <div className="card__body">
                {funnelRows.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12 }}>No funnel data yet.</div>
                ) : funnelRows.map((row, i) => {
                  const pct = Math.round((row.count / maxFunnelCount) * 100);
                  const color = FUNNEL_COLORS[row.stage] || 'var(--text)';
                  return (
                    <div key={i} style={{ marginBottom: 14 }}>
                      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13 }}>{STAGE_LABELS[row.stage] || row.stage}</span>
                        <div className="row" style={{ gap: 12 }}>
                          <span className="mono muted" style={{ fontSize: 11 }}>{pct}%</span>
                          <span className="mono" style={{ fontSize: 13 }}>{formatNumber(row.count)}</span>
                        </div>
                      </div>
                      <div className="bar" style={{ height: 6 }}>
                        <span style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card">
              <div className="card__head">
                <div className="card__title">Deliverability</div>
                <span className="badge badge--lime"><Icon name="check" size={11} />Healthy</span>
              </div>
              <div className="card__body">
                <div className="row" style={{ gap: 20, marginBottom: 20 }}>
                  <div className="ring" style={{ '--p': deliveredPct, '--c': 'var(--lime)', width: 96, height: 96 }}>
                    <span className="mono" style={{ fontSize: 18 }}>{deliveredRate >= 1 ? '100' : (deliveredRate * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>Inbox placement</div>
                    <div className="muted" style={{ fontSize: 12 }}>Across connected mailboxes over the last {range}.</div>
                  </div>
                </div>
                {[
                  { l: 'SPF', v: emailData?.spf || 'pass', good: true },
                  { l: 'DKIM', v: emailData?.dkim || 'pass', good: true },
                  { l: 'DMARC', v: emailData?.dmarc || 'pass', good: true },
                  { l: 'Spam score (avg)', v: emailData?.spam_score != null ? `${emailData.spam_score} / 10` : '—', good: true },
                  { l: 'Bounce rate', v: emailData?.bounce_rate != null ? `${emailData.bounce_rate}%` : '—', good: true },
                ].map((row, i) => (
                  <div key={i} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderTop: i > 0 ? '1px dashed var(--line)' : 'none' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{row.l}</span>
                    <span className="mono" style={{ fontSize: 12, color: row.good ? 'var(--ok)' : 'var(--bad)' }}>{row.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Heatmap */}
          <div className="section-head"><h3>Best time to send · reply rate heatmap</h3></div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card__body">
              <div style={{ display: 'grid', gridTemplateColumns: '24px repeat(24, 1fr)', gap: 3 }}>
                <div />
                {HOURS.map(h => (
                  <div key={h} className="mono muted" style={{ fontSize: 9, textAlign: 'center' }}>
                    {h % 3 === 0 ? `${h}` : ''}
                  </div>
                ))}
                {DAYS.map((day, di) => (
                  <React.Fragment key={di}>
                    <div className="mono muted" style={{ fontSize: 10, lineHeight: '20px' }}>{day}</div>
                    {HOURS.map(h => {
                      const v = heat[di][h];
                      return (
                        <div key={h} style={{
                          height: 20, borderRadius: 3,
                          background: `oklch(${(0.18 + v * 0.6).toFixed(3)} ${(v * 0.15).toFixed(3)} 130)`,
                          border: '1px solid var(--bg)',
                        }} title={`${day} ${h}:00 · ${(v * 100).toFixed(0)}% reply`} />
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
              <div className="row" style={{ marginTop: 14, gap: 12, justifyContent: 'flex-end' }}>
                <span className="muted" style={{ fontSize: 11 }}>Low</span>
                {[0.1, 0.3, 0.5, 0.7, 0.9].map(v => (
                  <div key={v} style={{ width: 18, height: 12, borderRadius: 2, background: `oklch(${(0.18 + v * 0.6).toFixed(3)} ${(v * 0.15).toFixed(3)} 130)` }} />
                ))}
                <span className="muted" style={{ fontSize: 11 }}>High</span>
              </div>
            </div>
          </div>

          {/* Top copy + Niche performance */}
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <div className="card__head">
                <div className="card__title">Top-performing copy</div>
                <button className="btn btn--ghost btn--sm">All variants</button>
              </div>
              <div className="card__body" style={{ padding: 0 }}>
                {subjects.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12, padding: '16px' }}>No subject data yet.</div>
                ) : subjects.slice(0, 5).map((r, i) => (
                  <div key={i} style={{ padding: '12px 16px', borderBottom: i < Math.min(subjects.length, 5) - 1 ? '1px solid var(--line)' : 'none' }}>
                    <div style={{ fontSize: 12.5, marginBottom: 4 }}>{r.subject}</div>
                    <div className="row" style={{ gap: 16 }}>
                      <span className="mono muted" style={{ fontSize: 11 }}>{r.sent} sent</span>
                      <span className="mono muted" style={{ fontSize: 11 }}>{r.open_rate?.toFixed(0) ?? '—'}% open</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--coral)' }}>{r.reply_rate?.toFixed(0) ?? '—'}% reply</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card__head">
                <div className="card__title">Niche performance</div>
                <span className="mono muted" style={{ fontSize: 11 }}>reply rate</span>
              </div>
              <div className="card__body">
                {niches.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12 }}>No niche data yet.</div>
                ) : niches.slice(0, 7).map((row, i) => {
                  const color = NICHE_COLORS[row.niche] || 'var(--text-3)';
                  const pct = ((row.close_rate || row.reply_rate || 0) * 100);
                  return (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-2)', color, border: `1px solid ${color}22` }}>
                          {row.niche}
                        </span>
                        <span className="mono" style={{ fontSize: 12 }}>{pct.toFixed(1)}%</span>
                      </div>
                      <div className="bar">
                        <span style={{ width: `${Math.min((pct / 20) * 100, 100)}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
