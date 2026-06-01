import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import TrialBanner from './TrialBanner';
import UpgradeWall from './UpgradeWall';

export function useIsMobile() {
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

const NAV = [
  { path: '/',          label: 'Dashboard',       icon: 'home',     tag: 'DASH' },
  { path: '/leads',     label: 'Lead Finder',     icon: 'target',   tag: 'FIND' },
  { path: '/analyzer',  label: 'Channel Analyzer',icon: 'eye',      tag: 'SCAN' },
  { path: '/pitch',     label: 'Pitch Gen',       icon: 'sparkle',  tag: 'PTCH' },
  { path: '/email',     label: 'Email Sender',    icon: 'inbox',    tag: 'MAIL', dot: true },
  { path: '/crm',       label: 'CRM',             icon: 'layers',   tag: 'CRM_' },
  { path: '/analytics', label: 'Analytics',       icon: 'bar',      tag: 'DATA' },
  { path: '/settings',  label: 'Settings',        icon: 'settings', tag: 'CONF' },
];

const ROUTE_CRUMBS = {
  '/':          ['Dashboard'],
  '/leads':     ['Outreach', 'Lead Finder'],
  '/analyzer':  ['Outreach', 'Channel Analyzer'],
  '/pitch':     ['Outreach', 'Pitch Gen'],
  '/email':     ['Outreach', 'Email Sender'],
  '/crm':       ['CRM'],
  '/analytics': ['Analytics'],
  '/settings':  ['Settings'],
  '/admin':     ['Admin'],
  '/admin/settings': ['Admin', 'Settings'],
};

const SUGGESTED = [
  'Find 50 Tech creators 100k–300k',
  'Why did my reply rate drop?',
  'Launch a Finance campaign',
  'Show me hot leads in CRM',
];

/* ── Sysbar ─────────────────────────────────────────────── */
function Sysbar({ sysStatus, onOpenAgent, agentOpen }) {
  const services = [
    { label: 'SCRAPER', on: sysStatus.innertube?.online ?? true },
    { label: 'YT·API',  on: sysStatus.youtube?.configured && !sysStatus.youtube?.exhausted, warn: sysStatus.youtube?.configured && sysStatus.youtube?.exhausted },
    { label: 'GEMINI',  on: sysStatus.gemini },
    { label: 'SMTP',    on: sysStatus.smtp },
  ];

  return (
    <div className={`sysbar${agentOpen ? ' sysbar--agent' : ''}`} style={agentOpen ? { right: 420 } : {}}>
      {services.map(s => {
        const color = s.warn ? 'var(--warn)' : s.on ? 'var(--lime)' : 'var(--bad)';
        return (
          <span key={s.label} className="sysbar__svc">
            <span className="sysbar__dot" style={{ background: color }} />
            {s.label}{s.warn ? '!' : ''}
          </span>
        );
      })}
      <span className="spacer" />
      <span style={{ color: 'var(--text-4)', fontSize: 10.5 }}>v2.4.1</span>
      <span className="sysbar__svc">
        <button
          onClick={onOpenAgent}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--f-mono)', fontSize: 10.5 }}
        >
          Ask agent <kbd>⌘K</kbd>
        </button>
      </span>
    </div>
  );
}

/* ── Agent Panel ─────────────────────────────────────────── */
function AgentPanel({ onClose }) {
  const [messages, setMessages] = useState([
    { role: 'bot', text: "Hey — I'm your outreach agent. What do you want to work on?" },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setLoading(true);
    try {
      const { data } = await api.post('/assistant/chat', { message: msg });
      setMessages(prev => [...prev, { role: 'bot', text: data.reply || data.message || 'Done.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'Something went wrong. Try again.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  return (
    <aside className="agent">
      <div className="agent__head">
        <div className="agent__avatar" />
        <div>
          <h3>Agent</h3>
          <div className="muted">Online · gemini-2.5-pro</div>
        </div>
        <button className="agent__close" onClick={onClose}><Icon name="x" size={14} /></button>
      </div>

      <div className="agent__body">
        {messages.map((m, i) => (
          <div key={i} className={`agent__msg agent__msg--${m.role}`}>
            {m.role === 'bot' && <div className="agent__bot-avatar" />}
            <div className="agent__bubble">
              <div>{m.text}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="agent__msg agent__msg--bot">
            <div className="agent__bot-avatar" />
            <div className="agent__bubble">
              <div style={{ color: 'var(--text-3)' }}>Thinking…</div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />

        <div className="agent__chips">
          {SUGGESTED.map(s => (
            <button key={s} className="agent__chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      </div>

      <div className="agent__composer">
        <div className="agent__composer-inner">
          <textarea
            className="agent__input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask the agent to find, write, send, or analyze…"
            rows={1}
          />
          <button className="agent__send" disabled={!input.trim() || loading} onClick={() => send()}>
            <Icon name="arrowUp" size={13} />
          </button>
        </div>
        <div className="agent__hint">
          <span><kbd>↵</kbd> send</span>
          <span><kbd>⇧↵</kbd> new line</span>
          <span><kbd>⌘K</kbd> toggle</span>
        </div>
      </div>
    </aside>
  );
}

/* ── User dropdown ───────────────────────────────────────── */
function UserMenu({ user, logout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : (user?.email?.[0] || '?').toUpperCase();

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="tb__avatar"
        style={{ cursor: 'pointer', border: 'none' }}
        title={user?.full_name || user?.email}
      >
        {user?.profile_picture
          ? <img src={user.profile_picture} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
          : initials
        }
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: 'var(--surface)', border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-md)', padding: 4, width: 190, zIndex: 1000,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.full_name || 'User'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--f-mono)' }}>
              {user?.email}
            </div>
          </div>
          {[
            { label: 'Profile & Settings', icon: 'settings', action: () => { navigate('/settings'); setOpen(false); } },
            ...(user?.is_admin ? [
              { label: 'Admin Panel', icon: 'shield', action: () => { navigate('/admin'); setOpen(false); } },
              { label: 'Admin Settings', icon: 'shield', action: () => { navigate('/admin/settings'); setOpen(false); } },
            ] : []),
          ].map(item => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-2)', fontSize: 12, fontWeight: 500, borderRadius: 6,
                textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <Icon name={item.icon} size={13} />
              {item.label}
            </button>
          ))}
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4 }}>
            <button
              onClick={logout}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--bad)', fontSize: 12, fontWeight: 600, borderRadius: 6,
                textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--coral-soft)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <Icon name="logout" size={13} />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Layout ─────────────────────────────────────────────── */
export default function Layout({ children }) {
  const [agentOpen, setAgentOpen] = useState(false);
  const [sysStatus, setSysStatus] = useState({
    gemini: false, smtp: false,
    youtube: { configured: true, exhausted: false },
    innertube: { online: true },
  });
  const location = useLocation();
  const isMobile = useIsMobile();
  const { user, logout, trialExpired } = useAuth();

  const crumbs = ROUTE_CRUMBS[location.pathname] || ['ContentCrafterzz'];

  useEffect(() => {
    const toggle = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setAgentOpen(o => !o);
      }
    };
    document.addEventListener('keydown', toggle);
    return () => document.removeEventListener('keydown', toggle);
  }, []);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data } = await api.get('/assistant/status');
        setSysStatus({
          gemini: data.gemini?.configured || false,
          smtp: data.smtp?.configured || false,
          youtube: { configured: data.youtube?.configured ?? true, exhausted: data.youtube?.exhausted ?? false },
          innertube: { online: data.innertube?.online ?? true },
        });
      } catch {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
        <header style={{
          height: 48, flexShrink: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '0 16px',
          background: 'var(--bg-2)', borderBottom: '1px solid var(--line)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="sb__logo" style={{ width: 24, height: 24 }}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="#0a0a0c" strokeLinejoin="round"/>
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600 }}>ContentCrafterzz</span>
          </div>
          {user && <UserMenu user={user} logout={logout} />}
        </header>
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 60 }}>
          {children}
        </div>
        <nav className="bottom-nav-bar">
          {NAV.slice(0, 6).map(({ path, icon, label }) => (
            <NavLink key={path} to={path} end={path === '/'} style={{ textDecoration: 'none', flex: 1 }}>
              {({ isActive }) => (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', height: 60, position: 'relative',
                  color: isActive ? 'var(--lime)' : 'var(--text-3)',
                }}>
                  {isActive && <div className="bottom-nav-dot" />}
                  <Icon name={icon} size={20} style={{ marginTop: isActive ? 8 : 0 }} />
                </div>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className={`app${agentOpen ? ' agent-open' : ''}`}>
      {/* ── Sidebar ── */}
      <aside className="sb">
        <div className="sb__brand">
          <div className="sb__logo">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="#0a0a0c" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div className="sb__brand-name">ContentCrafterzz</div>
            <div className="muted" style={{ fontSize: 10.5, marginTop: 1, fontFamily: 'var(--f-mono)', letterSpacing: '.08em' }}>OUTREACH·OS</div>
          </div>
        </div>

        <button className="sb__org" onClick={() => setAgentOpen(true)}>
          <div className="agent__bot-avatar" style={{ width: 24, height: 24, borderRadius: 7 }} />
          <div>
            <div className="sb__org-name">Ask the agent</div>
            <div className="sb__org-role">
              Press <kbd style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, background: 'var(--bg-2)', border: '1px solid var(--line)', padding: '0 4px', borderRadius: 3 }}>⌘K</kbd>
            </div>
          </div>
        </button>

        <div>
          <div className="sb__section">Workspace</div>
          <nav className="sb__nav">
            {NAV.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => `sb__item${isActive ? ' is-active' : ''}`}
              >
                {({ isActive }) => (
                  <>
                    <Icon name={item.icon} size={15} />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.dot && !isActive && <span className="sb__item-dot" />}
                    {item.tag && !item.dot && (
                      <span className="sb__item-meta" style={{ opacity: isActive ? 0.6 : 0.4 }}>{item.tag}</span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sb__foot">
          <div className="sb__credit">
            <div style={{ flex: 1 }}>
              <div className="sb__credit-label">AI credits</div>
              <div className="sb__credit-bar" style={{ marginTop: 6 }}>
                <div className="sb__credit-fill" />
              </div>
            </div>
            <div className="sb__credit-meta">6.4k / 10k</div>
          </div>
          {user && (
            <div className="sb__org" style={{ cursor: 'default' }}>
              <div className="sb__org-ava" style={{ fontSize: 10, fontWeight: 700 }}>
                {(user.full_name || user.email || '?').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="sb__org-name">{user.full_name || user.email}</div>
                <div className="sb__org-role">{user.plan || 'Free'} plan</div>
              </div>
              <UserMenu user={user} logout={logout} />
            </div>
          )}
        </div>
      </aside>

      {/* ── Upgrade wall (trial expired) ── */}
      {trialExpired && <UpgradeWall />}

      {/* ── Main ── */}
      <main className="main">
        {/* Trial countdown banner */}
        <TrialBanner />
        {/* Topbar */}
        <header className="tb">
          <div className="tb__crumbs">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Icon name="chev" size={12} className="tb__sep" />}
                <span className={`tb__crumb${i === crumbs.length - 1 ? ' is-current' : ''}`}>{c}</span>
              </React.Fragment>
            ))}
          </div>

          <div className="tb__search">
            <Icon name="search" size={13} />
            <span>Search leads, campaigns, replies…</span>
            <kbd>⌘K</kbd>
          </div>

          <div className="tb__right">
            <button className="btn btn--ghost btn--sm" onClick={() => setAgentOpen(true)}>
              <Icon name="sparkle" size={11} />Agent <kbd style={{ fontFamily: 'var(--f-mono)', fontSize: 10, padding: '0 4px', borderRadius: 3, background: 'var(--bg-2)', border: '1px solid var(--line)', marginLeft: 2 }}>⌘K</kbd>
            </button>
            <button className="tb__icon-btn"><Icon name="help" /></button>
            <button className="tb__icon-btn"><Icon name="bell" /></button>
          </div>
        </header>

        {/* Page scroll container */}
        <div className="page-content-scroll" style={{ overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </main>

      {/* ── Agent slide-out ── */}
      {agentOpen && <AgentPanel onClose={() => setAgentOpen(false)} />}

      {/* ── Sysbar ── */}
      <Sysbar sysStatus={sysStatus} onOpenAgent={() => setAgentOpen(o => !o)} agentOpen={agentOpen} />
    </div>
  );
}
