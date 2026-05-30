/* global React, Icon, Avatar, Badge, ChannelChip, PageHead */
const { useState: useStateFinder } = React;

const NICHES = [
  { id: 'finance',  name: 'Finance',  count: '3.2k', color: 'var(--lime)' },
  { id: 'tech',     name: 'Tech',     count: '2.8k', color: 'var(--sky)' },
  { id: 'fitness',  name: 'Fitness',  count: '1.6k', color: 'var(--coral)' },
  { id: 'cooking',  name: 'Cooking',  count: '1.9k', color: 'var(--cream)' },
  { id: 'gaming',   name: 'Gaming',   count: '1.2k', color: 'var(--violet)' },
  { id: 'design',   name: 'Design',   count: '832',  color: 'var(--sky)' },
  { id: 'travel',   name: 'Travel',   count: '692',  color: 'var(--coral)' },
  { id: 'beauty',   name: 'Beauty',   count: '540',  color: 'var(--coral)' },
  { id: 'edu',      name: 'Education',count: '418',  color: 'var(--lime)' },
];

const LIVE_FEED = [
  { t: '00:14', text: '> Connecting to YouTube Data API v3...' },
  { t: '00:15', text: '> Querying: "finance" 50k–500k subs, US/UK/CA, active in last 30d' },
  { t: '00:16', text: '✓ Page 1 → 47 candidates' },
  { t: '00:17', text: '✓ Page 2 → 38 candidates' },
  { t: '00:18', text: '→ Enriching channels with stats, sponsors, last upload...' },
  { t: '00:22', text: '→ Resolving business emails via 4 sources...' },
  { t: '00:25', text: '✓ 142 enriched · 32 had no email · 10 dupes skipped', hi: true },
  { t: '00:26', text: '→ Scoring with Gemini...' },
];

const FOUND = [
  { name: 'Jay Patel',      handle: '@MarketMavenJay',     subs: '142k', niche: 'Finance', color: 'var(--lime)',  cpm: '$28', last: '3d',  email: '✓', score: 94 },
  { name: 'Maria Chen',     handle: '@ChenFinance',         subs: '88k',  niche: 'Finance', color: 'var(--lime)',  cpm: '$24', last: '2d',  email: '✓', score: 91 },
  { name: 'Eli Brooks',     handle: '@EliExplainsFinance',  subs: '74k',  niche: 'Finance', color: 'var(--lime)',  cpm: '$26', last: '5d',  email: '✓', score: 88 },
  { name: 'Sarah Liu',      handle: '@LiuMoneyTalks',       subs: '218k', niche: 'Finance', color: 'var(--lime)',  cpm: '$32', last: '1d',  email: '✓', score: 96 },
  { name: 'Trevor Hayes',   handle: '@HayesInvests',        subs: '54k',  niche: 'Finance', color: 'var(--lime)',  cpm: '$22', last: '6d',  email: '–', score: 76 },
  { name: 'Diana Volkov',   handle: '@DianaCapital',        subs: '108k', niche: 'Finance', color: 'var(--lime)',  cpm: '$28', last: '2d',  email: '✓', score: 89 },
  { name: 'Marcus Reid',    handle: '@MarcusOnMoney',       subs: '320k', niche: 'Finance', color: 'var(--lime)',  cpm: '$34', last: '1d',  email: '✓', score: 95 },
  { name: 'Anjali Iyer',    handle: '@IyerEconomics',       subs: '62k',  niche: 'Finance', color: 'var(--lime)',  cpm: '$24', last: '4d',  email: '✓', score: 82 },
];

const FinderScreen = ({ goAnalyzer }) => {
  const [tab, setTab] = useStateFinder('youtube');
  const [niches, setNiches] = useStateFinder(new Set(['finance']));
  const [running, setRunning] = useStateFinder(false);
  const [done, setDone] = useStateFinder(false);

  const toggleNiche = (id) => {
    const n = new Set(niches);
    n.has(id) ? n.delete(id) : n.add(id);
    setNiches(n);
  };

  const start = () => {
    setRunning(true);
    setTimeout(() => { setRunning(false); setDone(true); }, 2500);
  };

  return (
    <div className="page" style={{maxWidth: 1500}}>
      <PageHead
        eyebrow="Discovery"
        title="Lead Finder — <em>tell the agent who you want. It scrapes, enriches, scores.</em>"
      />

      {/* Source tabs */}
      <div className="tabs" style={{marginBottom: 20}}>
        {[
          {id: 'youtube',    label: 'YouTube',    sub: 'channels + Shorts'},
          {id: 'reddit',     label: 'Reddit',     sub: 'authors + subreddits'},
          {id: 'viral',      label: 'Viral',      sub: 'trending in your niche'},
          {id: 'competitor', label: 'Competitor', sub: 'who they sponsor'},
          {id: 'upload',     label: 'Upload CSV', sub: 'enrich your list'},
        ].map(t => (
          <div key={t.id} className={`tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)} style={{padding: '10px 16px'}}>
            <div style={{fontWeight: 500}}>{t.label}</div>
            <div className="muted" style={{fontSize: 10.5, marginTop: 1}}>{t.sub}</div>
          </div>
        ))}
      </div>

      {/* PowerMode card */}
      <div className="pm">
        <div className="pm__head">
          <div className="pm__icon"><Icon name="bolt" size={18}/></div>
          <div style={{flex: 1}}>
            <div className="pm__title">PowerMode</div>
            <div className="pm__sub">One-click discovery. Pick niches, hit go, watch it work.</div>
          </div>
          <button className="btn btn--ghost btn--sm"><Icon name="sliders" size={12}/>Advanced filters</button>
        </div>

        {/* Filter row */}
        <div className="grid" style={{gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 8}}>
          <div className="field"><div className="field__label">Sub range</div><input className="input" defaultValue="50k – 500k"/></div>
          <div className="field"><div className="field__label">Geo</div><input className="input" defaultValue="US, UK, CA, AU"/></div>
          <div className="field"><div className="field__label">Posting cadence</div><input className="input" defaultValue="≥ 1 / week"/></div>
          <div className="field"><div className="field__label">Last upload</div><input className="input" defaultValue="within 14 days"/></div>
        </div>

        <div className="muted" style={{fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 18, marginBottom: 8}}>Pick niches</div>
        <div className="pm__niches">
          {NICHES.map(n => (
            <button key={n.id} className={`pm__niche ${niches.has(n.id) ? 'is-active' : ''}`} onClick={() => toggleNiche(n.id)}>
              <span className="chan__dot" style={{width: 8, height: 8, borderRadius: '50%', background: n.color}}/>
              {n.name}
              <span className="pill">{n.count}</span>
            </button>
          ))}
        </div>

        <button className="pm__cta" onClick={start} disabled={running}>
          {running ? (
            <><span className="dot dot--pulse" style={{background: '#0a0a0c', width: 8, height: 8}}/> Discovering creators...</>
          ) : (
            <><Icon name="bolt" size={16}/>Launch PowerMode <span className="sub">~ 30 seconds · {niches.size} niche{niches.size===1?'':'s'}</span></>
          )}
        </button>

        {(running || done) && (
          <div className="pm__feed">
            <div className="row" style={{marginBottom: 8, justifyContent: 'space-between'}}>
              <div className="row" style={{gap: 8}}>
                <Icon name="bolt" size={12} style={{color:'var(--lime)'}}/>
                <span className="mono" style={{fontSize: 11, color: 'var(--lime)', textTransform: 'uppercase', letterSpacing: '.06em'}}>Live · streaming results</span>
              </div>
              <div className="mono muted" style={{fontSize: 11}}>{done ? '142 found · 32 enriched · scoring...' : 'running...'}</div>
            </div>
            {LIVE_FEED.map((f, i) => (
              <div key={i} className={`pm__feed-row ${f.hi ? 'is-new' : ''}`}>
                <span className="ts">{f.t}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="section-head">
        <h3>
          {done ? '142 creators found · ' : 'Recent finds · '}
          <span className="mono" style={{color: 'var(--coral)'}}>34 A+ score</span>
        </h3>
        <div className="row" style={{gap: 6}}>
          <button className="btn btn--ghost btn--sm"><Icon name="filter" size={11}/>Filter</button>
          <button className="btn btn--ghost btn--sm"><Icon name="sort" size={11}/>Sort: Score</button>
          <button className="btn btn--ghost btn--sm"><Icon name="arrowDown" size={11}/>Export CSV</button>
          <button className="btn btn--sm" style={{background:'var(--coral-soft)', color:'var(--coral)', borderColor:'var(--coral-border)'}}><Icon name="rocket" size={11}/>Send to Pitch Gen</button>
        </div>
      </div>

      <div className="card" style={{overflow: 'hidden'}}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{width: 32}}><input type="checkbox"/></th>
              <th>Creator</th>
              <th>Niche</th>
              <th className="num">Subs</th>
              <th className="num">Est. CPM</th>
              <th>Last upload</th>
              <th>Email</th>
              <th className="num">Score</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {FOUND.map((l, i) => (
              <tr key={i}>
                <td><input type="checkbox" defaultChecked={l.score >= 90}/></td>
                <td>
                  <div className="row" style={{cursor: 'pointer'}} onClick={goAnalyzer}>
                    <Avatar name={l.name} size="sm"/>
                    <div>
                      <div style={{fontSize: 13, fontWeight: 500}}>{l.name}</div>
                      <div className="mono muted" style={{fontSize: 10.5}}>{l.handle}</div>
                    </div>
                  </div>
                </td>
                <td><ChannelChip color={l.color}>{l.niche}</ChannelChip></td>
                <td className="num">{l.subs}</td>
                <td className="num" style={{color: 'var(--lime)'}}>{l.cpm}</td>
                <td className="muted" style={{fontSize: 11.5}}>{l.last} ago</td>
                <td className="mono" style={{color: l.email === '✓' ? 'var(--ok)' : 'var(--text-3)', fontSize: 13}}>{l.email}</td>
                <td className="num">
                  <span style={{
                    fontFamily: 'var(--f-mono)',
                    fontSize: 12,
                    color: l.score >= 90 ? 'var(--coral)' : l.score >= 80 ? 'var(--lime)' : 'var(--text-2)',
                    background: l.score >= 90 ? 'var(--coral-soft)' : l.score >= 80 ? 'var(--lime-soft)' : 'var(--surface-2)',
                    border: '1px solid ' + (l.score >= 90 ? 'var(--coral-border)' : l.score >= 80 ? 'var(--lime-border)' : 'var(--line)'),
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}>{l.score}</span>
                </td>
                <td>
                  <div className="row" style={{gap: 4, justifyContent: 'flex-end'}}>
                    <button className="btn btn--ghost btn--sm" onClick={goAnalyzer} title="Analyze"><Icon name="eye" size={12}/></button>
                    <button className="btn btn--ghost btn--sm" title="Pitch"><Icon name="sparkle" size={12}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

window.FinderScreen = FinderScreen;
