import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Trash2, Ban, Database, Users, Mail, Target, Zap, ChevronDown, ChevronUp, Search, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const ALL_PLANS = ['trial', 'free', 'starter', 'pro', 'growth', 'agency'];

function planBadgeClass(plan) {
  if (plan === 'agency') return 'badge badge--lime';
  if (plan === 'pro' || plan === 'growth') return 'badge badge--ok';
  return 'badge badge--neutral';
}

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers]           = useState([]);
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [expandedUser, setExpandedUser]   = useState(null);
  const [search, setSearch]         = useState('');
  const [limitEdits, setLimitEdits] = useState({});
  const [seederInfo, setSeederInfo] = useState(null);
  const [scraping, setScraping]     = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!user?.is_admin) { navigate('/'); return; }
    load();
    loadSeeder();
  }, [user]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const load = async () => {
    try {
      const { data } = await api.get('/auth/admin/stats');
      setUsers(data.users || []);
      setStats(data.stats || null);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSeeder = async () => {
    try { const { data } = await api.get('/auth/admin/seeder-status'); setSeederInfo(data); }
    catch {}
  };

  const scrapeNow = async () => {
    setScraping(true);
    try {
      const { data } = await api.post('/auth/admin/seed-now');
      toast.success(data.message || 'Seeder started!');
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => { await loadSeeder(); await load(); }, 5000);
      setTimeout(() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } setScraping(false); }, 180000);
    } catch (e) { toast.error(e.response?.data?.error || e.message); setScraping(false); }
  };

  const setPlan = async (id, plan) => {
    setActionLoading(`plan-${id}`);
    try { await api.put(`/auth/admin/users/${id}/plan`, { plan }); await load(); toast.success('Plan updated'); }
    catch (e) { toast.error(e.response?.data?.error || e.message); }
    setActionLoading('');
  };

  const resetUsage = async id => {
    setActionLoading(`reset-${id}`);
    try { await api.post(`/auth/admin/users/${id}/reset-usage`); await load(); toast.success('Usage reset'); }
    catch (e) { toast.error(e.response?.data?.error || e.message); }
    setActionLoading('');
  };

  const deleteUser = async id => {
    if (!confirm('Delete this user and ALL their data? This cannot be undone.')) return;
    setActionLoading(`del-${id}`);
    try { await api.delete(`/auth/admin/users/${id}`); await load(); toast.success('User deleted'); }
    catch (e) { toast.error(e.response?.data?.error || e.message); }
    setActionLoading('');
  };

  const banUser = async (id, banned) => {
    setActionLoading(`ban-${id}`);
    try {
      await api.put(`/auth/admin/users/${id}/ban`, { banned: !banned });
      await load();
      toast.success(banned ? 'User unbanned' : 'User banned');
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    setActionLoading('');
  };

  const saveLimits = async id => {
    const edits = limitEdits[id] || {};
    if (!Object.keys(edits).length) return;
    setActionLoading(`limits-${id}`);
    try {
      await api.put(`/auth/admin/users/${id}/limits`, edits);
      setLimitEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
      await load();
      toast.success('Limits saved');
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    setActionLoading('');
  };

  const editLimit = (id, key, val) => {
    setLimitEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: val } }));
  };

  const filtered = users.filter(u =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (!user?.is_admin) return null;

  const isSeeding = scraping || seederInfo?.seederStatus?.running;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1360, margin: '0 auto' }}>
      <div className="page__head">
        <h1 className="page__title">Admin Panel</h1>
        <button onClick={load} className="btn btn--ghost btn--sm" title="Refresh"><RefreshCw size={13} /></button>
      </div>

      {stats && (
        <div className="grid g-4" style={{ marginBottom: 20 }}>
          {[
            { icon: <Users size={16} />, label: 'Total Users',  value: stats.total_users, sub: `${stats.active_users} active (30d)` },
            { icon: <Target size={16} />, label: 'User Leads',  value: stats.total_leads?.toLocaleString(), sub: 'in user DBs' },
            { icon: <Mail size={16} />, label: 'Emails Sent',   value: stats.total_emails?.toLocaleString(), sub: 'all time' },
            { icon: <Database size={16} />, label: 'Master DB', value: (stats.master_leads ?? 0).toLocaleString(), sub: `${(stats.master_with_email ?? 0).toLocaleString()} with email` },
          ].map(item => (
            <div key={item.label} className="stat">
              <div style={{ color: 'var(--lime)', marginBottom: 8 }}>{item.icon}</div>
              <div className="stat__value--mono">{item.value ?? '—'}</div>
              <div className="stat__label" style={{ marginTop: 4, marginBottom: 0 }}>{item.label}</div>
              <div className="stat__meta">{item.sub}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, padding: '18px 20px' }}>
        <div className="row row--between" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Lead Seeder</span>
              <span className={`badge ${isSeeding ? 'badge--warn' : 'badge--neutral'}`}>
                {isSeeding ? '● RUNNING' : '○ IDLE'}
              </span>
            </div>
            <div className="t-mono t-muted" style={{ fontSize: 12 }}>
              {seederInfo ? (
                <>
                  DB: <b style={{ color: 'var(--text-2)' }}>{seederInfo.withEmail?.toLocaleString()}</b> leads with email
                  {' · '}Last saved: <b style={{ color: 'var(--text-2)' }}>{seederInfo.seederStatus?.lastCycleSaved ?? '—'}</b> leads
                  {seederInfo.seederStatus?.lastCycleAt ? ` · ${new Date(seederInfo.seederStatus.lastCycleAt).toLocaleTimeString()}` : ''}
                  {' · '}
                  <span style={{ color: seederInfo.ytKeyCount > 0 ? 'var(--lime)' : 'var(--coral)' }}>
                    {seederInfo.ytKeyCount > 0 ? `${seederInfo.ytKeyCount} YT API keys` : '⚠ NO YT API KEYS'}
                  </span>
                </>
              ) : 'Loading…'}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button onClick={loadSeeder} className="btn btn--ghost btn--sm" title="Refresh status"><RefreshCw size={13} /></button>
            <button onClick={scrapeNow} disabled={isSeeding} className="btn btn--primary">
              <Play size={12} />{scraping ? 'Starting…' : isSeeding ? 'Running…' : 'Scrape Now'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#FF4444', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="field" style={{ marginBottom: 14, position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search users by name or email…"
          className="input" style={{ paddingLeft: 30 }}
        />
      </div>

      {loading ? (
        <p className="t-muted" style={{ fontSize: 13 }}>Loading users…</p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>User</th><th>Plan</th><th>Leads</th><th>Emails</th><th>Joined</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const isBanned = !!(u.lockout_until && new Date(u.lockout_until) > new Date());
                const edits = limitEdits[u.id] || {};
                const isExpanded = expandedUser === u.id;
                return (
                  <React.Fragment key={u.id}>
                    <tr>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="ava ava--lg" style={{ background: 'var(--surface-3)', color: 'var(--text-2)', fontSize: 14 }}>
                            {(u.full_name || u.email || '?')[0].toUpperCase()}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{u.full_name || '—'}</div>
                            <div className="t-xs t-muted">{u.email}</div>
                            <div className="row" style={{ gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                              <span className="t-mono t-muted" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Target size={10} />{u.leads_used_this_month ?? 0} leads
                              </span>
                              <span className="t-mono t-muted" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Mail size={10} />{u.emails_used_this_month ?? 0} emails
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={planBadgeClass(u.plan)}>{u.plan}</span>
                        {isBanned && <span className="badge badge--bad" style={{ marginLeft: 4 }}>BANNED</span>}
                        {u.is_admin && <span className="badge badge--lime" style={{ marginLeft: 4 }}>ADMIN</span>}
                      </td>
                      <td className="mono">{u.leads_used_this_month ?? 0}</td>
                      <td className="mono">{u.emails_used_this_month ?? 0}</td>
                      <td className="t-sm t-muted">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <select value={u.plan} onChange={e => setPlan(u.id, e.target.value)} disabled={!!actionLoading}
                            className="input" style={{ height: 28, padding: '0 8px', fontSize: 11, width: 'auto' }}>
                            {ALL_PLANS.map(p => <option key={p}>{p}</option>)}
                          </select>
                          <button onClick={() => resetUsage(u.id)} disabled={!!actionLoading} title="Reset usage" className="btn btn--ghost btn--sm"><RefreshCw size={12} /></button>
                          <button onClick={() => banUser(u.id, isBanned)} disabled={!!actionLoading} title={isBanned ? 'Unban' : 'Ban'}
                            className="btn btn--ghost btn--sm" style={{ color: isBanned ? 'var(--ok)' : '#FF8C00' }}>
                            <Ban size={12} />
                          </button>
                          {u.id !== user.id && (
                            <button onClick={() => deleteUser(u.id)} disabled={!!actionLoading} title="Delete user" className="btn btn--danger btn--sm">
                              <Trash2 size={12} />
                            </button>
                          )}
                          <button onClick={() => setExpandedUser(isExpanded ? null : u.id)} className="btn btn--ghost btn--sm">
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0 }}>
                          <div style={{ background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--line)', padding: '14px 16px 16px' }}>
                            <div className="t-mono" style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-2)', fontWeight: 700, marginBottom: 12, textTransform: 'uppercase' }}>
                              Custom Limits <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(overrides plan defaults)</span>
                            </div>
                            <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                              {[
                                { key: 'emails_limit', label: 'EMAIL LIMIT / MONTH', val: u.custom_emails_limit },
                                { key: 'leads_limit',  label: 'LEAD LIMIT / MONTH',  val: u.custom_leads_limit },
                                { key: 'emails_used',  label: 'EMAILS USED',          val: u.emails_used_this_month },
                                { key: 'leads_used',   label: 'LEADS USED',           val: u.leads_used_this_month },
                              ].map(({ key, label, val }) => (
                                <div key={key}>
                                  <label className="field__label">{label}</label>
                                  <input
                                    type="number" placeholder={`Plan default`}
                                    value={edits[key] !== undefined ? edits[key] : (val ?? '')}
                                    onChange={e => editLimit(u.id, key, e.target.value)}
                                    className="input" style={{ width: 130, padding: '6px 10px', fontSize: 12 }}
                                  />
                                </div>
                              ))}
                              <button onClick={() => saveLimits(u.id)} disabled={actionLoading === `limits-${u.id}` || !Object.keys(edits).length} className="btn btn--primary">
                                <Zap size={11} /> Save
                              </button>
                            </div>
                            <div className="t-muted" style={{ marginTop: 8, fontSize: 11 }}>
                              Leave blank to use plan default · Set to 0 to block access · Set to 999999 for unlimited
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)', fontSize: 13 }}>No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
