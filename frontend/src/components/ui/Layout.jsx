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
  return (
    <div className={`sysbar${agentOpen ? ' sysbar--agent' : ''}`} style={agentOpen ? { right: 420 } : {}}>
      <span style={{ color: 'var(--text-4)', fontSize: 10.5, fontFamily: 'var(--f-mono)' }}>v2.5.0</span>
      <span className="spacer" />
      <span className="sysbar__svc">
        <button
          onClick={onOpenAgent}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--f-mono)', fontSize: 10.5 }}
        >
          Ask Jack <kbd>⌘K</kbd>
        </button>
      </span>
    </div>
  );
}

/* ── Agent Panel ─────────────────────────────────────────── */
function AgentPanel({ onClose }) {
  const [messages, setMessages] = useState([
    { role: 'bot', text: "Hey — I'm Jack, your outreach agent. Tell me what to do: find leads, write emails, send pitches, anything." },
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
      // Build conversation history for context
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'bot')
        .map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text }));
      history.push({ role: 'user', content: msg });
      const { data } = await api.post('/assistant/chat', { messages: history });
      setMessages(prev => [...prev, { role: 'bot', text: data.reply || data.message || 'Done.' }]);
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Something went wrong.';
      setMessages(prev => [...prev, { role: 'bot', text: errMsg }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  return (
    <aside className="agent">
      <div className="agent__head">
        <div className="agent__avatar" />
        <div>
          <h3>Jack</h3>
          <div className="muted">Online · your outreach agent</div>
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
            placeholder="Ask Jack to find leads, write emails, send pitches…"
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

/* ── User section (inline, no floating) ─────────────────── */
function UserFooter({ user, logout }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="sb__org" style={{ cursor: 'default' }}>
        <div className="sb__org-ava" style={{ fontSize: 10, fontWeight: 700 }}>
          {(user?.full_name || user?.email || '?').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sb__org-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.full_name || user?.email}</div>
          <div className="sb__org-role">{user?.plan || 'Free'} plan</div>
        </div>
      </div>
      <button
        onClick={logout}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '8px 12px', background: 'var(--coral-soft)',
          border: '1px solid var(--coral-border, #ff6b6b44)',
          cursor: 'pointer', color: 'var(--bad)', fontSize: 12, fontWeight: 600,
          borderRadius: 'var(--r)', textAlign: 'center',
        }}
      >
        <Icon name="logout" size={13} /> Sign Out
      </button>
    </div>
  );
}

/* ── Layout ─────────────────────────────────────────────── */
export default function Layout({ children }) {
  const [agentOpen, setAgentOpen] = useState(false);
  const [sysStatus, setSysStatus] = useState({ gemini: false, smtp: false, youtube: { configured: true, exhausted: false }, innertube: { online: true } });
  const [emailUsage, setEmailUsage] = useState({ sent: 0, limit: 500 });
  const location = useLocation();
  const isMobile = useIsMobile();
  const { user, logout, trialExpired } = useAuth();

  const crumbs = ROUTE_CRUMBS[location.pathname] || ['Quelro'];

  useEffect(() => {
    const toggle = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setAgentOpen(o => !o); }
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
        if (data.smtp?.sent_today !== undefined) {
          setEmailUsage({ sent: data.smtp.sent_today || 0, limit: data.smtp.daily_limit || 500 });
        }
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
            <span style={{ fontSize: 13, fontWeight: 600 }}>Quelro</span>
          </div>
          {user && <UserFooter user={user} logout={logout} />}
        </header>
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 60 }}>
          {children}
        </div>
        <nav className="bottom-nav-bar">
          {[
            { path: '/',          icon: 'home',    label: 'Home' },
            { path: '/leads',     icon: 'target',  label: 'Leads' },
            { path: '/pitch',     icon: 'sparkle', label: 'Pitch' },
            { path: '/email',     icon: 'inbox',   label: 'Email' },
            { path: '/crm',       icon: 'layers',  label: 'CRM' },
            { path: '/analytics', icon: 'bar',     label: 'Stats' },
            { path: '/settings',  icon: 'settings',label: 'Settings' },
          ].map(({ path, icon, label }) => (
            <NavLink key={path} to={path} end={path === '/'} style={{ textDecoration: 'none', flex: 1 }}>
              {({ isActive }) => (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', height: 60, gap: 3, position: 'relative',
                  color: isActive ? 'var(--lime)' : 'var(--text-3)',
                }}>
                  {isActive && <div className="bottom-nav-dot" />}
                  <Icon name={icon} size={18} />
                  <span style={{ fontSize: 9, fontFamily: 'var(--f-mono)', letterSpacing: '.04em' }}>{label}</span>
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
            <div className="sb__brand-name">Quelro</div>
            <div className="muted" style={{ fontSize: 10.5, marginTop: 1, fontFamily: 'var(--f-mono)', letterSpacing: '.08em' }}>OUTREACH·OS</div>
          </div>
        </div>

        <button className="sb__org" onClick={() => setAgentOpen(true)}>
          <div className="agent__bot-avatar" style={{ width: 24, height: 24, borderRadius: 7 }} />
          <div>
            <div className="sb__org-name">Ask Jack</div>
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
            {user?.is_admin && (
              <NavLink to="/admin" className={({ isActive }) => `sb__item${isActive ? ' is-active' : ''}`}>
                {({ isActive }) => (
                  <>
                    <Icon name="settings" size={15} />
                    <span style={{ flex: 1 }}>Admin</span>
                    <span className="sb__item-meta" style={{ opacity: isActive ? 0.6 : 0.4, color: 'var(--lime)' }}>ADMN</span>
                  </>
                )}
              </NavLink>
            )}
          </nav>
        </div>

        <div className="sb__foot">
          <div className="sb__credit">
            <div style={{ flex: 1 }}>
              <div className="sb__credit-label">Emails this month</div>
              <div className="sb__credit-bar" style={{ marginTop: 6 }}>
                <div className="sb__credit-fill" style={{ width: `${Math.min(100, Math.round((emailUsage.sent / Math.max(1, emailUsage.limit)) * 100))}%` }} />
              </div>
            </div>
            <div className="sb__credit-meta">{emailUsage.sent.toLocaleString()} / {emailUsage.limit.toLocaleString()}</div>
          </div>
          {user && <UserFooter user={user} logout={logout} />}
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
