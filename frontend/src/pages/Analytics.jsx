﻿import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  TrendingUp, DollarSign, Target, Clock, BarChart2,
  RefreshCw, Youtube, MessageSquare, ChevronUp, ChevronDown,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  FunnelChart, Cell, PieChart, Pie,
} from 'recharts';
import api, { formatNumber, formatDate, stageLabel } from '../utils/api';
import { useApp } from '../context/AppContext';

// ---------------------------------------------------------------------------
// Chart theme constants
// ---------------------------------------------------------------------------
const GRID_COLOR = '#1E1E1E';
const TICK_COLOR = '#555555';
const C_PRIMARY  = '#FF4500';
const C_SUCCESS  = '#00E5A0';
const C_PURPLE   = '#7B61FF';
const C_AMBER    = '#F5A623';
const C_CYAN     = '#00B8D4';
const C_RED      = '#FF4560';

const CHART_COLORS = [C_PRIMARY, C_SUCCESS, C_PURPLE, C_AMBER, C_CYAN, C_RED];

// ---------------------------------------------------------------------------
// Shared dark tooltip
// ---------------------------------------------------------------------------
const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.8)' }}>
      {label && <p style={{ color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.05em' }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">
          {p.name}: {typeof p.value === 'number' && p.value % 1 !== 0 ? p.value.toFixed(1) : formatNumber(p.value)}
          {p.unit || ''}
        </p>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Axis common props factory
// ---------------------------------------------------------------------------
const axisProps = (angle = 0) => ({
  tick: { fill: TICK_COLOR, fontSize: 11 },
  tickLine: false,
  axisLine: false,
  angle,
  textAnchor: angle ? 'end' : 'middle',
});

// ---------------------------------------------------------------------------
// Stat card (pipeline section)
// ---------------------------------------------------------------------------
const PipelineStat = ({ label, value, sub, color = 'text-brand-400', animateVal = false }) => {
  return (
    <div className="stat-card text-center">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Section tabs
// ---------------------------------------------------------------------------
const TABS = ['Outreach', 'Pipeline', 'Platforms'];

// ---------------------------------------------------------------------------
// OUTREACH TAB
// ---------------------------------------------------------------------------
const OutreachTab = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-64 animate-pulse" />
        ))}
      </div>
    );
  }

  const dailySends = data?.daily_sends || [];
  const rateData   = data?.rate_trend || [];
  const subjects   = data?.best_subjects || [];
  const times      = data?.best_times || [];

  return (
    <div className="flex flex-col gap-6">

      {/* 2-col row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Emails sent per day */}
        <div className="card">
          <h3 className="section-title mb-4">Emails Sent Per Day</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailySends} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="date" {...axisProps()} tickFormatter={(v) => v?.slice(5)} />
              <YAxis {...axisProps()} />
              <Tooltip content={<DarkTooltip />} />
              <Bar dataKey="count" name="Sent" fill={C_PRIMARY} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Open rate + reply rate */}
        <div className="card">
          <h3 className="section-title mb-4">Open Rate &amp; Reply Rate (%)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rateData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="date" {...axisProps()} tickFormatter={(v) => v?.slice(5)} />
              <YAxis {...axisProps()} unit="%" />
              <Tooltip content={<DarkTooltip />} />
              <Line
                type="monotone" dataKey="open_rate" name="Open Rate"
                stroke={C_SUCCESS} strokeWidth={2} dot={false} unit="%"
              />
              <Line
                type="monotone" dataKey="reply_rate" name="Reply Rate"
                stroke={C_PURPLE} strokeWidth={2} dot={false} unit="%"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2-col row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Best performing subjects */}
        <div className="card overflow-hidden">
          <h3 className="section-title mb-4">Best Subject Lines</h3>
          {subjects.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No data yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-dark-600">
                    <th className="text-left pb-2 pr-3">Subject</th>
                    <th className="text-right pb-2 pr-3 whitespace-nowrap">Sent</th>
                    <th className="text-right pb-2 whitespace-nowrap">Open %</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((row, i) => (
                    <tr key={i} className="border-b border-dark-700 hover:bg-dark-700/30 transition-colors">
                      <td className="py-2 pr-3 text-slate-300 max-w-[200px] truncate">{row.subject}</td>
                      <td className="py-2 pr-3 text-slate-400 text-right">{formatNumber(row.sent)}</td>
                      <td className="py-2 text-right">
                        <span className={`font-semibold ${row.open_rate >= 30 ? 'text-green-400' : row.open_rate >= 15 ? 'text-amber-400' : 'text-slate-400'}`}>
                          {row.open_rate?.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Best send times */}
        <div className="card">
          <h3 className="section-title mb-4">Best Send Times</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={times} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="hour" {...axisProps()} tickFormatter={(v) => `${v}:00`} />
              <YAxis {...axisProps()} />
              <Tooltip content={<DarkTooltip />} formatter={(v) => [v, 'Replies']} />
              <Bar dataKey="replies" name="Replies" fill={C_AMBER} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// PIPELINE TAB
// ---------------------------------------------------------------------------
const PipelineTab = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="stat-card h-24 animate-pulse" />)}
        </div>
        <div className="card h-80 animate-pulse" />
      </div>
    );
  }

  const funnel   = data?.funnel   || [];
  const stats    = data?.stats    || {};
  const pipeVal  = data?.pipeline_value || 0;

  // Build funnel as horizontal bars
  const maxVal = Math.max(...funnel.map((s) => s.count), 1);

  const STAGE_COLORS = {
    new_lead:    C_PRIMARY,
    studying:    '#60a5fa',
    pitch_ready: C_PURPLE,
    emailed:     C_CYAN,
    opened:      C_AMBER,
    replied:     C_SUCCESS,
    call_booked: '#818cf8',
    closed_won:  '#34d399',
    closed_lost: C_RED,
  };

  return (
    <div className="flex flex-col gap-6">

      {/* Pipeline value hero */}
      <div className="card py-6 text-center">
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">Total Pipeline Value</p>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl font-extrabold text-gradient"
        >
          ${formatNumber(pipeVal)}
        </motion.p>
        <p className="text-sm text-slate-500 mt-2">Based on avg deal value × qualified leads</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <PipelineStat
          label="Revenue Closed This Month"
          value={`$${formatNumber(stats.revenue_closed_month || 0)}`}
          color="text-green-400"
        />
        <PipelineStat
          label="Avg Days to Close"
          value={stats.avg_days_to_close != null ? `${stats.avg_days_to_close}d` : '"-'}
          color="text-amber-400"
        />
        <PipelineStat
          label="Win Rate"
          value={stats.win_rate != null ? `${(stats.win_rate * 100).toFixed(1)}%` : '"-'}
          sub="Closed Won / Total Contacted"
          color="text-brand-400"
        />
      </div>

      {/* Funnel */}
      <div className="card">
        <h3 className="section-title mb-6">Pipeline Funnel</h3>
        <div className="flex flex-col gap-3">
          {funnel.map((stage) => {
            const pct = (stage.count / maxVal) * 100;
            const color = STAGE_COLORS[stage.stage] || C_PRIMARY;
            return (
              <div key={stage.stage} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-28 flex-shrink-0 truncate">{stageLabel(stage.stage)}</span>
                <div className="flex-1 bg-dark-700 rounded-full h-5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, delay: 0.05 }}
                    className="h-full rounded-full flex items-center pl-2"
                    style={{ backgroundColor: color }}
                  >
                    <span className="text-[10px] font-bold text-white whitespace-nowrap">
                      {stage.count > 0 ? formatNumber(stage.count) : ''}
                    </span>
                  </motion.div>
                </div>
                <span className="text-sm font-semibold text-white w-10 text-right flex-shrink-0">
                  {formatNumber(stage.count)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// PLATFORMS TAB
// ---------------------------------------------------------------------------
const PlatformsTab = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-64 animate-pulse" />)}
      </div>
    );
  }

  const yt          = data?.youtube   || {};
  const rd          = data?.reddit    || {};
  const niches      = data?.niche_stats || [];
  const subreddits  = data?.subreddit_stats || [];

  const platformRows = [
    { label: 'Total Leads',   yt: yt.total_leads,   rd: rd.total_leads },
    { label: 'Emails Sent',   yt: yt.emails_sent,   rd: rd.emails_sent },
    { label: 'Responses',     yt: yt.responses,     rd: rd.responses },
    { label: 'Closed Deals',  yt: yt.closed,        rd: rd.closed },
    { label: 'Close Rate',    yt: yt.close_rate != null ? `${(yt.close_rate*100).toFixed(1)}%` : '"-', rd: rd.close_rate != null ? `${(rd.close_rate*100).toFixed(1)}%` : '"-', highlight: true },
  ];

  return (
    <div className="flex flex-col gap-6">

      {/* Platform comparison table */}
      <div className="card overflow-hidden">
        <h3 className="section-title mb-4">Platform Comparison</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-dark-600">
              <th className="text-left pb-3 pr-4">Metric</th>
              <th className="text-right pb-3 pr-4">
                <span className="flex items-center gap-1.5 justify-end">
                  <Youtube size={14} className="text-red-400" /> YouTube
                </span>
              </th>
              <th className="text-right pb-3">
                <span className="flex items-center gap-1.5 justify-end">
                  <MessageSquare size={14} className="text-orange-400" /> Reddit
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {platformRows.map((row) => (
              <tr key={row.label} className="border-b border-dark-700 hover:bg-dark-700/30 transition-colors">
                <td className="py-2.5 pr-4 text-slate-300">{row.label}</td>
                <td className={`py-2.5 pr-4 text-right font-semibold ${row.highlight ? 'text-brand-400' : 'text-white'}`}>
                  {typeof row.yt === 'number' ? formatNumber(row.yt) : (row.yt || '"-')}
                </td>
                <td className={`py-2.5 text-right font-semibold ${row.highlight ? 'text-brand-400' : 'text-white'}`}>
                  {typeof row.rd === 'number' ? formatNumber(row.rd) : (row.rd || '"-')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 2-col row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Niche conversion chart */}
        <div className="card">
          <h3 className="section-title mb-4">Top Converting Niches</h3>
          {niches.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No niche data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={niches} layout="vertical" margin={{ top: 4, right: 20, left: 60, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                <XAxis type="number" {...axisProps()} unit="%" />
                <YAxis type="category" dataKey="niche" tick={{ fill: TICK_COLOR, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<DarkTooltip />} formatter={(v) => [`${v.toFixed(1)}%`, 'Close Rate']} />
                <Bar dataKey="close_rate" name="Close Rate" radius={[0, 3, 3, 0]}>
                  {niches.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Subreddit performance table */}
        <div className="card overflow-hidden">
          <h3 className="section-title mb-4">Subreddit Performance</h3>
          {subreddits.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No subreddit data yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-dark-600">
                    <th className="text-left pb-2 pr-3">Subreddit</th>
                    <th className="text-right pb-2 pr-3">Leads</th>
                    <th className="text-right pb-2 pr-3">Replies</th>
                    <th className="text-right pb-2">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {subreddits.map((row, i) => (
                    <tr key={i} className="border-b border-dark-700 hover:bg-dark-700/30 transition-colors">
                      <td className="py-2 pr-3 text-slate-300">r/{row.subreddit}</td>
                      <td className="py-2 pr-3 text-slate-400 text-right">{formatNumber(row.total_leads)}</td>
                      <td className="py-2 pr-3 text-slate-400 text-right">{formatNumber(row.replies)}</td>
                      <td className="py-2 text-right">
                        <span className={`font-semibold ${row.reply_rate >= 0.2 ? 'text-green-400' : 'text-slate-400'}`}>
                          {row.reply_rate != null ? `${(row.reply_rate * 100).toFixed(1)}%` : '"-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Analytics component
// ---------------------------------------------------------------------------
export default function Analytics() {
  const [activeTab, setActiveTab] = useState('Outreach');
  const [outreachData, setOutreachData] = useState(null);
  const [pipelineData, setPipelineData] = useState(null);
  const [platformsData, setPlatformsData] = useState(null);
  const [loading, setLoading] = useState({ Outreach: false, Pipeline: false, Platforms: false });

  const fetchTab = useCallback(async (tab) => {
    if (tab === 'Outreach' && outreachData) return;
    if (tab === 'Pipeline' && pipelineData) return;
    if (tab === 'Platforms' && platformsData) return;

    setLoading((prev) => ({ ...prev, [tab]: true }));
    try {
      if (tab === 'Outreach') {
        const { data } = await api.get('/analytics/email');
        setOutreachData(data);
      } else if (tab === 'Pipeline') {
        const { data } = await api.get('/analytics/pipeline');
        setPipelineData(data);
      } else if (tab === 'Platforms') {
        const { data } = await api.get('/analytics/platforms');
        setPlatformsData(data);
      }
    } catch {
      toast.error(`Failed to load ${tab} analytics`);
    } finally {
      setLoading((prev) => ({ ...prev, [tab]: false }));
    }
  }, [outreachData, pipelineData, platformsData]);

  useEffect(() => {
    fetchTab(activeTab);
  }, [activeTab, fetchTab]);

  const handleRefresh = async () => {
    if (activeTab === 'Outreach') setOutreachData(null);
    if (activeTab === 'Pipeline') setPipelineData(null);
    if (activeTab === 'Platforms') setPlatformsData(null);
    setLoading((prev) => ({ ...prev, [activeTab]: true }));
    try {
      if (activeTab === 'Outreach') {
        const { data } = await api.get('/analytics/email');
        setOutreachData(data);
      } else if (activeTab === 'Pipeline') {
        const { data } = await api.get('/analytics/pipeline');
        setPipelineData(data);
      } else if (activeTab === 'Platforms') {
        const { data } = await api.get('/analytics/platforms');
        setPlatformsData(data);
      }
    } catch {
      toast.error('Refresh failed');
    } finally {
      setLoading((prev) => ({ ...prev, [activeTab]: false }));
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-slate-400 mt-0.5">Track outreach performance, pipeline health, and platform ROI</p>
        </div>
        <button onClick={handleRefresh} className="btn btn-ghost flex items-center gap-2">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 bg-dark-800 rounded-xl p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/30'
                : 'text-slate-400 hover:text-white hover:bg-dark-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === 'Outreach' && (
            <OutreachTab data={outreachData} loading={loading.Outreach} />
          )}
          {activeTab === 'Pipeline' && (
            <PipelineTab data={pipelineData} loading={loading.Pipeline} />
          )}
          {activeTab === 'Platforms' && (
            <PlatformsTab data={platformsData} loading={loading.Platforms} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
