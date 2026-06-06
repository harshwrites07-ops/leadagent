import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Trash2, Ban, Database, Users, Mail, Target, Zap, ChevronDown, ChevronUp, Search, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const ALL_PLANS = ['trial', 'free', 'starter', 'pro', 'growth', 'agency'];

const PLAN_COLORS = {
  trial: '#6e6e7a', free: '#6e6e7a', starter: '#8ec5ff',
  pro: '#c8f654', growth: '#c8f654', agency: '#ff8a73',
};

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [expandedUser, setExpandedUser] = useState(null);
  const [search, setSearch] = useState('');
  const [limitEdits, setLimitEdits] = useState({});
  const [seederInfo, setSeederInfo] = useState(null);
  const [scraping, setScraping] = useState(false);
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
    try {
      const { data } = await api.get('/auth/admin/seeder-status');
      setSeederInfo(data);
    } catch {}
  };

  const scrapeNow = async () => {
    setScraping(true);
    try {
      const { data } = await api.post('/auth/admin/seed-now');
      toast.success(data.message || 'Seeder started!');
      // Poll status every 5s for 3 minutes
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        await loadSeeder();
        await load();
      }, 5000);
      setTimeout(() => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        setScraping(false);
      }, 180000);
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
      setScraping(false);
    }
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

  return (
    <div style={{ padding: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={s.title}>Admin Panel</h1>
        <button onClick={load} style={s.refreshBtn} title="Refresh">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={s.statsGrid}>
          {[
            { icon: <Users size={16} />, label: 'Total Users', value: stats.total_users, sub: `${stats.active_users} active (30d)` },
            { icon: <Target size={16} />, label: 'User Leads', value: stats.total_leads?.toLocaleString(), sub: 'in user DBs' },
            { icon: <Mail size={16} />, label: 'Emails Sent', value: stats.total_emails?.toLocaleString(), sub: 'all time' },
            { icon: <Database size={16} />, label: 'Master DB', value: (stats.master_leads ?? 0).toLocaleString(), sub: `${(stats.master_with_email ?? 0).toLocaleString()} with email` },
          ].map(s2 => (
            <div key={s2.label} style={s.statCard}>
              <div style={{ color: 'var(--lime)', marginBottom: 8 }}>{s2.icon}</div>
              <div style={s.statValue}>{s2.value ?? '—'}</div>
              <div style={s.statLabel}>{s2.label}</div>
              <div style={s.statSub}>{s2.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Seeder control */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '18px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Lead Seeder</span>
            <span style={{
              fontSize: 10, fontWeight: 700, fontFamily: 'var(--f-mono)',
              padding: '2px 8px', borderRadius: 99,
              background: seederInfo?.seederStatus?.running ? '#c8f65422' : '#6e6e7a22',
              color: seederInfo?.seederStatus?.running ? 'var(--lime)' : 'var(--text-3)',
              border: `1px solid ${seederInfo?.seederStatus?.running ? '#c8f65444' : '#6e6e7a44'}`,
            }}>
              {seederInfo?.seederStatus?.running ? '● RUNNING' : '○ IDLE'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--f-mono)' }}>
            {seederInfo ? (
              <>
                DB: <b style={{ color: 'var(--text-2)' }}>{seederInfo.withEmail?.toLocaleString()}</b> leads with email
                {' · '}Last saved: <b style={{ color: 'var(--text-2)' }}>{seederInfo.seederStatus?.lastCycleSaved ?? '—'}</b> leads
                {seederInfo.seederStatus?.lastCycleAt ? ` · ${new Date(seederInfo.seederStatus.lastCycleAt).toLocaleTimeString()}` : ''}
                {seederInfo.seederStatus?.currentKeyword ? ` · Scanning: "${seederInfo.seederStatus.currentKeyword}"` : ''}
              </>
            ) : 'Loading…'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadSeeder} style={{ ...s.refreshBtn }} title="Refresh status">
            <RefreshCw size={13} />
          </button>
          <button
            onClick={scrapeNow}
            disabled={scraping || seederInfo?.seederStatus?.running}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--lime)', color: '#0a0a0c',
              border: 'none', borderRadius: 8,
              padding: '8px 16px', fontSize: 12, fontWeight: 700,
              cursor: (scraping || seederInfo?.seederStatus?.running) ? 'not-allowed' : 'pointer',
              opacity: (scraping || seederInfo?.seederStatus?.running) ? 0.6 : 1,
              fontFamily: 'var(--f-sans)',
            }}
          >
            <Play size={12} />
            {scraping ? 'Starting…' : seederInfo?.seederStatus?.running ? 'Running…' : 'Scrape Now'}
          </button>
        </div>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search users by name or email…"
          style={{ ...s.searchInput, paddingLeft: 30 }}
        />
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading users…</p>
      ) : (
        <div style={s.tableWrap}>
          {filtered.map(u => {
            const isBanned = !!(u.lockout_until && new Date(u.lockout_until) > new Date());
            const edits = limitEdits[u.id] || {};
            const isExpanded = expandedUser === u.id;
            return (
              <div key={u.id} style={{ ...s.userRow, borderBottom: '1px solid var(--border-subtle)' }}>
                {/* Main row */}
                <div style={s.userMain}>
                  <div style={s.userAvatar}>
                    {(u.full_name || u.email || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={s.userName}>{u.full_name || '—'}</span>
                      <span style={{ ...s.planBadge, background: `${PLAN_COLORS[u.plan] || '#6e6e7a'}22`, color: PLAN_COLORS[u.plan] || '#6e6e7a', border: `1px solid ${PLAN_COLORS[u.plan] || '#6e6e7a'}44` }}>
                        {u.plan}
                      </span>
                      {isBanned && <span style={{ ...s.planBadge, background: 'rgba(255,68,68,0.12)', color: '#FF4444', border: '1px solid rgba(255,68,68,0.3)' }}>BANNED</span>}
                      {u.is_admin ? <span style={{ ...s.planBadge, background: 'rgba(200,246,84,0.12)', color: 'var(--lime)', border: '1px solid rgba(200,246,84,0.3)' }}>ADMIN</span> : null}
                    </div>
                    <div style={s.userEmail}>{u.email}</div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={s.metaItem}>
                        <Target size={10} style={{ color: 'var(--text-muted)' }} />
                        {u.leads_used_this_month ?? 0} leads used
                      </span>
                      <span style={s.metaItem}>
                        <Mail size={10} style={{ color: 'var(--text-muted)' }} />
                        {u.emails_used_this_month ?? 0} emails used
                      </span>
                      <span style={s.metaItem}>
                        Joined {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Plan select */}
                    <select
                      value={u.plan} onChange={e => setPlan(u.id, e.target.value)}
                      disabled={!!actionLoading}
                      style={s.planSelect}
                    >
                      {ALL_PLANS.map(p => <option key={p}>{p}</option>)}
                    </select>
                    {/* Actions */}
                    <button onClick={() => resetUsage(u.id)} disabled={!!actionLoading} title="Reset usage" style={s.iconBtn}>
                      <RefreshCw size={12} />
                    </button>
                    <button onClick={() => banUser(u.id, isBanned)} disabled={!!actionLoading} title={isBanned ? 'Unban' : 'Ban'} style={{ ...s.iconBtn, color: isBanned ? 'var(--ok)' : '#FF8C00' }}>
                      <Ban size={12} />
                    </button>
                    {u.id !== user.id && (
                      <button onClick={() => deleteUser(u.id)} disabled={!!actionLoading} title="Delete user" style={{ ...s.iconBtn, color: '#FF4444' }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                    <button onClick={() => setExpandedUser(isExpanded ? null : u.id)} style={{ ...s.iconBtn, color: 'var(--text-muted)' }}>
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>
                </div>

                {/* Expanded: custom limits */}
                {isExpanded && (
                  <div style={s.expandedSection}>
                    <div style={s.expandedTitle}>Custom Limits <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(overrides plan defaults)</span></div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <label style={s.fieldLabel}>EMAIL LIMIT / MONTH</label>
                        <input
                          type="number" placeholder={`Plan default`}
                          value={edits.emails_limit !== undefined ? edits.emails_limit : (u.custom_emails_limit ?? '')}
                          onChange={e => editLimit(u.id, 'emails_limit', e.target.value)}
                          style={s.limitInput}
                        />
                      </div>
                      <div>
                        <label style={s.fieldLabel}>LEAD LIMIT / MONTH</label>
                        <input
                          type="number" placeholder={`Plan default`}
                          value={edits.leads_limit !== undefined ? edits.leads_limit : (u.custom_leads_limit ?? '')}
                          onChange={e => editLimit(u.id, 'leads_limit', e.target.value)}
                          style={s.limitInput}
                        />
                      </div>
                      <div>
                        <label style={s.fieldLabel}>EMAILS USED</label>
                        <input
                          type="number" placeholder={u.emails_used_this_month ?? 0}
                          value={edits.emails_used !== undefined ? edits.emails_used : ''}
                          onChange={e => editLimit(u.id, 'emails_used', e.target.value)}
                          style={s.limitInput}
                        />
                      </div>
                      <div>
                        <label style={s.fieldLabel}>LEADS USED</label>
                        <input
                          type="number" placeholder={u.leads_used_this_month ?? 0}
                          value={edits.leads_used !== undefined ? edits.leads_used : ''}
                          onChange={e => editLimit(u.id, 'leads_used', e.target.value)}
                          style={s.limitInput}
                        />
                      </div>
                      <button
                        onClick={() => saveLimits(u.id)}
                        disabled={actionLoading === `limits-${u.id}` || !Object.keys(edits).length}
                        style={s.saveBtn}
                      >
                        <Zap size={11} /> Save
                      </button>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                      Leave blank to use plan default · Set to 0 to block access · Set to 999999 for unlimited
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No users found</div>}
        </div>
      )}
    </div>
  );
}

const s = {
  title: { fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0', letterSpacing: '-0.02em' },
  refreshBtn: { background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', padding: '6px 8px', display: 'flex', alignItems: 'center' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 },
  statCard: { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '14px 16px' },
  statValue: { fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' },
  statLabel: { fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontWeight: 600 },
  statSub: { fontSize: 10, color: 'var(--text-muted)', marginTop: 1 },
  errorBox: { background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#FF4444', marginBottom: 16 },
  searchInput: { width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' },
  tableWrap: { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' },
  userRow: { background: 'transparent' },
  userMain: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', flexWrap: 'wrap' },
  userAvatar: { width: 36, height: 36, borderRadius: 9, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 },
  userName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  userEmail: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  metaItem: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  planBadge: { fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, letterSpacing: '0.06em', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' },
  planSelect: { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 11, padding: '5px 8px', fontFamily: 'var(--font-body)', cursor: 'pointer' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 5, borderRadius: 5, display: 'flex', alignItems: 'center' },
  expandedSection: { background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--border-subtle)', padding: '14px 16px 16px' },
  expandedTitle: { fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 12, textTransform: 'uppercase' },
  fieldLabel: { display: 'block', fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase' },
  limitInput: { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, padding: '6px 10px', fontFamily: 'var(--font-body)', outline: 'none', width: 130 },
  saveBtn: { display: 'flex', alignItems: 'center', gap: 5, background: 'var(--lime)', color: '#0a0a0c', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' },
};
