/* global React, Icon, Avatar, Badge, ChannelChip, PageHead */
const { useState: useStateSender } = React;

const QUEUE = [
  { name: 'Jay Patel',       handle: '@MarketMavenJay',     subj: 'The 4:12 chart on your index funds video',  when: 'Tue 10:14 AM', mailbox: 'sahil@reachagency.io', niche: 'Finance', color: 'var(--lime)' },
  { name: 'Sarah Liu',       handle: '@LiuMoneyTalks',       subj: 'Loved your real estate vs index breakdown', when: 'Tue 10:17 AM', mailbox: 'sahil@reachagency.io', niche: 'Finance', color: 'var(--lime)' },
  { name: 'Marcus Reid',     handle: '@MarcusOnMoney',       subj: 'Following up after your Ramp segment',      when: 'Tue 10:22 AM', mailbox: 'team@reachagency.io',  niche: 'Finance', color: 'var(--lime)' },
  { name: 'Maria Chen',      handle: '@ChenFinance',         subj: 'Quick collab idea for {{channel.name}}',    when: 'Tue 10:28 AM', mailbox: 'hello@reachfounder.co',niche: 'Finance', color: 'var(--lime)' },
  { name: 'Diana Volkov',    handle: '@DianaCapital',        subj: 'Loved the dollar-cost-averaging segment',   when: 'Tue 10:33 AM', mailbox: 'pitch@rocketreach.email', niche: 'Finance', color: 'var(--lime)' },
  { name: 'Eli Brooks',      handle: '@EliExplainsFinance',  subj: 'Worth a 15-min for {{channel.name}}?',      when: 'Tue 10:38 AM', mailbox: 'sahil@reachagency.io', niche: 'Finance', color: 'var(--lime)' },
];

const HISTORY = [
  { name: 'Jay Patel',     subj: 'The 4:12 chart on your index funds video',  status: 'replied', when: '2h ago',  tag: 'positive' },
  { name: 'Maria Chen',    subj: 'Quick collab idea for {{channel.name}}',    status: 'replied', when: '14m ago', tag: 'question' },
  { name: 'Devon Reed',    subj: 'Worth a 15-min for {{channel.name}}?',      status: 'replied', when: '3h ago',  tag: 'opt-out' },
  { name: 'Aria Singh',    subj: 'Loved your latest collab with @MrBeast',    status: 'opened', when: '4h ago',   tag: '' },
  { name: 'Marco Rossi',   subj: 'Following up after destination series',     status: 'opened', when: '6h ago',   tag: '' },
  { name: 'Kenji Watanabe',subj: 'Re: collab for @CookWithKenji',             status: 'sent',   when: '8h ago',   tag: '' },
  { name: 'Sasha Volkov',  subj: 'Sponsorship opener for @SashaLifts',        status: 'sent',   when: '1d ago',   tag: '' },
];

const SenderScreen = () => {
  const [tab, setTab] = useStateSender('queue');
  const [showPower, setShowPower] = useStateSender(false);

  return (
    <div className="page" style={{maxWidth: 1500}}>
      <PageHead
        title="Email Sender — <em>your outbox, alive.</em>"
        actions={
          <>
            <button className="btn btn--ghost"><Icon name="pause" size={13}/>Pause sending</button>
            <button className="btn" style={{background: 'var(--coral-soft)', borderColor: 'var(--coral-border)', color: 'var(--coral)'}}>
              <Icon name="bolt" size={13}/>Power Follow-up
            </button>
            <button className="btn btn--primary" onClick={() => setShowPower(true)}><Icon name="bolt" size={13}/>Power Send · 412 ready</button>
          </>
        }
      />

      {/* Top KPIs */}
      <div className="grid g-4" style={{marginBottom: 16}}>
        <div className="stat">
          <div className="stat__label">Queued</div>
          <div className="stat__value stat__value--mono">412</div>
          <div className="muted mono" style={{fontSize:11, marginTop: 6}}>across 4 mailboxes</div>
        </div>
        <div className="stat">
          <div className="stat__label">Sent today</div>
          <div className="stat__value stat__value--mono">186</div>
          <div className="muted mono" style={{fontSize:11, marginTop: 6}}>248 capacity left</div>
        </div>
        <div className="stat">
          <div className="stat__label">Replied</div>
          <div className="stat__value stat__value--mono" style={{color: 'var(--coral)'}}>14</div>
          <div className="muted mono" style={{fontSize:11, marginTop: 6}}>3 need attention</div>
        </div>
        <div className="stat">
          <div className="stat__label">Inbox placement</div>
          <div className="stat__value stat__value--mono" style={{color: 'var(--lime)'}}>98.6%</div>
          <div className="muted mono" style={{fontSize:11, marginTop: 6}}>0 bounces · 0 spam</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{marginBottom: 14}}>
        {[
          {id: 'queue',   label: 'Queue',   count: 412},
          {id: 'sent',    label: 'Sent',    count: 186},
          {id: 'opened',  label: 'Opened',  count: 84},
          {id: 'replied', label: 'Replied', count: 14, kind: 'coral'},
          {id: 'bounced', label: 'Bounced', count: 0},
        ].map(t => (
          <div key={t.id} className={`tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label} <span className="muted mono" style={{marginLeft: 6, fontSize: 10.5, color: t.kind === 'coral' ? 'var(--coral)' : 'var(--text-3)'}}>{t.count}</span>
          </div>
        ))}
      </div>

      {tab === 'queue' && (
        <div className="card" style={{overflow: 'hidden'}}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{width: 32}}><Icon name="moreH" size={12}/></th>
                <th style={{width: 32}}><input type="checkbox"/></th>
                <th>To</th>
                <th>Subject</th>
                <th>From mailbox</th>
                <th>Will send</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {QUEUE.map((q, i) => (
                <tr key={i}>
                  <td><span className="handle">⋮⋮</span></td>
                  <td><input type="checkbox" defaultChecked/></td>
                  <td>
                    <div className="row">
                      <Avatar name={q.name} size="sm"/>
                      <div>
                        <div style={{fontSize: 13, fontWeight: 500}}>{q.name}</div>
                        <div className="mono muted" style={{fontSize: 10.5}}>{q.handle}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{fontSize: 12.5, color: 'var(--text-2)'}}>{q.subj}</td>
                  <td className="mono" style={{fontSize: 11.5}}>{q.mailbox}</td>
                  <td className="muted" style={{fontSize: 11.5}}>{q.when}</td>
                  <td>
                    <div className="row" style={{gap: 4, justifyContent: 'flex-end'}}>
                      <button className="btn btn--ghost btn--sm" title="Preview"><Icon name="eye" size={11}/></button>
                      <button className="btn btn--ghost btn--sm" title="Edit"><Icon name="pen" size={11}/></button>
                      <button className="btn btn--ghost btn--sm btn--danger" title="Remove"><Icon name="x" size={11}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'replied' && (
        <div className="card" style={{overflow: 'hidden'}}>
          {HISTORY.filter(h => h.status === 'replied').map((h, i) => (
            <div key={i} style={{padding: '14px 18px', borderBottom: i < 2 ? '1px solid var(--line)' : 'none', display:'flex', alignItems:'center', gap: 14}}>
              <Avatar name={h.name}/>
              <div style={{flex: 1, minWidth: 0}}>
                <div className="row" style={{gap: 8, marginBottom: 2}}>
                  <span style={{fontSize: 13, fontWeight: 500}}>{h.name}</span>
                  <Badge kind={h.tag === 'positive' ? 'coral' : h.tag === 'question' ? 'warn' : 'bad'}>{h.tag}</Badge>
                </div>
                <div className="muted" style={{fontSize: 12}}>{h.subj}</div>
              </div>
              <div className="muted mono" style={{fontSize: 11}}>{h.when}</div>
              <button className="btn btn--coral btn--sm">Reply <Icon name="arrowR" size={11}/></button>
            </div>
          ))}
        </div>
      )}

      {tab !== 'queue' && tab !== 'replied' && (
        <div className="card" style={{padding: 32, textAlign: 'center'}}>
          <div className="muted" style={{fontSize: 13}}>Showing {tab} emails ({tab === 'sent' ? 186 : tab === 'opened' ? 84 : 0} total)</div>
        </div>
      )}

      {/* Power Send overlay */}
      {showPower && (
        <div className="onb" onClick={(e) => e.target === e.currentTarget && setShowPower(false)}>
          <div className="onb__card" style={{maxWidth: 540}}>
            <div style={{padding: '28px 32px 8px'}}>
              <div className="row" style={{marginBottom: 14}}>
                <div className="pm__icon" style={{width: 30, height: 30, borderRadius: 8}}><Icon name="bolt" size={14}/></div>
                <div className="muted" style={{fontSize: 11, textTransform:'uppercase', letterSpacing:'.06em'}}>Power send · about to launch</div>
              </div>
              <h2 className="page__title" style={{fontSize: 28}}>Send <em style={{fontStyle:'italic', color: 'var(--lime)'}}>412 emails</em> across <em style={{fontStyle:'italic'}}>4 mailboxes?</em></h2>
            </div>

            <div style={{padding: '20px 32px 24px'}}>
              <div style={{padding: 16, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, marginBottom: 16}}>
                <div className="muted" style={{fontSize: 10.5, textTransform:'uppercase', letterSpacing:'.06em', marginBottom: 10}}>Send plan</div>
                <div className="col" style={{gap: 8}}>
                  {[
                    {l: 'sahil@reachagency.io',    n: 142, time: '10:14 → 14:32'},
                    {l: 'team@reachagency.io',      n: 96,  time: '10:18 → 13:48'},
                    {l: 'hello@reachfounder.co',    n: 124, time: '10:22 → 14:12'},
                    {l: 'pitch@rocketreach.email',  n: 50,  time: '10:30 → 11:54'},
                  ].map((m, i) => (
                    <div key={i} className="row" style={{justifyContent: 'space-between', fontSize: 12.5}}>
                      <span className="mono">{m.l}</span>
                      <span className="muted mono" style={{fontSize: 11}}>{m.n} emails · {m.time}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="muted" style={{fontSize: 12, marginBottom: 18, lineHeight: 1.55}}>
                Each mailbox sends within its safe daily limit. Random 30-90s gaps between sends. Auto-pause if bounce rate exceeds 2%.
              </div>
              <div className="row" style={{gap: 8}}>
                <button className="btn" style={{flex: 1, justifyContent:'center'}} onClick={() => setShowPower(false)}>Cancel</button>
                <button className="btn btn--primary" style={{flex: 2, justifyContent:'center'}} onClick={() => setShowPower(false)}><Icon name="bolt" size={13}/>Launch send</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

window.SenderScreen = SenderScreen;
