import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Icon from '../components/ui/Icon';
import PowerSendOverlay from '../components/ui/PowerSendOverlay';
import SpamMonitorPanel from '../components/ui/SpamMonitorPanel';
import api, { formatNumber, formatDate } from '../utils/api';
import { useApp } from '../context/AppContext';

const STATUS_BADGE = {
  pending:  { label: 'Pending',  kind: '' },
  sending:  { label: 'Sending',  kind: 'warn' },
  sent:     { label: 'Sent',     kind: 'lime' },
  failed:   { label: 'Failed',   kind: 'bad' },
  opened:   { label: 'Opened',   kind: 'lime' },
  replied:  { label: 'Replied',  kind: 'coral' },
  bounced:  { label: 'Bounced',  kind: 'bad' },
};

export default function EmailSender() {
  const navigate = useNavigate();
  const { refreshDashboard } = useApp();

  const [tab, setTab] = useState('queue');
  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [paused, setPaused] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showPowerOverlay, setShowPowerOverlay] = useState(false);
  const [showPowerSendModal, setShowPowerSendModal] = useState(false);
  const [showSpamMonitor, setShowSpamMonitor] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpDays, setFollowUpDays] = useState(3);
  const [followUpCount, setFollowUpCount] = useState(2);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const { data } = await api.get('/emails/stats');
      setStats(data);
    } catch { toast.error('Failed to load email stats'); }
    finally { setStatsLoading(false); }
  }, []);

  const fetchQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const { data } = await api.get('/emails/queue');
      setQueue(data.queue || data || []);
      setPaused(data.paused || false);
    } catch { toast.error('Failed to load queue'); }
    finally { setQueueLoading(false); }
  }, []);

  const fetchHistory = useCallback(async (status) => {
    setHistoryLoading(true);
    try {
      const params = status !== 'all' ? { status } : {};
      const { data } = await api.get('/emails', { params });
      setHistory(data.emails || data || []);
    } catch { toast.error('Failed to load history'); }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchQueue();
  }, [fetchStats, fetchQueue]);

  useEffect(() => {
    if (tab !== 'queue') fetchHistory(tab === 'sent' ? 'sent' : tab === 'opened' ? 'opened' : tab === 'replied' ? 'replied' : tab === 'bounced' ? 'bounced' : 'all');
  }, [tab, fetchHistory]);

  const handleTogglePause = async () => {
    try {
      if (paused) {
        await api.post('/emails/queue/resume');
        setPaused(false);
        toast.success('Sending resumed.');
      } else {
        await api.post('/emails/queue/pause');
        setPaused(true);
        toast.success('Paused. Nothing will go out.');
      }
    } catch { toast.error('Failed to toggle queue'); }
  };

  const handleRemove = async id => {
    try {
      await api.delete(`/emails/queue/${id}`);
      setQueue(prev => prev.filter(i => i.id !== id));
      toast.success('Removed.');
    } catch { toast.error('Failed to remove'); }
  };

  const handleSendNow = async id => {
    try {
      setQueue(prev => prev.map(i => i.id === id ? { ...i, status: 'sending' } : i));
      await api.post(`/emails/send-now/${id}`);
      toast.success('Sent.');
      fetchQueue();
      fetchStats();
    } catch { toast.error('Failed to send'); fetchQueue(); }
  };

  const queueCount = queue.length;
  const sentToday = stats?.sent_today ?? 0;
  const openRate = stats?.open_rate ?? 0;
  const replyCount = history.filter ? history.filter(e => e.status === 'replied').length : (stats?.replied_count ?? 0);

  const TABS = [
    { id: 'queue',   label: 'Queue',   count: queueCount },
    { id: 'sent',    label: 'Sent',    count: sentToday },
    { id: 'opened',  label: 'Opened',  count: stats?.opened_count ?? 0 },
    { id: 'replied', label: 'Replied', count: stats?.replied_count ?? 0, kind: 'coral' },
    { id: 'bounced', label: 'Bounced', count: stats?.bounced_count ?? 0 },
  ];

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Email Sender — <em>your outbox, alive.</em></h1>
        </div>
        <div className="page__actions">
          <button className="btn btn--ghost" onClick={() => setShowSpamMonitor(true)}>
            <Icon name="shield" size={13} />Spam Monitor
          </button>
          <button className="btn btn--ghost" onClick={handleTogglePause}>
            <Icon name={paused ? 'play' : 'pause'} size={13} />{paused ? 'Resume sending' : 'Pause sending'}
          </button>
          <button
            className="btn"
            style={{ background: 'var(--coral-soft)', borderColor: 'var(--coral-border)', color: 'var(--coral)' }}
            onClick={() => setShowFollowUpModal(true)}
          >
            <Icon name="bolt" size={13} />Power Follow-up
          </button>
          <button className="btn btn--primary" onClick={() => setShowPowerSendModal(true)}>
            <Icon name="bolt" size={13} />Power Send · {queueCount} ready
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid g-4" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="stat__label">Queued</div>
          <div className="stat__value stat__value--mono">{formatNumber(queueCount)}</div>
          <div className="muted mono" style={{ fontSize: 11, marginTop: 6 }}>across mailboxes</div>
        </div>
        <div className="stat">
          <div className="stat__label">Sent today</div>
          <div className="stat__value stat__value--mono">{formatNumber(sentToday)}</div>
          <div className="muted mono" style={{ fontSize: 11, marginTop: 6 }}>{formatNumber((stats?.daily_limit ?? 150) - sentToday)} capacity left</div>
        </div>
        <div className="stat">
          <div className="stat__label">Replied</div>
          <div className="stat__value stat__value--mono" style={{ color: 'var(--coral)' }}>{formatNumber(stats?.replied_count ?? 0)}</div>
          <div className="muted mono" style={{ fontSize: 11, marginTop: 6 }}>need attention</div>
        </div>
        <div className="stat">
          <div className="stat__label">Inbox placement</div>
          <div className="stat__value stat__value--mono" style={{ color: 'var(--lime)' }}>
            {stats?.inbox_placement != null ? `${stats.inbox_placement}%` : '98.6%'}
          </div>
          <div className="muted mono" style={{ fontSize: 11, marginTop: 6 }}>0 bounces · 0 spam</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {TABS.map(t => (
          <div key={t.id} className={`tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}{' '}
            <span className="mono muted" style={{ marginLeft: 6, fontSize: 10.5, color: t.kind === 'coral' ? 'var(--coral)' : 'var(--text-3)' }}>
              {t.count}
            </span>
          </div>
        ))}
      </div>

      {/* Queue tab */}
      {tab === 'queue' && (
        <>
          {queueLoading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              <span className="dot dot--pulse" style={{ marginRight: 8, display: 'inline-block' }} />Loading queue...
            </div>
          ) : queue.length === 0 ? (
            <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              Nothing queued yet. Head to Pitch Gen, generate some pitches, and they'll land here ready to send.
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}><Icon name="moreH" size={12} /></th>
                    <th style={{ width: 32 }}><input type="checkbox" onChange={e => {}} /></th>
                    <th>To</th>
                    <th>Subject</th>
                    <th>From mailbox</th>
                    <th>Status</th>
                    <th>Will send</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item, i) => {
                    const badge = STATUS_BADGE[item.status] || STATUS_BADGE.pending;
                    return (
                      <tr key={item.id || i}>
                        <td><span style={{ cursor: 'grab', color: 'var(--text-4)', fontSize: 14, letterSpacing: '-1px' }}>⋮⋮</span></td>
                        <td><input type="checkbox" defaultChecked /></td>
                        <td>
                          <div className="row" style={{ gap: 8 }}>
                            <span className="ava" style={{ fontSize: 11, flexShrink: 0 }}>
                              {(item.lead_name || '?')[0].toUpperCase()}
                            </span>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{item.lead_name || 'Unknown'}</div>
                              <div className="mono muted" style={{ fontSize: 10.5 }}>{item.email || ''}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: 12.5, color: 'var(--text-2)', maxWidth: 280 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject}</div>
                        </td>
                        <td className="mono" style={{ fontSize: 11.5 }}>{item.mailbox || item.from_email || '—'}</td>
                        <td>
                          <span className={`badge${badge.kind ? ' badge--' + badge.kind : ''}`}>{badge.label}</span>
                        </td>
                        <td className="muted" style={{ fontSize: 11.5 }}>
                          {item.scheduled_at ? formatDate(item.scheduled_at) : '—'}
                        </td>
                        <td>
                          <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                            <button className="btn btn--ghost btn--sm" title="Preview"><Icon name="eye" size={11} /></button>
                            <button className="btn btn--ghost btn--sm" title="Send now" onClick={() => handleSendNow(item.id)}>
                              <Icon name="play" size={11} />
                            </button>
                            <button className="btn btn--ghost btn--sm" title="Remove" onClick={() => handleRemove(item.id)}>
                              <Icon name="x" size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Replied tab */}
      {tab === 'replied' && (
        <>
          {historyLoading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              <span className="dot dot--pulse" style={{ marginRight: 8, display: 'inline-block' }} />Loading...
            </div>
          ) : history.length === 0 ? (
            <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No replies yet.
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {history.map((h, i) => (
                <div key={h.id || i} style={{ padding: '14px 18px', borderBottom: i < history.length - 1 ? '1px solid var(--line)' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className="ava" style={{ flexShrink: 0 }}>
                    {(h.lead_name || h.to_name || '?')[0].toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{h.lead_name || h.to_name || 'Unknown'}</span>
                      {h.reply_sentiment && (
                        <span className={`badge badge--${h.reply_sentiment === 'positive' ? 'coral' : h.reply_sentiment === 'question' ? 'warn' : 'bad'}`}>
                          {h.reply_sentiment}
                        </span>
                      )}
                    </div>
                    <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.subject}</div>
                  </div>
                  <div className="muted mono" style={{ fontSize: 11, flexShrink: 0 }}>{h.sent_at ? formatDate(h.sent_at) : '—'}</div>
                  <button className="btn btn--coral btn--sm" onClick={() => navigate('/email')}>
                    Reply <Icon name="arrowR" size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Sent / Opened / Bounced tabs */}
      {tab !== 'queue' && tab !== 'replied' && (
        <>
          {historyLoading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              <span className="dot dot--pulse" style={{ marginRight: 8, display: 'inline-block' }} />Loading...
            </div>
          ) : history.length === 0 ? (
            <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No {tab} emails yet.
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>To</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Sent</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => {
                    const badge = STATUS_BADGE[h.status] || STATUS_BADGE.sent;
                    return (
                      <tr key={h.id || i}>
                        <td>
                          <div className="row" style={{ gap: 8 }}>
                            <span className="ava" style={{ fontSize: 11 }}>
                              {(h.lead_name || h.to_name || '?')[0].toUpperCase()}
                            </span>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{h.lead_name || h.to_name}</div>
                              <div className="mono muted" style={{ fontSize: 10.5 }}>{h.to_email || ''}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: 12.5, color: 'var(--text-2)', maxWidth: 280 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.subject}</div>
                        </td>
                        <td>
                          <span className={`badge${badge.kind ? ' badge--' + badge.kind : ''}`}>{badge.label}</span>
                        </td>
                        <td className="muted" style={{ fontSize: 11.5 }}>{h.sent_at ? formatDate(h.sent_at) : '—'}</td>
                        <td>
                          <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                            <button className="btn btn--ghost btn--sm"><Icon name="eye" size={11} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Power Send modal */}
      {showPowerSendModal && (
        <div className="onb" onClick={e => e.target === e.currentTarget && setShowPowerSendModal(false)}>
          <div className="onb__card" style={{ maxWidth: 540 }}>
            <div style={{ padding: '28px 32px 8px' }}>
              <div className="row" style={{ marginBottom: 14 }}>
                <div className="pm__icon" style={{ width: 30, height: 30, borderRadius: 8 }}><Icon name="bolt" size={14} /></div>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>Power send · about to launch</div>
              </div>
              <h2 className="page__title" style={{ fontSize: 28 }}>
                Send <em style={{ fontStyle: 'italic', color: 'var(--lime)' }}>{queueCount} emails</em> across <em style={{ fontStyle: 'italic' }}>your mailboxes?</em>
              </h2>
            </div>
            <div style={{ padding: '20px 32px 24px' }}>
              <div style={{ padding: 16, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, marginBottom: 16 }}>
                <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Send plan</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{queueCount} emails scheduled across active mailboxes · smart timing</div>
              </div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 18, lineHeight: 1.55 }}>
                Each mailbox sends within its safe daily limit. Random 30-90s gaps between sends. Auto-pause if bounce rate exceeds 2%.
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowPowerSendModal(false)}>Cancel</button>
                <button className="btn btn--primary" style={{ flex: 2, justifyContent: 'center' }} onClick={() => { setShowPowerSendModal(false); setShowPowerOverlay(true); }}>
                  <Icon name="bolt" size={13} />Launch send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPowerOverlay && (
        <PowerSendOverlay
          maxLeads={100}
          onClose={() => { setShowPowerOverlay(false); fetchStats(); fetchQueue(); refreshDashboard(); }}
        />
      )}

      {showSpamMonitor && <SpamMonitorPanel onClose={() => setShowSpamMonitor(false)} />}

      {/* Follow-up modal */}
      {showFollowUpModal && (
        <div className="onb" onClick={e => e.target === e.currentTarget && setShowFollowUpModal(false)}>
          <div className="onb__card" style={{ maxWidth: 480 }}>
            <div style={{ padding: '28px 32px 8px' }}>
              <div className="row" style={{ marginBottom: 14 }}>
                <div className="pm__icon" style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--coral-soft)', border: '1px solid var(--coral-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="bolt" size={14} color="var(--coral)" />
                </div>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--coral)' }}>Auto Follow-up</div>
              </div>
              <h2 className="page__title" style={{ fontSize: 22, marginBottom: 8 }}>
                Set up <em style={{ fontStyle: 'italic', color: 'var(--coral)' }}>automatic follow-ups</em>
              </h2>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 0 }}>
                Marcus AI will send a personalised follow-up to everyone who hasn't replied — automatically, at your chosen interval — until they respond or opt out.
              </p>
            </div>
            <div style={{ padding: '20px 32px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Follow-up interval</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1, 2, 3, 5, 7].map(d => (
                    <button key={d} onClick={() => setFollowUpDays(d)} className={`btn btn--sm${followUpDays === d ? ' btn--primary' : ' btn--ghost'}`} style={{ flex: 1, justifyContent: 'center' }}>
                      {d}d
                    </button>
                  ))}
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Send a follow-up every <strong style={{ color: 'var(--text)' }}>{followUpDays} day{followUpDays > 1 ? 's' : ''}</strong> to non-responders</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Max follow-ups per lead</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1, 2, 3, 4].map(n => (
                    <button key={n} onClick={() => setFollowUpCount(n)} className={`btn btn--sm${followUpCount === n ? ' btn--primary' : ' btn--ghost'}`} style={{ flex: 1, justifyContent: 'center' }}>
                      {n}×
                    </button>
                  ))}
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Stop after <strong style={{ color: 'var(--text)' }}>{followUpCount} follow-up{followUpCount > 1 ? 's' : ''}</strong> with no reply</div>
              </div>
              <div style={{ padding: 14, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10 }}>
                <div className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
                  Marcus AI will write a <strong style={{ color: 'var(--text)' }}>unique follow-up</strong> for each creator based on your original pitch. Auto-stops when they reply.
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowFollowUpModal(false)}>Cancel</button>
                <button
                  className="btn btn--primary"
                  style={{ flex: 2, justifyContent: 'center', background: 'var(--coral-soft)', borderColor: 'var(--coral-border)', color: 'var(--coral)' }}
                  onClick={async () => {
                    try {
                      await api.post('/emails/follow-up/schedule', { interval_days: followUpDays, max_count: followUpCount });
                      toast.success(`Follow-ups scheduled — every ${followUpDays} day${followUpDays > 1 ? 's' : ''}, up to ${followUpCount}×`);
                    } catch { toast.error('Failed to schedule follow-ups'); }
                    setShowFollowUpModal(false);
                  }}
                >
                  <Icon name="bolt" size={13} />Activate Auto Follow-up
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
