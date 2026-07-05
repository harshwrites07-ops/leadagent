import { useState, useEffect, useRef } from 'react';
import { X, Zap, CheckCircle } from 'lucide-react';
import api from '../../utils/api';

const STEP_LABELS = ['', 'Fresh Insight', 'Social Proof', 'Check-In', 'Last Try', 'Close Loop'];

export default function PowerFollowUpOverlay({ onClose }) {
  const [phase, setPhase] = useState('confirm');
  const [pending, setPending] = useState(null);
  const [stats, setStats] = useState({ sent: 0, failed: 0 });
  const [feed, setFeed] = useState([]);
  const [total, setTotal] = useState(0);
  const feedRef = useRef(null);

  useEffect(() => {
    api.get('/followups/pending')
      .then(r => setPending(r.data.due || 0))
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
        credentials: 'include',
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', width: '100%', maxWidth: 580, padding: 32, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ padding: 8, background: 'var(--lime-soft)', border: '1px solid var(--lime-border)', borderRadius: 'var(--r)', color: 'var(--lime)' }}>
            <Zap size={18} />
          </div>
          <div>
            <h2 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 600, margin: 0, fontFamily: 'var(--f-sans)' }}>Power Follow Up</h2>
            <p style={{ color: 'var(--text-3)', fontSize: 12, margin: 0, fontFamily: 'var(--f-mono)' }}>5-step automated follow-up system</p>
          </div>
        </div>

        {/* Confirm phase */}
        {phase === 'confirm' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 48, fontWeight: 500, color: 'var(--lime)', marginBottom: 8 }}>
              {pending === null ? '–' : pending}
            </div>
            <p style={{ color: 'var(--text-2)', marginBottom: 4, fontFamily: 'var(--f-sans)', fontSize: 13 }}>leads due for follow-up</p>
            <p style={{ color: 'var(--text-3)', fontSize: 11, marginBottom: 24, fontFamily: 'var(--f-mono)' }}>
              FU1 Day 3 · FU2 Day 6 · FU3 Day 9 · FU4 Day 12 · FU5 Day 15 → no_response
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={onClose} style={{ padding: '8px 20px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--f-sans)', fontSize: 13 }}>
                Cancel
              </button>
              <button
                onClick={start}
                disabled={pending === 0}
                style={{ padding: '8px 20px', background: 'var(--lime)', border: 'none', borderRadius: 'var(--r)', color: 'var(--on-accent)', cursor: pending === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, fontFamily: 'var(--f-sans)', fontSize: 13, opacity: pending === 0 ? 0.4 : 1 }}
              >
                Send Follow-Ups
              </button>
            </div>
          </div>
        )}

        {/* Running / done phase */}
        {(phase === 'running' || phase === 'done') && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'SENT', value: stats.sent, color: 'var(--ok)' },
                { label: 'FAILED', value: stats.failed, color: 'var(--bad)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 'var(--r)', padding: 16, textAlign: 'center', border: '1px solid var(--line)' }}>
                  <div style={{ color, fontFamily: 'var(--f-mono)', fontSize: 32, fontWeight: 500 }}>{value}</div>
                  <div style={{ color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--f-mono)', letterSpacing: '0.1em' }}>{label}</div>
                </div>
              ))}
            </div>

            {phase === 'running' && total > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--f-mono)', marginBottom: 4 }}>
                  <span>Progress</span>
                  <span>{stats.sent + stats.failed}/{total}</span>
                </div>
                <div style={{ height: 4, background: 'var(--line-2)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--lime)', borderRadius: 99, width: `${total > 0 ? Math.round((stats.sent + stats.failed) / total * 100) : 0}%`, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            )}

            <div ref={feedRef} style={{ height: 180, overflowY: 'auto', background: 'var(--bg)', borderRadius: 'var(--r)', padding: 12, fontSize: 11, fontFamily: 'var(--f-mono)' }}>
              {feed.map((f, i) => (
                <div key={i} style={{ color: f.type === 'success' ? 'var(--ok)' : f.type === 'error' ? 'var(--bad)' : 'var(--text-3)', marginBottom: 2 }}>
                  <span style={{ color: 'var(--text-4)' }}>[{f.time}]</span> {f.msg}
                </div>
              ))}
              {phase === 'running' && <div style={{ color: 'var(--lime)' }}>⟳ running…</div>}
            </div>

            {phase === 'done' && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--ok)', marginBottom: 12 }}>
                  <CheckCircle size={16} />
                  <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'var(--f-sans)' }}>Done — {stats.sent} follow-ups sent</span>
                </div>
                <button onClick={onClose} style={{ padding: '8px 24px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--f-sans)', fontSize: 13 }}>
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
