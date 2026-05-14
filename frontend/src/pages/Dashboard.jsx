import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, UserPlus, Mail, MailOpen, TrendingUp, DollarSign,
  RefreshCw, Zap, MessageSquare, Star, Flame, Activity,
  BarChart2, AlertCircle,
} from 'lucide-react';
import PowerSendOverlay from '../components/ui/PowerSendOverlay';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { formatNumber, formatDate } from '../utils/api';

const activityMeta = {
  lead_found:       { icon: UserPlus,  color: '#00E5A0', label: 'Lead Found' },
  pitch_generated:  { icon: Zap,       color: '#7B61FF', label: 'Pitch Generated' },
  email_sent:       { icon: Mail,      color: '#00B8D4', label: 'Email Sent' },
  reply_received:   { icon: Star,      color: '#F5A623', label: 'Reply Received' },
  viral_detected:   { icon: Flame,     color: '#FF4500', label: 'Viral Detected' },
};

const crmStageColors = {
  new_lead:       '#555',
  studying:       '#00B8D4',
  pitch_ready:    '#7B61FF',
  email_sent:     '#FF4500',
  replied:        '#F5A623',
  call_booked:    '#00E5A0',
  closed:         '#00C896',
  not_interested: '#cc3333',
};

const crmStageLabels = {
  new_lead: 'New Lead', studying: 'Studying', pitch_ready: 'Pitch Ready',
  email_sent: 'Email Sent', replied: 'Replied', call_booked: 'Call Booked',
  closed: 'Closed', not_interested: 'Not Interested',
};

const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: 8, padding: '8px 12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
    }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.05em' }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>
          {p.name}: {formatNumber(p.value)}
        </p>
      ))}
    </div>
  );
};

const SkeletonCard = () => (
  <div className="skeleton" style={{
    height: 110, borderRadius: 8,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
  }} />
);

const StatCard = ({ icon: Icon, label, value, sub, color = '#FF4500', accentBorder = false, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, delay }}
    style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderLeft: accentBorder ? `3px solid ${color}` : '1px solid var(--border-subtle)',
      borderRadius: 8,
      padding: '18px 20px',
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9, fontWeight: 600, letterSpacing: '0.16em',
          color: 'var(--text-muted)', marginBottom: 10,
          textTransform: 'uppercase',
        }}>{label}</p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 36, fontWeight: 700,
          lineHeight: 1, color: color,
          letterSpacing: '-0.02em',
        }}>{value}</p>
        {sub && <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9, color: 'var(--text-muted)',
          marginTop: 8, letterSpacing: '0.08em',
        }}>{sub}</p>}
      </div>
      <div style={{
        padding: 8, borderRadius: 7, flexShrink: 0,
        background: `${color}12`,
        border: `1px solid ${color}22`,
      }}>
        <Icon size={15} style={{ color }} />
      </div>
    </div>
  </motion.div>
);

const ActivityItem = ({ activity, index }) => {
  const meta = activityMeta[activity.type] ?? activityMeta.lead_found;
  const Icon = meta.icon;
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div style={{
        marginTop: 1, padding: 6, borderRadius: 6, flexShrink: 0,
        background: `${meta.color}14`,
        border: `1px solid ${meta.color}22`,
      }}>
        <Icon size={11} style={{ color: meta.color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>{activity.message}</p>
        {activity.channel_name && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activity.channel_name}</p>
        )}
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>{formatDate(activity.created_at)}</p>
    </motion.div>
  );
};

const StageDistribution = ({ distribution }) => {
  if (!distribution) return null;
  const total = Object.values(distribution).reduce((s, v) => s + v, 0) || 1;
  const stages = Object.entries(distribution).filter(([, v]) => v > 0);
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
      borderRadius: 8, padding: '20px 24px', marginTop: 24,
    }}>
      <h3 style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
        letterSpacing: '0.18em', color: 'var(--text-muted)',
        textTransform: 'uppercase', marginBottom: 16,
      }}>CRM PIPELINE DISTRIBUTION</h3>
      <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 6, width: '100%', marginBottom: 16, gap: 2 }}>
        {stages.map(([stage, count]) => (
          <div key={stage} style={{
            background: crmStageColors[stage] ?? '#555',
            width: `${(count / total) * 100}%`,
            transition: 'all 0.7s ease',
            borderRadius: 2,
          }} title={`${crmStageLabels[stage] ?? stage}: ${count}`} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {stages.map(([stage, count]) => (
          <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: crmStageColors[stage] ?? '#555' }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{crmStageLabels[stage] ?? stage}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const EmptyState = ({ navigate }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.97 }}
    animate={{ opacity: 1, scale: 1 }}
    style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
      borderRadius: 8, padding: '64px 32px', textAlign: 'center', marginTop: 32,
    }}
  >
    <Activity size={44} style={{ color: 'var(--accent-primary)', margin: '0 auto 16px', opacity: 0.7 }} />
    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
      Welcome to ContentCrafterzz Outreach OS
    </h2>
    <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.6 }}>
      Your dashboard will populate once you start finding leads. Head over to Lead Finder to discover your first batch of YouTube or Reddit prospects.
    </p>
    <button
      className="btn-primary"
      onClick={() => navigate('/leads')}
      style={{ padding: '10px 24px', borderRadius: 6, cursor: 'pointer' }}
    >
      Find Your First Leads
    </button>
  </motion.div>
);

export default function Dashboard() {
  const { dashboardStats, activities, loadingDash, refreshDashboard } = useApp();
  const navigate = useNavigate();
  const feedRef = useRef(null);
  const [showPowerOverlay, setShowPowerOverlay] = useState(false);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [activities]);

  const s = dashboardStats;
  const hasData = s && (s.total_leads > 0 || s.emails_today > 0);
  const revenueRaw = (s?.call_booked ?? 0) * (s?.average_deal_value ?? 2500);
  const revenue = `$${formatNumber(revenueRaw)}`;
  const emailLabel = `${s?.emails_today ?? 0}/${s?.emails_month ?? 0}`;
  const replyRate = s?.reply_rate != null ? `${Number(s.reply_rate).toFixed(1)}%` : '-';
  const convRate = s?.conversion_rate != null ? `${Number(s.conversion_rate).toFixed(1)}%` : '-';

  const sectionTitle = {
    fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
    letterSpacing: '0.18em', color: 'var(--text-muted)',
    textTransform: 'uppercase', marginBottom: 0,
  };

  const cardStyle = {
    background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8,
  };

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
            Dashboard
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.1em' }}>
            OUTREACH OS — LIVE OVERVIEW
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={refreshDashboard}
            disabled={loadingDash}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)', fontSize: 13,
              fontFamily: 'var(--font-body)',
            }}
          >
            <RefreshCw size={13} style={{ animation: loadingDash ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
          <button
            onClick={() => setShowPowerOverlay(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              height: 40, padding: '0 20px', borderRadius: 7, cursor: 'pointer',
              background: 'var(--gradient-orange)', color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-body)',
              boxShadow: '0 0 20px rgba(255,69,0,0.4)', letterSpacing: '-0.01em',
            }}
          >
            <Zap size={15} /> Power Email
          </button>
        </div>
      </div>

      {/* Stat cards */}
      {loadingDash ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 24 }}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
          <StatCard icon={Users}      label="Total Leads"      value={formatNumber(s?.total_leads ?? 0)} sub="all time"            color="#FF4500" accentBorder delay={0}    />
          <StatCard icon={UserPlus}   label="Leads Today"      value={formatNumber(s?.leads_today ?? 0)} sub="since midnight"     color="#00E5A0" accentBorder delay={0.05} />
          <StatCard icon={Mail}       label="Emails Sent"      value={emailLabel}                        sub="today / this month" color="#00B8D4" accentBorder delay={0.1}  />
          <StatCard icon={MailOpen}   label="Reply Rate"       value={replyRate}                         sub="last 30 days"       color="#F5A623" accentBorder delay={0.15} />
          <StatCard icon={TrendingUp} label="Conversion"       value={convRate}                          sub="lead → call"        color="#7B61FF" accentBorder delay={0.2}  />
          <StatCard icon={DollarSign} label="Pipeline"         value={revenue}                           sub={`${s?.call_booked ?? 0} calls`} color="#FF4500" accentBorder delay={0.25} />
        </div>
      )}

      {!loadingDash && !hasData && <EmptyState navigate={navigate} />}

      {!loadingDash && hasData && (
        <div style={{ display: 'flex', gap: 20 }}>
          {/* Left — Charts */}
          <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Leads chart */}
            <div style={{ ...cardStyle, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <p style={sectionTitle}>LEADS FOUND — WEEKLY</p>
                <BarChart2 size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={s?.charts?.weekly_leads ?? []} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<DarkTooltip />} />
                  <Bar dataKey="count" name="Leads" fill="#FF4500" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Emails chart */}
            <div style={{ ...cardStyle, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <p style={sectionTitle}>EMAILS SENT — WEEKLY</p>
                <Mail size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={s?.charts?.weekly_emails ?? []}>
                  <defs>
                    <linearGradient id="emailGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#00E5A0" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#00E5A0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<DarkTooltip />} />
                  <Area type="monotone" dataKey="count" name="Emails" stroke="#00E5A0" strokeWidth={2} fill="url(#emailGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Replies chart */}
            <div style={{ ...cardStyle, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <p style={sectionTitle}>REPLIES — WEEKLY</p>
                <MessageSquare size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={s?.charts?.weekly_replies ?? []} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<DarkTooltip />} />
                  <Bar dataKey="count" name="Replies" fill="#7B61FF" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right — Activity feed */}
          <div style={{ ...cardStyle, width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '20px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={sectionTitle}>LIVE ACTIVITY</p>
              <button
                onClick={refreshDashboard}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 4,
                }}
              >
                <RefreshCw size={11} style={{ animation: loadingDash ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            </div>
            <div ref={feedRef} style={{ flex: 1, overflowY: 'auto', maxHeight: 540 }}>
              <AnimatePresence>
                {activities.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>No recent activity yet.</p>
                ) : (
                  activities.slice(0, 20).map((a, i) => (
                    <ActivityItem key={a.id ?? i} activity={a} index={i} />
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {loadingDash && (
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[160, 160, 160].map((h, i) => (
              <div key={i} className="skeleton" style={{ height: h + 60, borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }} />
            ))}
          </div>
          <div className="skeleton" style={{ width: 300, borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }} />
        </div>
      )}

      {!loadingDash && hasData && <StageDistribution distribution={s?.stage_distribution} />}

      {showPowerOverlay && (
        <PowerSendOverlay maxLeads={100} onClose={() => { setShowPowerOverlay(false); refreshDashboard(); }} />
      )}
    </div>
  );
}
