import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import AssistantChat from './AssistantChat';
import { Menu, X } from 'lucide-react';

/* Grouped by the journey — same narrative as the landing page.
   Text-only: no icon glyphs in the nav, per the Ink & Champagne spec. */
const NAV_GROUPS = [
  { label: null, items: [
    { to: '/dashboard', label: 'Dashboard' },
  ]},
  { label: 'Find', items: [
    { to: '/leads',     label: 'Lead Finder' },
    { to: '/analyzer',  label: 'Channel Analyzer' },
    { to: '/quality',   label: 'Quality Leads' },
  ]},
  { label: 'Write', items: [
    { to: '/pitch',     label: 'Pitch Gen' },
  ]},
  { label: 'Send', items: [
    { to: '/email',     label: 'Email Sender', dot: true },
    { to: '/campaigns', label: 'Campaigns' },
  ]},
  { label: 'Close', items: [
    { to: '/crm',       label: 'CRM' },
  ]},
  { label: 'Measure', items: [
    { to: '/analytics', label: 'Analytics' },
  ]},
  { label: null, items: [
    { to: '/settings',  label: 'Settings' },
  ]},
];

const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

const BOTTOM_NAV = [
  { to: '/dashboard', label: 'Home' },
  { to: '/leads',     label: 'Leads' },
  { to: '/pitch',     label: 'Pitch' },
  { to: '/email',     label: 'Email', dot: true },
  { to: '/crm',       label: 'CRM' },
];

const MORE_NAV = [
  { to: '/analytics', label: 'Analytics' },
  { to: '/campaigns', label: 'Campaigns' },
  { to: '/quality',   label: 'Quality Leads' },
  { to: '/settings',  label: 'Settings' },
];

const ADMIN_ITEMS = [
  { to: '/admin', label: 'Admin' },
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
  const [moreOpen, setMoreOpen] = useState(false);

  // Close drawer + more sheet whenever route changes
  useEffect(() => { setDrawerOpen(false); setMoreOpen(false); }, [location.pathname]);

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
          flexShrink: 0, boxShadow: '0 0 12px var(--app-accent-glow)',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="var(--on-accent)" strokeLinejoin="round"/>
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

      {/* Nav items — grouped by journey stage */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {NAV_GROUPS.map((group, gi) => (
          <React.Fragment key={group.label || `g${gi}`}>
            {group.label && <div className="sb__group">{group.label}</div>}
            {group.items.map(({ to, label, dot }) => {
              const active = isActive(to);
              const taskRunning = (to === '/leads' && powerModeRunning) || (to === '/pitch' && pitchJobRunning);
              return (
                <NavLink key={to} to={to} className={`sb__nav-item${active ? ' active' : ''}`} style={{ color: active ? 'var(--lime)' : undefined }}>
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
          </React.Fragment>
        ))}

        {user?.is_admin && (
          <>
            <div className="sb__group">Admin</div>
            {ADMIN_ITEMS.map(({ to, label }) => {
              const active = isActive(to);
              return (
                <NavLink key={to} to={to} className={`sb__nav-item${active ? ' active' : ''}`} style={{ color: active ? 'var(--lime)' : undefined }}>
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

      {/* Ask Marcus + user row */}
      <div style={{ padding: '12px 8px 8px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('jack:open'))}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 8,
            background: 'var(--lime-soft)',
            border: '1px solid var(--lime-border)', color: 'var(--lime)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 150ms', marginBottom: 8,
          }}
        >
          Ask Marcus
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
            style={{ color: 'var(--text-4)', fontSize: 11, padding: '4px 6px', borderRadius: 6, transition: 'all 120ms', cursor: 'pointer', flexShrink: 0, background: 'none', border: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--bad)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; }}
          >
            Log out
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
                <path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="var(--on-accent)" strokeLinejoin="round"/>
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

        {/* ⌘K command trigger (desktop only) */}
        {!isMobile && (
          <button type="button" className="cmdk-trigger" onClick={() => window.dispatchEvent(new CustomEvent('jack:open'))}>
            <span style={{ flex: 1 }}>Search or ask Marcus…</span>
            <kbd>⌘K</kbd>
          </button>
        )}

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 'auto' }}>
          {!isMobile && (
            <a href="#" style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>Help</a>
          )}

          <button onClick={() => window.dispatchEvent(new CustomEvent('jack:open'))} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '0 10px', height: 32, borderRadius: 6,
            color: 'var(--text-2)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', background: 'var(--surface)',
            border: '1px solid var(--line-2)', transition: 'all 120ms',
          }}>
            Agent
            {!isMobile && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-4)' }}>⌘K</span>}
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
        paddingBottom: isMobile ? 'calc(60px + env(safe-area-inset-bottom, 0px))' : 0,
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
      {/* ══ Marcus AI CHAT ════════════════════════════════════════ */}
      <AssistantChat />

      {isMobile && (
        <>
          {/* More sheet backdrop */}
          <AnimatePresence>
            {moreOpen && (
              <motion.div
                key="more-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setMoreOpen(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 48 }}
              />
            )}
          </AnimatePresence>

          {/* More sheet */}
          <AnimatePresence>
            {moreOpen && (
              <motion.div
                key="more-sheet"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: 'fixed', bottom: 0, left: 0, right: 0,
                  background: 'var(--bg-2)',
                  borderTop: '1px solid var(--line)',
                  borderRadius: '16px 16px 0 0',
                  zIndex: 49,
                  paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
                  paddingTop: 12,
                }}
              >
                {/* Drag handle */}
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--line)', margin: '0 auto 16px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, padding: '0 8px 8px' }}>
                  {MORE_NAV.map(({ to, label }) => {
                    const active = isActive(to);
                    return (
                      <NavLink
                        key={to}
                        to={to}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: '18px 12px',
                          borderRadius: 12, textDecoration: 'none',
                          background: active ? 'var(--surface-hover)' : 'transparent',
                          border: `1px solid ${active ? 'var(--line-2)' : 'var(--line)'}`,
                          color: active ? 'var(--lime)' : 'var(--text-2)',
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: active ? 600 : 400 }}>{label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom nav bar */}
          <nav style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            height: 60,
            background: 'rgba(11,11,15,0.96)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderTop: '1px solid var(--line)',
            display: 'flex', alignItems: 'stretch',
            zIndex: 50,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}>
            {BOTTOM_NAV.map(({ to, label, dot }) => {
              const active = isActive(to);
              const taskDot = (to === '/leads' && powerModeRunning) || (to === '/pitch' && pitchJobRunning);
              return (
                <NavLink
                  key={to}
                  to={to}
                  style={{
                    flex: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11,
                    color: active ? 'var(--lime)' : 'var(--text-4)',
                    fontWeight: active ? 600 : 400,
                    transition: 'color 150ms',
                    position: 'relative',
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ position: 'relative' }}>
                    {label}
                    {taskDot && (
                      <span style={{ position: 'absolute', top: -8, right: -8, width: 6, height: 6, borderRadius: '50%', background: 'var(--lime)', animation: 'pulse-lime 2s infinite' }} />
                    )}
                    {dot && !taskDot && (
                      <span style={{ position: 'absolute', top: -8, right: -8, width: 6, height: 6, borderRadius: '50%', background: 'var(--coral)' }} />
                    )}
                  </span>
                  {active && (
                    <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 20, height: 2, borderRadius: 2, background: 'var(--lime)' }} />
                  )}
                </NavLink>
              );
            })}

            {/* More button */}
            <button
              onClick={() => setMoreOpen(v => !v)}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11,
                color: (moreOpen || MORE_NAV.some(n => isActive(n.to))) ? 'var(--lime)' : 'var(--text-4)',
                fontWeight: (moreOpen || MORE_NAV.some(n => isActive(n.to))) ? 600 : 400,
                background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
              }}
            >
              More
              {(moreOpen || MORE_NAV.some(n => isActive(n.to))) && (
                <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 20, height: 2, borderRadius: 2, background: 'var(--lime)' }} />
              )}
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
