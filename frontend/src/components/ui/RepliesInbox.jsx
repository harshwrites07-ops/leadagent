import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageSquare, RefreshCw, Mail, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import api, { formatDate } from '../../utils/api';

function ReplyCard({ reply }) {
  const [expanded, setExpanded] = useState(false);
  const initials = (reply.channel_name || '??').slice(0, 2).toUpperCase();
  const hasContent = reply.reply_body && reply.reply_body.trim().length > 0;

  return (
    <div className="card bg-dark-700 border border-dark-500 overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 py-3 px-4 cursor-pointer hover:bg-dark-600 transition-colors"
        onClick={() => hasContent && setExpanded(e => !e)}
      >
        <div className="w-9 h-9 rounded-full bg-dark-600 overflow-hidden flex-shrink-0 flex items-center justify-center text-xs font-bold text-slate-300">
          {reply.thumbnail_url
            ? <img src={reply.thumbnail_url} alt={reply.channel_name} className="w-full h-full object-cover" />
            : <span>{initials}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white truncate">{reply.channel_name || reply.lead_email}</p>
            <span className="badge badge-purple text-xs flex-shrink-0">REPLIED</span>
          </div>
          <p className="text-xs text-slate-400 truncate">
            {reply.reply_subject || reply.subject || 'No subject'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{reply.reply_from || reply.lead_email}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-slate-500">{reply.replied_at ? formatDate(reply.replied_at) : '—'}</span>
          <a
            href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(reply.from_email || '')}&shva=1#search/from%3A${encodeURIComponent(reply.reply_from || reply.lead_email || '')}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md transition-colors flex-shrink-0"
            style={{ background: 'rgba(255,69,0,0.15)', color: '#fb923c', border: '1px solid rgba(255,69,0,0.3)' }}
            title={`Open in Gmail (${reply.from_email})`}
          >
            <ExternalLink size={11} /> Open
          </a>
          {hasContent && (
            expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />
          )}
        </div>
      </div>

      {/* Reply content */}
      <AnimatePresence>
        {expanded && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {/* Their reply */}
              <div className="rounded-lg border border-purple-500/40 overflow-hidden mb-3">
                <div className="bg-purple-500/15 px-4 py-2 flex items-center gap-2">
                  <MessageSquare size={13} className="text-purple-400" />
                  <span className="text-xs text-purple-300 font-bold uppercase tracking-wider">Their Reply</span>
                  {reply.reply_from && <span className="text-xs text-slate-400 ml-auto">{reply.reply_from}</span>}
                </div>
                <div className="bg-dark-600 p-4 max-h-64 overflow-y-auto">
                  <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{reply.reply_body}</p>
                </div>
              </div>
              {/* Original email we sent */}
              <div className="rounded-lg border border-dark-500 overflow-hidden">
                <div className="bg-dark-700 px-4 py-2">
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Your Original Email — </span>
                  <span className="text-xs text-slate-400">{reply.subject}</span>
                </div>
                <div className="bg-dark-800 p-4 max-h-48 overflow-y-auto">
                  <p className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed">{reply.body}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No content fallback */}
      {!hasContent && (
        <div className="px-4 pb-3">
          <p className="text-xs text-slate-500 italic">Reply content not yet fetched — click "Sync Replies" to load it from Gmail.</p>
        </div>
      )}
    </div>
  );
}

export default function RepliesInbox({ onClose }) {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newCount, setNewCount] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/emails/replies');
      setReplies(data.replies || []);
    } catch {
      setReplies([]);
    } finally {
      setLoading(false);
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

  useEffect(() => {
    load();
  }, []);

  const withContent = replies.filter(r => r.reply_body);
  const withoutContent = replies.filter(r => !r.reply_body);

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
          className="w-full max-w-2xl max-h-[85vh] bg-dark-800 border border-dark-600 rounded-xl flex flex-col"
          onClick={e => e.stopPropagation()}
          style={{ boxShadow: '0 0 60px rgba(124,58,237,0.15)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-dark-600">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <MessageSquare size={18} className="text-purple-400" />
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Replies Inbox</h2>
                <p className="text-xs text-slate-400">{replies.length} leads replied to your emails</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={sync}
                disabled={syncing}
                className="btn btn-primary flex items-center gap-2 text-sm"
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Syncing...' : 'Sync Replies'}
              </button>
              <button onClick={onClose} className="btn btn-ghost p-2"><X size={18} /></button>
            </div>
          </div>

          {/* New count banner */}
          {newCount !== null && (
            <div className={`px-6 py-2 text-sm font-medium ${newCount > 0 ? 'bg-green-500/10 text-green-400' : 'bg-dark-700 text-slate-400'}`}>
              {newCount > 0 ? `✓ Found ${newCount} new repl${newCount === 1 ? 'y' : 'ies'}` : '✓ All caught up — no new replies'}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {loading ? (
              <div className="flex items-center justify-center h-48 gap-3">
                <RefreshCw size={24} className="animate-spin text-purple-400" />
                <span className="text-slate-400">Loading replies...</span>
              </div>
            ) : replies.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-4">
                <Mail size={40} className="text-slate-600" />
                <p className="text-slate-400 font-medium">No replies yet</p>
                <p className="text-slate-500 text-sm text-center">Click "Sync Replies" to check your Gmail inboxes for new replies</p>
                <button onClick={sync} disabled={syncing} className="btn btn-primary">
                  <RefreshCw size={14} className={syncing ? 'animate-spin mr-2' : 'mr-2'} /> Check Gmail Now
                </button>
              </div>
            ) : (
              <>
                {withContent.length > 0 && (
                  <>
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold px-1">
                      Replies with content ({withContent.length})
                    </p>
                    {withContent.map(r => <ReplyCard key={r.id} reply={r} />)}
                  </>
                )}
                {withoutContent.length > 0 && (
                  <>
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold px-1 mt-2">
                      Detected but content not yet synced ({withoutContent.length}) — click Sync Replies
                    </p>
                    {withoutContent.map(r => <ReplyCard key={r.id} reply={r} />)}
                  </>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
