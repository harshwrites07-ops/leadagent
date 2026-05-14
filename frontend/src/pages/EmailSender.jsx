import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Mail, MailOpen, Send, Inbox, AlertCircle, CheckCircle, Clock,
  X, Play, Pause, RefreshCw, ExternalLink, ChevronDown, Reply,
  Loader, GripVertical, Eye, EyeOff, Settings, Zap,
} from 'lucide-react';
import PowerSendOverlay from '../components/ui/PowerSendOverlay';
import PowerFollowUpOverlay from '../components/ui/PowerFollowUpOverlay';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api, { formatNumber, formatDate } from '../utils/api';
import { useApp } from '../context/AppContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HISTORY_TABS = [
  { key: 'all', label: 'All Emails' },
  { key: 'opened', label: 'Opened' },
  { key: 'replied', label: 'Replied' },
  { key: 'bounced', label: 'Bounced' },
];

const STATUS_META = {
  pending: { label: 'Pending', cls: 'badge badge-blue' },
  sending: { label: 'Sending...', cls: 'badge badge-warm animate-pulse' },
  sent: { label: 'Sent', cls: 'badge badge-green' },
  failed: { label: 'Failed', cls: 'badge bg-red-500/20 text-red-400 border border-red-500/30' },
  opened: { label: 'Opened', cls: 'badge badge-green' },
  replied: { label: 'Replied', cls: 'badge badge-purple' },
  bounced: { label: 'Bounced', cls: 'badge bg-red-500/20 text-red-400 border border-red-500/30' },
};

// ---------------------------------------------------------------------------
// Dark tooltip
// ---------------------------------------------------------------------------
const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-semibold">
          {p.name}: {formatNumber(p.value)}
        </p>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stat mini card
// ---------------------------------------------------------------------------
const MiniStat = ({ icon: Icon, label, value, sub, color = 'text-brand-400' }) => (
  <div className="stat-card flex items-center gap-4">
    <div className={`p-2 rounded-lg bg-dark-700 ${color}`}>
      <Icon size={20} />
    </div>
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Sortable queue item
// ---------------------------------------------------------------------------
const SortableQueueItem = ({ item, onRemove, onSendNow }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  const meta = STATUS_META[item.status] || STATUS_META.pending;
  const initials = (item.lead_name || '??').slice(0, 2).toUpperCase();

  return (
    <div ref={setNodeRef} style={style} className="card card-hover flex items-center gap-3 py-3 px-4 group">
      {/* drag handle */}
      <button {...attributes} {...listeners} className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing touch-none">
        <GripVertical size={16} />
      </button>

      {/* avatar */}
      <div className="w-9 h-9 rounded-full bg-dark-600 overflow-hidden flex-shrink-0 flex items-center justify-center text-xs font-bold text-slate-300">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt={item.lead_name} className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      {/* info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{item.lead_name}</p>
        <p className="text-xs text-slate-400 truncate">{item.subject}</p>
      </div>

      {/* status */}
      <span className={meta.cls}>{meta.label}</span>

      {/* time */}
      <span className="text-xs text-slate-500 whitespace-nowrap hidden lg:block">
        {item.scheduled_at ? formatDate(item.scheduled_at) : 'Send now'}
      </span>

      {/* actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {item.status === 'pending' && (
          <button
            onClick={() => onSendNow(item.id)}
            className="btn btn-primary text-xs py-1 px-2 flex items-center gap-1"
          >
            <Send size={11} /> Send Now
          </button>
        )}
        <button
          onClick={() => onRemove(item.id)}
          className="btn btn-danger text-xs py-1 px-2"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Email body modal
// ---------------------------------------------------------------------------
const EmailModal = ({ email, onClose }) => {
  if (!email) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="card w-full max-w-2xl max-h-[80vh] flex flex-col"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-white text-lg">{email.subject}</h3>
              <p className="text-sm text-slate-400">To: {email.lead_name} "- {email.lead_email}</p>
            </div>
            <button onClick={onClose} className="btn btn-ghost p-2"><X size={18} /></button>
          </div>
          <div className="flex gap-3 mb-4">
            <span className={STATUS_META[email.status]?.cls || 'badge'}>{STATUS_META[email.status]?.label || email.status}</span>
            <span className="text-xs text-slate-500">Sent {formatDate(email.sent_at)}</span>
            {email.opened_at && <span className="text-xs text-green-400">Opened {formatDate(email.opened_at)}</span>}
            {email.replied_at && <span className="text-xs text-purple-400">Replied {formatDate(email.replied_at)}</span>}
          </div>
          <div className="flex-1 overflow-y-auto bg-dark-800 rounded-lg p-4 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
            {email.body || <span className="text-slate-500 italic">No body content.</span>}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function EmailSender() {
  const navigate = useNavigate();
  const { settings } = useApp();

  const [showPowerOverlay, setShowPowerOverlay] = useState(false);
  const [showFollowUpOverlay, setShowFollowUpOverlay] = useState(false);

  // Stats
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Queue
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(150);

  // History
  const [historyTab, setHistoryTab] = useState('all');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);

  // SMTP
  const [smtpOk, setSmtpOk] = useState(null);

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const { data } = await api.get('/emails/stats');
      setStats(data);
      setDailyLimit(data.daily_limit || 150);
    } catch {
      toast.error('Failed to load email stats');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const { data } = await api.get('/emails/queue');
      setQueue(data.queue || data || []);
      setPaused(data.paused || false);
    } catch {
      toast.error('Failed to load queue');
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async (tab) => {
    setHistoryLoading(true);
    try {
      const params = tab !== 'all' ? { status: tab } : {};
      const { data } = await api.get('/emails', { params });
      setHistory(data.emails || data || []);
    } catch {
      toast.error('Failed to load email history');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const checkSmtp = useCallback(async () => {
    try {
      await api.post('/settings/test/smtp');
      setSmtpOk(true);
    } catch {
      setSmtpOk(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchQueue();
    checkSmtp();
  }, [fetchStats, fetchQueue, checkSmtp]);

  useEffect(() => {
    fetchHistory(historyTab);
  }, [historyTab, fetchHistory]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleTogglePause = async () => {
    try {
      if (paused) {
        await api.post('/emails/queue/resume');
        setPaused(false);
        toast.success('Queue resumed');
      } else {
        await api.post('/emails/queue/pause');
        setPaused(true);
        toast.success('Queue paused');
      }
    } catch {
      toast.error('Failed to toggle queue');
    }
  };

  const handleRemove = async (queueId) => {
    try {
      await api.delete(`/emails/queue/${queueId}`);
      setQueue((prev) => prev.filter((i) => i.id !== queueId));
      toast.success('Removed from queue');
    } catch {
      toast.error('Failed to remove');
    }
  };

  const handleSendNow = async (queueId) => {
    try {
      setQueue((prev) =>
        prev.map((i) => (i.id === queueId ? { ...i, status: 'sending' } : i)),
      );
      await api.post(`/emails/send-now/${queueId}`);
      toast.success('Email sent!');
      fetchQueue();
      fetchStats();
    } catch {
      toast.error('Failed to send');
      fetchQueue();
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = queue.findIndex((i) => i.id === active.id);
    const newIndex = queue.findIndex((i) => i.id === over.id);
    const newQueue = arrayMove(queue, oldIndex, newIndex);
    setQueue(newQueue);

    try {
      await api.post('/emails/queue/reorder', {
        order: newQueue.map((i) => i.id),
      });
    } catch {
      toast.error('Failed to save order');
      fetchQueue();
    }
  };

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const sentToday = stats?.sent_today ?? 0;
  const limitProgress = Math.min((sentToday / dailyLimit) * 100, 100);
  const progressColor = limitProgress > 85 ? 'bg-red-500' : limitProgress > 60 ? 'bg-amber-500' : 'bg-brand-500';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6 pb-10">

      {/* ---- Page header ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Email Sender</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage your outreach queue and track delivery</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { fetchStats(); fetchQueue(); }} className="btn btn-ghost flex items-center gap-2">
            <RefreshCw size={15} /> Refresh
          </button>
          <button
            onClick={() => setShowFollowUpOverlay(true)}
            className="btn flex items-center gap-2 font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#f97316,#ef4444)', border: 'none', boxShadow: '0 0 14px rgba(239,68,68,0.35)', height: 40, padding: '0 16px', borderRadius: 8 }}
          >
            <Zap size={15} /> Follow Up
          </button>
          <button
            onClick={() => setShowPowerOverlay(true)}
            className="btn flex items-center gap-2 font-bold text-white"
            style={{ background: 'var(--gradient-orange)', border: 'none', boxShadow: '0 0 18px rgba(255,69,0,0.4)', height: 40, padding: '0 20px', borderRadius: 8 }}
          >
            <Zap size={15} /> Power Email
          </button>
        </div>
      </div>

      {/* ---- Stats bar ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stat-card animate-pulse h-20" />
          ))
        ) : (
          <>
            <MiniStat icon={Send} label="Sent Today" value={formatNumber(stats?.sent_today ?? 0)} color="text-brand-400" />
            <MiniStat icon={Mail} label="Sent This Month" value={formatNumber(stats?.sent_month ?? 0)} color="text-blue-400" />
            <MiniStat icon={MailOpen} label="Open Rate" value={`${(stats?.open_rate ?? 0).toFixed(1)}%`} color="text-green-400" />
            <MiniStat icon={Reply} label="Reply Rate" value={`${(stats?.reply_rate ?? 0).toFixed(1)}%`} color="text-purple-400" />
          </>
        )}
      </div>

      {/* ---- Main 2-col layout ---- */}
      <div className="flex gap-6" style={{ minHeight: 0 }}>

        {/* ===== LEFT "- Queue ===== */}
        <div className="flex-[3] min-w-0 flex flex-col gap-3">

          {/* Queue header */}
          <div className="card py-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Inbox size={18} className="text-brand-400" />
                <span className="font-semibold text-white">Queue</span>
                <span className="badge badge-blue">{queue.length}</span>
              </div>
              <button
                onClick={handleTogglePause}
                className={`btn flex items-center gap-2 text-sm py-1.5 px-3 ${paused ? 'btn-primary' : 'btn-secondary'}`}
              >
                {paused ? <><Play size={14} /> Resume All</> : <><Pause size={14} /> Pause All</>}
              </button>
            </div>

            {/* Daily limit progress */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {sentToday} / {dailyLimit} sent today
              </span>
              <div className="flex-1 bg-dark-700 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                  style={{ width: `${limitProgress}%` }}
                />
              </div>
              <span className="text-xs text-slate-500">{limitProgress.toFixed(0)}%</span>
            </div>
          </div>

          {/* Queue list */}
          {queueLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card h-16 animate-pulse" />
              ))}
            </div>
          ) : queue.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 gap-4">
              <div className="p-4 bg-dark-700 rounded-full">
                <Inbox size={32} className="text-slate-500" />
              </div>
              <p className="text-slate-400 font-medium">Queue is empty</p>
              <p className="text-sm text-slate-500">Generate pitches and add leads to start outreach</p>
              <button onClick={() => navigate('/leads')} className="btn btn-primary">
                Find Leads
              </button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={queue.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {queue.map((item) => (
                    <SortableQueueItem
                      key={item.id}
                      item={item}
                      onRemove={handleRemove}
                      onSendNow={handleSendNow}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* ===== RIGHT "- History ===== */}
        <div className="flex-[2] min-w-0 flex flex-col gap-3">
          <div className="card flex-1 flex flex-col min-h-0">
            {/* Tabs */}
            <div className="flex border-b border-dark-600 mb-4">
              {HISTORY_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setHistoryTab(t.key)}
                  className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    historyTab === t.key
                      ? 'border-brand-500 text-brand-400'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Table */}
            {historyLoading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 bg-dark-700 rounded animate-pulse" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 py-10 gap-3">
                <Mail size={28} className="text-slate-600" />
                <p className="text-sm text-slate-500">No emails yet</p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-dark-600">
                      <th className="text-left pb-2 pr-2">Lead</th>
                      <th className="text-left pb-2 pr-2 hidden lg:table-cell">Subject</th>
                      <th className="text-left pb-2 pr-2">Status</th>
                      <th className="text-left pb-2 pr-2 hidden xl:table-cell">Sent</th>
                      <th className="text-left pb-2 pr-2 hidden xl:table-cell">Opened</th>
                      <th className="text-left pb-2">Replied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((email) => {
                      const meta = STATUS_META[email.status] || STATUS_META.pending;
                      return (
                        <tr
                          key={email.id}
                          onClick={() => setSelectedEmail(email)}
                          className="border-b border-dark-700 hover:bg-dark-700/50 cursor-pointer transition-colors"
                        >
                          <td className="py-2 pr-2 font-medium text-white truncate max-w-[100px]">{email.lead_name}</td>
                          <td className="py-2 pr-2 text-slate-400 truncate max-w-[120px] hidden lg:table-cell">{email.subject}</td>
                          <td className="py-2 pr-2"><span className={meta.cls}>{meta.label}</span></td>
                          <td className="py-2 pr-2 text-slate-500 text-xs hidden xl:table-cell">{email.sent_at ? formatDate(email.sent_at) : '"-'}</td>
                          <td className="py-2 pr-2 text-slate-500 text-xs hidden xl:table-cell">{email.opened_at ? formatDate(email.opened_at) : '"-'}</td>
                          <td className="py-2 text-slate-500 text-xs">{email.replied_at ? formatDate(email.replied_at) : '"-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- SMTP Status strip ---- */}
      <div className={`card py-3 px-4 flex items-center gap-3 border ${smtpOk === true ? 'border-green-500/30 bg-green-500/5' : smtpOk === false ? 'border-red-500/30 bg-red-500/5' : 'border-dark-600'}`}>
        {smtpOk === null ? (
          <>
            <Loader size={16} className="text-slate-500 animate-spin" />
            <span className="text-sm text-slate-400">Checking SMTP...</span>
          </>
        ) : smtpOk ? (
          <>
            <CheckCircle size={16} className="text-green-400" />
            <span className="text-sm text-green-400 font-medium">SMTP Connected</span>
            <span className="text-xs text-slate-500 ml-1">"- outgoing mail is working</span>
          </>
        ) : (
          <>
            <AlertCircle size={16} className="text-red-400" />
            <span className="text-sm text-red-400 font-medium">SMTP not configured</span>
            <button
              onClick={() => navigate('/settings')}
              className="ml-2 text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 underline underline-offset-2"
            >
              Configure in Settings <ExternalLink size={11} />
            </button>
          </>
        )}
      </div>

      {/* ---- Email body modal ---- */}
      <AnimatePresence>
        {selectedEmail && (
          <EmailModal email={selectedEmail} onClose={() => setSelectedEmail(null)} />
        )}
      </AnimatePresence>

      {showPowerOverlay && (
        <PowerSendOverlay maxLeads={100} onClose={() => { setShowPowerOverlay(false); fetchStats(); fetchQueue(); }} />
      )}
      {showFollowUpOverlay && (
        <PowerFollowUpOverlay onClose={() => { setShowFollowUpOverlay(false); fetchStats(); fetchQueue(); }} />
      )}
    </div>
  );
}
