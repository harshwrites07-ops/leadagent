import { useState, useEffect, useRef } from 'react';
import { Zap, X, Loader } from 'lucide-react';

export default function PowerSendOverlay({ onClose, leadIds = null, maxLeads = 100 }) {
  const [phase, setPhase] = useState('confirm');
  const [stats, setStats] = useState({ studied: 0, generated: 0, sent: 0, failed: 0, total: 0 });
  const [feed, setFeed] = useState([]);
  const feedRef = useRef(null);
  const readerRef = useRef(null);

  useEffect(() => {
    return () => {
      // Cancel the stream if component unmounts while running
      try { readerRef.current?.cancel(); } catch {}
    };
  }, []);

  const addFeed = (type, message) => {
    setFeed(prev => [{ type, message, time: new Date() }, ...prev].slice(0, 60));
  };

  const startPowerSend = async () => {
    setPhase('running');
    addFeed('start', `Starting power send for ${leadIds ? leadIds.length : maxLeads} leads...`);

    try {
      const response = await fetch('/api/pitches/power-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: leadIds || null, max_leads: maxLeads }),
      });

      if (!response.ok) {
        throw new Error(`Server error ${response.status}`);
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split('\n\n');
        buffer = messages.pop() ?? '';

        for (const message of messages) {
          if (!message.trim()) continue;
          let eventName = '';
          let eventData = '';
          for (const line of message.split('\n')) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            else if (line.startsWith('data: ')) eventData = line.slice(6).trim();
          }
          if (!eventData) continue;

          try {
            const parsed = JSON.parse(eventData);
            if (eventName === 'start') {
              setStats(s => ({ ...s, total: parsed.total }));
            } else if (eventName === 'progress') {
              if (parsed.stats) setStats(s => ({ ...s, ...parsed.stats }));
              const labels = { studying: `Studying ${parsed.channel}...`, generated: `Pitch ready for ${parsed.channel}`, sent: `Sent to ${parsed.channel} (${parsed.email || ''})`, failed: `Failed: ${parsed.channel} — ${parsed.error || ''}` };
              addFeed(parsed.type, labels[parsed.type] || parsed.type);
            } else if (eventName === 'done') {
              setStats(parsed);
              setPhase('done');
              addFeed('done', `Complete! ${parsed.sent} sent, ${parsed.failed} failed out of ${parsed.total}.`);
            } else if (eventName === 'error') {
              addFeed('failed', `Error: ${parsed.message}`);
              setPhase('done');
            }
          } catch {}
        }
      }

      if (phase !== 'done') setPhase('done');
    } catch (err) {
      addFeed('failed', `Connection error: ${err.message}`);
      setPhase('done');
    }
  };

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [feed]);

  const pct = stats.total > 0 ? Math.round(((stats.sent + stats.failed) / stats.total) * 100) : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 580, background: 'var(--bg-surface)', borderRadius: 14, border: '1px solid rgba(255,69,0,0.2)', overflow: 'hidden', boxShadow: '0 0 60px rgba(255,69,0,0.15)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,69,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gradient-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(255,69,0,0.5)', flexShrink: 0 }}>
              <Zap size={20} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: 'var(--text-primary)', margin: 0 }}>Power Email Mode</h2>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent-primary)', letterSpacing: '0.18em', marginTop: 2 }}>AI-POWERED BULK OUTREACH</p>
            </div>
          </div>
          {phase !== 'running' && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
              <X size={18} />
            </button>
          )}
        </div>

        {/* Confirm phase */}
        {phase === 'confirm' && (
          <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>
              Auto-select top <strong style={{ color: 'var(--accent-primary)' }}>{leadIds ? leadIds.length : maxLeads} leads</strong>, generate hyper-personalized pitches with <strong style={{ color: '#7B61FF' }}>Prahvi AI</strong>, and send via 4-account rotation — all in one shot.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                ['Leads targeted', leadIds ? `${leadIds.length} selected` : `Top ${maxLeads} HOT leads`],
                ['AI persona', 'Prahvi (Gemini Flash)'],
                ['Sending accounts', '4 × 150/day = 600/day'],
                ['Est. time', `~${Math.ceil((leadIds?.length || maxLeads) * 0.35)} mins`],
              ].map(([label, val]) => (
                <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '12px 16px' }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: 4 }}>{label.toUpperCase()}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{val}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={startPowerSend} style={{ flex: 2, padding: '12px', borderRadius: 8, cursor: 'pointer', background: 'var(--gradient-orange)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 0 24px rgba(255,69,0,0.35)' }}>
                <Zap size={16} /> Fire Power Email
              </button>
            </div>
          </div>
        )}

        {/* Running / Done phase */}
        {(phase === 'running' || phase === 'done') && (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Counters */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'STUDIED', val: stats.studied, color: '#00B8D4' },
                { label: 'GENERATED', val: stats.generated, color: '#7B61FF' },
                { label: 'SENT', val: stats.sent, color: '#00E5A0' },
                { label: 'FAILED', val: stats.failed, color: '#FF4444' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: 'var(--bg-card)', border: `1px solid ${color}30`, borderRadius: 8, padding: '14px 0', textAlign: 'center' }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 700, color, lineHeight: 1, margin: 0 }}>{val}</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.14em', marginTop: 6 }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--gradient-orange)', borderRadius: 99, width: `${pct}%`, transition: 'width 0.6s ease' }} />
            </div>
            {stats.total > 0 && (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: -8 }}>
                {stats.sent + stats.failed} / {stats.total} processed ({pct}%)
              </p>
            )}

            {/* Live feed */}
            <div ref={feedRef} style={{ height: 180, overflowY: 'auto', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border-subtle)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {feed.length === 0 && phase === 'running' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
                  <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Connecting to server...
                </div>
              )}
              {feed.map((item, i) => {
                const dotColors = { start: '#00B8D4', studying: '#7B61FF', generated: '#F5A623', sent: '#00E5A0', failed: '#FF4444', done: '#00E5A0' };
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minHeight: 18 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: dotColors[item.type] || '#555', marginTop: 5, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)', color: item.type === 'failed' ? '#FF6666' : item.type === 'sent' || item.type === 'done' ? '#00E5A0' : 'var(--text-secondary)', lineHeight: 1.5, wordBreak: 'break-all' }}>{item.message}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{item.time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                );
              })}
            </div>

            {phase === 'done' && (
              <button onClick={onClose} style={{ padding: '12px', borderRadius: 8, cursor: 'pointer', background: 'var(--gradient-orange)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, boxShadow: '0 0 20px rgba(255,69,0,0.3)' }}>
                Done — Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
