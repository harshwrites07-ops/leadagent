import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import PowerSendOverlay from '../components/ui/PowerSendOverlay';
import { useApp } from '../context/AppContext';
import api, { formatNumber } from '../utils/api';

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

  useEffect(() => {
    api.get('/analytics/hot-alerts').then(({ data }) => setHotAlerts(data.alerts || [])).catch(() => {});
  }, []);

  const loadLeads = useCallback(async () => {
    setLoadingLeads(true);
    try {
      const { data } = await api.get('/crm?limit=2000');
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

  const countStage = (...ids) => leads.filter(l => ids.includes(l.crm_stage || 'new_lead')).length;
  const pipeline = [
    { label: 'Discovered',  count: countStage('new_lead', 'studying'), color: 'var(--text-4)' },
    { label: 'Pitch ready', count: countStage('pitch_ready'),          color: 'var(--violet)' },
    { label: 'Contacted',   count: countStage('emailed', 'opened'),    color: 'var(--lime)' },
    { label: 'Replied',     count: countStage('replied'),              color: 'var(--ok)' },
    { label: 'Call booked', count: countStage('call_booked'),          color: 'var(--warn)' },
    { label: 'Won',         count: countStage('closed_won'),           color: 'var(--ok)' },
  ];
  const pipelineMax = Math.max(1, ...pipeline.map(r => r.count));
  const plural = (n, one, many) => `${formatNumber(n)} ${n === 1 ? one : many}`;
  const newLeads = countStage('new_lead', 'studying');
  const pitchReady = countStage('pitch_ready');
  const repliedCount = countStage('replied');
  const nextSteps = [];
  if (repliedCount > 0) nextSteps.push({ title: `${plural(repliedCount, 'reply is', 'replies are')} waiting`, desc: 'Answer them while they are warm', to: '/crm' });
  if (pitchReady > 0) nextSteps.push({ title: `Send ${plural(pitchReady, 'ready pitch', 'ready pitches')}`, desc: 'These leads already have a pitch written', to: '/email' });
  if (newLeads > 0) nextSteps.push({ title: `Write pitches for ${plural(newLeads, 'new lead', 'new leads')}`, desc: 'Marcus drafts one for each channel', to: '/pitch' });
  nextSteps.push({ title: leadsTotal === 0 ? 'Find your first leads' : 'Find more leads', desc: 'Search YouTube creators by niche', to: '/leads' });

  return (
    <div style={{ padding: isMobile ? '14px 14px 60px' : '28px 32px 40px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

      {hotAlerts.length > 0 && (
        <div className="card" style={{
          padding: '12px 18px', background: 'var(--lime)', color: 'var(--on-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              {hotAlerts.length} new HOT lead{hotAlerts.length !== 1 ? 's' : ''} matched your niche
            </span>
            <span className="mono" style={{ fontSize: 13, opacity: 0.85 }}>
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
        <button className="btn" onClick={() => setShowPowerOverlay(true)}>Power Email</button>
        <button className="btn btn--primary" onClick={() => navigate('/campaigns')}>New campaign</button>
      </div>

      {/* Stats row: four cards */}
      {loadingDash ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 16 }}>
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 96, borderRadius: 8 }} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 16 }}>
          {statDefs.map((stat, i) => (
            <motion.div
              key={stat.label}
              className="card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 16, minWidth: 0 }}
            >
              <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>{stat.label}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontFamily: 'var(--f-sans)', fontVariantNumeric: 'tabular-nums', fontSize: isMobile ? 24 : 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, color: 'var(--text)' }}>{stat.value}</span>
                {stat.unit && <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-3)' }}>{stat.unit}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {stat.delta && (
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600, color: 'var(--ok)' }}>{stat.delta} {stat.deltaSub}</span>
                )}
                {stat.sub && (
                  <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{stat.delta ? '· ' : ''}{stat.sub}</span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pipeline + next steps (real counts from your CRM) */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>Your pipeline</div>
          <div style={{ fontSize: 15, color: 'var(--text-3)', marginTop: 2, marginBottom: 16 }}>Where every lead you have found sits right now</div>
          {loadingLeads ? (
            [0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 28, marginBottom: 10 }} />)
          ) : leadsTotal === 0 ? (
            <div className="empty" style={{ padding: '24px 0' }}>
              <div className="empty__title">No leads yet</div>
              <div className="empty__desc">Find YouTube creators to start your pipeline.</div>
              <button className="btn btn--primary btn--sm" style={{ marginTop: 12 }} onClick={() => navigate('/leads')}>Find leads</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pipeline.map(row => (
                <div key={row.label} onClick={() => navigate('/crm')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{row.label}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--text)' }}>{formatNumber(row.count)}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(row.count ? 2 : 0, (row.count / pipelineMax) * 100)}%`, background: row.color, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>Do this next</div>
          <div style={{ fontSize: 15, color: 'var(--text-3)', marginTop: 2, marginBottom: 12 }}>Based on what is in your pipeline</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nextSteps.map(step => (
              <button
                key={step.title}
                onClick={() => navigate(step.to)}
                style={{
                  textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                  background: 'var(--bg)', border: '1px solid var(--line-2)', borderRadius: 6,
                  padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{step.title}</span>
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{step.desc}</span>
              </button>
            ))}
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
