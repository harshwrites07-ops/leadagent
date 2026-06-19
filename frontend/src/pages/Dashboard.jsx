import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
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
  const palette = ['#D4FF00', '#ff8a73', '#8ec5ff', '#c4b5fd', '#f4ecd8', '#6ee7a8', '#ffd166'];
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

const stageLabels = {
  new_lead: 'New Lead', studying: 'Studying', pitch_ready: 'Pitch Ready',
  email_sent: 'Email Sent', replied: 'Replied', call_booked: 'Call Booked',
  closed: 'Closed', not_interested: 'Not Interested',
};
const stageColors = {
  new_lead: 'var(--text-4)', studying: 'var(--sky)', pitch_ready: 'var(--violet)',
  email_sent: 'var(--lime)', replied: 'var(--coral)', call_booked: 'var(--ok)',
  closed: 'var(--ok)', not_interested: 'var(--bad)',
};

export default function Dashboard() {
  const { dashboardStats, activities, loadingDash, refreshDashboard } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showPowerOverlay, setShowPowerOverlay] = useState(false);

  const s = dashboardStats;
  const firstName = user?.full_name?.split(' ')[0] || user?.name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Hey' : 'Good evening';
  const urgentCount = activities.filter(a => a.type === 'reply_received').length;

  const spark1 = s?.charts?.weekly_emails?.map(d => d.count) || [12, 18, 14, 22, 24, 20, 30, 28, 36, 40, 38, 44, 52, 48, 60];
  const spark2 = [40, 38, 42, 36, 44, 40, 48, 44, 52, 50, 58, 54, 62, 60, 66];
  const spark3 = s?.charts?.weekly_replies?.map(d => d.count) || [5, 6, 5, 7, 6, 8, 7, 9, 8, 10, 11, 10, 12, 13, 14];

  const stats = {
    leadsFound:       s?.total_leads ?? 0,
    leadsToday:       s?.leads_today ?? 0,
    pitchesSent:      s?.emails_today ?? 0,
    pitchesMonth:     formatNumber(s?.emails_month ?? 0),
    openRate:         s?.open_rate != null ? Number(s.open_rate).toFixed(1) : '0.0',
    replyRate:        s?.reply_rate != null ? Number(s.reply_rate).toFixed(1) : '0.0',
    pipeline:         formatNumber(s?.pipeline_value ?? 0),
    callsBooked:      s?.call_booked ?? 0,
    totalLeads:       formatNumber(s?.total_leads ?? 0),
    queueSize:        s?.queue_size ?? 0,
    hotLeads:         s?.hot_leads ?? 0,
    activeCampaigns:  s?.active_campaigns ?? 0,
  };

  const crmStages = s?.stage_distribution
    ? Object.entries(s.stage_distribution)
        .filter(([, v]) => v > 0)
        .map(([stage, count]) => ({
          name: stage,
          label: stageLabels[stage] || stage,
          color: stageColors[stage] || 'var(--text-4)',
          count,
        }))
    : [];

  if (loadingDash) {
    return (
      <div style={{ padding: '28px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 130, borderRadius: 12 }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div className="skeleton" style={{ height: 320, borderRadius: 12 }} />
          <div className="skeleton" style={{ height: 320, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1360, margin: '0 auto' }}>

      {/* ── Page Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <h1 style={{
              fontFamily: 'var(--f-serif)',
              fontStyle: 'italic',
              fontSize: 32,
              fontWeight: 400,
              color: 'var(--text)',
              letterSpacing: '-0.5px',
              lineHeight: 1.15,
              margin: 0,
            }}>
              {greeting},{' '}
              <span style={{ color: 'var(--text-2)' }}>{firstName}</span>
              {' '}—{' '}
              <span style={{ color: 'var(--text-3)', fontWeight: 300 }}>
                {stats.pitchesSent === 0 ? 'ready to start sending.' : `${stats.pitchesSent} pitches out the door.`}
              </span>
            </h1>
            {urgentCount > 0 && (
              <p style={{ marginTop: 6, fontSize: 13, color: 'var(--coral)', fontWeight: 500, margin: '6px 0 0' }}>
                <span style={{ fontWeight: 700 }}>{urgentCount} conversation{urgentCount !== 1 ? 's' : ''}</span> need a human.{' '}
                <span style={{ color: 'var(--text-3)' }}>Everything else is on autopilot.</span>
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
            <button className="btn" onClick={() => navigate('/leads')}>
              + Import leads
            </button>
            <button
              className="btn btn--primary"
              onClick={() => setShowPowerOverlay(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Zap size={13} />
              Power Email
            </button>
          </div>
        </div>
      </div>

      {/* ── Stat Tiles ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 20,
      }}>
        {/* LEADS FOUND */}
        <div className="stat">
          <div className="stat__label">Leads Found</div>
          <div className="stat__value stat__value--mono">{formatNumber(stats.leadsFound)}</div>
          <div className="stat__spark">
            <Sparkline data={s?.charts?.weekly_leads?.map(d => d.count) || [0,1,2,1,3,2,4,3,5,4,6,5,8,7,10]} color="var(--lime)" />
          </div>
          <div className="stat__delta stat__delta--up">
            <Icon name="arrowUp" size={11} />
            +{stats.leadsToday} today
          </div>
        </div>

        {/* PITCHES SENT */}
        <div className="stat">
          <div className="stat__label">Pitches Sent</div>
          <div className="stat__value stat__value--mono">
            {stats.pitchesSent}
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-3)', marginLeft: 4 }}>today</span>
          </div>
          <div className="stat__spark">
            <Sparkline data={spark1} color="var(--lime)" />
          </div>
          <div className="stat__delta">
            <Icon name="arrowR" size={11} />
            {stats.pitchesMonth} this month
          </div>
        </div>

        {/* OPENS */}
        <div className="stat">
          <div className="stat__label">Opens</div>
          <div className="stat__value">{stats.openRate}%</div>
          <div className="stat__spark">
            <Sparkline data={spark2} color="var(--coral)" />
          </div>
          <div className="stat__delta">
            <Icon name="arrowR" size={11} />
            reply rate {stats.replyRate}%
          </div>
        </div>

        {/* IN THE PIPE */}
        <div className="stat">
          <div className="stat__label">In The Pipe</div>
          <div className="stat__value stat__value--mono" style={{ color: 'var(--ok)' }}>
            ${stats.pipeline}
          </div>
          <div className="stat__spark">
            <Sparkline data={[200,400,350,600,800,750,1000,1200,1100,1400,1600,1800,2000,2200,2400]} color="var(--ok)" />
          </div>
          <div className="stat__delta stat__delta--up">
            <Icon name="arrowUp" size={11} />
            {stats.callsBooked} calls booked
          </div>
        </div>
      </div>

      {/* ── Main Grid (2fr 1fr) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: 12,
        marginBottom: 12,
      }}>
        {/* What's happening */}
        <div className="card">
          <div className="card__head">
            <div className="row">
              <div className="card__title">What's happening</div>
              <Badge kind="lime">
                <span className="dot dot--pulse" />
                Live
              </Badge>
            </div>
            <div className="row">
              <button className="btn btn--ghost btn--sm">Last 24h</button>
              <button className="btn btn--ghost btn--sm" onClick={refreshDashboard}>Refresh</button>
            </div>
          </div>
          <div className="card__body" style={{ padding: 0 }}>
            {activities.length === 0 ? (
              <div className="empty" style={{ padding: '32px 16px' }}>
                <div className="empty__title">No activity yet</div>
                <div className="empty__desc">Start a campaign to see live updates here.</div>
              </div>
            ) : activities.slice(0, 5).map((row, i) => {
              const meta = activityTagMap[row.type] ?? activityTagMap.lead_found;
              return (
                <div key={i} style={{
                  display: 'flex', gap: 14, padding: '14px 16px',
                  borderBottom: i < Math.min(activities.length - 1, 4) ? '1px solid var(--line)' : 'none',
                  background: meta.human ? 'var(--coral-soft)' : 'transparent',
                }}>
                  <div className="mono" style={{ color: 'var(--text-3)', fontSize: 11, width: 56, flexShrink: 0, paddingTop: 2 }}>
                    {formatDate(row.created_at)}
                  </div>
                  <div style={{ width: 8, marginTop: 6, flexShrink: 0 }}>
                    <span className="dot" style={{ color: meta.acc, width: 6, height: 6 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8, marginBottom: 2 }}>
                      <span className="mono" style={{ color: meta.acc, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                        {meta.tag}
                      </span>
                    </div>
                    <div style={{ fontSize: 13 }}>{row.message}</div>
                    {row.channel_name && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 2, fontFamily: 'var(--f-mono)' }}>
                        {row.channel_name}
                      </div>
                    )}
                  </div>
                  {meta.human && (
                    <button
                      className="btn btn--sm btn--coral"
                      style={{ alignSelf: 'center' }}
                      onClick={() => navigate('/email')}
                    >
                      Reply <Icon name="arrowR" size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Where deals stand */}
        <div className="card">
          <div className="card__head">
            <div className="card__title">Where deals stand</div>
            <button className="btn btn--ghost btn--sm" onClick={() => navigate('/crm')}>
              View CRM
            </button>
          </div>
          <div className="card__body" style={{ padding: 0 }}>
            {crmStages.length === 0 ? (
              <div className="empty" style={{ padding: '24px 16px' }}>
                <div className="empty__title">No leads in pipeline yet</div>
                <div className="empty__desc">Add leads to your CRM to track deals here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {crmStages.map((stage, i) => (
                  <div key={stage.name} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: i < crmStages.length - 1 ? '1px solid var(--line)' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 8, height: 8,
                        borderRadius: '50%',
                        background: stage.color,
                        boxShadow: `0 0 6px ${stage.color}`,
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{stage.label}</span>
                    </div>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: 'var(--f-mono)',
                      color: 'var(--text)',
                    }}>{stage.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom Grid (1fr 1fr) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
      }}>
        {/* Recent replies */}
        <div className="card">
          <div className="card__head">
            <div className="row">
              <div className="card__title">Humans responded</div>
              {urgentCount > 0 && (
                <Badge kind="coral">
                  <span className="dot dot--pulse-coral" />
                  {urgentCount} unread
                </Badge>
              )}
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => navigate('/email')}>
              View inbox <Icon name="chev" size={11} />
            </button>
          </div>
          <div className="card__body" style={{ padding: 0 }}>
            {urgentCount === 0 ? (
              <div className="empty" style={{ padding: '24px 16px' }}>
                <div className="empty__title">All caught up</div>
                <div className="empty__desc">No pending replies — everything's being handled.</div>
              </div>
            ) : activities.filter(a => a.type === 'reply_received').slice(0, 3).map((row, i, arr) => (
              <div key={i} style={{
                display: 'flex', gap: 12, padding: 14,
                borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none',
              }}>
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

        {/* Quick numbers */}
        <div className="card">
          <div className="card__head">
            <div className="card__title">Quick Numbers</div>
            <Badge kind="ok">
              <Icon name="check" size={11} />
              Live data
            </Badge>
          </div>
          <div className="card__body" style={{ padding: '8px 16px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                { label: 'Total Leads in DB',    value: stats.totalLeads,      color: 'var(--text)' },
                { label: 'Leads Today',           value: formatNumber(s?.leads_today ?? 0), color: 'var(--lime)' },
                { label: 'HOT Leads Available',   value: formatNumber(stats.hotLeads),      color: 'var(--coral)' },
                { label: 'Campaigns Active',      value: formatNumber(stats.activeCampaigns), color: 'var(--lime)' },
                { label: 'Conversion Rate',       value: s?.conversion_rate != null ? `${Number(s.conversion_rate).toFixed(1)}%` : '—', color: 'var(--ok)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 0',
                  borderBottom: '1px solid var(--line)',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    fontFamily: 'var(--f-mono)',
                    color,
                  }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showPowerOverlay && (
        <PowerSendOverlay
          maxLeads={100}
          onClose={() => { setShowPowerOverlay(false); refreshDashboard(); }}
        />
      )}
    </div>
  );
}
