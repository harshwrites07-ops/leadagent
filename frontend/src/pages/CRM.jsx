import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Search, Wand2, Mail, StickyNote, X, ChevronDown,
  Copy, Check, Clock, Users, Activity, Plus,
  Trash2, ArrowRight, RefreshCw, Zap,
  ExternalLink, CheckSquare, Square, AlignLeft,
} from 'lucide-react';
import PowerSendOverlay from '../components/ui/PowerSendOverlay';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api, { formatNumber, formatDate, tempLabel, tempClass, stageLabel } from '../utils/api';

const STAGES = [
  { key: 'new_lead',     label: 'New Lead',    color: '#6B7280' },
  { key: 'studying',     label: 'Studying',    color: '#00B8D4' },
  { key: 'pitch_ready',  label: 'Pitch Ready', color: '#7B61FF' },
  { key: 'emailed',      label: 'Emailed',     color: '#FF4500' },
  { key: 'opened',       label: 'Opened',      color: '#F5A623' },
  { key: 'replied',      label: 'Replied',     color: '#00E5A0' },
  { key: 'call_booked',  label: 'Call Booked', color: '#00C896' },
  { key: 'closed_won',   label: 'Closed Won',  color: '#00E5A0' },
  { key: 'closed_lost',  label: 'Closed Lost', color: '#FF4444' },
];

const TEMP_FILTERS  = [{ key: 'all', label: 'ALL' }, { key: 'hot', label: 'Hot' }, { key: 'warm', label: 'Warm' }, { key: 'cold', label: 'Cold' }];
const PLAT_FILTERS  = [{ key: 'all', label: 'ALL' }, { key: 'youtube', label: 'YouTube' }, { key: 'reddit', label: 'Reddit' }];
const DETAIL_TABS   = ['Pitch', 'Emails', 'Notes', 'Timeline'];

const inputSt = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
  borderRadius: 6, padding: '8px 12px', color: 'var(--text-primary)',
  fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', width: '100%', boxSizing: 'border-box',
};

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error('Copy failed'); }
  };
  return (
    <button onClick={handle} style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
      background: copied ? 'rgba(0,229,160,0.12)' : 'var(--bg-elevated)',
      color: copied ? '#00E5A0' : 'var(--text-muted)',
      border: `1px solid ${copied ? 'rgba(0,229,160,0.3)' : 'var(--border-subtle)'}`,
    }}>
      {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
    </button>
  );
};

const initials = (name = '') => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '??';
const daysInStage = movedAt => {
  if (!movedAt) return null;
  const diff = Math.floor((Date.now() - new Date(movedAt).getTime()) / 86400000);
  return diff === 0 ? 'today' : `${diff}d`;
};

const TempBadge = ({ temp }) => {
  const colors = { hot: ['rgba(255,69,0,0.12)', '#FF4500', 'rgba(255,69,0,0.3)'], warm: ['rgba(245,166,35,0.12)', '#F5A623', 'rgba(245,166,35,0.3)'], cold: ['rgba(0,184,212,0.12)', '#00B8D4', 'rgba(0,184,212,0.3)'] };
  const [bg, color, border] = colors[temp] || colors.cold;
  return <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: bg, color, border: `1px solid ${border}`, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em' }}>{(temp || 'cold').toUpperCase()}</span>;
};

// ─── Lead Card ────────────────────────────────────────────────────────────────
const LeadCard = ({ lead, onClick, onPitch, onEmail, onNote, selected, onToggleSelect }) => (
  <div style={{
    background: selected ? 'rgba(255,69,0,0.06)' : 'var(--bg-card)',
    border: `1px solid ${selected ? 'rgba(255,69,0,0.3)' : 'var(--border-subtle)'}`,
    borderRadius: 8, padding: 12, cursor: 'pointer',
    transition: 'all 0.15s',
  }}
    onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
    onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-card)'; }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
      <button onClick={e => { e.stopPropagation(); onToggleSelect(lead.id); }} style={{ marginTop: 2, background: 'none', border: 'none', cursor: 'pointer', color: selected ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0 }}>
        {selected ? <CheckSquare size={13} /> : <Square size={13} />}
      </button>
      <div onClick={() => onClick(lead)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-elevated)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
        {lead.thumbnail_url ? <img src={lead.thumbnail_url} alt={lead.channel_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>{initials(lead.channel_name)}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }} onClick={() => onClick(lead)}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.channel_name}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em', background: lead.platform === 'youtube' ? 'rgba(0,184,212,0.12)' : 'rgba(123,97,255,0.12)', color: lead.platform === 'youtube' ? '#00B8D4' : '#7B61FF', border: `1px solid ${lead.platform === 'youtube' ? 'rgba(0,184,212,0.3)' : 'rgba(123,97,255,0.3)'}` }}>
            {lead.platform === 'youtube' ? 'YT' : 'RD'}
          </span>
          {lead.temperature && <TempBadge temp={lead.temperature} />}
        </div>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, paddingLeft: 21 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Users size={10} /> {formatNumber(lead.subscriber_count || 0)}</span>
      {lead.email_count > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Mail size={10} /> {lead.email_count}</span>}
      {daysInStage(lead.updated_at) && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={10} /> {daysInStage(lead.updated_at)}</span>}
    </div>
    <div style={{ display: 'flex', gap: 4, paddingLeft: 21 }}>
      {[
        { icon: Wand2, label: 'Pitch', fn: onPitch },
        { icon: Mail,  label: 'Email', fn: onEmail },
        { icon: StickyNote, label: 'Note', fn: onNote },
      ].map(({ icon: Icon, label, fn }) => (
        <button key={label} onClick={e => { e.stopPropagation(); fn(lead); }} style={{
          display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px',
          borderRadius: 5, fontSize: 10, cursor: 'pointer',
          background: 'transparent', border: '1px solid var(--border-subtle)',
          color: 'var(--text-muted)', fontFamily: 'var(--font-body)',
          transition: 'all 0.1s',
        }}>
          <Icon size={10} /> {label}
        </button>
      ))}
    </div>
  </div>
);

// ─── Kanban Column ────────────────────────────────────────────────────────────
const KanbanColumn = ({ stage, leads, onCardClick, onPitch, onEmail, onNote, selectedIds, onToggleSelect, onSelectAllInColumn }) => {
  const allSelected = leads.length > 0 && leads.every(l => selectedIds.has(l.id));
  return (
  <div style={{
    display: 'flex', flexDirection: 'column', borderRadius: 8, minWidth: 248, maxWidth: 264, minHeight: 200,
    background: 'var(--bg-surface)', border: `1px solid var(--border-subtle)`,
    borderTop: `2px solid ${stage.color}`,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={() => onSelectAllInColumn(stage.key, leads)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: allSelected ? 'var(--accent-primary)' : 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center' }}>
          {allSelected ? <CheckSquare size={11} /> : <Square size={11} />}
        </button>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: stage.color, boxShadow: `0 0 6px ${stage.color}` }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>{stage.label}</span>
      </div>
      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: `${stage.color}18`, color: stage.color, border: `1px solid ${stage.color}30`, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
        {leads.length}
      </span>
    </div>
    <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 8px 8px', overflowY: 'auto', flex: 1, maxHeight: 'calc(100vh - 240px)' }}>
        {leads.map(lead => (
          <LeadCard key={lead.id} lead={lead} onClick={onCardClick} onPitch={onPitch} onEmail={onEmail} onNote={onNote}
            selected={selectedIds.has(lead.id)} onToggleSelect={onToggleSelect} />
        ))}
        {leads.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0', gap: 6, color: 'var(--text-muted)' }}>
            <AlignLeft size={16} />
            <p style={{ fontSize: 11 }}>Drop leads here</p>
          </div>
        )}
      </div>
    </SortableContext>
  </div>
);
};

// ─── Lead Detail Panel ────────────────────────────────────────────────────────
const LeadDetailPanel = ({ lead, onClose, onRefresh }) => {
  const [activeTab, setActiveTab] = useState('Pitch');
  const [pitch, setPitch] = useState(null);
  const [emails, setEmails] = useState([]);
  const [notes, setNotes] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [stage, setStage] = useState(lead?.crm_stage || 'new_lead');
  const [addingQueue, setAddingQueue] = useState(false);
  const [generatingPitch, setGeneratingPitch] = useState(false);

  useEffect(() => {
    if (!lead) return;
    setStage(lead.crm_stage || 'new_lead');
    setPitch(null); setEmails([]); setNotes([]); setTimeline([]);
    const load = async () => {
      setLoading(true);
      try {
        const [histRes, pitchRes] = await Promise.allSettled([
          api.get(`/crm/${lead.id}/history`),
          api.get(`/pitches/by-lead/${lead.id}`),
        ]);
        if (histRes.status === 'fulfilled') { const d = histRes.value.data; setEmails(d.emails || []); setNotes(d.notes || []); setTimeline(d.timeline || d.activities || []); }
        if (pitchRes.status === 'fulfilled') setPitch(pitchRes.value.data.pitch);
      } finally { setLoading(false); }
    };
    load();
  }, [lead?.id]);

  if (!lead) return null;

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      await api.post(`/crm/${lead.id}/note`, { note: newNote.trim() });
      setNotes(prev => [{ id: Date.now(), content: newNote.trim(), created_at: new Date().toISOString() }, ...prev]);
      setNewNote('');
      toast.success('Note saved');
    } catch (err) { toast.error(err.message || 'Failed to save note'); }
    finally { setSavingNote(false); }
  };

  const handleMoveStage = async newStage => {
    try {
      await api.put(`/crm/${lead.id}/stage`, { stage: newStage });
      setStage(newStage);
      toast.success(`Moved to ${stageLabel(newStage)}`);
      onRefresh();
    } catch (err) { toast.error(err.message || 'Failed to move stage'); }
  };

  const handleAddToQueue = async () => {
    setAddingQueue(true);
    try { await api.post('/emails/queue', { lead_id: lead.id }); toast.success('Added to email queue'); }
    catch (err) { toast.error(err.message || 'Failed'); }
    finally { setAddingQueue(false); }
  };

  const handleGeneratePitch = async () => {
    setGeneratingPitch(true);
    try {
      const { data } = await api.post(`/pitches/generate/${lead.id}`);
      setPitch(data.pitch); toast.success('Pitch generated!'); onRefresh();
    } catch (err) { toast.error(err.message || 'Failed'); }
    finally { setGeneratingPitch(false); }
  };

  const panelInputSt = { ...inputSt, fontSize: 12 };

  return (
    <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 26, stiffness: 300 }}
      style={{ position: 'fixed', right: 0, top: 0, height: '100vh', width: 460, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', zIndex: 40, boxShadow: '-8px 0 32px rgba(0,0,0,0.5)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-elevated)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
          {lead.thumbnail_url ? <img src={lead.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>{initials(lead.channel_name)}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-primary)', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{lead.channel_name}</h2>
            {lead.platform === 'youtube' && (lead.channel_handle || lead.channel_id) && (
              <a href={lead.channel_handle ? `https://youtube.com/${lead.channel_handle}` : `https://youtube.com/channel/${lead.channel_id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                <ExternalLink size={13} />
              </a>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <TempBadge temp={lead.temperature} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatNumber(lead.subscriber_count || 0)} subs</span>
            {lead.email && <span style={{ fontSize: 11, color: '#00E5A0', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{lead.email}</span>}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={16} /></button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        {DETAIL_TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === t ? 'var(--accent-primary)' : 'transparent'}`,
            color: activeTab === t ? 'var(--accent-primary)' : 'var(--text-muted)',
            marginBottom: -1, transition: 'all 0.15s',
          }}>{t}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 6, background: 'var(--bg-elevated)' }} />)}
          </div>
        ) : (
          <>
            {activeTab === 'Pitch' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {pitch ? (
                  <>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Cold Email</p>
                        <CopyButton text={`Subject: ${pitch.email_subject}\n\n${pitch.cold_email}`} />
                      </div>
                      {pitch.email_subject && <p style={{ fontSize: 11, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>Subject: {pitch.email_subject}</p>}
                      <pre style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '10px 12px', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', lineHeight: 1.7, border: '1px solid var(--border-subtle)' }}>{pitch.cold_email}</pre>
                    </div>
                    {pitch.reddit_dm && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Reddit DM</p>
                          <CopyButton text={pitch.reddit_dm} />
                        </div>
                        <pre style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '10px 12px', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', lineHeight: 1.7, border: '1px solid var(--border-subtle)' }}>{pitch.reddit_dm}</pre>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: 12 }}>
                    <Wand2 size={26} style={{ color: 'var(--text-muted)' }} />
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No pitch generated yet</p>
                    <button onClick={handleGeneratePitch} disabled={generatingPitch} style={{ padding: '8px 20px', borderRadius: 6, cursor: 'pointer', background: 'var(--gradient-orange)', color: '#fff', border: 'none', fontSize: 13 }}>
                      {generatingPitch ? 'Generating...' : 'Generate Pitch'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'Emails' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {emails.length === 0
                  ? <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>No emails sent yet</p>
                  : emails.map(email => (
                    <div key={email.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '10px 12px' }}>
                      <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.subject}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        <span>{formatDate(email.sent_at)}</span>
                        {email.opened_at && <span style={{ color: '#00E5A0' }}>Opened</span>}
                        {email.replied_at && <span style={{ color: '#7B61FF' }}>Replied</span>}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            {activeTab === 'Notes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..."
                    style={{ ...panelInputSt, height: 80, resize: 'none', fontFamily: 'var(--font-body)', lineHeight: 1.6 }} />
                  <button onClick={handleAddNote} disabled={savingNote || !newNote.trim()}
                    style={{ marginTop: 8, width: '100%', padding: '8px', borderRadius: 6, cursor: 'pointer', background: 'var(--gradient-orange)', color: '#fff', border: 'none', fontSize: 12, opacity: (savingNote || !newNote.trim()) ? 0.6 : 1 }}>
                    {savingNote ? 'Saving...' : 'Save Note'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {notes.map(note => (
                    <div key={note.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '10px 12px' }}>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{note.content}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{formatDate(note.created_at)}</p>
                    </div>
                  ))}
                  {notes.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>No notes yet</p>}
                </div>
              </div>
            )}

            {activeTab === 'Timeline' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {timeline.length === 0
                  ? <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>No activity yet</p>
                  : timeline.map((event, i) => (
                    <div key={event.id || i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)', marginTop: 6, flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{event.description || event.type}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{formatDate(event.created_at)}</p>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </>
        )}
      </div>

      {/* Quick actions */}
      <div style={{ flexShrink: 0, padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleGeneratePitch} disabled={generatingPitch} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)',
          }}>
            <Wand2 size={13} /> {generatingPitch ? 'Generating...' : 'Gen Pitch'}
          </button>
          <button onClick={handleAddToQueue} disabled={addingQueue} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            background: 'var(--gradient-orange)', color: '#fff', border: 'none',
          }}>
            <Mail size={13} /> {addingQueue ? 'Adding...' : 'Add to Queue'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Move to:</span>
          <select value={stage} onChange={e => handleMoveStage(e.target.value)} style={{ ...inputSt, fontSize: 12, padding: '6px 10px', flex: 1 }}>
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────
const BulkActionBar = ({ count, onMoveStage, onGenPitches, onAddQueue, onGenAndSend, onDelete, onClear, genSending }) => {
  const [showStageMenu, setShowStageMenu] = useState(false);
  return (
    <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
      style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', flexWrap: 'wrap', maxWidth: 780 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{count} selected</span>
      <div style={{ width: 1, height: 20, background: 'var(--border-default)' }} />
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowStageMenu(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 12 }}>
          <ArrowRight size={13} /> Move Stage <ChevronDown size={11} />
        </button>
        {showStageMenu && (
          <div style={{ position: 'absolute', bottom: '100%', marginBottom: 6, left: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '4px 0', minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.7)', zIndex: 10 }}>
            {STAGES.map(s => (
              <button key={s.key} onClick={() => { onMoveStage(s.key); setShowStageMenu(false); }} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />{s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {[
        { icon: Wand2, label: 'Gen Pitches', fn: onGenPitches },
        { icon: Mail,  label: 'Add to Queue', fn: onAddQueue },
      ].map(({ icon: Icon, label, fn }) => (
        <button key={label} onClick={fn} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 12 }}>
          <Icon size={13} /> {label}
        </button>
      ))}
      <button onClick={onGenAndSend} disabled={genSending} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 6, cursor: genSending ? 'not-allowed' : 'pointer', background: 'var(--gradient-orange)', color: '#fff', border: 'none', fontSize: 12, opacity: genSending ? 0.7 : 1, whiteSpace: 'nowrap' }}>
        {genSending ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Working...</> : <><Zap size={13} /> Generate & Send All</>}
      </button>
      <button onClick={onDelete} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.3)', color: '#FF4444', fontSize: 12 }}>
        <Trash2 size={13} /> Delete
      </button>
      <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={15} /></button>
    </motion.div>
  );
};

// ─── Main CRM ─────────────────────────────────────────────────────────────────
export default function CRM() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tempFilter, setTempFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [selectedPanel, setSelectedPanel] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeId, setActiveId] = useState(null);
  const [genSending, setGenSending] = useState(false);
  const [showPowerOverlay, setShowPowerOverlay] = useState(false);
  const [powerLeadIds, setPowerLeadIds] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm', { params: { search: search || undefined, temperature: tempFilter !== 'all' ? tempFilter : undefined, platform: platformFilter !== 'all' ? platformFilter : undefined } });
      setLeads(data.leads || []);
    } catch (err) { toast.error(err.message || 'Failed to load CRM leads'); }
    finally { setLoading(false); }
  }, [search, tempFilter, platformFilter]);

  useEffect(() => { const t = setTimeout(fetchLeads, search ? 350 : 0); return () => clearTimeout(t); }, [fetchLeads, search]);

  const grouped = STAGES.reduce((acc, s) => { acc[s.key] = leads.filter(l => (l.crm_stage || 'new_lead') === s.key); return acc; }, {});

  const handleDragStart = ({ active }) => setActiveId(active.id);
  const handleDragEnd = async ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const targetStage = STAGES.find(s => grouped[s.key].some(l => l.id === over.id) || s.key === over.id);
    if (!targetStage) return;
    const lead = leads.find(l => l.id === active.id);
    if (!lead || lead.crm_stage === targetStage.key) return;
    setLeads(prev => prev.map(l => l.id === active.id ? { ...l, crm_stage: targetStage.key } : l));
    try { await api.put(`/crm/${active.id}/stage`, { stage: targetStage.key }); toast.success(`Moved to ${targetStage.label}`); }
    catch (err) { toast.error(err.message || 'Failed'); fetchLeads(); }
  };

  const toggleSelect = id => setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const clearSelection = () => setSelectedIds(new Set());
  const selectAll = () => setSelectedIds(new Set(leads.map(l => l.id)));
  const selectAllInColumn = (stageKey, columnLeads) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = columnLeads.length > 0 && columnLeads.every(l => prev.has(l.id));
      if (allSelected) { columnLeads.forEach(l => next.delete(l.id)); }
      else { columnLeads.forEach(l => next.add(l.id)); }
      return next;
    });
  };

  const openPowerSend = () => {
    const ids = selectedIds.size > 0 ? [...selectedIds] : null;
    setPowerLeadIds(ids);
    setShowPowerOverlay(true);
  };

  const bulkMoveStage = async stage => {
    const ids = [...selectedIds];
    try { await Promise.all(ids.map(id => api.put(`/crm/${id}/stage`, { stage }))); setLeads(prev => prev.map(l => selectedIds.has(l.id) ? { ...l, crm_stage: stage } : l)); toast.success(`Moved ${ids.length} leads`); clearSelection(); }
    catch (err) { toast.error(err.message || 'Bulk move failed'); }
  };
  const bulkGenPitches = async () => { const ids = [...selectedIds]; try { await api.post('/pitches/bulk-generate', { lead_ids: ids }); toast.success(`Generating pitches for ${ids.length} leads`); clearSelection(); } catch (err) { toast.error(err.message || 'Failed'); } };
  const bulkAddQueue = async () => { const ids = [...selectedIds]; try { await api.post('/emails/queue/bulk', { lead_ids: ids }); toast.success(`Added ${ids.length} leads to queue`); clearSelection(); } catch (err) { toast.error(err.message || 'Failed'); } };
  const bulkGenerateAndSend = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Study, generate pitch, and send emails to ${ids.length} leads in one shot?`)) return;
    setGenSending(true);
    try {
      toast.loading(`Studying leads & generating emails...`, { id: 'gen-send' });
      const { data } = await api.post('/pitches/generate-and-send', { lead_ids: ids });
      const sent = data.sent || 0;
      const failed = (data.total || 0) - sent;
      toast.success(`Done! ${sent} emails sent${failed > 0 ? `, ${failed} failed` : ''}.`, { id: 'gen-send' });
      clearSelection(); fetchLeads();
    } catch (err) { toast.error(err.response?.data?.error || err.message || 'Failed', { id: 'gen-send' }); }
    finally { setGenSending(false); }
  };
  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} leads? Cannot be undone.`)) return;
    const ids = [...selectedIds];
    try { await api.delete('/crm/bulk', { data: { lead_ids: ids } }); setLeads(prev => prev.filter(l => !selectedIds.has(l.id))); toast.success(`Deleted ${ids.length} leads`); clearSelection(); }
    catch (err) { toast.error(err.message || 'Delete failed'); }
  };

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null;

  const filterBtnSt = (active) => ({
    padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
    ...(active
      ? { background: 'rgba(255,69,0,0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(255,69,0,0.2)' }
      : { background: 'transparent', color: 'var(--text-muted)', border: '1px solid transparent' }),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads..."
            style={{ ...inputSt, paddingLeft: 32, flex: 1 }} />
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 7, padding: 3 }}>
          {TEMP_FILTERS.map(f => <button key={f.key} onClick={() => setTempFilter(f.key)} style={filterBtnSt(tempFilter === f.key)}>{f.label}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 7, padding: 3 }}>
          {PLAT_FILTERS.map(f => <button key={f.key} onClick={() => setPlatformFilter(f.key)} style={filterBtnSt(platformFilter === f.key)}>{f.label}</button>)}
        </div>
        <button onClick={fetchLeads} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: 12 }}>
          <RefreshCw size={12} /> Refresh
        </button>
        <button onClick={selectedIds.size === leads.length && leads.length > 0 ? clearSelection : selectAll} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: 12 }}>
          {selectedIds.size === leads.length && leads.length > 0 ? <><CheckSquare size={12} style={{ color: 'var(--accent-primary)' }} /> Deselect All</> : <><Square size={12} /> Select All ({leads.length})</>}
        </button>
        <button onClick={openPowerSend} style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 16px', borderRadius: 7, cursor: 'pointer', background: 'var(--gradient-orange)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, boxShadow: '0 0 16px rgba(255,69,0,0.35)', whiteSpace: 'nowrap' }}>
          <Zap size={13} /> Power Email
        </button>
      </div>

      {/* Kanban board */}
      {loading ? (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16 }}>
          {STAGES.map(s => <div key={s.key} className="skeleton" style={{ flexShrink: 0, width: 248, height: 300, borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }} />)}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16, flex: 1, minHeight: 0 }}>
            {STAGES.map(stage => (
              <KanbanColumn key={stage.key} stage={stage} leads={grouped[stage.key] || []}
                onCardClick={setSelectedPanel} onPitch={l => navigate(`/pitch-generator?lead=${l.id}`)}
                onEmail={() => navigate('/email-sender')} onNote={setSelectedPanel}
                selectedIds={selectedIds} onToggleSelect={toggleSelect}
                onSelectAllInColumn={selectAllInColumn} />
            ))}
          </div>
          <DragOverlay>
            {activeLead ? (
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(255,69,0,0.4)', borderRadius: 8, padding: 12, width: 240, opacity: 0.9, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {initials(activeLead.channel_name)}
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeLead.channel_name}</p>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <AnimatePresence>
        {selectedPanel && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30 }}
              onClick={() => setSelectedPanel(null)} />
            <LeadDetailPanel lead={selectedPanel} onClose={() => setSelectedPanel(null)} onRefresh={fetchLeads} />
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedIds.size > 0 && (
          <BulkActionBar count={selectedIds.size} onMoveStage={bulkMoveStage} onGenPitches={bulkGenPitches}
            onAddQueue={bulkAddQueue} onGenAndSend={bulkGenerateAndSend} onDelete={bulkDelete}
            onClear={clearSelection} genSending={genSending} />
        )}
      </AnimatePresence>

      {showPowerOverlay && (
        <PowerSendOverlay
          leadIds={powerLeadIds}
          maxLeads={100}
          onClose={() => { setShowPowerOverlay(false); clearSelection(); fetchLeads(); }}
        />
      )}
    </div>
  );
}
