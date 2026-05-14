import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Bot, User, Loader2, Trash2, Minus, GripHorizontal, Mic, MicOff, Volume2, VolumeX, Radio } from 'lucide-react';
import api from '../../utils/api';

const WELCOME = `Captain Levi online. Outreach OS is live.\n\nTry **"find 50 leads"**, **"daily briefing"**, or just speak — I execute without questions.`;

const SUGGESTIONS = [
  'Daily briefing',
  'Find 50 fitness leads',
  'Find and pitch 10 gaming channels',
  'Show my hot leads',
  'Clean dead leads',
  'Turn on automation',
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
      return <p key={i} style={{ fontWeight: 700, color: '#fff', margin: '6px 0 2px', fontSize: 12 }}>{line.slice(3)}</p>;
    }
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} style={{ marginBottom: 2, lineHeight: 1.5 }}>
        {parts.map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j} style={{ color: '#fff', fontWeight: 600 }}>{part.slice(2, -2)}</strong>
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
        background: isUser ? '#1a1a1a' : 'linear-gradient(135deg, #FF4500, #FF8C00)',
        border: isUser ? '1px solid #2a2a2a' : 'none',
      }}>
        {isUser ? <User size={12} color="#aaa" /> : <Bot size={12} color="#fff" />}
      </div>
      <div style={{
        maxWidth: '82%', borderRadius: 14, padding: '8px 12px', fontSize: 12,
        background: isUser ? '#FF4500' : '#141414',
        color: isUser ? '#fff' : '#ccc',
        borderTopRightRadius: isUser ? 4 : 14,
        borderTopLeftRadius: isUser ? 14 : 4,
        lineHeight: 1.5,
        border: isUser ? 'none' : '1px solid #1e1e1e',
      }}>
        {renderText(msg.content)}
      </div>
    </div>
  );
}

// Animated sound wave for listening / speaking
function VoiceWave({ color = '#FF4500', bars = 5 }) {
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
  const [messages, setMessages] = useState([{ role: 'assistant', content: WELCOME }]);
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
      console.warn('[Levi Voice] Recognition error:', e.error);
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
    const updated = [...messages, { role: 'user', content: text }];
    setMessages(updated);
    setLoading(true);
    try {
      const apiMessages = updated.filter((m, idx) => !(idx === 0 && m.role === 'assistant'));
      const { data } = await api.post('/assistant/chat', { messages: apiMessages });
      const reply = data.reply || 'Done.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      speak(reply);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Something went wrong';
      const errText = `Error: ${msg}`;
      setMessages(prev => [...prev, { role: 'assistant', content: errText }]);
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
    setMessages([{ role: 'assistant', content: WELCOME }]);
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
        console.warn('[Levi Voice] Could not start recognition:', e.message);
      }
    }
  };

  const showSuggestions = messages.length === 1 && !minimized;

  const posStyle = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' }
    : { position: 'fixed', bottom: 24, right: 24 };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Open Captain Levi — Outreach OS"
        style={{
          ...posStyle, width: 56, height: 56, borderRadius: '50%', zIndex: 9999,
          background: 'linear-gradient(135deg, #FF4500, #FF8C00)',
          boxShadow: '0 8px 32px rgba(255,69,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', cursor: 'pointer', transition: 'transform 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <Bot size={22} color="#fff" />
        <span style={{
          position: 'absolute', top: -2, right: -2, width: 14, height: 14,
          borderRadius: '50%', background: '#00E5A0', border: '2px solid #080808',
        }} />
      </button>
    );
  }

  return (
    <div
      ref={windowRef}
      style={{
        ...posStyle, zIndex: 9999, width: 390,
        display: 'flex', flexDirection: 'column',
        background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: 18,
        boxShadow: '0 24px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,69,0,0.08)',
        overflow: 'hidden',
        height: minimized ? 'auto' : 560,
        transition: 'height 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
          flexShrink: 0, borderBottom: minimized ? 'none' : '1px solid #1a1a1a',
          background: 'linear-gradient(135deg, rgba(255,69,0,0.12), rgba(255,140,0,0.06))',
          cursor: 'grab', userSelect: 'none',
        }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #FF4500, #FF8C00)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: speaking ? '0 0 12px rgba(255,69,0,0.7)' : 'none',
          transition: 'box-shadow 0.3s',
        }}>
          {speaking ? <Radio size={16} color="#fff" /> : <Bot size={17} color="#fff" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: 0 }}>Captain Levi</p>
            {speaking
              ? <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, fontWeight: 700, background: 'rgba(255,69,0,0.2)', color: '#FF4500', border: '1px solid rgba(255,69,0,0.4)' }}>SPEAKING</span>
              : listening
              ? <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, fontWeight: 700, background: 'rgba(0,229,160,0.15)', color: '#00E5A0', border: '1px solid rgba(0,229,160,0.3)' }}>LISTENING</span>
              : <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, fontWeight: 700, background: 'rgba(0,229,160,0.15)', color: '#00E5A0', border: '1px solid rgba(0,229,160,0.3)' }}>LIVE</span>
            }
          </div>
          <p style={{ fontSize: 10, color: '#555', margin: 0 }}>
            {speaking ? 'Captain Levi is speaking...' : listening ? 'Listening to you...' : 'ContentCrafterzz · Outreach OS'}
          </p>
        </div>
        <GripHorizontal size={14} color="#333" style={{ flexShrink: 0 }} />

        {/* Voice output toggle */}
        {hasSpeechSupport && (
          <button
            onClick={() => { setVoiceOut(v => !v); if (speaking) stopSpeaking(); }}
            title={voiceOut ? 'Mute voice' : 'Unmute voice'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: voiceOut ? '#FF4500' : '#444' }}
          >
            {voiceOut ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        )}

        <button onClick={clearChat} title="Clear chat" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: 4 }}
          onMouseEnter={e => e.currentTarget.style.color = '#888'} onMouseLeave={e => e.currentTarget.style.color = '#444'}>
          <Trash2 size={14} />
        </button>
        <button onClick={() => setMinimized(m => !m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: 4 }}
          onMouseEnter={e => e.currentTarget.style.color = '#888'} onMouseLeave={e => e.currentTarget.style.color = '#444'}>
          <Minus size={14} />
        </button>
        <button onClick={() => { setOpen(false); stopSpeaking(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: 4 }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = '#444'}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)', borderRadius: 12 }}>
                <VoiceWave color="#00E5A0" bars={6} />
                <span style={{ fontSize: 11, color: '#00E5A0' }}>Listening... speak now</span>
              </div>
            )}

            {/* Speaking indicator */}
            {speaking && !listening && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,69,0,0.06)', border: '1px solid rgba(255,69,0,0.2)', borderRadius: 12 }}>
                <VoiceWave color="#FF4500" bars={6} />
                <span style={{ fontSize: 11, color: '#FF4500' }}>Captain Levi is speaking</span>
                <button onClick={stopSpeaking} style={{ marginLeft: 'auto', fontSize: 10, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>stop</button>
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #FF4500, #FF8C00)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={12} color="#fff" />
                </div>
                <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 14, borderTopLeftRadius: 4, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={12} color="#FF4500" style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 11, color: '#555' }}>Thinking...</span>
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
                  background: 'transparent', border: '1px solid #222', color: '#555', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,69,0,0.4)'; e.currentTarget.style.color = '#FF4500'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#222'; e.currentTarget.style.color = '#555'; }}
                >{s}</button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{ flexShrink: 0, padding: '8px 12px 12px', borderTop: '1px solid #1a1a1a' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Mic button */}
              {hasSpeechSupport && (
                <button
                  onClick={toggleMic}
                  disabled={loading}
                  title={listening ? 'Stop listening' : 'Speak to Captain Levi'}
                  style={{
                    flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: 'none',
                    background: listening ? 'rgba(0,229,160,0.15)' : '#111',
                    cursor: loading ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: listening ? '0 0 0 2px rgba(0,229,160,0.5)' : '0 0 0 1px #222',
                    transition: 'all 0.2s',
                  }}
                >
                  {listening
                    ? <MicOff size={15} color="#00E5A0" />
                    : <Mic size={15} color={loading ? '#333' : '#888'} />
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
                  flex: 1, background: '#111', border: '1px solid #222', borderRadius: 10,
                  padding: '8px 12px', color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit',
                  borderColor: listening ? 'rgba(0,229,160,0.4)' : '#222',
                }}
                onFocus={e => { if (!listening) e.target.style.borderColor = 'rgba(255,69,0,0.5)'; }}
                onBlur={e => { if (!listening) e.target.style.borderColor = '#222'; }}
              />

              <button
                onClick={() => send()}
                disabled={!input.trim() || loading || listening}
                style={{
                  flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: 'none',
                  background: input.trim() && !loading && !listening ? 'linear-gradient(135deg, #FF4500, #FF8C00)' : '#1a1a1a',
                  cursor: input.trim() && !loading && !listening ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                }}
              >
                <Send size={14} color={input.trim() && !loading && !listening ? '#fff' : '#333'} />
              </button>
            </div>

            {hasSpeechSupport && (
              <p style={{ fontSize: 9, color: '#333', textAlign: 'center', marginTop: 5, margin: '5px 0 0' }}>
                {voiceOut ? '🔊 Voice on — Captain Levi will speak replies' : '🔇 Voice muted — tap 🔊 in header to unmute'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
