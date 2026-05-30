import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageSquare, RefreshCw, Mail, ArrowLeft, Send, Check, ChevronRight } from 'lucide-react';
import api, { formatDate } from '../../utils/api';

// ─── Conversation thread view ─────────────────────────────────────────────────
function ConversationView({ reply, onBack, onReplySent }) {
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [mySentReplies, setMySentReplies] = useState(
    reply.my_reply_body ? [{ body: reply.my_reply_body, sent_at: reply.my_reply_sent_at }] : []
  );
  const textareaRef = useRef(null);
  const bottomRef = useRef(null);

  const reSubject = (reply.reply_subject || reply.subject || '').startsWith('Re:')
    ? (reply.reply_subject || reply.subject)
    : `Re: ${reply.reply_subject || reply.subject || ''}`;

  const sendReply = async () => {
    if (!replyBody.trim()) return;
    setSending(true);
    setSendError('');
    const bodyToSend = replyBody.trim();
    try {
      await api.post('/emails/send-reply', {
        to: reply.reply_from || reply.lead_email,
        from_email: reply.from_email,
        subject: reSubject,
        body: bodyToSend,
        email_id: reply.id,
      });
      const newReply = { body: bodyToSend, sent_at: new Date().toISOString() };
      setMySentReplies(prev => [...prev, newReply]);
      setReplyBody('');
      if (onReplySent) onReplySent(reply.id, newReply);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      setSendError(err?.response?.data?.error || 'Failed to send — check SMTP settings');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendReply();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Conversation header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
        <button onClick={onBack} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-2)' }}>
          <ArrowLeft size={16} />
        </button>
        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-xs font-bold" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
          {reply.thumbnail_url
            ? <img src={reply.thumbnail_url} alt={reply.channel_name} className="w-full h-full object-cover" />
            : <span>{(reply.channel_name || '??').slice(0, 2).toUpperCase()}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{reply.channel_name || reply.lead_email}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{reply.reply_from || reply.lead_email}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>via</p>
          <p className="text-xs font-semibold" style={{ color: '#a78bfa' }}>{reply.from_email}</p>
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Subject */}
        <p className="text-xs uppercase tracking-wider font-semibold text-center" style={{ color: 'var(--text-3)' }}>
          {reply.reply_subject || reply.subject || 'No subject'}
        </p>

        {/* Original email — sent bubble */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
            <span>{reply.from_email}</span>
            <span>·</span>
            <span>{reply.sent_at ? formatDate(reply.sent_at) : '—'}</span>
          </div>
          <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-2)' }}>{reply.body || 'Email body not available'}</p>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-4)' }}>You</span>
        </div>

        {/* Their reply — received bubble */}
        {reply.reply_body ? (
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
              <span>{reply.reply_from || reply.lead_email}</span>
              <span>·</span>
              <span>{reply.replied_at ? formatDate(reply.replied_at) : '—'}</span>
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm border px-4 py-3"
              style={{ background: 'rgba(var(--lime-rgb),0.1)', borderColor: 'rgba(var(--lime-rgb),0.25)' }}>
              <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text)' }}>{reply.reply_body}</p>
            </div>
            <span className="text-xs" style={{ color: 'var(--text-4)' }}>{reply.channel_name || 'Them'}</span>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-xs italic" style={{ color: 'var(--text-3)' }}>Reply content not synced yet — click Sync Replies</p>
          </div>
        )}

        {/* My sent replies */}
        {mySentReplies.map((r, i) => (
          <div key={i} className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
              <span>{reply.from_email}</span>
              <span>·</span>
              <span>{r.sent_at ? formatDate(r.sent_at) : 'Just now'}</span>
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
              <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-2)' }}>{r.body}</p>
            </div>
            <div className="flex items-center gap-1 text-xs text-green-400">
              <Check size={11} /> Sent
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Compose area */}
      <div className="flex-shrink-0" style={{ borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
        {sendError && (
          <div className="px-4 pt-2 text-xs text-red-400">{sendError}</div>
        )}
        <div className="flex items-end gap-3 p-3">
          <textarea
            ref={textareaRef}
            className="flex-1 rounded-xl text-sm px-4 py-3 resize-none outline-none transition-colors"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--text)' }}
            rows={3}
            placeholder={`Reply to ${reply.channel_name || 'them'}… (Ctrl+Enter to send)`}
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={sendReply}
            disabled={sending || !replyBody.trim()}
            className="flex-shrink-0 p-3 rounded-xl transition-colors disabled:opacity-40"
            style={{ background: replyBody.trim() ? 'var(--lime)' : 'rgba(var(--lime-rgb),0.2)', color: 'var(--bg)' }}
            title="Send reply (Ctrl+Enter)"
          >
            <Send size={18} className={sending ? 'animate-pulse' : ''} />
          </button>
        </div>
        <p className="text-xs pb-2 px-4" style={{ color: 'var(--text-4)' }}>Sending from {reply.from_email}</p>
      </div>
    </div>
  );
}

// ─── Reply list item ───────────────────────────────────────────────────────────
function ReplyRow({ reply, onOpen }) {
  const initials = (reply.channel_name || '??').slice(0, 2).toUpperCase();
  const hasContent = reply.reply_body && reply.reply_body.trim().length > 0;
  const preview = hasContent
    ? reply.reply_body.trim().slice(0, 80) + (reply.reply_body.length > 80 ? '…' : '')
    : 'Click Sync Replies to load reply content';

  return (
    <div
      className="flex items-center gap-3 py-3 px-4 rounded-xl cursor-pointer transition-colors border"
      style={{ borderColor: 'transparent' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.borderColor = 'var(--line)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = 'transparent'; }}
      onClick={() => onOpen(reply)}
    >
      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-xs font-bold" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
        {reply.thumbnail_url
          ? <img src={reply.thumbnail_url} alt={reply.channel_name} className="w-full h-full object-cover" />
          : <span>{initials}</span>
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{reply.channel_name || reply.lead_email}</p>
          <span className="badge badge-purple text-xs flex-shrink-0">REPLIED</span>
        </div>
        <p className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{reply.reply_subject || reply.subject || 'No subject'}</p>
        <p className={`text-xs truncate mt-0.5${!hasContent ? ' italic' : ''}`} style={{ color: hasContent ? 'var(--text-3)' : 'var(--text-4)' }}>{preview}</p>
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>{reply.replied_at ? formatDate(reply.replied_at) : '—'}</span>
        <div className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg"
          style={{ background: 'rgba(var(--lime-rgb),0.12)', color: 'var(--lime)', border: '1px solid rgba(var(--lime-rgb),0.3)' }}>
          Open <ChevronRight size={11} />
        </div>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export default function RepliesInbox({ onClose }) {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newCount, setNewCount] = useState(null);
  const [activeReply, setActiveReply] = useState(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/emails/replies');
      const fresh = data.replies || [];
      setReplies(fresh);
      // Keep activeReply in sync if it's open
      setActiveReply(prev => {
        if (!prev) return prev;
        const updated = fresh.find(r => r.id === prev.id);
        return updated || prev;
      });
    } catch {
      setReplies([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/emails/replies/fetch');
      setReplies(data.replies || []);
      setNewCount(data.newReplies || 0);
    } catch {
    } finally {
      setSyncing(false);
    }
  };

  // Auto-poll every 30s for new replies
  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="w-full max-w-2xl rounded-xl flex flex-col overflow-hidden"
          style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', height: '82vh', boxShadow: '0 0 60px rgba(200,246,84,0.08)' }}
          onClick={e => e.stopPropagation()}
        >
          <AnimatePresence mode="wait">
            {activeReply ? (
              /* ── Conversation view ── */
              <motion.div
                key="conversation"
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 40, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col h-full"
              >
                <ConversationView
                  reply={activeReply}
                  onBack={() => setActiveReply(null)}
                  onReplySent={(emailId, newReply) => {
                    setReplies(prev => prev.map(r =>
                      r.id === emailId ? { ...r, my_reply_body: newReply.body, my_reply_sent_at: newReply.sent_at } : r
                    ));
                  }}
                />
              </motion.div>
            ) : (
              /* ── List view ── */
              <motion.div
                key="list"
                initial={{ x: -40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -40, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col h-full"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <MessageSquare size={18} className="text-purple-400" />
                    </div>
                    <div>
                      <h2 className="font-bold text-lg" style={{ color: 'var(--text)' }}>Replies Inbox</h2>
                      <p className="text-xs" style={{ color: 'var(--text-2)' }}>{replies.length} leads replied — click to open & reply</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={sync} disabled={syncing} className="btn btn-primary flex items-center gap-2 text-sm">
                      <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                      {syncing ? 'Syncing...' : 'Sync Replies'}
                    </button>
                    <button onClick={onClose} className="btn btn-ghost p-2"><X size={18} /></button>
                  </div>
                </div>

                {/* New count banner */}
                {newCount !== null && (
                  <div className="px-6 py-2 text-sm font-medium flex-shrink-0" style={newCount > 0 ? { background: 'rgba(var(--ok-rgb),0.1)', color: 'var(--ok)' } : { background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                    {newCount > 0 ? `✓ Found ${newCount} new repl${newCount === 1 ? 'y' : 'ies'}` : '✓ All caught up — no new replies'}
                  </div>
                )}

                {/* List */}
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
                  {loading ? (
                    <div className="flex items-center justify-center h-48 gap-3">
                      <RefreshCw size={24} className="animate-spin text-purple-400" />
                      <span style={{ color: 'var(--text-2)' }}>Loading replies...</span>
                    </div>
                  ) : replies.length === 0 ? (
                    <div className="flex flex-col items-center py-16 gap-4">
                      <Mail size={40} style={{ color: 'var(--text-4)' }} />
                      <p className="font-medium" style={{ color: 'var(--text-2)' }}>No replies yet</p>
                      <p className="text-sm text-center" style={{ color: 'var(--text-3)' }}>Click "Sync Replies" to check your Gmail inboxes</p>
                      <button onClick={sync} disabled={syncing} className="btn btn-primary">
                        <RefreshCw size={14} className={syncing ? 'animate-spin mr-2' : 'mr-2'} /> Check Gmail Now
                      </button>
                    </div>
                  ) : (
                    replies.map(r => <ReplyRow key={r.id} reply={r} onOpen={setActiveReply} />)
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
