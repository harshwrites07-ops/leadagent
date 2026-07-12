import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import Icon from '../components/ui/Icon';
import PowerSendOverlay from '../components/ui/PowerSendOverlay';
import { useApp } from '../context/AppContext';
import api, { formatNumber, formatDate } from '../utils/api';

const PAGE_SIZE = 10;

const STAGE_META = {
  new_lead:    { label: 'Not contacted',   dot: 'rgba(255,255,255,0.25)' },
  studying:    { label: 'Researching',     dot: 'var(--sky)' },
  pitch_ready: { label: 'Pitch ready',     dot: 'var(--violet)' },
  emailed:     { label: 'Sequence active', dot: 'var(--lime)' },
  opened:      { label: 'Opened',          dot: 'var(--warn)' },
  replied:     { label: 'Replied',         dot: 'var(--ok)' },
  call_booked: { label: 'Call booked',     dot: 'var(--ok)' },
  closed_won:  { label: 'Closed won',      dot: 'var(--ok)' },
  closed_lost: { label: 'Not interested',  dot: 'var(--bad)' },
};

function useMobile() {
  const [m, setM] = useState(() => window.innerWidth < 860);
  useEffect(() => { const fn = () => setM(window.innerWidth < 860); window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn); }, []);
  return m;
}

export default function Dashboard() {
  const { dashboardStats, loadingDash, refreshDashboard } = useApp();
  const navigate = useNavigate();
  const isMobile = useMobile();

  const [showPowerOverlay, setShowPowerOverlay] = useState(false);
  const [hotAlerts, setHotAlerts] = useState([]);
  const [leads, setLeads] = useState([]);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [filter, setFilter] = useState('All');
  const [page, setPage] = useState(0);

  useEffect(() => {
    api.get('/analytics/hot-alerts').then(({ data }) => setHotAlerts(data.alerts || [])).catch(() => {});
  }, []);

  const loadLeads = useCallback(async () => {
    setLoadingLeads(true);
    try {
      const { data } = await api.get('/crm?limit=500');
      setLeads(Array.isArray(data.leads) ? data.leads : []);
      setLeadsTotal(data.total ?? (data.leads?.length || 0));
    } catch { /* leave leads empty */ }
    finally { setLoadingLeads(false); }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const dismissHotAlerts = () => {
    const ids = hotAlerts.map(a => a.notification_id);
    setHotAlerts([]);
    api.post('/analytics/hot-alerts/seen', { notification_ids: ids }).catch(() => {});
  };

  const s = dashboardStats;
  const stats = {
    emailsMonth: s?.emails_month ?? 0,
    emailsToday: s?.emails_today ?? 0,
    openRate: s?.open_rate != null ? Number(s.open_rate).toFixed(1) : '0.0',
    replyRate: s?.reply_rate != null ? Number(s.reply_rate).toFixed(1) : '0.0',
    totalReplies: s?.total_replies ?? 0,
    totalLeads: s?.total_leads ?? 0,
    leadsToday: s?.leads_today ?? 0,
  };

  const hotLeadsCount = leads.filter(l => (l.lead_score ?? 0) >= 70).length;

  const statDefs = [
    { label: 'Emails sent', value: formatNumber(stats.emailsMonth), sub: 'Past 30 days', delta: `+${stats.emailsToday}`, deltaSub: 'today' },
    { label: 'Open rate', value: stats.openRate, unit: '%', sub: 'Avg across campaigns' },
    { label: 'Replies', value: formatNumber(stats.totalReplies), sub: `${stats.replyRate}% reply rate` },
    { label: 'Active leads', value: formatNumber(stats.totalLeads), delta: `+${stats.leadsToday}`, deltaSub: 'today', sub: `${hotLeadsCount} high intent` },
  ];

  const filteredLeads = useMemo(() => {
    if (filter === 'High intent') return leads.filter(l => (l.lead_score ?? 0) >= 70);
    if (filter === 'Replied') return leads.filter(l => l.crm_stage === 'replied');
    return leads;
  }, [leads, filter]);

  useEffect(() => { setPage(0); }, [filter]);

  const pageLeads = filteredLeads.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const maxPage = Math.max(0, Math.ceil(filteredLeads.length / PAGE_SIZE) - 1);

  const avatarBgs = ['#1C1B18', '#191C1B', '#201C16', '#1A181D', '#171C1E', '#1E1A16'];

  return (
    <div style={{ padding: isMobile ? '14px 14px 60px' : '28px 32px 40px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

      {hotAlerts.length > 0 && (
        <div className="card" style={{
          padding: '12px 18px', background: 'var(--lime)', color: 'var(--on-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="bell" size={14} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              {hotAlerts.length} new HOT lead{hotAlerts.length !== 1 ? 's' : ''} matched your niche
            </span>
            <span className="mono" style={{ fontSize: 11.5, opacity: 0.85 }}>
              {hotAlerts.slice(0, 3).map(a => a.channel_name).join(', ')}{hotAlerts.length > 3 ? ` +${hotAlerts.length - 3} more` : ''}
            </span>
          </div>
          <button className="btn btn--sm" style={{ background: 'var(--on-accent)', color: 'var(--lime)' }} onClick={dismissHotAlerts}>
            Dismiss
          </button>
        </div>
      )}

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--f-heading)', fontSize: isMobile ? 20 : 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)', flex: 'none' }}>
          Dashboard
        </h1>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={() => navigate('/leads')}>Import leads</button>
        <button className="btn btn--primary" onClick={() => navigate('/campaigns')}>New campaign</button>
        <button className="btn btn--primary" onClick={() => setShowPowerOverlay(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={13} />
          Power Email
        </button>
      </div>

      {/* Stats row */}
      {loadingDash ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 90, borderRadius: 12 }} />)}
        </div>
      ) : (
        <div style={{
          display: 'flex', flexWrap: isMobile ? 'wrap' : 'nowrap', alignItems: 'flex-start', gap: 0,
          paddingBottom: 24, borderBottom: '1px solid var(--line)',
        }}>
          {statDefs.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              style={{
                flex: isMobile ? '1 1 45%' : 1, display: 'flex', flexDirection: 'column', gap: 8,
                paddingRight: 32, marginRight: 32, minWidth: isMobile ? '40%' : 0,
                borderRight: i === statDefs.length - 1 ? 'none' : '1px solid var(--line)',
              }}
            >
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-4)', fontWeight: 500 }}>{stat.label}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: isMobile ? 26 : 34, fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--text)' }}>{stat.value}</span>
                {stat.unit && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--text-4)' }}>{stat.unit}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {stat.delta && (
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 500, color: 'var(--ok)' }}>{stat.delta} {stat.deltaSub}</span>
                )}
                {!stat.delta && stat.sub && (
                  <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{stat.sub}</span>
                )}
                {stat.delta && stat.sub && (
                  <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>· {stat.sub}</span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Leads table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)' }}>Leads</h2>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-4)' }}>{formatNumber(leadsTotal)} total</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {['All', 'High intent', 'Replied'].map(f => {
              const on = f === filter;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
                    color: on ? 'var(--text)' : 'var(--text-4)',
                    background: on ? 'var(--surface-2)' : 'transparent',
                    border: `1px solid ${on ? 'var(--line-3)' : 'var(--line)'}`,
                    borderRadius: 7, padding: '5px 11px', cursor: 'pointer',
                  }}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 720 }}>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,2fr) 100px 80px 140px 120px', gap: 16, padding: '10px 20px', borderBottom: '1px solid var(--line)', alignItems: 'center' }}>
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-4)', fontWeight: 500 }}>Channel</span>
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-4)', fontWeight: 500, textAlign: 'right' }}>Subscribers</span>
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-4)', fontWeight: 500, textAlign: 'right' }}>Intent</span>
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-4)', fontWeight: 500 }}>Status</span>
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-4)', fontWeight: 500, textAlign: 'right' }}>Last contacted</span>
              </div>

              {loadingLeads ? (
                [0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 52, margin: '8px 20px' }} />)
              ) : pageLeads.length === 0 ? (
                <div className="empty" style={{ padding: '32px 20px' }}>
                  <div className="empty__title">No leads yet</div>
                  <div className="empty__desc">Import leads to see them here.</div>
                  <button className="btn btn--primary btn--sm" style={{ marginTop: 12 }} onClick={() => navigate('/leads')}>
                    Import leads →
                  </button>
                </div>
              ) : (
                pageLeads.map((lead, i) => {
                  const meta = STAGE_META[lead.crm_stage] || STAGE_META.new_lead;
                  const initials = (lead.channel_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                  return (
                    <div
                      key={lead.id}
                      onClick={() => navigate('/crm')}
                      style={{
                        display: 'grid', gridTemplateColumns: 'minmax(180px,2fr) 100px 80px 140px 120px', gap: 16,
                        padding: '12px 20px', borderBottom: '1px solid var(--line)', alignItems: 'center', cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <div style={{
                          width: 28, height: 28, flexShrink: 0, borderRadius: '50%',
                          background: avatarBgs[i % avatarBgs.length], border: '1px solid var(--line)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 600, color: 'var(--text-2)',
                        }}>{initials}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)' }}>
                            {lead.channel_name || 'Unknown'}
                          </span>
                          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-4)' }}>{lead.channel_handle || ''}</span>
                        </div>
                      </div>
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--text-2)', textAlign: 'right' }}>
                        {formatNumber(lead.subscriber_count ?? 0)}
                      </span>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, fontWeight: 500, color: (lead.lead_score ?? 0) >= 70 ? 'var(--lime)' : 'var(--text-3)' }}>
                          {lead.lead_score ?? 0}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 6, height: 6, flexShrink: 0, borderRadius: '50%', background: meta.dot, display: 'inline-block' }} />
                        <span style={{ fontSize: 12.5, color: 'var(--text-2)', letterSpacing: '-0.01em' }}>{meta.label}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--text-4)', textAlign: 'right' }}>
                        {lead.last_email_date ? formatDate(lead.last_email_date) : '—'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px' }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-4)' }}>
              Showing {filteredLeads.length === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min(filteredLeads.length, page * PAGE_SIZE + PAGE_SIZE)} of {filteredLeads.length}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn--ghost btn--sm"
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                style={{ opacity: page === 0 ? 0.4 : 1 }}
              >prev</button>
              <button
                className="btn btn--ghost btn--sm"
                disabled={page >= maxPage}
                onClick={() => setPage(p => Math.min(maxPage, p + 1))}
                style={{ opacity: page >= maxPage ? 0.4 : 1 }}
              >next</button>
            </div>
          </div>
        </div>
      </div>

      {showPowerOverlay && (
        <PowerSendOverlay
          maxLeads={100}
          onClose={() => { setShowPowerOverlay(false); refreshDashboard(); loadLeads(); }}
        />
      )}
    </div>
  );
}
