/* global React */
const { useState, useEffect, useRef, useMemo } = React;

/* =========================================================
   Icons — tiny inline SVG set (1.5 stroke, 16px)
   ========================================================= */
const Icon = ({ name, size = 16, className = '' }) => {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    className: `ic ${className}`,
  };
  const paths = {
    home:      <><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></>,
    users:     <><circle cx="9" cy="9" r="3.2"/><path d="M3 19c.5-3 3-5 6-5s5.5 2 6 5"/><circle cx="17" cy="8" r="2.5"/><path d="M16 14c2 0 4 1.2 5 3.5"/></>,
    rocket:    <><path d="M5 19c1-3 3-5 6-6"/><path d="M14 4c3 0 6 3 6 6-2 4-5 7-9 9l-3-3c2-4 5-7 9-9 0 0-2-2-3-3z"/><circle cx="15" cy="9" r="1.4"/></>,
    flow:      <><circle cx="6" cy="6" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="18" r="2"/><path d="M8 6h4a4 4 0 0 1 4 4M8 18h4a4 4 0 0 0 4-4"/></>,
    inbox:     <><path d="M3 13l3-8h12l3 8"/><path d="M3 13v6h18v-6"/><path d="M3 13h5l1 2h6l1-2h5"/></>,
    sparkle:   <><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6.5 6.5 2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2"/></>,
    bar:       <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    flame:     <><path d="M12 3c.5 4 4 4 4 9a4 4 0 1 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z"/></>,
    plus:      <><path d="M12 5v14M5 12h14"/></>,
    chev:      <><path d="m9 6 6 6-6 6"/></>,
    chevd:     <><path d="m6 9 6 6 6-6"/></>,
    search:    <><circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/></>,
    bell:      <><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2H4.5z"/><path d="M10 21h4"/></>,
    help:      <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7M12 17v.5"/></>,
    filter:    <><path d="M3 5h18l-7 8v6l-4 2v-8z"/></>,
    sort:      <><path d="M7 4v14M3 14l4 4 4-4M17 20V6M13 10l4-4 4 4"/></>,
    play:      <><path d="m7 5 12 7-12 7z"/></>,
    pause:     <><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></>,
    mail:      <><path d="M3 6h18v12H3z"/><path d="m3 7 9 7 9-7"/></>,
    youtube:   <><rect x="2" y="6" width="20" height="12" rx="3"/><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none"/></>,
    globe:     <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></>,
    star:      <><path d="m12 3 2.6 5.6 6.2.7-4.6 4.2 1.2 6L12 16.7 6.6 19.5l1.2-6L3.2 9.3l6.2-.7z"/></>,
    reply:     <><path d="M9 5 3 11l6 6M3 11h12a6 6 0 0 1 6 6"/></>,
    settings:  <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    cmd:       <><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/></>,
    arrowUp:   <><path d="M12 19V5M5 12l7-7 7 7"/></>,
    arrowDown: <><path d="M12 5v14M5 12l7 7 7-7"/></>,
    arrowR:    <><path d="M5 12h14M13 5l7 7-7 7"/></>,
    check:     <><path d="m5 12 5 5 9-11"/></>,
    x:         <><path d="m6 6 12 12M6 18 18 6"/></>,
    clock:     <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    target:    <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></>,
    bolt:      <><path d="M13 3 4 14h7l-1 7 9-11h-7z"/></>,
    link:      <><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></>,
    moreH:     <><circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18" cy="12" r="1.4" fill="currentColor"/></>,
    sliders:   <><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14M18 18h2"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/></>,
    eye:       <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
    pen:       <><path d="m4 20 4-1 11-11-3-3L5 16z"/><path d="m14 6 3 3"/></>,
    layers:    <><path d="m12 4 9 5-9 5-9-5z"/><path d="m3 14 9 5 9-5M3 19l9 5 9-5"/></>,
  };
  return <svg {...p}>{paths[name] || null}</svg>;
};

/* =========================================================
   Sidebar
   ========================================================= */
const NAV = [
  { id: 'dashboard', label: 'Dashboard',       icon: 'home',    tag: 'DASH' },
  { id: 'finder',    label: 'Lead Finder',     icon: 'target',  tag: 'FIND' },
  { id: 'analyzer',  label: 'Channel Analyzer',icon: 'eye',     tag: 'SCAN' },
  { id: 'pitch',     label: 'Pitch Gen',       icon: 'sparkle', tag: 'PTCH' },
  { id: 'sender',    label: 'Email Sender',    icon: 'inbox',   tag: 'MAIL', dot: true },
  { id: 'crm',       label: 'CRM',             icon: 'layers',  tag: 'CRM_' },
  { id: 'analytics', label: 'Analytics',       icon: 'bar',     tag: 'DATA' },
  { id: 'settings',  label: 'Settings',        icon: 'settings',tag: 'CONF' },
];

const Sidebar = ({ route, setRoute, openAgent }) => (
  <aside className="sb">
    <div className="sb__brand">
      <div className="sb__logo"><span>c</span></div>
      <div>
        <div className="sb__brand-name">ContentCrafterzz</div>
        <div className="muted" style={{fontSize: 10.5, marginTop: 1, fontFamily: 'var(--f-mono)', letterSpacing: '.08em'}}>OUTREACH·OS</div>
      </div>
    </div>

    <button className="sb__org" onClick={openAgent} style={{textAlign:'left', cursor:'pointer'}}>
      <div className="agent__bot-avatar" style={{width: 24, height: 24, borderRadius: 7}}/>
      <div>
        <div className="sb__org-name">Ask the agent</div>
        <div className="sb__org-role">Type or press <kbd style={{fontFamily:'var(--f-mono)', fontSize: 9.5, background:'var(--bg-2)', border:'1px solid var(--line)', padding:'0 4px', borderRadius: 3}}>⌘K</kbd></div>
      </div>
    </button>

    <div>
      <div className="sb__section">Workspace</div>
      <nav className="sb__nav">
        {NAV.map(item => (
          <NavItem key={item.id} item={item} active={route === item.id} onClick={() => setRoute(item.id)} />
        ))}
      </nav>
    </div>

    <div className="sb__foot">
      <div className="sb__credit">
        <div style={{flex:1}}>
          <div className="sb__credit-label">AI credits</div>
          <div className="sb__credit-bar" style={{marginTop: 6}}>
            <div className="sb__credit-fill" />
          </div>
        </div>
        <div className="sb__credit-meta">6.4k / 10k</div>
      </div>
      <div className="sb__org" style={{cursor:'pointer'}}>
        <div className="sb__org-ava">RR</div>
        <div>
          <div className="sb__org-name">Rocket Reach</div>
          <div className="sb__org-role">Growth · 4 seats</div>
        </div>
        <Icon name="chevd" size={14} className="sb__org-chev" />
      </div>
    </div>
  </aside>
);

const NavItem = ({ item, active, onClick }) => (
  <button className={`sb__item ${active ? 'is-active' : ''}`} onClick={onClick} data-comment-anchor={`nav-${item.id}`}>
    <Icon name={item.icon} />
    <span>{item.label}</span>
    {item.dot && <span className="sb__item-dot" style={{background: 'var(--coral)', boxShadow: '0 0 0 3px var(--coral-soft)'}} />}
    {item.tag && !item.dot && <span className="sb__item-meta" style={{opacity: active ? 0.6 : 0.4}}>{item.tag}</span>}
  </button>
);

/* =========================================================
   Topbar
   ========================================================= */
const Topbar = ({ crumbs = [], actions = null }) => (
  <header className="tb">
    <div className="tb__crumbs">
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Icon name="chev" size={12} className="tb__sep" />}
          <span className={`tb__crumb ${i === crumbs.length - 1 ? 'is-current' : ''}`}>{c}</span>
        </React.Fragment>
      ))}
    </div>

    <div className="tb__search">
      <Icon name="search" size={13} />
      <span>Search leads, campaigns, replies…</span>
      <kbd>⌘K</kbd>
    </div>

    <div className="tb__right">
      {actions}
      <button className="tb__icon-btn"><Icon name="help" /></button>
      <button className="tb__icon-btn"><Icon name="bell" /></button>
      <div className="tb__avatar">SJ</div>
    </div>
  </header>
);

/* =========================================================
   Reusable primitives
   ========================================================= */
const Stat = ({ label, value, delta, trend, mono = false, spark = null }) => (
  <div className="stat">
    <div className="stat__label">{label}</div>
    <div className={mono ? 'stat__value stat__value--mono' : 'stat__value'}>{value}</div>
    {delta != null && (
      <div className={`stat__delta ${trend === 'up' ? 'stat__delta--up' : trend === 'down' ? 'stat__delta--down' : ''}`}>
        <Icon name={trend === 'up' ? 'arrowUp' : trend === 'down' ? 'arrowDown' : 'arrowR'} size={11} />
        {delta}
      </div>
    )}
    {spark && <div className="stat__spark">{spark}</div>}
  </div>
);

const Bars = ({ data, hiIdx = -1 }) => (
  <div className="bars">
    {data.map((v, i) => (
      <span
        key={i}
        className={i === hiIdx ? 'hi' : ''}
        style={{ height: `${v}%` }}
      />
    ))}
  </div>
);

/* Smooth sparkline using SVG path */
const Sparkline = ({ data, color = 'var(--lime)', height = 36, fill = true }) => {
  const w = 200, h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const span = (max - min) || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - min) / span) * (h - 4) - 2,
  ]);
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const dFill = `${d} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width: '100%', height: h}}>
      {fill && <path d={dFill} fill={color} opacity={0.10} />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const Avatar = ({ name, color, size = 'md', img = null }) => {
  const init = (name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const cls = size === 'sm' ? 'ava ava--sm' : size === 'lg' ? 'ava ava--lg' : size === 'xl' ? 'ava ava--xl' : 'ava';
  const palette = ['#c8f654','#ff8a73','#8ec5ff','#c4b5fd','#f4ecd8','#6ee7a8','#ffd166'];
  const bg = color || palette[(name?.charCodeAt(0) ?? 0) % palette.length];
  return (
    <span className={cls} style={{background: bg}}>
      {img ? <img src={img} alt="" style={{width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover'}}/> : init}
    </span>
  );
};

const Badge = ({ children, kind = '' }) => (
  <span className={`badge ${kind ? 'badge--' + kind : ''}`}>{children}</span>
);

/* Channel icon chip — for YouTube niches etc */
const ChannelChip = ({ children, color = 'var(--rose)' }) => (
  <span className="chan"><span className="chan__dot" style={{background: color}}/>{children}</span>
);

/* Page header standard layout */
const PageHead = ({ title, sub, eyebrow, actions }) => (
  <div className="page__head">
    <div>
      {eyebrow && <div className="muted" style={{fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8}}>{eyebrow}</div>}
      <h1 className="page__title" dangerouslySetInnerHTML={{__html: title}} />
      {sub && <div className="page__sub">{sub}</div>}
    </div>
    {actions && <div className="page__actions">{actions}</div>}
  </div>
);

/* =========================================================
   System bar — bottom strip showing what's running
   ========================================================= */
const SystemBar = ({ openAgent }) => (
  <div className="sysbar">
    <span className="sysbar__svc"><span className="sysbar__dot" style={{background:'var(--lime)'}}/>SCRAPER</span>
    <span className="sysbar__svc"><span className="sysbar__dot" style={{background:'var(--lime)'}}/>YT·API</span>
    <span className="sysbar__svc"><span className="sysbar__dot" style={{background:'var(--lime)'}}/>GEMINI</span>
    <span className="sysbar__svc"><span className="sysbar__dot" style={{background:'var(--lime)'}}/>SMTP</span>
    <span className="sysbar__svc" style={{color:'var(--lime)'}}><span className="sysbar__dot dot--pulse" style={{background:'var(--lime)'}}/>2 agents working</span>
    <span className="spacer"/>
    <span style={{color:'var(--text-3)'}}>v2.4.1 · uptime 12d 4h</span>
    <span className="sysbar__svc">
      <button onClick={openAgent} style={{display:'inline-flex', alignItems:'center', gap:6, color:'var(--text-2)'}}>
        Ask agent <kbd>⌘K</kbd>
      </button>
    </span>
  </div>
);

/* =========================================================
   Agent — global slide-out
   ========================================================= */
const Agent = ({ open, onClose }) => {
  const [input, setInput] = React.useState('');
  const [thread, setThread] = React.useState([
    { from: 'bot', text: "Morning Sahil. I scraped 184 new Finance creators overnight and ran your Q2 sequence. 3 replied positively — they're waiting in your inbox." },
    { from: 'bot', action: { tag: 'COMPLETED', title: 'Scraped 184 prospects · Finance 50k-500k', running: false }},
    { from: 'bot', action: { tag: 'COMPLETED', title: 'Sent 412 emails across 4 mailboxes', running: false }},
    { from: 'bot', action: { tag: 'RUNNING',   title: 'Drafting 28 follow-ups for opens with no reply', running: true }},
  ]);

  const send = (text) => {
    const t = (text ?? input).trim();
    if (!t) return;
    setThread(prev => [
      ...prev,
      { from: 'user', text: t },
      { from: 'bot', text: "On it. I'll search Finance YouTube channels between 100k–300k subs that don't already sponsor Acorns or Public, draft a pitch for each using your standard brief, and queue them for review." },
      { from: 'bot', action: { tag: 'RUNNING', title: `Searching: ${t.slice(0, 50)}...`, running: true } },
    ]);
    setInput('');
  };

  if (!open) return null;

  return (
    <aside className="agent">
      <div className="agent__head">
        <div className="agent__avatar"/>
        <div>
          <h3>Agent</h3>
          <div className="muted">Online · model gemini-2.5-pro</div>
        </div>
        <button className="agent__close" onClick={onClose}><Icon name="x" size={14}/></button>
      </div>

      <div className="agent__body">
        {thread.map((m, i) => (
          <div key={i} className={`agent__msg agent__msg--${m.from}`}>
            {m.from === 'bot' && <div className="agent__bot-avatar"/>}
            <div className="agent__bubble">
              {m.text && <div>{m.text}</div>}
              {m.action && (
                <div className={`agent__action ${m.action.running ? 'is-running' : ''}`}>
                  <span className="tag">{m.action.tag}</span>
                  <span style={{flex: 1}}>{m.action.title}</span>
                  {m.action.running && <span className="dot dot--pulse" style={{background:'var(--lime)', width:8, height:8}}/>}
                  {!m.action.running && <Icon name="check" size={12} className="" />}
                </div>
              )}
            </div>
          </div>
        ))}

        <div className="agent__chips">
          <button className="agent__chip" onClick={() => send('Find 50 Tech creators 100k-300k subs')}>Find 50 Tech creators 100k-300k</button>
          <button className="agent__chip" onClick={() => send('Write a pitch for @MarketMavenJay')}>Write a pitch for @MarketMavenJay</button>
          <button className="agent__chip" onClick={() => send('Move all hot leads to "Call booked"')}>Move all hot leads to "Call booked"</button>
          <button className="agent__chip" onClick={() => send("Why did my reply rate drop yesterday?")}>Why did my reply rate drop?</button>
        </div>
      </div>

      <div className="agent__composer">
        <div className="agent__composer-inner">
          <textarea
            className="agent__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }}}
            placeholder="Ask the agent to find, write, send, or analyze…"
            rows={1}
          />
          <button className="agent__send" disabled={!input.trim()} onClick={() => send()}>
            <Icon name="arrowUp" size={13}/>
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
};

/* Export to window */
Object.assign(window, {
  Icon, Sidebar, Topbar, Stat, Bars, Sparkline, Avatar, Badge, ChannelChip, PageHead, NAV,
  SystemBar, Agent,
});
