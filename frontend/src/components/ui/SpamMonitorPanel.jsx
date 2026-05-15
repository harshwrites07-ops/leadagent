import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldAlert, ShieldCheck, ShieldX, AlertTriangle, RefreshCw, Inbox, Mail } from 'lucide-react';
import api, { formatDate } from '../../utils/api';

const RISK_CONFIG = {
  low:    { label: 'Low Risk',    bg: 'bg-green-500/20',  text: 'text-green-400',  border: 'border-green-500/30',  icon: ShieldCheck },
  medium: { label: 'Medium Risk', bg: 'bg-amber-500/20',  text: 'text-amber-400',  border: 'border-amber-500/30',  icon: ShieldAlert },
  high:   { label: 'High Risk',   bg: 'bg-red-500/20',    text: 'text-red-400',    border: 'border-red-500/30',    icon: ShieldX },
};

const HEALTH_DOT = {
  good:    'bg-green-400',
  warning: 'bg-amber-400',
  danger:  'bg-red-500',
};

export default function SpamMonitorPanel({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  const load = async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get('/emails/spam-report');
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const risk = data ? RISK_CONFIG[data.overallRisk] || RISK_CONFIG.low : null;
  const RiskIcon = risk?.icon || ShieldCheck;

  const totalBouncebacks = data?.imapResults?.reduce((s, r) => s + (r.bounceEmails?.length || 0), 0) || 0;
  const totalSpamFolder = data?.imapResults?.reduce((s, r) => s + (r.spamCount || 0), 0) || 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-end"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="w-full max-w-xl h-full bg-dark-800 border-l border-dark-600 flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-dark-600">
            <div className="flex items-center gap-3">
              <ShieldAlert size={20} className="text-amber-400" />
              <div>
                <h2 className="text-white font-bold text-lg">Spam Monitor</h2>
                <p className="text-xs text-slate-400">Inbox health & delivery tracking</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} className="btn btn-ghost p-2" title="Refresh (runs IMAP check)">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={onClose} className="btn btn-ghost p-2"><X size={18} /></button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-dark-600 px-6">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'likely-spam', label: `Likely Spam (${data?.likelySpam?.length || 0})` },
              { key: 'bounces', label: `Bounces (${totalBouncebacks + (data?.recentBounces?.length || 0)})` },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.key ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <RefreshCw size={28} className="animate-spin text-brand-400" />
                <p className="text-slate-400 text-sm">Checking inboxes via IMAP...</p>
                <p className="text-slate-500 text-xs">This may take up to 20 seconds</p>
              </div>
            ) : !data ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <ShieldX size={32} className="text-red-400" />
                <p className="text-slate-400">Failed to load spam report</p>
                <button onClick={load} className="btn btn-primary">Retry</button>
              </div>
            ) : tab === 'overview' ? (
              <div className="p-6 flex flex-col gap-5">

                {/* Overall risk banner */}
                <div className={`rounded-xl p-4 border flex items-center gap-4 ${risk.bg} ${risk.border}`}>
                  <RiskIcon size={32} className={risk.text} />
                  <div className="flex-1">
                    <p className={`font-bold text-lg ${risk.text}`}>{risk.label}</p>
                    <p className="text-slate-300 text-sm">
                      {data.overallBounceRate}% bounce rate · {data.likelySpam.length} emails likely in spam
                      {totalBouncebacks > 0 && ` · ${totalBouncebacks} delivery failures detected`}
                    </p>
                  </div>
                </div>

                {/* IMAP findings */}
                {(totalBouncebacks > 0 || totalSpamFolder > 0) && (
                  <div className="card bg-dark-700 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle size={16} className="text-amber-400" />
                      <span className="text-amber-400 font-semibold text-sm">IMAP Findings</span>
                    </div>
                    {totalBouncebacks > 0 && (
                      <p className="text-sm text-slate-300 mb-1">
                        <span className="text-red-400 font-bold">{totalBouncebacks}</span> Mailer-Daemon bounce-back emails detected in your inboxes
                        — these emails were rejected (blocked or spam-filtered) by recipients.
                      </p>
                    )}
                    {totalSpamFolder > 0 && (
                      <p className="text-sm text-slate-300 mt-1">
                        <span className="text-amber-400 font-bold">{totalSpamFolder}</span> items in your own Gmail Spam folder.
                      </p>
                    )}
                  </div>
                )}

                {/* Per-inbox health */}
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-semibold">Inbox Health (Last 30 Days)</p>
                  <div className="flex flex-col gap-2">
                    {data.perInbox.map(inbox => {
                      const imapData = data.imapResults?.find(r => r.email === inbox.email);
                      return (
                        <div key={inbox.email} className="card bg-dark-700 flex items-center gap-3 py-3 px-4">
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${HEALTH_DOT[inbox.health]}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{inbox.email}</p>
                            <p className="text-xs text-slate-400">
                              {inbox.sentCount} sent · {inbox.openedCount} opened · {inbox.bouncedCount} bounced
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-sm font-bold ${inbox.health === 'good' ? 'text-green-400' : inbox.health === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>
                              {inbox.openRate}% open
                            </p>
                            <p className="text-xs text-slate-500">{inbox.bounceRate}% bounce</p>
                          </div>
                          {imapData?.bounceEmails?.length > 0 && (
                            <div className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded font-bold flex-shrink-0">
                              {imapData.bounceEmails.length} failures
                            </div>
                          )}
                          {imapData?.error && (
                            <div className="bg-dark-600 text-slate-500 text-xs px-2 py-0.5 rounded flex-shrink-0">
                              IMAP error
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Tips */}
                <div className="card bg-dark-700 border border-dark-500">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-semibold">Tips to Stay Out of Spam</p>
                  <ul className="flex flex-col gap-2 text-sm text-slate-300">
                    <li className="flex gap-2"><span className="text-green-400">✓</span> Keep bounce rate below 2% — remove bad emails immediately</li>
                    <li className="flex gap-2"><span className="text-green-400">✓</span> Send max 150/day per inbox — never blast in bulk</li>
                    <li className="flex gap-2"><span className="text-green-400">✓</span> Warm up new inboxes: 10/day → 20/day → 50/day over 2 weeks</li>
                    <li className="flex gap-2"><span className="text-green-400">✓</span> Emails ending with a question get more replies (better engagement signals)</li>
                    <li className="flex gap-2"><span className="text-amber-400">!</span> Low open rate (&lt;15%) signals to Gmail that people aren't engaging</li>
                  </ul>
                </div>

                {data.generatedAt && (
                  <p className="text-xs text-slate-600 text-center">
                    Last checked: {formatDate(data.generatedAt)}
                  </p>
                )}
              </div>
            ) : tab === 'likely-spam' ? (
              <div className="p-6">
                <p className="text-xs text-slate-400 mb-1">
                  Sent 5+ days ago and never opened — likely in spam or unread.
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  If you see someone's email here that you know is active, their Gmail may have filtered you.
                </p>
                {data.likelySpam.length === 0 ? (
                  <div className="flex flex-col items-center py-12 gap-3">
                    <ShieldCheck size={32} className="text-green-400" />
                    <p className="text-green-400 font-semibold">All clear!</p>
                    <p className="text-slate-400 text-sm">No emails flagged as likely spam</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.likelySpam.map(email => (
                      <div key={email.id} className="card bg-dark-700 py-3 px-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{email.channel_name || email.to_email}</p>
                            <p className="text-xs text-slate-400 truncate">{email.subject}</p>
                            <p className="text-xs text-slate-500 mt-1">{email.to_email}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-xs text-amber-400 font-bold">{email.days_since}d ago</div>
                            <div className="text-xs text-slate-500">never opened</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6">
                {/* IMAP Mailer-Daemon bounces */}
                {totalBouncebacks > 0 && (
                  <div className="mb-6">
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-semibold text-red-400">
                      Delivery Failures from IMAP ({totalBouncebacks})
                    </p>
                    <div className="flex flex-col gap-2">
                      {data.imapResults?.flatMap(r =>
                        (r.bounceEmails || []).map((b, i) => (
                          <div key={`${r.email}-${i}`} className="card bg-dark-700 border border-red-500/20 py-3 px-4">
                            <p className="text-xs text-red-400 font-semibold mb-1">Via {r.email}</p>
                            <p className="text-sm text-white truncate">{b.subject}</p>
                            {b.originalRecipient && (
                              <p className="text-xs text-slate-400 mt-1">Recipient: {b.originalRecipient}</p>
                            )}
                            <p className="text-xs text-slate-500 mt-0.5">{b.date}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* DB bounces */}
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-semibold">
                  Bounced in Database ({data.recentBounces.length})
                </p>
                {data.recentBounces.length === 0 && totalBouncebacks === 0 ? (
                  <div className="flex flex-col items-center py-12 gap-3">
                    <ShieldCheck size={32} className="text-green-400" />
                    <p className="text-green-400 font-semibold">No bounces detected</p>
                    <p className="text-slate-400 text-sm">Your delivery rate looks clean</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.recentBounces.map(email => (
                      <div key={email.id} className="card bg-dark-700 py-3 px-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{email.channel_name || email.to_email}</p>
                            <p className="text-xs text-slate-400 truncate">{email.subject}</p>
                            <p className="text-xs text-slate-500">{email.to_email}</p>
                          </div>
                          <div className="text-xs text-red-400 font-bold flex-shrink-0">bounced</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
