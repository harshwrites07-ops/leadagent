import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Zap, TrendingUp, Mail,
  Activity, ChevronRight, RefreshCw,
  Users, Target,
} from 'lucide-react';
import Icon from '../components/ui/Icon';
import PowerSendOverlay from '../components/ui/PowerSendOverlay';
import { useApp } from '../context/AppContext';
import { formatNumber, formatDate } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useCountUp } from '../hooks/useCountUp';

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

  const stats = {
    leadsFound:      s?.total_leads ?? 0,
    leadsToday:      s?.leads_today ?? 0,
    pitchesSent:     s?.emails_today ?? 0,
    pitchesMonth:    formatNumber(s?.emails_month ?? 0),
    openRate:        s?.open_rate != null ? Number(s.open_rate).toFixed(1) : '0.0',
    replyRate:       s?.reply_rate != null ? Number(s.reply_rate).toFixed(1) : '0.0',
    pipeline:        s?.pipeline_value ?? 0,
    callsBooked:     s?.call_booked ?? 0,
    totalLeads:      s?.total_leads ?? 0,
    queueSize:       s?.queue_size ?? 0,
    hotLeads:        s?.hot_leads ?? 0,
    activeCampaigns: s?.active_campaigns ?? 0,
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

  // Bridge vars
  const loading = loadingDash;
  const fetchDashboard = refreshDashboard;
  const handleImport = () => navigate('/leads');
  const handlePowerEmail = () => setShowPowerOverlay(true);
  const recentReplies = activities.filter(a => a.type === 'reply_received').slice(0, 3);
  const formatTime = formatDate;

  // Animated counters
  const animLeads = useCountUp(stats.leadsFound, 1000, 100);
  const animPitches = useCountUp(stats.pitchesSent, 1000, 200);
  const animCalls = useCountUp(stats.callsBooked, 1000, 400);

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
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 24,
          gap: 16,
        }}
      >
        <div>
          <h1 style={{
            fontFamily: 'var(--f-serif)',
            fontStyle: 'italic',
            fontSize: 30,
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
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              style={{ marginTop: 6, fontSize: 13, color: 'var(--coral)', fontWeight: 500, margin: '6px 0 0' }}
            >
              <span style={{ fontWeight: 700 }}>{urgentCount} conversation{urgentCount !== 1 ? 's' : ''}</span>
              {' '}need a human.{' '}
              <span style={{ color: 'var(--text-3)' }}>Everything else is on autopilot.</span>
            </motion.p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn" onClick={handleImport}>
            + Import leads
          </button>
          <button className="btn btn--primary" onClick={handlePowerEmail}>
            <Zap size={13} />
            Power Email
          </button>
        </div>
      </motion.div>

      {/* ── Stat Tiles ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          {
            label: 'LEADS FOUND',
            value: animLeads.toLocaleString(),
            meta: `+${stats.leadsToday} today`,
            metaColor: 'var(--ok)',
            spark: s?.charts?.weekly_leads?.map(d => d.count) || null,
            sparkColor: 'var(--lime)',
            delay: 0,
          },
          {
            label: 'PITCHES SENT',
            value: animPitches.toLocaleString(),
            meta: `${stats.pitchesMonth} this month`,
            metaColor: 'var(--text-3)',
            spark: spark1,
            sparkColor: 'var(--lime)',
            delay: 80,
          },
          {
            label: 'OPENS',
            value: `${stats.openRate}%`,
            meta: `reply rate ${stats.replyRate}%`,
            metaColor: 'var(--text-3)',
            spark: spark2,
            sparkColor: 'var(--coral)',
            delay: 160,
            serif: true,
          },
          {
            label: 'IN THE PIPE',
            value: `$${Number(stats.pipeline).toLocaleString()}`,
            meta: `${animCalls} calls booked`,
            metaColor: 'var(--ok)',
            spark: null,
            sparkColor: 'var(--ok)',
            delay: 240,
            highlight: true,
          },
        ].map(({ label, value, meta, metaColor, spark, sparkColor, delay, serif, highlight }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: delay / 1000, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className="stat"
            style={{ cursor: 'default' }}
          >
            <div className="stat__label">{label}</div>
            <div
              className={serif ? 'stat__value' : 'stat__value stat__value--mono'}
              style={highlight ? { color: 'var(--ok)' } : {}}
            >
              {value}
            </div>
            {spark ? (
              <div style={{ marginBottom: 10, height: 40 }}>
                <Sparkline data={spark} color={sparkColor} />
              </div>
            ) : (
              <div style={{ height: 40, marginBottom: 10, display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', width: '100%' }}>
                  {[3, 6, 4, 7, 5, 8, 6, 9, 7, 10].map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ delay: (delay / 1000) + (i * 0.04), duration: 0.3 }}
                      style={{
                        flex: 1,
                        height: `${h * 3}px`,
                        background: sparkColor,
                        opacity: 0.15 + (i / 10) * 0.5,
                        borderRadius: '2px 2px 0 0',
                        transformOrigin: 'bottom',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="stat__meta" style={{ color: metaColor }}>{meta}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Main Grid (2fr 1fr) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>

        {/* Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="card"
        >
          <div className="card__head">
            <div className="row" style={{ gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                What's happening
              </span>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'rgba(110,231,168,0.08)',
                border: '1px solid rgba(110,231,168,0.2)',
                borderRadius: 20, padding: '2px 8px',
                fontSize: 9, fontWeight: 700,
                color: 'var(--ok)', fontFamily: 'var(--f-mono)',
                letterSpacing: '0.5px',
              }}>
                <motion.div
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--ok)' }}
                />
                LIVE
              </span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn--ghost btn--sm">Last 24h</button>
              <button className="btn btn--ghost btn--sm" onClick={fetchDashboard}>
                <RefreshCw size={11} />
              </button>
            </div>
          </div>
          <div className="card__body">
            {!activities?.length ? (
              <div className="empty" style={{ padding: '32px 0' }}>
                <Activity size={28} style={{ opacity: 0.2, marginBottom: 8 }} />
                <div className="empty__title">No activity yet</div>
                <div className="empty__desc">Start a campaign to see live updates here.</div>
                <button
                  className="btn btn--primary btn--sm"
                  style={{ marginTop: 12 }}
                  onClick={() => navigate('/campaigns')}
                >
                  Create Campaign →
                </button>
              </div>
            ) : (
              <div>
                {activities.slice(0, 6).map((item, i) => {
                  const meta = activityTagMap[item.type] ?? activityTagMap.lead_found;
                  return (
                    <motion.div
                      key={item.id || i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + (i * 0.05), duration: 0.3 }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 0',
                        borderBottom: '1px solid var(--line)',
                        cursor: 'pointer',
                      }}
                      whileHover={{ x: 4 }}
                    >
                      <div className="row" style={{ gap: 10 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 7,
                          background: meta.human ? 'var(--coral-soft)' : 'var(--lime-soft)',
                          border: `1px solid ${meta.human ? 'var(--coral-border)' : 'var(--lime-border)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {meta.human
                            ? <Mail size={12} color="var(--coral)" />
                            : <Target size={12} color="var(--lime)" />
                          }
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 1 }}>
                            {item.message}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--f-mono)' }}>
                            {item.channel_name && `${item.channel_name} · `}{formatTime(item.created_at)}
                          </div>
                        </div>
                      </div>
                      {meta.human ? (
                        <button className="btn btn--sm btn--coral" onClick={() => navigate('/email')}>
                          Reply <ChevronRight size={11} />
                        </button>
                      ) : (
                        <ChevronRight size={14} color="var(--text-4)" />
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>

        {/* CRM Pipeline */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="card"
        >
          <div className="card__head">
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              Where deals stand
            </span>
            <button className="btn btn--ghost btn--sm" onClick={() => navigate('/crm')}>
              View CRM →
            </button>
          </div>
          <div className="card__body">
            {crmStages.length === 0 ? (
              <div className="empty" style={{ padding: '24px 0' }}>
                <Users size={24} style={{ opacity: 0.2, marginBottom: 8 }} />
                <div className="empty__title">No leads in pipeline</div>
                <div className="empty__desc">Add leads to your CRM to track deals here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {crmStages.map((stage, i) => (
                  <motion.div
                    key={stage.name}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + (i * 0.06), duration: 0.3 }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    }}
                    whileHover={{ backgroundColor: 'var(--hover)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.4 + (i * 0.06), type: 'spring', stiffness: 200 }}
                        style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: stage.color || 'var(--text-4)',
                          boxShadow: `0 0 6px ${stage.color || 'transparent'}`,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{stage.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {stage.value > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--lime)', fontFamily: 'var(--f-mono)' }}>
                          ${stage.value.toLocaleString()}
                        </span>
                      )}
                      <span style={{
                        fontSize: 12, fontWeight: 700, fontFamily: 'var(--f-mono)',
                        color: 'var(--text)', background: 'var(--surface-3)',
                        padding: '2px 7px', borderRadius: 4,
                      }}>
                        {stage.count}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Bottom Grid (1fr 1fr) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Recent Replies */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="card"
        >
          <div className="card__head">
            <div className="row" style={{ gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                Humans responded
              </span>
              {urgentCount > 0 && (
                <Badge kind="coral">
                  <span className="dot dot--pulse-coral" />
                  {urgentCount} unread
                </Badge>
              )}
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => navigate('/email')}>
              View inbox →
            </button>
          </div>
          <div className="card__body">
            {recentReplies.length > 0 ? (
              recentReplies.map((reply, i) => (
                <motion.div
                  key={reply.id || i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 + (i * 0.08) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 0',
                    borderBottom: i < recentReplies.length - 1 ? '1px solid var(--line)' : 'none',
                  }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: 'var(--coral-soft)',
                    border: '1px solid var(--coral-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: 'var(--coral)',
                    flexShrink: 0,
                  }}>
                    {reply.channel_name?.[0]?.toUpperCase() || 'C'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 1 }}>
                      {reply.channel_name || 'Creator'}
                    </div>
                    <div style={{
                      fontSize: 11, color: 'var(--text-3)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {reply.message}
                    </div>
                  </div>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'var(--coral)',
                    boxShadow: '0 0 6px var(--coral)',
                    flexShrink: 0,
                  }} />
                </motion.div>
              ))
            ) : (
              <div className="empty" style={{ padding: '24px 0' }}>
                <Mail size={24} style={{ opacity: 0.2, marginBottom: 8 }} />
                <div className="empty__title">All caught up</div>
                <div className="empty__desc">No pending replies — everything's being handled.</div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Quick Numbers */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="card"
        >
          <div className="card__head">
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              Quick Numbers
            </span>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 9, fontWeight: 700,
              color: 'var(--ok)', fontFamily: 'var(--f-mono)',
              letterSpacing: '0.5px',
            }}>
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--ok)' }}
              />
              LIVE DATA
            </span>
          </div>
          <div className="card__body">
            {[
              { label: 'Total Leads in DB',   value: stats.totalLeads.toLocaleString(), color: 'var(--text)',   IconComp: Users },
              { label: 'Emails in Queue',      value: stats.queueSize,                   color: 'var(--warn)',  IconComp: Mail },
              { label: 'HOT Leads Available',  value: stats.hotLeads,                    color: 'var(--coral)', IconComp: Target },
              { label: 'Campaigns Active',     value: stats.activeCampaigns,             color: 'var(--lime)',  IconComp: TrendingUp },
            ].map(({ label, value, color, IconComp }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.45 + (i * 0.06), duration: 0.3 }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: i < 3 ? '1px solid var(--line)' : 'none',
                }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <IconComp size={13} color="var(--text-4)" />
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
                </div>
                <motion.span
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.5 + (i * 0.06), type: 'spring', stiffness: 200 }}
                  style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--f-mono)', color }}
                >
                  {value}
                </motion.span>
              </motion.div>
            ))}
          </div>
        </motion.div>
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
