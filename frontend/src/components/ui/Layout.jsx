import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import {
  LayoutDashboard, Search, BarChart2, Mail, Users,
  Zap, Star, TrendingUp, Settings, Shield, Bell,
  HelpCircle, LogOut, Youtube, Cpu,
  Sparkles, Menu, X,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads',     icon: Search,          label: 'Lead Finder' },
  { to: '/analyzer',  icon: Youtube,         label: 'Channel Analyzer' },
  { to: '/pitch',     icon: Zap,             label: 'Pitch Gen' },
  { to: '/email',     icon: Mail,            label: 'Email Sender', dot: true },
  { to: '/crm',       icon: Users,           label: 'CRM' },
  { to: '/campaigns', icon: TrendingUp,      label: 'Campaigns' },
  { to: '/quality',   icon: Star,            label: 'Quality Leads' },
  { to: '/analytics', icon: BarChart2,       label: 'Analytics' },
  { to: '/settings',  icon: Settings,        label: 'Settings' },
];

const BOTTOM_NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/leads',     icon: Search,          label: 'Leads' },
  { to: '/pitch',     icon: Zap,             label: 'Pitch' },
  { to: '/email',     icon: Mail,            label: 'Email', dot: true },
  { to: '/crm',       icon: Users,           label: 'CRM' },
];

const ADMIN_ITEMS = [
  { to: '/admin', icon: Shield, label: 'Admin' },
];

function useMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 860);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 860);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return isMobile;
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { backgroundTasks, powerModeRunning, pitchJobRunning } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer whenever route changes
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (to) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname.startsWith(to);
  };

  const displayName = user?.full_name || user?.name || 'User';
  const userPlan = user?.plan || 'free';

  // ─── Sidebar inner content (reused in desktop + mobile drawer) ───────────────
  const SidebarNav = ({ onClose }) => (
    <>
      {/* Brand row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 16px', height: 'var(--topbar-h)',
        borderBottom: '1px solid var(--line)', flexShrink: 0,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: 'var(--lime)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, boxShadow: '0 0 12px rgba(200,246,84,0.35)',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="#0a0a0c" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.3px', color: 'var(--text)', lineHeight: 1.2 }}>Quelro</div>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-4)', fontFamily: 'var(--f-mono)' }}>OUTREACH OS</div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex' }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        <div style={{ padding: '16px 16px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-4)', fontFamily: 'var(--f-mono)' }}>
          WORKSPACE
        </div>

        {NAV_ITEMS.map(({ to, icon: Icon, label, dot }) => {
          const active = isActive(to);
          const taskRunning = (to === '/leads' && powerModeRunning) || (to === '/pitch' && pitchJobRunning);
          return (
            <NavLink key={to} to={to} className={`sb__nav-item${active ? ' active' : ''}`}>
              <Icon size={15} style={{ flexShrink: 0, opacity: active ? 1 : 0.6, color: active ? 'var(--lime)' : 'inherit' }} />
              {label}
              {taskRunning && (
                <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: 'var(--lime)', boxShadow: '0 0 6px var(--lime)', animation: 'pulse-lime 2s infinite' }} />
              )}
              {dot && !taskRunning && (
                <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: 'var(--coral)', boxShadow: '0 0 6px var(--coral)', animation: 'pulse-coral 2s infinite' }} />
              )}
            </NavLink>
          );
        })}

        {user?.is_admin && (
          <>
            <div style={{ padding: '16px 16px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-4)', fontFamily: 'var(--f-mono)' }}>ADMIN</div>
            {ADMIN_ITEMS.map(({ to, icon: Icon, label }) => {
              const active = isActive(to);
              return (
                <NavLink key={to} to={to} className={`sb__nav-item${active ? ' active' : ''}`}>
                  <Icon size={15} style={{ flexShrink: 0, opacity: active ? 1 : 0.6 }} />
                  {label}
                </NavLink>
              );
            })}
          </>
        )}
      </nav>

      {/* Background tasks */}
      <AnimatePresence>
        {backgroundTasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.16,1,0.3,1] }}
            style={{ borderTop: '1px solid var(--line)', flexShrink: 0, overflow: 'hidden' }}
          >
            <div style={{ padding: '8px 8px 4px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-4)', fontFamily: 'var(--f-mono)', padding: '0 4px', marginBottom: 4 }}>RUNNING</div>
              {backgroundTasks.map(task => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  onClick={() => task.page && (window.location.href = task.page)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11, color: 'var(--text-2)', cursor: task.page ? 'pointer' : 'default', marginBottom: 4 }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lime)', boxShadow: '0 0 5px var(--lime)', animation: 'pulse-lime 2s infinite', flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ask Jack + user row */}
      <div style={{ padding: '12px 8px 8px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
        <button style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8,
          background: 'linear-gradient(135deg,rgba(200,246,84,0.1) 0%,rgba(200,246,84,0.05) 100%)',
          border: '1px solid rgba(200,246,84,0.2)', color: 'var(--lime)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 150ms', marginBottom: 8,
        }}>
          <Sparkles size={13} />
          Ask Jack
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-4)', background: 'var(--surface-3)', padding: '2px 5px', borderRadius: 3 }}>⌘K</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--surface-3)', border: '1px solid var(--line-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0,
          }}>
            {displayName[0]?.toUpperCase() || 'U'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
            <div style={{ fontSize: 9, color: 'var(--text-4)', fontFamily: 'var(--f-mono)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{userPlan}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            style={{ color: 'var(--text-4)', padding: 4, borderRadius: 6, transition: 'all 120ms', cursor: 'pointer', flexShrink: 0, background: 'none', border: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--bad)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ══ DESKTOP SIDEBAR ══════════════════════════════════════ */}
      {!isMobile && (
        <aside style={{
          position: 'fixed', top: 0, left: 0,
          width: 'var(--sidebar-w)', height: '100vh',
          background: 'var(--bg-2)', borderRight: '1px solid var(--line)',
          display: 'flex', flexDirection: 'column',
          zIndex: 40, overflow: 'hidden',
        }}>
          <SidebarNav />
        </aside>
      )}

      {/* ══ MOBILE DRAWER + BACKDROP ═════════════════════════════ */}
      <AnimatePresence>
        {isMobile && drawerOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.65)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                zIndex: 45,
              }}
            />
            <motion.aside
              key="drawer"
              initial={{ x: -270 }}
              animate={{ x: 0 }}
              exit={{ x: -270 }}
              transition={{ duration: 0.25, ease: [0.16,1,0.3,1] }}
              style={{
                position: 'fixed', top: 0, left: 0,
                width: 264, height: '100vh',
                background: 'var(--bg-2)', borderRight: '1px solid var(--line)',
                display: 'flex', flexDirection: 'column',
                zIndex: 50, overflow: 'hidden',
              }}
            >
              <SidebarNav onClose={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ══ TOPBAR ═══════════════════════════════════════════════ */}
      <header style={{
        position: 'fixed', top: 0,
        left: isMobile ? 0 : 'var(--sidebar-w)',
        right: 0,
        height: 'var(--topbar-h)',
        background: 'rgba(10,10,12,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center',
        padding: isMobile ? '0 12px' : '0 24px',
        gap: 10, zIndex: 30,
      }}>
        {/* Hamburger (mobile) */}
        {isMobile && (
          <button
            onClick={() => setDrawerOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 8, flexShrink: 0,
              background: 'var(--surface)', border: '1px solid var(--line)',
              color: 'var(--text-2)', cursor: 'pointer',
            }}
          >
            <Menu size={16} />
          </button>
        )}

        {/* Logo on mobile */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 5,
              background: 'var(--lime)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="#0a0a0c" strokeLinejoin="round"/>
              </svg>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Quelro</span>
          </div>
        )}

        {/* Page label (desktop) */}
        {!isMobile && (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {[...NAV_ITEMS, ...ADMIN_ITEMS].find(i => isActive(i.to))?.label || 'Quelro'}
          </span>
        )}

        {/* Search (desktop only) */}
        {!isMobile && (
          <div style={{
            flex: 1, maxWidth: 400,
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 8, padding: '0 12px',
            height: 34, color: 'var(--text-3)', cursor: 'pointer',
          }}>
            <Search size={13} style={{ flexShrink: 0, opacity: 0.5 }} />
            <span style={{ flex: 1, fontSize: 12 }}>Search leads, campaigns, replies...</span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-4)', background: 'var(--surface-3)', padding: '2px 5px', borderRadius: 3 }}>⌘K</span>
          </div>
        )}

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          {!isMobile && (
            <>
              <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 6, color: 'var(--text-3)', cursor: 'pointer', background: 'transparent', border: 'none' }}>
                <Bell size={15} />
              </button>
              <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 6, color: 'var(--text-3)', cursor: 'pointer', background: 'transparent', border: 'none' }}>
                <HelpCircle size={15} />
              </button>
            </>
          )}

          <button style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '0 10px', height: 32, borderRadius: 6,
            color: 'var(--text-2)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', background: 'var(--surface)',
            border: '1px solid var(--line-2)', transition: 'all 120ms',
          }}>
            <Cpu size={13} />
            {!isMobile && <>Agent <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-4)' }}>⌘K</span></>}
          </button>
        </div>
      </header>

      {/* ══ MAIN CONTENT ═════════════════════════════════════════ */}
      <main style={{
        marginLeft: isMobile ? 0 : 'var(--sidebar-w)',
        marginTop: 'var(--topbar-h)',
        flex: 1,
        minHeight: 'calc(100vh - var(--topbar-h))',
        width: isMobile ? '100vw' : `calc(100vw - var(--sidebar-w))`,
        overflowX: 'hidden',
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ minHeight: '100%' }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ══ MOBILE BOTTOM NAV ════════════════════════════════════ */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: 60,
          background: 'rgba(11,11,15,0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--line)',
          display: 'flex', alignItems: 'stretch',
          zIndex: 40,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
          {BOTTOM_NAV.map(({ to, icon: Icon, label, dot }) => {
            const active = isActive(to);
            const taskDot = (to === '/leads' && powerModeRunning) || (to === '/pitch' && pitchJobRunning);
            return (
              <NavLink
                key={to}
                to={to}
                style={{
                  flex: 1,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 3, fontSize: 9.5,
                  color: active ? 'var(--lime)' : 'var(--text-4)',
                  fontWeight: active ? 600 : 400,
                  transition: 'color 150ms',
                  position: 'relative',
                  textDecoration: 'none',
                  paddingBottom: 2,
                }}
              >
                <div style={{ position: 'relative' }}>
                  <Icon size={18} />
                  {taskDot && (
                    <span style={{
                      position: 'absolute', top: -3, right: -3,
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'var(--lime)',
                      animation: 'pulse-lime 2s infinite',
                    }} />
                  )}
                  {dot && !taskDot && (
                    <span style={{
                      position: 'absolute', top: -3, right: -3,
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'var(--coral)',
                    }} />
                  )}
                </div>
                {label}
                {active && (
                  <span style={{
                    position: 'absolute', top: 0, left: '50%',
                    transform: 'translateX(-50%)',
                    width: 20, height: 2, borderRadius: 2,
                    background: 'var(--lime)',
                  }} />
                )}
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}
