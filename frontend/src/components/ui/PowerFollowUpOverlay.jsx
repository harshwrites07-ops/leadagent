import { useState, useEffect, useRef } from 'react';
import { X, Zap, CheckCircle, XCircle, Clock, Loader } from 'lucide-react';

const STEP_LABELS = ['', 'Fresh Insight', 'Social Proof', 'Check-In', 'Last Try', 'Close Loop'];

export default function PowerFollowUpOverlay({ onClose }) {
  const [phase, setPhase] = useState('confirm'); // confirm | running | done
  const [pending, setPending] = useState(null);
  const [stats, setStats] = useState({ sent: 0, failed: 0 });
  const [feed, setFeed] = useState([]);
  const [total, setTotal] = useState(0);
  const feedRef = useRef(null);

  useEffect(() => {
    fetch('/api/followups/pending')
      .then(r => r.json())
      .then(d => setPending(d.due || 0))
      .catch(() => setPending(0));
  }, []);

  const addFeed = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setFeed(prev => [...prev.slice(-80), { msg, type, time }]);
    setTimeout(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, 30);
  };

  const start = async () => {
    setPhase('running');
    setFeed([]);
    setStats({ sent: 0, failed: 0 });

    try {
      const response = await fetch('/api/followups/send-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_leads: 100 }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          let event = 'message';
          let dataStr = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            if (line.startsWith('data:')) dataStr = line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (event === 'start') {
              setTotal(data.total);
              addFeed(`Starting follow-ups for ${data.total} leads`, 'info');
            } else if (event === 'progress') {
              if (data.stats) setStats({ sent: data.stats.sent, failed: data.stats.failed });
              if (data.type === 'generating') addFeed(`Generating FU${data.step} (${STEP_LABELS[data.step] || ''}) for ${data.channel}`, 'info');
              if (data.type === 'sent') addFeed(`Sent FU${data.step} → ${data.channel} (${data.email})`, 'success');
              if (data.type === 'failed') addFeed(`Failed: ${data.channel} — ${data.error}`, 'error');
            } else if (event === 'done') {
              setStats({ sent: data.sent, failed: data.failed });
              setTotal(data.total);
              setPhase('done');
            } else if (event === 'error') {
              addFeed(`Error: ${data.message}`, 'error');
              setPhase('done');
            }
          } catch {}
        }
      }
      if (phase !== 'done') setPhase('done');
    } catch (err) {
      addFeed(`Connection error: ${err.message}`, 'error');
      setPhase('done');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#0f0f1a', border: '1px solid #2d2d4a', borderRadius: '16px', width: '100%', maxWidth: 580, padding: '2rem', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
          <X size={20} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ padding: '0.5rem', background: 'linear-gradient(135deg,#f97316,#ef4444)', borderRadius: '10px', color: 'white' }}>
            <Zap size={20} />
          </div>
          <div>
            <h2 style={{ color: 'white', fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Power Follow Up</h2>
            <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0 }}>5-step automated follow-up system</p>
          </div>
        </div>

        {/* Confirm phase */}
        {phase === 'confirm' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '3rem', fontWeight: 800, color: '#f97316', marginBottom: '0.5rem' }}>
              {pending === null ? '...' : pending}
            </div>
            <p style={{ color: '#94a3b8', marginBottom: '0.25rem' }}>leads due for follow-up</p>
            <p style={{ color: '#475569', fontSize: '0.8rem', marginBottom: '2rem' }}>
              FU1 Day 3 · FU2 Day 6 · FU3 Day 9 · FU4 Day 12 · FU5 Day 15 → no_response
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button onClick={onClose} style={{ padding: '0.6rem 1.5rem', background: '#1e1e2e', border: '1px solid #2d2d4a', borderRadius: '8px', color: '#94a3b8', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={start}
                disabled={pending === 0}
                style={{ padding: '0.6rem 1.5rem', background: 'linear-gradient(135deg,#f97316,#ef4444)', border: 'none', borderRadius: '8px', color: 'white', cursor: pending === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: pending === 0 ? 0.5 : 1 }}
              >
                Send Follow-Ups
              </button>
            </div>
          </div>
        )}

        {/* Running phase */}
        {(phase === 'running' || phase === 'done') && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'SENT', value: stats.sent, color: '#4ade80' },
                { label: 'FAILED', value: stats.failed, color: '#f87171' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#1a1a2e', borderRadius: '10px', padding: '1rem', textAlign: 'center', border: '1px solid #2d2d4a' }}>
                  <div style={{ color, fontSize: '2rem', fontWeight: 800 }}>{value}</div>
                  <div style={{ color: '#475569', fontSize: '0.75rem' }}>{label}</div>
                </div>
              ))}
            </div>

            {phase === 'running' && total > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.75rem', marginBottom: '4px' }}>
                  <span>Progress</span>
                  <span>{stats.sent + stats.failed}/{total}</span>
                </div>
                <div style={{ height: 6, background: '#1e1e2e', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'linear-gradient(90deg,#f97316,#ef4444)', borderRadius: 3, width: `${total > 0 ? Math.round((stats.sent + stats.failed) / total * 100) : 0}%`, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            )}

            <div ref={feedRef} style={{ height: 180, overflowY: 'auto', background: '#0a0a0f', borderRadius: '8px', padding: '0.75rem', fontSize: '0.72rem', fontFamily: 'monospace' }}>
              {feed.map((f, i) => (
                <div key={i} style={{ color: f.type === 'success' ? '#4ade80' : f.type === 'error' ? '#f87171' : '#64748b', marginBottom: '2px' }}>
                  <span style={{ color: '#334155' }}>[{f.time}]</span> {f.msg}
                </div>
              ))}
              {phase === 'running' && <div style={{ color: '#f97316' }}>⟳ running...</div>}
            </div>

            {phase === 'done' && (
              <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#4ade80', marginBottom: '1rem' }}>
                  <CheckCircle size={18} />
                  <span style={{ fontWeight: 600 }}>Done — {stats.sent} follow-ups sent</span>
                </div>
                <button onClick={onClose} style={{ padding: '0.6rem 2rem', background: '#1e1e2e', border: '1px solid #2d2d4a', borderRadius: '8px', color: 'white', cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
