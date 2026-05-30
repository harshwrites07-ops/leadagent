import { useState, useEffect } from 'react';
import Icon from './Icon';
import api, { formatDate } from '../../utils/api';

export default function SpamMonitorPanel({ onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('overview');

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

  const totalBouncebacks = data?.imapResults?.reduce((s, r) => s + (r.bounceEmails?.length || 0), 0) || 0;
  const totalSpamFolder  = data?.imapResults?.reduce((s, r) => s + (r.spamCount || 0), 0) || 0;

  const riskColor = !data ? 'var(--lime)'
    : data.overallRisk === 'high'   ? 'var(--bad)'
    : data.overallRisk === 'medium' ? 'var(--warn)'
    : 'var(--ok)';

  const riskLabel = !data ? '—'
    : data.overallRisk === 'high'   ? 'High Risk'
    : data.overallRisk === 'medium' ? 'Medium Risk'
    : 'Low Risk';

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 480, height: '100%', background: 'var(--bg-2)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid var(--line)', gap: 12, flexShrink: 0 }}>
          <Icon name="shield" size={18} style={{ color: 'var(--warn)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Spam Monitor</div>
            <div className="muted" style={{ fontSize: 11 }}>Inbox health &amp; delivery tracking</div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={load} title="Refresh">
            <Icon name="refresh" size={13} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>
            <Icon name="x" size={13} />
          </button>
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ padding: '0 20px', flexShrink: 0, borderBottom: '1px solid var(--line)' }}>
          {[
            { key: 'overview',      label: 'Overview' },
            { key: 'likely-spam',   label: `Likely Spam (${data?.likelySpam?.length || 0})` },
            { key: 'bounces',       label: `Bounces (${totalBouncebacks + (data?.recentBounces?.length || 0)})` },
          ].map(t => (
            <div key={t.key} className={`tab ${tab === t.key ? 'is-active' : ''}`} onClick={() => setTab(t.key)}
              style={{ fontSize: 12.5 }}>
              {t.label}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10 }}>
              <Icon name="refresh" size={28} style={{ color: 'var(--lime)', animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Checking inboxes...</div>
              <div className="muted" style={{ fontSize: 11 }}>May take up to 20 seconds</div>
            </div>
          ) : !data ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
              <Icon name="shield" size={32} style={{ color: 'var(--bad)' }} />
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Failed to load spam report</div>
              <button className="btn btn--ghost btn--sm" onClick={load}>Retry</button>
            </div>
          ) : tab === 'overview' ? (
            <>
              {/* Risk banner */}
              <div style={{ padding: '12px 16px', borderRadius: 'var(--r)', border: `1px solid ${riskColor}40`, background: `${riskColor}10`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Icon name="shield" size={24} style={{ color: riskColor, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: riskColor }}>{riskLabel}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {data.overallBounceRate}% bounce rate · {data.likelySpam?.length || 0} emails likely in spam
                    {totalBouncebacks > 0 && ` · ${totalBouncebacks} delivery failures`}
                  </div>
                </div>
              </div>

              {/* IMAP findings */}
              {(totalBouncebacks > 0 || totalSpamFolder > 0) && (
                <div className="card" style={{ background: 'var(--surface-2)', borderColor: 'var(--warn)' }}>
                  <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                    <Icon name="warn" size={14} style={{ color: 'var(--warn)' }} />
                    <span style={{ fontSize: 12, color: 'var(--warn)', fontWeight: 600 }}>IMAP Findings</span>
                  </div>
                  {totalBouncebacks > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
                      <strong style={{ color: 'var(--bad)' }}>{totalBouncebacks}</strong> Mailer-Daemon bounce-back emails detected — blocked or spam-filtered by recipients.
                    </div>
                  )}
                  {totalSpamFolder > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      <strong style={{ color: 'var(--warn)' }}>{totalSpamFolder}</strong> items in your Gmail Spam folder.
                    </div>
                  )}
                </div>
              )}

              {/* Per-inbox health */}
              <div>
                <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Inbox health · last 30 days</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.perInbox?.map(inbox => {
                    const imapData = data.imapResults?.find(r => r.email === inbox.email);
                    const hc = inbox.health === 'good' ? 'var(--ok)' : inbox.health === 'warning' ? 'var(--warn)' : 'var(--bad)';
                    return (
                      <div key={inbox.email} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: hc, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inbox.email}</div>
                          <div className="muted" style={{ fontSize: 11 }}>{inbox.sentCount} sent · {inbox.openedCount} opened · {inbox.bouncedCount} bounced</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: hc }}>{inbox.openRate}% open</div>
                          <div className="muted" style={{ fontSize: 10 }}>{inbox.bounceRate}% bounce</div>
                        </div>
                        {imapData?.bounceEmails?.length > 0 && (
                          <span style={{ background: 'rgba(255,68,68,.15)', color: 'var(--bad)', fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>
                            {imapData.bounceEmails.length} fail
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tips */}
              <div className="card" style={{ background: 'var(--surface-2)' }}>
                <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Tips to stay out of spam</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
                  {[
                    ['ok',   'Keep bounce rate below 2% — remove bad emails immediately'],
                    ['ok',   'Send max 150/day per inbox — never blast in bulk'],
                    ['ok',   'Warm up new inboxes: 10/day → 20/day → 50/day over 2 weeks'],
                    ['ok',   'Emails ending with a question get more replies'],
                    ['warn', 'Low open rate (<15%) signals low engagement to Gmail'],
                  ].map(([kind, tip], i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: kind === 'ok' ? 'var(--ok)' : 'var(--warn)', flexShrink: 0, marginTop: 1 }}>{kind === 'ok' ? '✓' : '!'}</span>
                      {tip}
                    </div>
                  ))}
                </div>
              </div>

              {data.generatedAt && (
                <div className="muted" style={{ fontSize: 10, textAlign: 'center' }}>Last checked: {formatDate(data.generatedAt)}</div>
              )}
            </>
          ) : tab === 'likely-spam' ? (
            <>
              {(!data.likelySpam || data.likelySpam.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ok)', fontSize: 13 }}>
                  <Icon name="check" size={28} style={{ display: 'block', margin: '0 auto 10px' }} />
                  No emails likely landing in spam.
                </div>
              ) : data.likelySpam.map((e, i) => (
                <div key={i} style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 2 }}>{e.subject || e.to_email}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{e.to_email} · {e.reason || 'High spam score'}</div>
                </div>
              ))}
            </>
          ) : (
            <>
              {(totalBouncebacks === 0 && (!data.recentBounces || data.recentBounces.length === 0)) ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ok)', fontSize: 13 }}>
                  <Icon name="check" size={28} style={{ display: 'block', margin: '0 auto 10px' }} />
                  No bounces detected.
                </div>
              ) : data.recentBounces?.map((b, i) => (
                <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,68,68,.06)', border: '1px solid rgba(255,68,68,.2)', borderRadius: 'var(--r)' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--bad)', marginBottom: 2 }}>{b.email || b.to_email}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{b.reason || 'Delivery failure'} · {formatDate(b.bounced_at || b.created_at)}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
