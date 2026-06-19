import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Icon from '../components/ui/Icon';
import api, { formatNumber, formatDate } from '../utils/api';

const STAGES = [
  { id: 'new_lead',       label: 'Discovered',  color: 'var(--text-4)' },
  { id: 'studying',       label: 'Enriched',    color: 'var(--sky)' },
  { id: 'pitch_ready',    label: 'Pitch Ready', color: 'var(--violet)' },
  { id: 'email_sent',     label: 'Sent',        color: 'var(--lime)' },
  { id: 'replied',        label: 'Replied',     color: 'var(--ok)' },
  { id: 'call_booked',    label: 'Call Booked', color: 'var(--coral)' },
  { id: 'closed',         label: 'Won',         color: 'var(--ok)' },
  { id: 'not_interested', label: 'Lost',        color: 'var(--bad)' },
];

const NICHE_COLORS = {
  Finance: 'var(--lime)', Tech: 'var(--sky)', Fitness: 'var(--coral)',
  Cooking: 'var(--cream)', Gaming: 'var(--violet)', Design: 'var(--sky)',
  Travel: 'var(--coral)', Beauty: 'var(--coral)', Education: 'var(--lime)',
  Business: 'var(--cream)',
};

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

  const columns = STAGES.map(s => ({
    ...s,
    leads: leads.filter(l => (l.crm_stage || l.stage) === s.id),
  }));

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm');
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
      toast.success('Stage updated');
    } catch (err) { toast.error(err.message || 'Failed'); }
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

  return (
    <div className="page page--bleed" style={{ padding: '24px 24px 0', maxWidth: 'none' }}>
      <div className="page__head">
        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
            Pipeline · {leads.length} creators{totalValue > 0 ? ` · $${(totalValue / 1000).toFixed(1)}k open value` : ''}
          </div>
          <h1 className="page__title">CRM — <em>drag a creator from cold to closed.</em></h1>
        </div>
        <div className="page__actions">
          <button className="btn btn--ghost btn--sm"><Icon name="filter" size={12} />Filter</button>
          <button className="btn btn--ghost btn--sm"><Icon name="search" size={12} />Search</button>
          <button className="btn btn--ghost btn--sm" onClick={handleExportCsv}><Icon name="arrowDown" size={12} />Export</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          <span className="dot dot--pulse" style={{ marginRight: 8, display: 'inline-block' }} />Loading pipeline...
        </div>
      ) : (
        <div className="kb">
          {columns.map(col => {
            const colValue = col.leads.reduce((sum, l) => sum + (l.deal_value || 0), 0);
            return (
              <div key={col.id} className="kb__col">
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
                <div className="kb__list">
                  {col.leads.map((lead, i) => {
                    const isHot = lead.temperature === 'hot' || col.id === 'replied' || col.id === 'call_booked';
                    const nicheColor = NICHE_COLORS[lead.niche] || 'var(--text-3)';
                    return (
                      <div
                        key={lead.id || i}
                        className="kb__card"
                        onClick={() => handleSelectLead(lead)}
                        style={isHot ? { borderColor: 'var(--coral-border)' } : undefined}
                      >
                        <div className="kb__card-head">
                          {lead.thumbnail_url ? (
                            <img src={lead.thumbnail_url} alt="" style={{ width: 26, height: 26, minWidth: 26, borderRadius: '50%', objectFit: 'cover' }} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
                          ) : null}
                          <span className="ava" style={{ fontSize: 10, width: 26, height: 26, minWidth: 26, borderRadius: '50%', display: lead.thumbnail_url ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-3)', color: '#0a0a0c' }}>
                            {(lead.channel_name || '?')[0].toUpperCase()}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="kb__card-name">{lead.channel_name}</div>
                            <div className="kb__card-meta">
                              {lead.channel_handle || ''} · {formatNumber(lead.subscriber_count ?? 0)}
                            </div>
                          </div>
                          {isHot && (
                            <span className="dot dot--pulse-coral" style={{ background: 'var(--coral)', width: 7, height: 7, marginTop: 4, flexShrink: 0 }} />
                          )}
                        </div>
                        <div className="kb__card-foot">
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-2)', color: nicheColor, border: `1px solid ${nicheColor}22` }}>
                            {lead.niche || 'General'}
                          </span>
                          {lead.deal_value ? (
                            <span className="kb__card-value">${(lead.deal_value / 1000).toFixed(1)}k</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button className="kb__add" onClick={() => setShowAddModal(true)}>
                  <Icon name="plus" size={11} /> Add
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add lead modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: 400, padding: 28 }}>
            <h2 style={{ fontFamily: 'var(--f-serif)', fontStyle: 'italic', fontSize: 20, fontWeight: 400, color: 'var(--text)', margin: '0 0 12px' }}>Add to Pipeline</h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 20px' }}>Find a lead in your leads database and add them to the CRM pipeline.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn--ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn--primary" onClick={() => { setShowAddModal(false); navigate('/leads'); }}>Browse Leads →</button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-in lead detail */}
      {selected && (
        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 28, width: 440,
          background: 'var(--bg-2)', borderLeft: '1px solid var(--line)',
          zIndex: 20, overflowY: 'auto', padding: '24px 26px',
          animation: 'slideIn 300ms cubic-bezier(0.16,1,0.3,1)',
        }}>
          <div className="row" style={{ marginBottom: 16 }}>
            <button className="btn btn--ghost btn--sm" onClick={() => setSelected(null)}>
              <Icon name="x" size={12} />Close
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn btn--ghost btn--sm" onClick={() => navigate(`/analyzer`)}>
              <Icon name="eye" size={12} />Open in Analyzer
            </button>
          </div>

          <div className="row" style={{ gap: 14, marginBottom: 18 }}>
            {selected.thumbnail_url ? (
              <img src={selected.thumbnail_url} alt="" style={{ width: 44, height: 44, minWidth: 44, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <span className="ava" style={{ fontSize: 14, width: 44, height: 44, minWidth: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-3)', color: '#0a0a0c' }}>
                {(selected.channel_name || '?')[0].toUpperCase()}
              </span>
            )}
            <div>
              <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>{selected.channel_name}</div>
              <div className="mono muted" style={{ fontSize: 11.5 }}>
                {selected.channel_handle || ''} · {formatNumber(selected.subscriber_count ?? 0)}
              </div>
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-2)', color: NICHE_COLORS[selected.niche] || 'var(--text-3)', border: '1px solid var(--line)' }}>
                  {selected.niche || 'General'}
                </span>
                {selected.email && <span className="badge badge--lime">email found</span>}
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

          {detailTab === 'Timeline' && (
            <>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Timeline</div>
              {leadHistory.length === 0 ? (
                <div className="muted" style={{ fontSize: 12 }}>Nothing yet — activity shows up as soon as you start sending.</div>
              ) : leadHistory.map((e, i) => (
                <div key={i} className="row" style={{ gap: 12, padding: '10px 0', borderBottom: '1px dashed var(--line)' }}>
                  <span style={{ color: e.type === 'reply' ? 'var(--coral)' : e.type === 'open' ? 'var(--lime)' : 'var(--text-3)', width: 16, display: 'grid', placeItems: 'center' }}>
                    <Icon name={e.type === 'reply' ? 'reply' : e.type === 'open' ? 'eye' : e.type === 'note' ? 'pen' : 'mail'} size={13} />
                  </span>
                  <div style={{ flex: 1, fontSize: 12.5 }}>{e.description || e.event || '—'}</div>
                  <span className="mono muted" style={{ fontSize: 10.5 }}>{formatDate(e.created_at || e.timestamp)}</span>
                </div>
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
                    <Icon name="sparkle" size={11} />Write pitch
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
                <Icon name="pen" size={11} />Save note
              </button>
            </div>
          )}

          <div className="row" style={{ gap: 6, marginTop: 20 }}>
            <button className="btn btn--sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setDetailTab('Notes')}>
              <Icon name="pen" size={11} />Note
            </button>
            <button className="btn btn--sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigate(`/pitch?lead=${selected.id}`)}>
              <Icon name="sparkle" size={11} />Pitch
            </button>
            <button className="btn btn--coral btn--sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigate('/email')}>
              <Icon name="reply" size={11} />Reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
