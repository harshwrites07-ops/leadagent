import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import PowerSendOverlay from '../components/ui/PowerSendOverlay';
import { useApp } from '../context/AppContext';
import { formatNumber, formatDate } from '../utils/api';
import { useAuth } from '../context/AuthContext';

/* Smooth SVG sparkline */
function Sparkline({ data = [], color = 'var(--lime)', height = 36 }) {
  if (!data.length) return null;
  const w = 200, h = height;
  const vals = data.map(d => (typeof d === 'object' ? (d.count ?? d.value ?? 0) : d));
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || 1;
  const pts = vals.map((v, i) => [
    (i / (vals.length - 1)) * w,
    h - ((v - min) / span) * (h - 4) - 2,
  ]);
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const dFill = `${d} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <path d={dFill} fill={color} opacity={0.10} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Avatar({ name, color }) {
  const init = (name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const palette = ['#c8f654', '#ff8a73', '#8ec5ff', '#c4b5fd', '#f4ecd8', '#6ee7a8', '#ffd166'];
  const bg = color || palette[(name?.charCodeAt(0) ?? 0) % palette.length];
  return <span className="ava" style={{ background: bg, color: '#0a0a0c' }}>{init}</span>;
}

function Badge({ children, kind = '' }) {
  return <span className={`badge${kind ? ' badge--' + kind : ''}`}>{children}</span>;
}

const activityTagMap = {
  lead_found:       { tag: 'scraping',      acc: 'var(--lime)',  human: false },
  pitch_generated:  { tag: 'writing',       acc: 'var(--lime)',  human: false },
  email_sent:       { tag: 'sending',       acc: 'var(--lime)',  human: false },
  reply_received:   { tag: 'human needed',  acc: 'var(--coral)', human: true  },
  viral_detected:   { tag: 'research',      acc: 'var(--lime)',  human: false },
};

export default function Dashboard() {
  const { dashboardStats, activities, loadingDash, refreshDashboard } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showPowerOverlay, setShowPowerOverlay] = useState(false);

  const s = dashboardStats;
  const firstName = user?.full_name?.split(' ')[0] || 'there';

  const spark1 = s?.charts?.weekly_emails?.map(d => d.count) || [12, 18, 14, 22, 24, 20, 30, 28, 36, 40, 38, 44, 52, 48, 60];
  const spark2 = [40, 38, 42, 36, 44, 40, 48, 44, 52, 50, 58, 54, 62, 60, 66];
  const spark3 = s?.charts?.weekly_replies?.map(d => d.count) || [5, 6, 5, 7, 6, 8, 7, 9, 8, 10, 11, 10, 12, 13, 14];

  const emailsSent = formatNumber(s?.emails_month ?? 0);
  const replyRate = s?.reply_rate != null ? `${Number(s.reply_rate).toFixed(1)}%` : '—';
  const meetingsBooked = formatNumber(s?.call_booked ?? 0);
  const deliverability = '98.6%';

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (loadingDash) {
    return (
      <div className="page">
        <div className="grid g-4" style={{ marginBottom: 24 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="stat" style={{ height: 120, background: 'var(--surface-2)', animation: 'none' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Page header */}
      <div className="page__head">
        <div>
          <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
            {today}
          </div>
          <h1 className="page__title">
            {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Hey' : 'Evening'}, {firstName} — <em>{emailsSent === '0' ? 'ready to start sending.' : `${emailsSent} emails out the door.`}</em>
          </h1>
          <div className="page__sub">
            <span style={{ color: 'var(--coral)' }}>{activities.filter(a => a.type === 'reply_received').length} conversations need a human.</span>
            {' '}Everything else is on autopilot.
          </div>
        </div>
        <div className="page__actions">
          <button className="btn btn--ghost" onClick={() => navigate('/leads')}><Icon name="plus" />Import leads</button>
          <button className="btn btn--primary" onClick={() => setShowPowerOverlay(true)}><Icon name="rocket" size={14} />Power Email</button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid g-4">
        <div className="stat">
          <div className="stat__label">Leads found</div>
          <div className="stat__value stat__value--mono">{formatNumber(s?.total_leads ?? 0)}</div>
          <div className="stat__delta stat__delta--up"><Icon name="arrowUp" size={11} />+{s?.leads_today ?? 0} today</div>
          <div className="stat__spark"><Sparkline data={s?.charts?.weekly_leads?.map(d => d.count) || [0,1,2,1,3,2,4,3,5,4,6,5,8,7,10]} color="var(--lime)" /></div>
        </div>
        <div className="stat">
          <div className="stat__label">Pitches sent</div>
          <div className="stat__value stat__value--mono">{formatNumber(s?.emails_today ?? 0)}<span className="muted" style={{ fontSize: 14, fontWeight: 400 }}> today</span></div>
          <div className="stat__delta"><Icon name="arrowR" size={11} />{formatNumber(s?.emails_month ?? 0)} this month</div>
          <div className="stat__spark"><Sparkline data={spark1} /></div>
        </div>
        <div className="stat">
          <div className="stat__label">Opens</div>
          <div className="stat__value">{s?.open_rate != null ? `${Number(s.open_rate).toFixed(1)}%` : '—'}</div>
          <div className="stat__delta"><Icon name="arrowR" size={11} />reply rate {replyRate}</div>
          <div className="stat__spark"><Sparkline data={spark2} color="var(--coral)" /></div>
        </div>
        <div className="stat">
          <div className="stat__label">In the pipe</div>
          <div className="stat__value stat__value--mono" style={{ color: 'var(--ok)' }}>
            ${formatNumber(s?.pipeline_value ?? 0)}
          </div>
          <div className="stat__delta stat__delta--up"><Icon name="arrowUp" size={11} />{meetingsBooked} calls booked</div>
          <div className="stat__spark"><Sparkline data={[200,400,350,600,800,750,1000,1200,1100,1400,1600,1800,2000,2200,2400]} color="var(--ok)" /></div>
        </div>
      </div>

      {/* Two-column: agent activity + schedule */}
      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', marginTop: 24 }}>
        {/* Agent activity */}
        <div className="card">
          <div className="card__head">
            <div className="row">
              <div className="card__title">What's happening</div>
              <Badge kind="lime"><span className="dot dot--pulse" />Live</Badge>
            </div>
            <div className="row">
              <button className="btn btn--ghost btn--sm">Last 24h</button>
              <button className="btn btn--ghost btn--sm" onClick={refreshDashboard}>Refresh</button>
            </div>
          </div>
          <div className="card__body" style={{ padding: 0 }}>
            {activities.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                No activity yet. Start a campaign to see live updates here.
              </div>
            ) : activities.slice(0, 5).map((row, i) => {
              const meta = activityTagMap[row.type] ?? activityTagMap.lead_found;
              return (
                <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 16px', borderBottom: i < 4 ? '1px solid var(--line)' : 'none', background: meta.human ? 'var(--coral-soft)' : 'transparent' }}>
                  <div className="mono" style={{ color: 'var(--text-3)', fontSize: 11, width: 56, flexShrink: 0, paddingTop: 2 }}>{formatDate(row.created_at)}</div>
                  <div style={{ width: 8, marginTop: 6, flexShrink: 0 }}>
                    <span className="dot" style={{ color: meta.acc, width: 6, height: 6 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8, marginBottom: 2 }}>
                      <span className="mono" style={{ color: meta.acc, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>{meta.tag}</span>
                    </div>
                    <div style={{ fontSize: 13 }}>{row.message}</div>
                    {row.channel_name && <div className="muted" style={{ fontSize: 11, marginTop: 2, fontFamily: 'var(--f-mono)' }}>{row.channel_name}</div>}
                  </div>
                  {meta.human && (
                    <button className="btn btn--sm btn--coral" style={{ alignSelf: 'center' }} onClick={() => navigate('/email')}>
                      Reply <Icon name="arrowR" size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick stats */}
        <div className="card">
          <div className="card__head">
            <div className="card__title">Where deals stand</div>
            <button className="btn btn--ghost btn--sm" onClick={() => navigate('/crm')}>View CRM</button>
          </div>
          <div className="card__body" style={{ padding: 0 }}>
            {s?.stage_distribution && Object.entries(s.stage_distribution).filter(([, v]) => v > 0).map(([stage, count], i, arr) => {
              const stageLabels = { new_lead: 'New Lead', studying: 'Studying', pitch_ready: 'Pitch Ready', email_sent: 'Email Sent', replied: 'Replied', call_booked: 'Call Booked', closed: 'Closed', not_interested: 'Not Interested' };
              const stageColors = { new_lead: 'var(--text-4)', studying: 'var(--sky)', pitch_ready: 'var(--violet)', email_sent: 'var(--lime)', replied: 'var(--coral)', call_booked: 'var(--ok)', closed: 'var(--ok)', not_interested: 'var(--bad)' };
              return (
                <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: stageColors[stage] || 'var(--text-4)', flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 12.5 }}>{stageLabels[stage] || stage}</div>
                  <span className="mono" style={{ fontSize: 12 }}>{count}</span>
                </div>
              );
            })}
            {(!s?.stage_distribution || Object.values(s.stage_distribution).every(v => v === 0)) && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                No leads in pipeline yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row: Inbox + Stats */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 24 }}>
        <div className="card">
          <div className="card__head">
            <div className="row">
              <div className="card__title">Humans responded</div>
              {activities.filter(a => a.type === 'reply_received').length > 0 && (
                <Badge kind="coral"><span className="dot dot--pulse-coral" />{activities.filter(a => a.type === 'reply_received').length} unread</Badge>
              )}
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => navigate('/email')}>View inbox <Icon name="chev" size={11} /></button>
          </div>
          <div className="card__body" style={{ padding: 0 }}>
            {activities.filter(a => a.type === 'reply_received').length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                All caught up. No pending replies.
              </div>
            ) : activities.filter(a => a.type === 'reply_received').slice(0, 3).map((row, i, arr) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: 14, borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <Avatar name={row.channel_name || 'Unknown'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{row.channel_name || 'Creator'}</div>
                    <Badge kind="coral">replied</Badge>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{row.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <div className="card__title">Numbers</div>
            <Badge kind="ok"><Icon name="check" size={11} />Live data</Badge>
          </div>
          <div className="card__body">
            <div className="grid g-2" style={{ gap: 16 }}>
              {[
                { l: 'Total leads', v: formatNumber(s?.total_leads ?? 0) },
                { l: 'Leads today',  v: formatNumber(s?.leads_today ?? 0) },
                { l: 'Emails today', v: formatNumber(s?.emails_today ?? 0) },
                { l: 'Conversion',   v: s?.conversion_rate != null ? `${Number(s.conversion_rate).toFixed(1)}%` : '—' },
              ].map((m, i) => (
                <div key={i} style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'var(--bg-2)' }}>
                  <div className="mono muted" style={{ fontSize: 10.5, marginBottom: 6 }}>{m.l.toUpperCase()}</div>
                  <div className="mono" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>{m.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showPowerOverlay && (
        <PowerSendOverlay maxLeads={100} onClose={() => { setShowPowerOverlay(false); refreshDashboard(); }} />
      )}
    </div>
  );
}
