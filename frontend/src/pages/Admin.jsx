import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, RefreshCw, Trash2, Ban, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const PLANS = ['free', 'starter', 'growth', 'agency'];

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    if (!user?.is_admin) { navigate('/'); return; }
    load();
  }, [user]);

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
    if (!confirm('Delete this user and all their data?')) return;
    setActionLoading(`del-${id}`);
    try { await api.delete(`/auth/admin/users/${id}`); await load(); toast.success('User deleted'); }
    catch (e) { toast.error(e.response?.data?.error || e.message); }
    setActionLoading('');
  };

  const banUser = async (id, banned) => {
    setActionLoading(`ban-${id}`);
    try { await api.put(`/auth/admin/users/${id}/ban`, { banned: !banned }); await load(); toast.success(banned ? 'User unbanned' : 'User banned'); }
    catch (e) { toast.error(e.response?.data?.error || e.message); }
    setActionLoading('');
  };

  if (!user?.is_admin) return null;

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Admin Panel</h1>

      {stats && (
        <div style={styles.statsRow}>
          {[
            { label: 'Total Users', value: stats.total_users },
            { label: 'Active (30d)', value: stats.active_users },
            { label: 'Total Leads', value: stats.total_leads?.toLocaleString() },
            { label: 'Total Emails', value: stats.total_emails?.toLocaleString() },
          ].map(s => (
            <div key={s.label} style={styles.statCard}>
              <div style={styles.statValue}>{s.value ?? '—'}</div>
              <div style={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {error && <div style={styles.errorBox}>{error}</div>}

      {loading ? (
        <p style={styles.loading}>Loading users...</p>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['ID', 'Name', 'Email', 'Plan', 'Leads Used', 'Emails Used', 'Joined', 'Actions'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={styles.tr}>
                  <td style={styles.td}>{u.id}</td>
                  <td style={styles.td}>{u.full_name || '—'}</td>
                  <td style={styles.td}>{u.email}</td>
                  <td style={styles.td}>
                    <select
                      value={u.plan} onChange={e => setPlan(u.id, e.target.value)}
                      disabled={actionLoading === `plan-${u.id}`}
                      style={styles.planSelect}
                    >
                      {PLANS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </td>
                  <td style={styles.td}>{u.leads_used_this_month ?? 0}</td>
                  <td style={styles.td}>{u.emails_used_this_month ?? 0}</td>
                  <td style={styles.td}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => resetUsage(u.id)} disabled={!!actionLoading} title="Reset usage" style={styles.iconBtn}>
                        <RefreshCw size={12} />
                      </button>
                      <button onClick={() => banUser(u.id, u.plan_status === 'banned')} disabled={!!actionLoading} title={u.plan_status === 'banned' ? 'Unban' : 'Ban'} style={{ ...styles.iconBtn, color: u.plan_status === 'banned' ? 'var(--ok)' : '#FF8C00' }}>
                        <Ban size={12} />
                      </button>
                      {u.id !== user.id && (
                        <button onClick={() => deleteUser(u.id)} disabled={!!actionLoading} title="Delete user" style={{ ...styles.iconBtn, color: '#FF4444' }}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { padding: 0 },
  title: { fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 20px', letterSpacing: '-0.02em' },
  statsRow: { display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 120, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '14px 16px' },
  statValue: { fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' },
  statLabel: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  errorBox: { background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#FF4444', marginBottom: 16 },
  loading: { color: 'var(--text-muted)', fontSize: 13 },
  tableWrap: { overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border-subtle)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { padding: '10px 12px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap', background: 'var(--bg-surface)' },
  tr: { borderBottom: '1px solid var(--border-subtle)' },
  td: { padding: '10px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' },
  planSelect: { background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 11, padding: '3px 6px', fontFamily: 'var(--font-body)' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' },
};
