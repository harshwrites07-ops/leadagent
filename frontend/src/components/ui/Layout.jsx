import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, Search, BarChart2, Mail, Users,
  Zap, Star, TrendingUp, Settings, Shield, Bell,
  HelpCircle, LogOut, Youtube, Cpu, ChevronRight,
  Sparkles,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
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

const ADMIN_ITEMS = [
  { to: '/admin', icon: Shield, label: 'Admin' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ══════════════════════════════
          SIDEBAR
      ══════════════════════════════ */}
      <aside style={{
        position: 'fixed',
        top: 0, left: 0,
        width: 'var(--sidebar-w)',
        height: '100vh',
        background: 'var(--bg-2)',
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
        overflow: 'hidden',
      }}>

        {/* Brand */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 16px',
          height: 'var(--topbar-h)',
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 28, height: 28,
            borderRadius: 6,
            background: 'var(--lime)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 0 12px rgba(200,246,84,0.4)',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="#0a0a0c" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{
              fontSize: 14, fontWeight: 700,
              letterSpacing: '-0.3px', color: 'var(--text)',
              lineHeight: 1.2,
            }}>Quelro</div>
            <div style={{
              fontSize: 9, fontWeight: 600,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: 'var(--text-4)',
              fontFamily: 'var(--f-mono)',
            }}>OUTREACH OS</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>

          <div style={{
            padding: '16px 16px 4px',
            fontSize: 9, fontWeight: 700,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: 'var(--text-4)',
            fontFamily: 'var(--f-mono)',
          }}>WORKSPACE</div>

          {NAV_ITEMS.map(({ to, icon: Icon, label, dot }) => {
            const active = isActive(to);
            return (
              <NavLink
                key={to}
                to={to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '0 12px',
                  height: 36,
                  margin: '1px 8px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--lime)' : 'var(--text-3)',
                  cursor: 'pointer',
                  transition: 'all 120ms cubic-bezier(0.16,1,0.3,1)',
                  textDecoration: 'none',
                  background: active ? 'rgba(200,246,84,0.08)' : 'transparent',
                  boxShadow: active ? 'inset 3px 0 0 var(--lime)' : 'none',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'var(--hover)';
                    e.currentTarget.style.color = 'var(--text)';
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-3)';
                  }
                }}
              >
                <Icon size={15} style={{
                  flexShrink: 0,
                  opacity: active ? 1 : 0.6,
                  color: active ? 'var(--lime)' : 'inherit',
                }} />
                {label}
                {dot && (
                  <span style={{
                    marginLeft: 'auto',
                    width: 6, height: 6,
                    borderRadius: '50%',
                    background: 'var(--coral)',
                    boxShadow: '0 0 6px var(--coral)',
                    animation: 'pulse-coral 2s infinite',
                  }} />
                )}
              </NavLink>
            );
          })}

          {user?.is_admin && (
            <>
              <div style={{
                padding: '16px 16px 4px',
                fontSize: 9, fontWeight: 700,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: 'var(--text-4)',
                fontFamily: 'var(--f-mono)',
              }}>ADMIN</div>
              {ADMIN_ITEMS.map(({ to, icon: Icon, label }) => {
                const active = isActive(to);
                return (
                  <NavLink key={to} to={to} style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '0 12px', height: 36, margin: '1px 8px',
                    borderRadius: 6, fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    color: active ? 'var(--lime)' : 'var(--text-3)',
                    textDecoration: 'none',
                    background: active ? 'rgba(200,246,84,0.08)' : 'transparent',
                    boxShadow: active ? 'inset 3px 0 0 var(--lime)' : 'none',
                    transition: 'all 120ms',
                  }}>
                    <Icon size={15} style={{ flexShrink: 0, opacity: active ? 1 : 0.6 }} />
                    {label}
                  </NavLink>
                );
              })}
            </>
          )}
        </nav>

        {/* Ask Jack + User */}
        <div style={{ padding: '12px 8px 8px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
          <button style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(200,246,84,0.1) 0%, rgba(200,246,84,0.05) 100%)',
            border: '1px solid rgba(200,246,84,0.2)',
            color: 'var(--lime)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 150ms',
            marginBottom: 8,
          }}>
            <Sparkles size={13} />
            Ask Jack
            <span style={{
              marginLeft: 'auto',
              fontFamily: 'var(--f-mono)',
              fontSize: 9,
              color: 'var(--text-4)',
              background: 'var(--surface-3)',
              padding: '2px 5px',
              borderRadius: 3,
            }}>⌘K</span>
          </button>

          {/* User row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 4px',
          }}>
            <div style={{
              width: 28, height: 28,
              borderRadius: '50%',
              background: 'var(--surface-3)',
              border: '1px solid var(--line-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-2)',
              flexShrink: 0,
            }}>
              {displayName[0]?.toUpperCase() || 'U'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 600,
                color: 'var(--text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {displayName}
              </div>
              <div style={{
                fontSize: 9,
                color: 'var(--text-4)',
                fontFamily: 'var(--f-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                {userPlan}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Log out"
              style={{
                color: 'var(--text-4)',
                padding: 4,
                borderRadius: 6,
                transition: 'all 120ms',
                cursor: 'pointer',
                flexShrink: 0,
                background: 'none',
                border: 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--bad)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ══════════════════════════════
          TOPBAR
      ══════════════════════════════ */}
      <header style={{
        position: 'fixed',
        top: 0,
        left: 'var(--sidebar-w)',
        right: 0,
        height: 'var(--topbar-h)',
        background: 'rgba(10,10,12,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 12,
        zIndex: 30,
      }}>
        {/* Page label */}
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-3)',
          whiteSpace: 'nowrap',
        }}>
          {[...NAV_ITEMS, ...ADMIN_ITEMS].find(i => isActive(i.to))?.label || 'Quelro'}
        </span>

        {/* Search bar */}
        <div style={{
          flex: 1,
          maxWidth: 400,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: '0 12px',
          height: 34,
          fontSize: 13,
          color: 'var(--text-3)',
          cursor: 'pointer',
          transition: 'border-color 120ms',
        }}>
          <Search size={13} style={{ flexShrink: 0, opacity: 0.5 }} />
          <span style={{ flex: 1, fontSize: 12 }}>Search leads, campaigns, replies...</span>
          <span style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 9,
            color: 'var(--text-4)',
            background: 'var(--surface-3)',
            padding: '2px 5px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
          }}>⌘K</span>
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <button
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 6,
              color: 'var(--text-3)', cursor: 'pointer',
              transition: 'all 120ms',
              background: 'transparent',
              border: 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; }}
          >
            <Bell size={15} />
          </button>

          <button
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 6,
              color: 'var(--text-3)', cursor: 'pointer',
              transition: 'all 120ms',
              background: 'transparent',
              border: 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; }}
          >
            <HelpCircle size={15} />
          </button>

          <button
            style={{
              display: 'flex', alignItems: 'center',
              gap: 6, padding: '0 12px',
              height: 32, borderRadius: 6,
              color: 'var(--text-2)',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              background: 'var(--surface)',
              border: '1px solid var(--line-2)',
              transition: 'all 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--lime-border)'; e.currentTarget.style.color = 'var(--lime)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.color = 'var(--text-2)'; }}
          >
            <Cpu size={13} />
            Agent
            <span style={{
              fontFamily: 'var(--f-mono)', fontSize: 9,
              color: 'var(--text-4)',
            }}>⌘K</span>
          </button>
        </div>
      </header>

      {/* ══════════════════════════════
          MAIN CONTENT
      ══════════════════════════════ */}
      <main style={{
        marginLeft: 'var(--sidebar-w)',
        marginTop: 'var(--topbar-h)',
        flex: 1,
        minHeight: 'calc(100vh - var(--topbar-h))',
        width: 'calc(100vw - var(--sidebar-w))',
      }}>
        {children}
      </main>
    </div>
  );
}
