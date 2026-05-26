import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Search, Wand2, Mail, Kanban, BarChart3,
  Settings, ChevronLeft, ChevronRight, ScanSearch,
  LogOut, User, Shield, ChevronDown,
} from 'lucide-react';
import AssistantChat from './AssistantChat';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { path: '/',          icon: LayoutDashboard, label: 'Dashboard',    tag: 'DASH' },
  { path: '/leads',     icon: Search,          label: 'Lead Finder',  tag: 'FIND' },
  { path: '/analyzer',  icon: ScanSearch,      label: 'Analyzer',     tag: 'SCAN' },
  { path: '/pitch',     icon: Wand2,           label: 'Pitch Gen',    tag: 'PTCH' },
  { path: '/email',     icon: Mail,            label: 'Email Sender', tag: 'MAIL' },
  { path: '/crm',       icon: Kanban,          label: 'CRM',          tag: 'CRM_' },
  { path: '/analytics', icon: BarChart3,       label: 'Analytics',    tag: 'DATA' },
  { path: '/settings',  icon: Settings,        label: 'Settings',     tag: 'CONF' },
];

const bottomNavItems = [
  { path: '/',          icon: LayoutDashboard, label: 'Home' },
  { path: '/leads',     icon: Search,          label: 'Leads' },
  { path: '/analyzer',  icon: ScanSearch,      label: 'Scan' },
  { path: '/pitch',     icon: Wand2,           label: 'Pitch' },
  { path: '/email',     icon: Mail,            label: 'Email' },
  { path: '/crm',       icon: Kanban,          label: 'CRM' },
  { path: '/analytics', icon: BarChart3,       label: 'Stats' },
  { path: '/settings',  icon: Settings,        label: 'More' },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 768
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

function useIsSmall() {
  const [isSmall, setIsSmall] = useState(
    typeof window !== 'undefined' && window.innerWidth < 480
  );
  useEffect(() => {
    const handler = () => setIsSmall(window.innerWidth < 480);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isSmall;
}

export { useIsMobile };

function UserMenu({ user, logout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const isSmall = useIsSmall();

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = user?.full_name ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
  const planColors = { free: '#888', starter: '#4A9EFF', growth: '#00E5A0', agency: '#FF4500' };
  const planColor = planColors[user?.plan] || '#888';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 7,
        background: open ? 'rgba(255,69,0,0.08)' : 'transparent',
        border: '1px solid ' + (open ? 'rgba(255,69,0,0.2)' : 'var(--border-subtle)'),
        borderRadius: 8, padding: '5px 10px', cursor: 'pointer', transition: 'all 0.15s',
      }}>
        {user?.profile_picture ? (
          <img src={user.profile_picture} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--gradient-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-heading)', flexShrink: 0 }}>
            {initials}
          </div>
        )}
        <div style={{ textAlign: 'left', lineHeight: 1.2, display: isSmall ? 'none' : 'block' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.full_name || user?.email?.split('@')[0] || 'User'}</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: planColor, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>{user?.plan || 'free'}</div>
        </div>
        <ChevronDown size={12} style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
          borderRadius: 10, padding: '4px', width: 180, zIndex: 1000,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.full_name || 'User'}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
          </div>
          {[
            { label: 'Profile & Settings', icon: User, action: () => { navigate('/settings'); setOpen(false); } },
            ...(user?.is_admin ? [
              { label: 'Admin Panel', icon: Shield, action: () => { navigate('/admin'); setOpen(false); } },
              { label: 'Admin Settings', icon: Shield, action: () => { navigate('/admin/settings'); setOpen(false); } },
            ] : []),
          ].map(item => (
            <button key={item.label} onClick={item.action} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500, borderRadius: 6,
              textAlign: 'left', fontFamily: 'var(--font-body)',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <item.icon size={13} />
              {item.label}
            </button>
          ))}
          <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 4, paddingTop: 4 }}>
            <button onClick={logout} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
              color: '#FF4444', fontSize: 12, fontWeight: 600, borderRadius: 6,
              textAlign: 'left', fontFamily: 'var(--font-body)',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,68,68,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <LogOut size={13} />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [time, setTime] = useState('');
  const [sysStatus, setSysStatus] = useState({ gemini: false, smtp: false, claude: false, youtube: { configured: true, exhausted: false }, innertube: { online: true } });
  const isMobile = useIsMobile();
  const location = useLocation();
  const currentPage = navItems.find(n => n.path === location.pathname)?.label || 'ContentCrafterzz';
  const { user, logout } = useAuth();

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data } = await api.get('/assistant/status');
        setSysStatus({
          gemini: data.gemini?.configured || false,
          smtp: data.smtp?.configured || false,
          claude: data.claude?.configured || false,
          youtube: { configured: data.youtube?.configured ?? true, exhausted: data.youtube?.exhausted ?? false },
          innertube: { online: data.innertube?.online ?? true },
        });
      } catch {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>

      {/* ── Sidebar (desktop only) ─────────────────────── */}
      {!isMobile && (
        <aside className="sidebar-desktop" style={{
          width: collapsed ? 56 : 220,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
          transition: 'width 0.25s cubic-bezier(0.16,1,0.3,1)',
          position: 'relative',
          overflow: 'hidden',
        }}>

          {/* Logo */}
          <div style={{
            height: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: collapsed ? '0 11px' : '0 16px',
            borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'var(--gradient-orange)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(255,69,0,0.35)',
            }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>CC</span>
            </div>
            {!collapsed && (
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <p style={{ fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>ContentCrafterzz</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 500, letterSpacing: '0.14em', color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 2 }}>OUTREACH OS</p>
              </div>
            )}
          </div>

          {!collapsed && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600, letterSpacing: '0.2em', color: 'var(--text-muted)', padding: '14px 16px 4px' }}>MAIN</p>
          )}

          {/* Nav items */}
          <nav style={{ flex: 1, padding: '4px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
            {navItems.map(({ path, icon: Icon, label, tag }) => (
              <NavLink key={path} to={path} end={path === '/'}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: collapsed ? '11px 0' : '9px 11px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRadius: 6, marginBottom: 2,
                  fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-body)',
                  letterSpacing: '-0.01em', textDecoration: 'none',
                  transition: 'all 0.15s ease', position: 'relative',
                  border: '1px solid transparent',
                  ...(isActive
                    ? { background: 'rgba(255,69,0,0.08)', color: 'var(--accent-primary)', borderColor: 'rgba(255,69,0,0.2)' }
                    : { color: 'var(--text-secondary)' }),
                })}
                className={({ isActive }) => isActive ? '' : 'sidebar-link'}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 2, borderRadius: 99, background: 'var(--gradient-orange)' }} />}
                    <Icon size={15} style={{ flexShrink: 0 }} />
                    {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
                    {!collapsed && isActive && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'rgba(255,69,0,0.5)', letterSpacing: '0.08em' }}>{tag}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Status card */}
          {!collapsed && (
            <div style={{ margin: '0 8px 8px', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E5A0', boxShadow: '0 0 6px rgba(0,229,160,0.8)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600, letterSpacing: '0.16em', color: '#00E5A0' }}>SYSTEM ONLINE</span>
              </div>
              {[
                { label: 'SCRAPER', on: sysStatus.innertube.online },
                { label: 'YT API',  on: sysStatus.youtube.configured && !sysStatus.youtube.exhausted, warn: sysStatus.youtube.configured && sysStatus.youtube.exhausted },
                { label: 'GEMINI',  on: sysStatus.gemini },
                { label: 'SMTP',    on: sysStatus.smtp },
              ].map(item => {
                const color = item.warn ? '#F5A623' : item.on ? '#00E5A0' : '#FF4444';
                return (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>{item.label}{item.warn ? ' !' : ''}</span>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}` }} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Collapse toggle */}
          <button onClick={() => setCollapsed(c => !c)}
            style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid var(--border-subtle)', background: 'transparent', border: 'none', borderRadius: 0, cursor: 'pointer', color: 'var(--text-muted)', transition: 'color 0.15s', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        </aside>
      )}

      {/* ── Main ─────────────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Topbar */}
        <header style={{
          height: isMobile ? 48 : 56,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '0 16px' : '0 28px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!isMobile && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-muted)' }}>OUTREACH_OS</span>}
            {!isMobile && <span style={{ color: 'var(--border-strong)', fontSize: 14 }}>›</span>}
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: isMobile ? 14 : 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.025em', margin: 0 }}>
              {currentPage}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!isMobile && time && (
              <span className="topbar-clock" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{time}</span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: isMobile ? '3px 8px' : '5px 12px', borderRadius: 99, background: 'rgba(255,69,0,0.08)', border: '1px solid rgba(255,69,0,0.2)', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.14em' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-primary)', boxShadow: '0 0 6px rgba(255,69,0,0.8)', display: 'inline-block', animation: 'statusPulse 2s ease-in-out infinite' }} />
              LIVE
            </div>
            {user && <UserMenu user={user} logout={logout} />}
          </div>
        </header>

        {/* Page content */}
        <div className="page-content-scroll" style={{
          flex: 1,
          overflow: 'auto',
          padding: isMobile ? 16 : 24,
          paddingBottom: isMobile ? 80 : 24,
          background: 'var(--bg-base)',
        }}>
          <div className="page-enter">{children}</div>
        </div>
      </main>

      {/* ── Bottom Navigation (mobile only) ──────────────── */}
      <nav className="bottom-nav-bar" style={{ display: isMobile ? 'flex' : 'none' }}>
        {bottomNavItems.map(({ path, icon: Icon }) => (
          <NavLink key={path} to={path} end={path === '/'} style={{ textDecoration: 'none', flex: 1 }}>
            {({ isActive }) => (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: 60, position: 'relative',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
              }}>
                {isActive && <div className="bottom-nav-dot" />}
                <Icon size={21} style={{ marginTop: isActive ? 8 : 0 }} />
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      <AssistantChat />
    </div>
  );
}
