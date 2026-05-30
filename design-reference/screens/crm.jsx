/* global React, Icon, Avatar, Badge, ChannelChip, PageHead */
const { useState: useStateCrm } = React;

const STAGES = [
  { id: 'discovered', label: 'Discovered', color: 'var(--text-3)' },
  { id: 'enriched',   label: 'Enriched',   color: 'var(--sky)' },
  { id: 'sent',       label: 'Sent',       color: 'var(--lime-dim)' },
  { id: 'opened',     label: 'Opened',     color: 'var(--lime)' },
  { id: 'replied',    label: 'Replied',    color: 'var(--coral)' },
  { id: 'qualified',  label: 'Qualified',  color: 'var(--cream)' },
  { id: 'call',       label: 'Call booked',color: 'var(--coral)' },
  { id: 'won',        label: 'Won',        color: 'var(--ok)' },
  { id: 'lost',       label: 'Lost',       color: 'var(--text-4)' },
];

const LEADS = {
  discovered: [
    { name: 'Trevor Hayes',   handle: '@HayesInvests',   subs: '54k',  niche: 'Finance', color: 'var(--lime)' },
    { name: 'Anjali Iyer',    handle: '@IyerEconomics',  subs: '62k',  niche: 'Finance', color: 'var(--lime)' },
    { name: 'Logan Park',     handle: '@LoganBuildsWealth', subs: '38k', niche: 'Finance', color: 'var(--lime)' },
  ],
  enriched: [
    { name: 'Diana Volkov',   handle: '@DianaCapital',   subs: '108k', niche: 'Finance', color: 'var(--lime)', value: '$2.8k' },
    { name: 'Nora Klein',     handle: '@NoraBakes',      subs: '58k',  niche: 'Cooking', color: 'var(--cream)', value: '$1.4k' },
  ],
  sent: [
    { name: 'Kenji Watanabe', handle: '@CookWithKenji',  subs: '208k', niche: 'Cooking', color: 'var(--cream)', value: '$4.8k' },
    { name: 'Tom Brennan',    handle: '@BrennanBuilds',  subs: '52k',  niche: 'DIY',     color: 'var(--cream)', value: '$1.3k' },
    { name: 'Priya Nair',     handle: '@PriyaCooks',     subs: '124k', niche: 'Cooking', color: 'var(--cream)', value: '$2.9k' },
    { name: 'Sasha Volkov',   handle: '@SashaLifts',     subs: '64k',  niche: 'Fitness', color: 'var(--coral)', value: '$1.6k' },
  ],
  opened: [
    { name: 'Marco Rossi',    handle: '@RossiTravels',   subs: '178k', niche: 'Travel',  color: 'var(--coral)', value: '$4.0k' },
    { name: 'Aria Singh',     handle: '@AriaPlays',      subs: '420k', niche: 'Gaming',  color: 'var(--violet)', value: '$7.6k' },
    { name: 'Lina Park',      handle: '@LinaDesigns',    subs: '96k',  niche: 'Design',  color: 'var(--sky)', value: '$2.4k' },
  ],
  replied: [
    { name: 'Maria Chen',     handle: '@ChenFinance',    subs: '88k',  niche: 'Finance', color: 'var(--lime)', value: '$2.2k', hot: true },
    { name: 'Eli Brooks',     handle: '@EliExplainsFinance', subs: '74k', niche: 'Finance', color: 'var(--lime)', value: '$1.9k' },
  ],
  qualified: [
    { name: 'Sarah Liu',      handle: '@LiuMoneyTalks',  subs: '218k', niche: 'Finance', color: 'var(--lime)', value: '$5.4k', hot: true },
  ],
  call: [
    { name: 'Jay Patel',      handle: '@MarketMavenJay', subs: '142k', niche: 'Finance', color: 'var(--lime)', value: '$3.6k', hot: true },
    { name: 'Marcus Reid',    handle: '@MarcusOnMoney',  subs: '320k', niche: 'Finance', color: 'var(--lime)', value: '$8.2k', hot: true },
  ],
  won: [
    { name: 'Olivia Sterling',handle: '@OliviaTalks',    subs: '186k', niche: 'Finance', color: 'var(--lime)', value: '$4.8k' },
    { name: 'Hugo Lefevre',   handle: '@HugoMoney',      subs: '94k',  niche: 'Finance', color: 'var(--lime)', value: '$2.4k' },
  ],
  lost: [
    { name: 'Devon Reed',     handle: '@ReedReviewsTech',subs: '312k', niche: 'Tech',    color: 'var(--sky)',  value: '$7.8k', reason: 'opt-out' },
  ],
};

const CrmScreen = () => {
  const [selected, setSelected] = useStateCrm(null);

  // Compute aggregate per column
  const colValue = (id) => {
    const ls = LEADS[id] || [];
    const total = ls.reduce((sum, l) => sum + parseFloat((l.value || '$0').replace(/[$k]/gi, '')), 0);
    return total ? `$${total.toFixed(1)}k` : '—';
  };

  return (
    <div className="page page--bleed" style={{padding: '24px 24px 0', maxWidth: 'none'}}>
      <PageHead
        eyebrow="Pipeline · $48.4k open value · $18.6k won YTD"
        title="CRM — <em>drag a creator from cold to closed.</em>"
        actions={
          <>
            <button className="btn btn--ghost btn--sm"><Icon name="filter" size={12}/>Filter</button>
            <button className="btn btn--ghost btn--sm"><Icon name="search" size={12}/>Search</button>
            <button className="btn btn--ghost btn--sm"><Icon name="arrowDown" size={12}/>Export</button>
          </>
        }
      />

      <div className="kb">
        {STAGES.map(s => {
          const leads = LEADS[s.id] || [];
          return (
            <div key={s.id} className="kb__col">
              <div className="kb__col-head">
                <div className="kb__col-title">
                  <span className="swatch" style={{background: s.color}}/>
                  {s.label}
                  <span className="count">{leads.length}</span>
                </div>
                <div className="kb__col-value">{colValue(s.id)}</div>
              </div>
              <div className="kb__list">
                {leads.map((l, i) => (
                  <div key={i} className="kb__card" onClick={() => setSelected(l)} style={l.hot ? {borderColor: 'var(--coral-border)'} : null}>
                    <div className="kb__card-head">
                      <Avatar name={l.name} size="sm"/>
                      <div style={{flex: 1, minWidth: 0}}>
                        <div className="kb__card-name">{l.name}</div>
                        <div className="kb__card-meta">{l.handle} · {l.subs}</div>
                      </div>
                      {l.hot && <span className="dot dot--pulse-coral" style={{background:'var(--coral)', width: 7, height: 7, marginTop: 4}}/>}
                    </div>
                    <div className="kb__card-foot">
                      <ChannelChip color={l.color}>{l.niche}</ChannelChip>
                      {l.reason && <Badge kind="bad">{l.reason}</Badge>}
                      <span className="kb__card-value">{l.value}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button className="kb__add"><Icon name="plus" size={11}/> Add</button>
            </div>
          );
        })}
      </div>

      {/* Slide-in lead detail */}
      {selected && (
        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 28, width: 440,
          background: 'var(--bg-2)', borderLeft: '1px solid var(--line)',
          zIndex: 20, overflow: 'auto', padding: '24px 26px',
        }}>
          <div className="row" style={{marginBottom: 16}}>
            <button className="btn btn--ghost btn--sm" onClick={() => setSelected(null)}><Icon name="x" size={12}/>Close</button>
            <div className="spacer"/>
            <button className="btn btn--ghost btn--sm"><Icon name="eye" size={12}/>Open in Analyzer</button>
          </div>

          <div className="row" style={{gap: 14, marginBottom: 18}}>
            <Avatar name={selected.name} size="xl"/>
            <div>
              <div style={{fontSize: 18, fontWeight: 500, letterSpacing:'-0.01em'}}>{selected.name}</div>
              <div className="mono muted" style={{fontSize: 11.5}}>{selected.handle} · {selected.subs}</div>
              <div className="row" style={{gap: 6, marginTop: 6}}>
                <ChannelChip color={selected.color}>{selected.niche}</ChannelChip>
                {selected.value && <Badge kind="lime">{selected.value} value</Badge>}
              </div>
            </div>
          </div>

          <div className="tabs" style={{marginBottom: 14}}>
            {['Pitch', 'Emails', 'Notes', 'Timeline'].map((t, i) => (
              <div key={t} className={`tab ${i===3 ? 'is-active' : ''}`}>{t}</div>
            ))}
          </div>

          <div className="muted" style={{fontSize: 11, textTransform:'uppercase', letterSpacing:'.06em', marginBottom: 10}}>Timeline</div>
          {[
            {t: '2h ago',  what: 'Replied — handed to inbox',  ic: 'reply',   c: 'var(--coral)'},
            {t: '8h ago',  what: 'Opened email at 14:22',       ic: 'eye',     c: 'var(--lime)'},
            {t: '1d ago',  what: 'Email sent — variant A',      ic: 'mail',    c: 'var(--text-3)'},
            {t: '1d ago',  what: 'Pitch generated · score 96',  ic: 'sparkle', c: 'var(--text-3)'},
            {t: '2d ago',  what: 'Channel analyzed',            ic: 'eye',     c: 'var(--text-3)'},
            {t: '2d ago',  what: 'Discovered via PowerMode',    ic: 'bolt',    c: 'var(--text-3)'},
          ].map((e, i) => (
            <div key={i} className="row" style={{gap: 12, padding: '10px 0', borderBottom: '1px dashed var(--line)'}}>
              <span style={{color: e.c, width: 16, display:'grid', placeItems:'center'}}><Icon name={e.ic} size={13}/></span>
              <div style={{flex: 1, fontSize: 12.5}}>{e.what}</div>
              <span className="mono muted" style={{fontSize: 10.5}}>{e.t}</span>
            </div>
          ))}

          <div className="row" style={{gap: 6, marginTop: 18}}>
            <button className="btn btn--sm" style={{flex:1, justifyContent:'center'}}><Icon name="pen" size={11}/>Note</button>
            <button className="btn btn--sm" style={{flex:1, justifyContent:'center'}}><Icon name="sparkle" size={11}/>Pitch</button>
            <button className="btn btn--coral btn--sm" style={{flex:1, justifyContent:'center'}}><Icon name="reply" size={11}/>Reply</button>
          </div>
        </div>
      )}
    </div>
  );
};

window.CrmScreen = CrmScreen;
