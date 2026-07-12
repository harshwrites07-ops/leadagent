import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Bot, User, Loader2, Trash2, Minus, GripHorizontal, Mic, MicOff, Volume2, VolumeX, Radio } from 'lucide-react';
import api from '../../utils/api';

const WELCOME = `Marcus online. Full control of your outreach OS.\n\nTry **"daily briefing"**, **"find 50 fitness leads"**, **"send emails to hot leads"**, or **"power follow-up"** — I execute immediately, no questions asked.`;

const SUGGESTIONS = [
  'Daily briefing',
  'Find 50 fitness leads',
  'Send emails to hot leads',
  'Power follow-up',
  'Clean dead leads',
  'Show database report',
];

// Strip markdown for TTS
function cleanForSpeech(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/#{1,3}\s/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ', ')
    .replace(/[•\-]\s/g, '')
    .trim();
}

function renderText(text) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <br key={i} />;
    if (line.startsWith('## ')) {
      return <p key={i} style={{ fontWeight: 700, color: 'var(--text)', margin: '6px 0 2px', fontSize: 12 }}>{line.slice(3)}</p>;
    }
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} style={{ marginBottom: 2, lineHeight: 1.5 }}>
        {parts.map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j} style={{ color: 'var(--text)', fontWeight: 600 }}>{part.slice(2, -2)}</strong>
            : part
        )}
      </p>
    );
  });
}

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', gap: 8, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', marginTop: 2,
        background: isUser ? 'var(--surface-2)' : 'var(--lime)',
        border: isUser ? '1px solid var(--line)' : 'none',
      }}>
        {isUser ? <User size={12} color="var(--text-2)" /> : <Bot size={12} color="var(--on-accent)" />}
      </div>
      <div style={{
        maxWidth: '82%', borderRadius: 14, padding: '8px 12px', fontSize: 12,
        background: isUser ? 'var(--coral)' : 'var(--surface)',
        color: isUser ? 'var(--on-accent)' : 'var(--text-2)',
        borderTopRightRadius: isUser ? 4 : 14,
        borderTopLeftRadius: isUser ? 14 : 4,
        lineHeight: 1.5,
        border: isUser ? 'none' : '1px solid var(--line)',
      }}>
        {renderText(msg.content)}
      </div>
    </div>
  );
}

// Animated sound wave for listening / speaking
function VoiceWave({ color = 'var(--lime)', bars = 5 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 20 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2, background: color,
          animation: `voiceBar 0.8s ease-in-out ${i * 0.12}s infinite alternate`,
          height: `${8 + Math.sin(i) * 6}px`,
        }} />
      ))}
      <style>{`
        @keyframes voiceBar {
          from { transform: scaleY(0.4); opacity: 0.5; }
          to   { transform: scaleY(1.4); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState(() => {
    try {
      const stored = localStorage.getItem('jack_chat_history');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [{ role: 'assistant', content: WELCOME }];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState(null);

  // Voice state
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const windowRef = useRef(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const recognitionRef = useRef(null);
  const interimRef = useRef('');
  const intentionalStop = useRef(false);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    try {
      const capped = messages.slice(-50);
      localStorage.setItem('jack_chat_history', JSON.stringify(capped));
    } catch {}
  }, [messages]);

  // Listen for sidebar button click + ⌘K / Ctrl+K toggle + Esc close
  useEffect(() => {
    const handler = () => { setOpen(true); setMinimized(false); };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'j')) {
        e.preventDefault();
        setOpen(v => !v);
        setMinimized(false);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('jack:open', handler);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('jack:open', handler);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // ── Speech Recognition setup ─────────────────────────────────────────────────
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setHasSpeechSupport(true);

    const rec = new SR();
    rec.continuous = true;       // keep listening until user clicks stop
    rec.interimResults = true;   // show live transcription as they speak
    rec.lang = 'en-US';

    rec.onresult = (e) => {
      // Accumulate all results (final + interim) into one live transcript
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      interimRef.current = transcript;
      setInput(transcript);
    };

    rec.onend = () => {
      setListening(false);
      // Only send if user clicked the mic button to stop (not a browser timeout/error)
      if (intentionalStop.current) {
        intentionalStop.current = false;
        const final = interimRef.current.trim();
        interimRef.current = '';
        if (final) setTimeout(() => sendVoice(final), 100);
      } else {
        interimRef.current = '';
      }
    };

    rec.onerror = (e) => {
      console.warn('[Marcus Voice] Recognition error:', e.error);
      intentionalStop.current = false;
      setListening(false);
    };

    recognitionRef.current = rec;
  }, []);

  // ── TTS ───────────────────────────────────────────────────────────────────────
  const speak = useCallback((text) => {
    if (!voiceOut || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const clean = cleanForSpeech(text);
    if (!clean) return;

    const utt = new SpeechSynthesisUtterance(clean);
    utt.rate = 1.05;
    utt.pitch = 1.0;
    utt.volume = 1.0;

    // Pick best available English voice
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      return (
        voices.find(v => v.name.includes('Google US English')) ||
        voices.find(v => v.name.includes('Microsoft') && v.lang === 'en-US') ||
        voices.find(v => v.lang === 'en-US') ||
        voices.find(v => v.lang.startsWith('en')) ||
        voices[0]
      );
    };

    const voice = pickVoice();
    if (voice) utt.voice = voice;

    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);

    // Chrome loads voices async
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        const v = pickVoice();
        if (v) utt.voice = v;
        window.speechSynthesis.speak(utt);
      };
    } else {
      window.speechSynthesis.speak(utt);
    }
  }, [voiceOut]);

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  };

  // ── Drag ─────────────────────────────────────────────────────────────────────
  const onHeaderMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    const rect = windowRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragging.current = true;
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const x = Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragOffset.current.x));
      const y = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffset.current.y));
      setPos({ x, y });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); inputRef.current?.focus(); }, 80);
    }
  }, [open, minimized]);

  useEffect(() => {
    if (!minimized) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, minimized]);

  // ── Send ──────────────────────────────────────────────────────────────────────
  const sendVoice = async (text) => {
    if (!text || loading) return;
    setInput('');
    setMinimized(false);
    const updated = [...messagesRef.current, { role: 'user', content: text }];
    setMessages(updated);
    setLoading(true);
    try {
      // Gemini requires history to start with user — strip all leading assistant messages
      const firstUserIdx = updated.findIndex(m => m.role === 'user');
      const apiMessages = firstUserIdx >= 0 ? updated.slice(firstUserIdx) : updated;
      const { data } = await api.post('/assistant/chat', { messages: apiMessages });
      const reply = data.reply || 'Done.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      speak(reply);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Something went wrong';
      const errText = `Something went wrong — ${msg.replace(/\[GoogleGenerativeAI Error\]:\s*/i, '')}`;
      setMessages(prev => {
        // Don't store error messages in history — they break subsequent requests
        const withoutErr = prev.filter(m => !m.content?.startsWith('Something went wrong'));
        return [...withoutErr, { role: 'assistant', content: errText }];
      });
      speak(errText);
    } finally {
      setLoading(false);
    }
  };

  const send = async (text) => {
    const userText = (text || input).trim();
    if (!userText || loading) return;
    await sendVoice(userText);
  };

  const clearChat = () => {
    window.speechSynthesis?.cancel();
    const fresh = [{ role: 'assistant', content: WELCOME }];
    setMessages(fresh);
    try { localStorage.removeItem('jack_chat_history'); } catch {}
  };

  const toggleMic = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      // User clicks to stop — mark as intentional so onend will send
      intentionalStop.current = true;
      recognitionRef.current.stop();
    } else {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      setInput('');
      interimRef.current = '';
      intentionalStop.current = false;
      try {
        recognitionRef.current.start();
        setListening(true);
      } catch (e) {
        console.warn('[Marcus Voice] Could not start recognition:', e.message);
      }
    }
  };

  const showSuggestions = messages.length === 1 && !minimized;

  /* Agent is a docked slide-out peer, not a floating bot.
     Open via sidebar "Ask Marcus", the ⌘K trigger, or the topbar Agent button. */
  if (!open) return null;

  return (
    <div
      ref={windowRef}
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        zIndex: 9999,
        width: 'min(420px, 100vw)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-2)', borderLeft: '1px solid var(--line)',
        boxShadow: 'var(--sh-xl)',
        overflow: 'hidden',
        animation: 'slideIn 300ms cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          flexShrink: 0, borderBottom: '1px solid var(--line)',
          userSelect: 'none',
        }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: 'var(--lime)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: speaking ? '0 0 12px rgba(var(--lime-rgb),0.7)' : 'none',
          transition: 'box-shadow 0.3s',
        }}>
          {speaking ? <Radio size={16} color="var(--on-accent)" /> : <Bot size={17} color="var(--on-accent)" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Marcus</p>
            {speaking
              ? <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, fontWeight: 700, background: 'rgba(var(--lime-rgb),0.15)', color: 'var(--lime)', border: '1px solid rgba(var(--lime-rgb),0.3)' }}>SPEAKING</span>
              : listening
              ? <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, fontWeight: 700, background: 'rgba(var(--ok-rgb),0.15)', color: 'var(--ok)', border: '1px solid rgba(var(--ok-rgb),0.3)' }}>LISTENING</span>
              : <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, fontWeight: 700, background: 'rgba(var(--ok-rgb),0.15)', color: 'var(--ok)', border: '1px solid rgba(var(--ok-rgb),0.3)' }}>LIVE</span>
            }
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>
            {speaking ? 'Marcus is speaking...' : listening ? 'Listening to you...' : 'Quelro · Outreach OS'}
          </p>
        </div>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--text-4)', flexShrink: 0 }}>⌘K</span>

        {/* Voice output toggle */}
        {hasSpeechSupport && (
          <button
            onClick={() => { setVoiceOut(v => !v); if (speaking) stopSpeaking(); }}
            title={voiceOut ? 'Mute voice' : 'Unmute voice'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: voiceOut ? 'var(--lime)' : 'var(--text-4)' }}
          >
            {voiceOut ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        )}

        <button onClick={clearChat} title="Clear chat" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: 4 }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-2)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; }}>
          <Trash2 size={14} />
        </button>
        <button onClick={() => { setOpen(false); stopSpeaking(); }} title="Close (Esc)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: 4 }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; }}>
          <X size={16} />
        </button>
      </div>

      {!minimized && (
        <>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((msg, i) => <Message key={i} msg={msg} />)}

            {/* Listening indicator */}
            {listening && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(var(--ok-rgb),0.06)', border: '1px solid rgba(var(--ok-rgb),0.2)', borderRadius: 12 }}>
                <VoiceWave color="var(--ok)" bars={6} />
                <span style={{ fontSize: 11, color: 'var(--ok)' }}>Listening... speak now</span>
              </div>
            )}

            {/* Speaking indicator */}
            {speaking && !listening && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(var(--lime-rgb),0.06)', border: '1px solid rgba(var(--lime-rgb),0.2)', borderRadius: 12 }}>
                <VoiceWave color="var(--lime)" bars={6} />
                <span style={{ fontSize: 11, color: 'var(--lime)' }}>Marcus is speaking</span>
                <button onClick={stopSpeaking} style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>stop</button>
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'var(--lime)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={12} color="var(--on-accent)" />
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, borderTopLeftRadius: 4, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={12} style={{ color: 'var(--lime)', animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions */}
          {showSuggestions && (
            <div style={{ padding: '0 12px 8px', display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} style={{
                  fontSize: 10, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--text-3)', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(var(--lime-rgb),0.4)'; e.currentTarget.style.color = 'var(--lime)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.color = 'var(--text-3)'; }}
                >{s}</button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{ flexShrink: 0, padding: '8px 12px 12px', borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Mic button */}
              {hasSpeechSupport && (
                <button
                  onClick={toggleMic}
                  disabled={loading}
                  title={listening ? 'Stop listening' : 'Speak to Marcus'}
                  style={{
                    flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: 'none',
                    background: listening ? 'rgba(var(--ok-rgb),0.15)' : 'var(--surface)',
                    cursor: loading ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: listening ? '0 0 0 2px rgba(var(--ok-rgb),0.5)' : '0 0 0 1px var(--line-2)',
                    transition: 'all 0.2s',
                  }}
                >
                  {listening
                    ? <MicOff size={15} color="var(--ok)" />
                    : <Mic size={15} color={loading ? 'var(--text-4)' : 'var(--text-2)'} />
                  }
                </button>
              )}

              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={listening ? 'Listening...' : 'Type or speak a command...'}
                disabled={loading || listening}
                style={{
                  flex: 1, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 10,
                  padding: '8px 12px', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'inherit',
                  borderColor: listening ? 'rgba(var(--ok-rgb),0.4)' : 'var(--line-2)',
                }}
                onFocus={e => { if (!listening) e.target.style.borderColor = 'rgba(var(--lime-rgb),0.5)'; }}
                onBlur={e => { if (!listening) e.target.style.borderColor = 'var(--line-2)'; }}
              />

              <button
                onClick={() => send()}
                disabled={!input.trim() || loading || listening}
                style={{
                  flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: 'none',
                  background: input.trim() && !loading && !listening ? 'var(--lime)' : 'var(--surface-2)',
                  cursor: input.trim() && !loading && !listening ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                }}
              >
                <Send size={14} color={input.trim() && !loading && !listening ? 'var(--on-accent)' : 'var(--text-4)'} />
              </button>
            </div>

            {hasSpeechSupport && (
              <p style={{ fontSize: 9, color: 'var(--text-4)', textAlign: 'center', marginTop: 5, margin: '5px 0 0' }}>
                {voiceOut ? '🔊 Voice on — Marcus will speak replies' : '🔇 Voice muted — tap 🔊 in header to unmute'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
