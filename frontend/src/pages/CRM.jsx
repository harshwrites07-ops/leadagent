import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import toast from 'react-hot-toast';
import PowerSendOverlay from '../components/ui/PowerSendOverlay';
import api, { formatNumber, formatDate } from '../utils/api';

const STAGES = [
  { id: 'new_lead',       label: 'Discovered',  color: 'var(--text-4)' },
  { id: 'studying',       label: 'Enriched',    color: 'var(--sky)' },
  { id: 'pitch_ready',    label: 'Pitch Ready', color: 'var(--violet)' },
  { id: 'emailed',        label: 'Sent',        color: 'var(--lime)' },
  { id: 'replied',        label: 'Replied',     color: 'var(--ok)' },
  { id: 'call_booked',    label: 'Call Booked', color: 'var(--warn)' },
  { id: 'closed_won',     label: 'Won',         color: 'var(--ok)' },
  { id: 'closed_lost',    label: 'Lost',        color: 'var(--bad)' },
];

function channelUrl(lead) {
  if (lead.channel_url) return lead.channel_url;
  if (lead.channel_handle) return `https://youtube.com/${lead.channel_handle}`;
  return null;
}

export default function CRM() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [leadHistory, setLeadHistory] = useState([]);
  const [leadPitch, setLeadPitch] = useState(null);
  const [newNote, setNewNote] = useState('');
  const [detailTab, setDetailTab] = useState('Timeline');
  const [showAddModal, setShowAddModal] = useState(false);
  const [checkedLeads, setCheckedLeads] = useState(new Set());
  const [showPowerSend, setShowPowerSend] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [justDropped, setJustDropped] = useState(null);

  const columns = STAGES.map(s => ({
    ...s,
    leads: leads.filter(l => (l.crm_stage || l.stage) === s.id),
  }));

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm?limit=2000');
      const arr = Array.isArray(data.leads) ? data.leads : Array.isArray(data) ? data : [];
      setLeads(arr);
    } catch { toast.error('Failed to load CRM'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const handleSelectLead = async lead => {
    setSelected(lead);
    setLeadHistory([]);
    setLeadPitch(null);
    setDetailTab('Timeline');
    try {
      const [histRes, pitchRes] = await Promise.allSettled([
        api.get(`/crm/${lead.id}/history`),
        api.get(`/pitches/by-lead/${lead.id}`),
      ]);
      if (histRes.status === 'fulfilled') {
        const h = histRes.value.data;
        setLeadHistory(Array.isArray(h.history) ? h.history : Array.isArray(h) ? h : []);
      }
      if (pitchRes.status === 'fulfilled') setLeadPitch(pitchRes.value.data.pitch);
    } catch {}
  };

  const toggleCheck = (e, leadId) => {
    e.stopPropagation();
    setCheckedLeads(prev => {
      const next = new Set(prev);
      next.has(leadId) ? next.delete(leadId) : next.add(leadId);
      return next;
    });
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !selected) return;
    try {
      await api.post(`/crm/${selected.id}/note`, { note: newNote.trim() });
      setNewNote('');
      toast.success('Note added');
      handleSelectLead(selected);
    } catch (err) { toast.error(err.message || 'Failed'); }
  };

  const handleMoveStage = async (leadId, stage) => {
    try {
      await api.put(`/crm/${leadId}/stage`, { stage });
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, crm_stage: stage, stage } : l));
      if (selected?.id === leadId) setSelected(s => ({ ...s, crm_stage: stage, stage }));
      setJustDropped(leadId);
      setTimeout(() => setJustDropped(id => (id === leadId ? null : id)), 700);
      toast.success('Stage updated');
    } catch (err) { toast.error(err.message || 'Failed'); }
  };

  const handleCardDragStart = (e, lead) => {
    e.dataTransfer.setData('text/plain', String(lead.id));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(lead.id);
  };
  const handleCardDragEnd = () => { setDraggingId(null); setDragOverCol(null); };
  const handleColDragOver = (e, colId) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverCol !== colId) setDragOverCol(colId); };
  const handleColDrop = (e, colId) => {
    e.preventDefault();
    const leadId = Number(e.dataTransfer.getData('text/plain'));
    setDragOverCol(null);
    setDraggingId(null);
    const lead = leads.find(l => l.id === leadId);
    if (lead && (lead.crm_stage || lead.stage) !== colId) handleMoveStage(leadId, colId);
  };

  const handleExportCsv = async () => {
    try {
      const response = await api.get('/leads/export/csv', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crm_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch { toast.error('Export failed'); }
  };

  const totalValue = leads.reduce((sum, l) => sum + (l.deal_value || 0), 0);
  const selectedLeadIds = [...checkedLeads];

  return (
    <div className="page page--bleed" style={{ padding: '24px 24px 0', maxWidth: 'none' }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16,1,0.3,1] }}
        className="page__head"
      >
        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, fontFamily: 'var(--f-mono)' }}>
            Pipeline · {leads.length} creators{totalValue > 0 ? ` · $${(totalValue / 1000).toFixed(1)}k open value` : ''}
          </div>
          <h1 className="page__title" style={{ whiteSpace: 'nowrap' }}>CRM — <em>drag a creator from cold to closed.</em></h1>
        </div>
        <div className="page__actions">
          <button className="btn btn--ghost btn--sm">Filter</button>
          <button className="btn btn--ghost btn--sm">Search</button>
          <button className="btn btn--ghost btn--sm" onClick={handleExportCsv}>Export</button>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ padding: '48px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}
          >
            Loading pipeline...
          </motion.div>
        ) : (
          <LayoutGroup>
          <motion.div
            key="board"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="kb"
          >
            {columns.map((col, colIdx) => {
              const colValue = col.leads.reduce((sum, l) => sum + (l.deal_value || 0), 0);
              const isDropTarget = dragOverCol === col.id;
              return (
                <motion.div
                  key={col.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: colIdx * 0.04, duration: 0.35, ease: [0.16,1,0.3,1] }}
                  className="kb__col"
                  style={{
                    borderTop: `2px solid ${col.color}`,
                    borderColor: isDropTarget ? 'var(--lime-border)' : undefined,
                    background: isDropTarget ? 'var(--lime-soft)' : undefined,
                    transition: 'background 150ms, border-color 150ms',
                  }}
                >
                  <div className="kb__col-head">
                    <div className="kb__col-title">
                      <span className="swatch" style={{ background: col.color }} />
                      {col.label}
                      <span className="count">{col.leads.length}</span>
                    </div>
                    <div className="kb__col-value">
                      {colValue > 0 ? `$${(colValue / 1000).toFixed(1)}k` : '—'}
                    </div>
                  </div>
                  <div
                    className="kb__list"
                    onDragOver={e => handleColDragOver(e, col.id)}
                    onDragLeave={() => setDragOverCol(c => (c === col.id ? null : c))}
                    onDrop={e => handleColDrop(e, col.id)}
                    style={{ minHeight: 60 }}
                  >
                    {col.leads.length === 0 && isDropTarget && (
                      <div style={{ border: '1px dashed var(--lime-border)', borderRadius: 8, padding: '14px', textAlign: 'center', color: 'var(--lime)', fontSize: 11.5 }}>
                        Drop to move here
                      </div>
                    )}
                    {col.leads.map((lead, i) => {
                      const isHot = lead.temperature === 'hot' || col.id === 'replied' || col.id === 'call_booked';
                      const isChecked = checkedLeads.has(lead.id);
                      const url = channelUrl(lead);
                      return (
                        <motion.div
                          key={lead.id || i}
                          layout
                          layoutId={`crm-card-${lead.id}`}
                          initial={{ opacity: 0, scale: 0.97 }}
                          animate={{
                            opacity: draggingId === lead.id ? 0.35 : 1,
                            scale: draggingId === lead.id ? 0.97 : 1,
                            rotate: draggingId === lead.id ? -2 : 0,
                          }}
                          transition={{
                            delay: colIdx * 0.04 + i * 0.03, duration: 0.3,
                            scale: { type: 'spring', stiffness: 400, damping: 30 },
                            rotate: { type: 'spring', stiffness: 400, damping: 30 },
                          }}
                          whileTap={{ scale: 0.98 }}
                          className="kb__card"
                          draggable
                          onDragStart={e => handleCardDragStart(e, lead)}
                          onDragEnd={handleCardDragEnd}
                          onClick={() => handleSelectLead(lead)}
                          style={{
                            cursor: 'grab',
                            borderColor: isChecked ? 'var(--lime-border)' : 'var(--line)',
                            background: isChecked ? 'var(--surface-2)' : undefined,
                          }}
                        >
                          <div className="kb__card-head">
                            {/* Checkbox */}
                            <div
                              onClick={e => toggleCheck(e, lead.id)}
                              style={{
                                width: 14, height: 14, borderRadius: 3, flexShrink: 0, marginTop: 3,
                                border: `1.5px solid ${isChecked ? 'var(--lime)' : 'var(--line-2)'}`,
                                background: isChecked ? 'var(--lime)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', transition: 'all 0.12s',
                              }}
                            >
                              {isChecked && (
                                <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m5 12 5 5 9-11"/>
                                </svg>
                              )}
                            </div>

                            {lead.thumbnail_url ? (
                              <img src={lead.thumbnail_url} alt="" style={{ width: 26, height: 26, minWidth: 26, borderRadius: '50%', objectFit: 'cover' }} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
                            ) : null}
                            <span className="ava" style={{ fontSize: 10, width: 26, height: 26, minWidth: 26, borderRadius: '50%', display: lead.thumbnail_url ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-3)', color: 'var(--on-accent)' }}>
                              {(lead.channel_name || '?')[0].toUpperCase()}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="kb__card-name">{lead.channel_name}</div>
                              <div className="kb__card-meta">
                                {lead.channel_handle || ''} · {formatNumber(lead.subscriber_count ?? 0)}
                              </div>
                            </div>
                            {isHot && !isChecked && (
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)', marginTop: 4, flexShrink: 0, display: 'inline-block' }} />
                            )}
                          </div>
                          <div className="kb__card-foot">
                            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                              {lead.niche || 'General'}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                              {lead.deal_value ? (
                                <span className="kb__card-value">${(lead.deal_value / 1000).toFixed(1)}k</span>
                              ) : null}
                              {url && (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  title="Open YouTube channel"
                                  style={{
                                    fontSize: 10.5, color: 'var(--text-3)', textDecoration: 'none',
                                    whiteSpace: 'nowrap',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
                                >
                                  Channel
                                </a>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                  <button className="kb__add" onClick={() => setShowAddModal(true)}>
                    Add
                  </button>
                </motion.div>
              );
            })}
          </motion.div>
          </LayoutGroup>
        )}
      </AnimatePresence>

      {/* Floating selection bar */}
      <AnimatePresence>
        {checkedLeads.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16,1,0.3,1] }}
            style={{
              position: 'fixed', bottom: 36, left: '50%', transform: 'translateX(-50%)',
              background: 'var(--surface-2)', border: '1px solid var(--lime-border)',
              borderRadius: 12, padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              zIndex: 50,
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {checkedLeads.size} lead{checkedLeads.size !== 1 ? 's' : ''} selected
            </span>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => setShowPowerSend(true)}
            >
              Send Emails
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setCheckedLeads(new Set())}
            >
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add lead modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop"
            onClick={e => e.target === e.currentTarget && setShowAddModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.16,1,0.3,1] }}
              className="modal"
              style={{ maxWidth: 400, padding: 28 }}
            >
              <h2 style={{ fontFamily: 'var(--f-heading)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.04em', color: 'var(--text)', margin: '0 0 12px' }}>Add to Pipeline</h2>
              <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 20px' }}>Find a lead in your leads database and add them to the CRM pipeline.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn--ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button className="btn" onClick={() => { setShowAddModal(false); navigate('/leads'); }}>Browse Leads →</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide-in lead detail */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.id}
            initial={{ x: 440 }}
            animate={{ x: 0 }}
            exit={{ x: 440 }}
            transition={{ duration: 0.3, ease: [0.16,1,0.3,1] }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 28, width: 440,
              background: 'var(--bg-2)', borderLeft: '1px solid var(--line)',
              zIndex: 20, overflowY: 'auto', padding: '24px 26px',
            }}
          >
            <div className="row" style={{ marginBottom: 16 }}>
              <button className="btn btn--ghost btn--sm" onClick={() => setSelected(null)}>
                Close
              </button>
              <div style={{ flex: 1 }} />
              {channelUrl(selected) && (
                <a
                  href={channelUrl(selected)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn--ghost btn--sm"
                  style={{ textDecoration: 'none', color: 'var(--text-2)' }}
                >
                  Open Channel
                </a>
              )}
              <button className="btn btn--ghost btn--sm" onClick={() => navigate(`/analyzer`)}>
                Open in Analyzer
              </button>
            </div>

            <div className="row" style={{ gap: 14, marginBottom: 18 }}>
              {selected.thumbnail_url ? (
                <img src={selected.thumbnail_url} alt="" style={{ width: 44, height: 44, minWidth: 44, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <span className="ava" style={{ fontSize: 14, width: 44, height: 44, minWidth: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-3)', color: 'var(--on-accent)' }}>
                  {(selected.channel_name || '?')[0].toUpperCase()}
                </span>
              )}
              <div>
                <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>{selected.channel_name}</div>
                <div className="mono muted" style={{ fontSize: 11.5 }}>
                  {selected.channel_handle || ''} · {formatNumber(selected.subscriber_count ?? 0)}
                </div>
                <div className="row" style={{ gap: 10, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {selected.niche || 'General'}
                  </span>
                  {selected.email && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-2)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} />
                      email found
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <div className="field__label">Stage</div>
              <select
                className="input"
                value={selected.crm_stage || selected.stage || 'new_lead'}
                onChange={e => handleMoveStage(selected.id, e.target.value)}
                style={{ fontSize: 12 }}
              >
                {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

            <div className="tabs" style={{ marginBottom: 14 }}>
              {['Timeline', 'Pitch', 'Notes'].map(t => (
                <div key={t} className={`tab ${detailTab === t ? 'is-active' : ''}`} onClick={() => setDetailTab(t)}>
                  {t}
                </div>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={detailTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
              >
                {detailTab === 'Timeline' && (
                  <>
                    <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Timeline</div>
                    {leadHistory.length === 0 ? (
                      <div className="muted" style={{ fontSize: 12 }}>Nothing yet — activity shows up as soon as you start sending.</div>
                    ) : leadHistory.map((e, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="row"
                        style={{ gap: 12, padding: '10px 0', borderBottom: '1px dashed var(--line)' }}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                          background: e.type === 'reply' ? 'var(--ok)' : e.type === 'open' ? 'var(--lime)' : 'var(--text-4)',
                        }} />
                        <div style={{ flex: 1, fontSize: 12.5 }}>{e.description || e.event || '—'}</div>
                        <span className="mono muted" style={{ fontSize: 10.5 }}>{formatDate(e.created_at || e.timestamp)}</span>
                      </motion.div>
                    ))}
                  </>
                )}

                {detailTab === 'Pitch' && (
                  <>
                    {leadPitch ? (
                      <>
                        <div style={{ fontSize: 11, color: 'var(--lime)', fontFamily: 'var(--f-mono)', marginBottom: 8 }}>
                          Subject: {leadPitch.email_subject || '—'}
                        </div>
                        <pre style={{ fontSize: 11, color: 'var(--text-2)', whiteSpace: 'pre-wrap', fontFamily: 'var(--f-mono)', lineHeight: 1.6, background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', border: '1px solid var(--line)', maxHeight: 400, overflowY: 'auto' }}>
                          {leadPitch.cold_email || '—'}
                        </pre>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>No pitch written yet.</div>
                        <button className="btn btn--ghost btn--sm" onClick={() => navigate(`/pitch?lead=${selected.id}`)}>
                          Write pitch
                        </button>
                      </div>
                    )}
                  </>
                )}

                {detailTab === 'Notes' && (
                  <div>
                    <textarea
                      className="input"
                      rows={3}
                      placeholder="Add a note..."
                      value={newNote}
                      onChange={e => setNewNote(e.target.value)}
                      style={{ fontFamily: 'var(--f-sans)', fontSize: 12, resize: 'vertical', width: '100%', boxSizing: 'border-box', marginBottom: 8 }}
                    />
                    <button className="btn btn--ghost btn--sm" onClick={handleAddNote}>
                      Save note
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="row" style={{ gap: 6, marginTop: 20 }}>
              <button className="btn btn--sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setDetailTab('Notes')}>
                Note
              </button>
              <button className="btn btn--sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigate(`/pitch?lead=${selected.id}`)}>
                Pitch
              </button>
              <button className="btn btn--sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigate('/email')}>
                Reply
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Power send overlay for selected leads */}
      {showPowerSend && (
        <PowerSendOverlay
          leadIds={selectedLeadIds}
          onClose={() => { setShowPowerSend(false); setCheckedLeads(new Set()); }}
        />
      )}
    </div>
  );
}
