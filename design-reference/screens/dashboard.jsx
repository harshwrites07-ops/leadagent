/* global React, Icon, Stat, Sparkline, Bars, Avatar, Badge, ChannelChip, PageHead */
const DashboardScreen = () => {
  const spark1 = [12, 18, 14, 22, 24, 20, 30, 28, 36, 40, 38, 44, 52, 48, 60];
  const spark2 = [40, 38, 42, 36, 44, 40, 48, 44, 52, 50, 58, 54, 62, 60, 66];
  const spark3 = [5, 6, 5, 7, 6, 8, 7, 9, 8, 10, 11, 10, 12, 13, 14];

  return (
    <div className="page">
      <PageHead
        eyebrow="Wednesday · May 27"
        title="Good morning, Sahil — <em>your agents shipped 412 emails overnight.</em>"
        sub={<span><span style={{color: 'var(--coral)'}}>3 conversations need a human.</span> Everything else is on autopilot.</span>}
        actions={
          <>
            <button className="btn btn--ghost"><Icon name="plus" />Import leads</button>
            <button className="btn btn--primary"><Icon name="rocket" size={14}/>New campaign</button>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid g-4">
        <Stat label="Emails sent · 7d" value="3,184" mono delta="+18.4%" trend="up" spark={<Sparkline data={spark1} />} />
        <Stat label="Reply rate" value="14.2%" delta="+2.1 pts" trend="up" spark={<Sparkline data={spark2} color="var(--coral)" />} />
        <Stat label="Meetings booked" value="38" mono delta="+9" trend="up" spark={<Sparkline data={spark3} color="var(--cream)" />} />
        <Stat label="Deliverability" value="98.6%" delta="Healthy" trend="up" spark={<Sparkline data={[80,82,84,83,86,88,90,92,94,95,96,97,98,98,99]} color="var(--ok)" />} />
      </div>

      {/* Two-column section */}
      <div className="grid" style={{gridTemplateColumns: '2fr 1fr', marginTop: 24}}>
        {/* Agent activity */}
        <div className="card">
          <div className="card__head">
            <div className="row">
              <div className="card__title">Agent activity</div>
              <Badge kind="lime"><span className="dot dot--pulse"/>Live</Badge>
            </div>
            <div className="row">
              <button className="btn btn--ghost btn--sm">Last 24h</button>
              <button className="btn btn--ghost btn--sm">View all</button>
            </div>
          </div>
          <div className="card__body" style={{padding: 0}}>
            {[
              {t: '2m ago',  tag: 'scraping', text: 'Discovered 184 new prospects in Finance YouTube channels (50k–500k subs).', acc: 'var(--lime)',  human: false},
              {t: '12m ago', tag: 'research', text: 'Studied 42 channels — extracted recent uploads, sponsors, hooks, posting cadence.', acc: 'var(--lime)', human: false},
              {t: '34m ago', tag: 'writing',  text: 'Drafted 28 personalized opening lines using "Channel-Hook" template.', acc: 'var(--lime)',  human: false},
              {t: '1h ago',  tag: 'sending',  text: 'Sent 116 emails across 4 mailboxes. 0 bounces, 2 soft fails handled.', acc: 'var(--lime)',  human: false},
              {t: '2h ago',  tag: 'human needed',    text: 'Detected positive reply from @MarketMavenJay — handed off to your inbox.', acc: 'var(--coral)', human: true},
            ].map((row, i) => (
              <div key={i} style={{display:'flex', gap: 14, padding: '14px 16px', borderBottom: i < 4 ? '1px solid var(--line)' : 'none', background: row.human ? 'var(--coral-soft)' : 'transparent'}}>
                <div className="mono" style={{color:'var(--text-3)', fontSize: 11, width: 56, flexShrink: 0, paddingTop: 2}}>{row.t}</div>
                <div style={{width: 8, marginTop: 6, flexShrink: 0}}>
                  <span className="dot" style={{color: row.acc, width: 6, height: 6}}/>
                </div>
                <div style={{flex: 1, minWidth: 0}}>
                  <div className="row" style={{gap: 8, marginBottom: 2}}>
                    <span className="mono" style={{color: row.acc, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em'}}>{row.tag}</span>
                  </div>
                  <div style={{fontSize: 13}}>{row.text}</div>
                </div>
                {row.human && (
                  <button className="btn btn--sm btn--coral" style={{alignSelf: 'center'}}>Reply <Icon name="arrowR" size={11}/></button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Today schedule */}
        <div className="card">
          <div className="card__head">
            <div className="card__title">Today's schedule</div>
            <button className="btn btn--ghost btn--sm">Pause</button>
          </div>
          <div className="card__body" style={{padding: 0}}>
            {[
              {h: '09:00', label: 'Mailbox warmup',     mailboxes: 4, status: 'done'},
              {h: '10:30', label: 'Send batch #1',       mailboxes: 412, status: 'done'},
              {h: '12:00', label: 'Research run',        mailboxes: 184, status: 'running'},
              {h: '14:00', label: 'Send batch #2',       mailboxes: 360, status: 'queued'},
              {h: '17:30', label: 'Followup sweep',      mailboxes: 220, status: 'queued'},
              {h: '20:00', label: 'Reply digest',        mailboxes: 0,   status: 'queued'},
            ].map((row, i) => (
              <div key={i} style={{display:'flex', alignItems:'center', gap: 12, padding: '12px 16px', borderBottom: i < 5 ? '1px solid var(--line)' : 'none'}}>
                <div className="mono" style={{color:'var(--text-3)', fontSize: 11, width: 42}}>{row.h}</div>
                <div style={{flex: 1}}>
                  <div style={{fontSize: 12.5}}>{row.label}</div>
                  {row.mailboxes > 0 && <div className="mono muted" style={{fontSize: 10.5, marginTop: 1}}>{row.mailboxes.toLocaleString()} {row.label.includes('Send') ? 'emails' : row.label.includes('Research') ? 'prospects' : 'mailboxes'}</div>}
                </div>
                {row.status === 'done' && <Badge kind="ghost"><Icon name="check" size={11}/>Done</Badge>}
                {row.status === 'running' && <Badge kind="lime"><span className="dot dot--pulse"/>Now</Badge>}
                {row.status === 'queued' && <span className="muted mono" style={{fontSize: 11}}>Queued</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active campaigns */}
      <div className="section-head">
        <h3>Active campaigns</h3>
        <button className="btn btn--ghost btn--sm">View all <Icon name="chev" size={11}/></button>
      </div>
      <div className="card" style={{overflow: 'hidden'}}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{width: '40%'}}>Campaign</th>
              <th>Niche</th>
              <th className="num">Sent</th>
              <th className="num">Open</th>
              <th className="num">Reply</th>
              <th className="num">Meetings</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[
              {name: 'Finance YT 50k+ · Q2 launch',     niche: 'Finance',     color: 'var(--lime)',   sent: 1240, open: '62%', reply: '17%', meet: 12, status: 'live'},
              {name: 'Fitness coaches · sponsorship',    niche: 'Fitness',     color: 'var(--rose)',   sent: 820,  open: '54%', reply: '11%', meet: 7,  status: 'live'},
              {name: 'Tech reviewers · 100k+ tier',      niche: 'Tech',        color: 'var(--sky)',    sent: 612,  open: '58%', reply: '14%', meet: 9,  status: 'live'},
              {name: 'Cooking creators · season 2',      niche: 'Cooking',     color: 'var(--cream)',  sent: 320,  open: '51%', reply: '9%',  meet: 4,  status: 'paused'},
              {name: 'Gaming streamers · brand deals',   niche: 'Gaming',      color: 'var(--violet)', sent: 192,  open: '47%', reply: '8%',  meet: 6,  status: 'live'},
            ].map((c, i) => (
              <tr key={i}>
                <td>
                  <div className="row">
                    <div style={{fontWeight: 500}}>{c.name}</div>
                  </div>
                </td>
                <td><ChannelChip color={c.color}>{c.niche}</ChannelChip></td>
                <td className="num">{c.sent.toLocaleString()}</td>
                <td className="num">{c.open}</td>
                <td className="num" style={{color: 'var(--coral)'}}>{c.reply}</td>
                <td className="num">{c.meet}</td>
                <td>
                  {c.status === 'live'
                    ? <Badge kind="lime"><span className="dot dot--pulse"/>Live</Badge>
                    : <Badge kind="warn">Paused</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom row */}
      <div className="grid" style={{gridTemplateColumns: '1fr 1fr', marginTop: 24}}>
        <div className="card">
          <div className="card__head">
            <div className="row">
              <div className="card__title">Inbox needs attention</div>
              <Badge kind="coral"><span className="dot dot--pulse-coral"/>3 unread</Badge>
            </div>
            <button className="btn btn--ghost btn--sm">View inbox <Icon name="chev" size={11}/></button>
          </div>
          <div className="card__body" style={{padding: 0}}>
            {[
              {n: 'Jay Patel', ch: '@MarketMavenJay · 142k subs', t: '"Sure, send me details — Friday at 3?"', tag: 'positive', tone: 'coral'},
              {n: 'Maria Chen', ch: '@ChenFinance · 88k subs', t: '"What\'s the deliverable and pricing?"', tag: 'question', tone: 'warn'},
              {n: 'Devon Reed', ch: '@ReedReviewsTech · 312k subs', t: '"Not interested at this time."', tag: 'opt-out', tone: 'bad'},
            ].map((row, i) => (
              <div key={i} style={{display:'flex', gap: 12, padding: 14, borderBottom: i < 2 ? '1px solid var(--line)' : 'none'}}>
                <Avatar name={row.n} />
                <div style={{flex: 1, minWidth: 0}}>
                  <div className="row" style={{justifyContent: 'space-between', marginBottom: 2}}>
                    <div style={{fontSize: 13, fontWeight: 500}}>{row.n}</div>
                    <Badge kind={row.tone}>{row.tag}</Badge>
                  </div>
                  <div className="muted" style={{fontSize: 11.5, marginBottom: 4}}>{row.ch}</div>
                  <div style={{fontSize: 12.5, color: 'var(--text-2)'}}>{row.t}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <div className="card__title">Mailbox health</div>
            <Badge kind="ok"><Icon name="check" size={11}/>All systems</Badge>
          </div>
          <div className="card__body">
            <div className="grid g-2" style={{gap: 16}}>
              {[
                {n: 'sahil@reachagency.io',   warm: 96, sent: 142, max: 180},
                {n: 'team@reachagency.io',     warm: 89, sent: 96,  max: 150},
                {n: 'hello@reachfounder.co',   warm: 92, sent: 124, max: 180},
                {n: 'pitch@rocketreach.email', warm: 78, sent: 50,  max: 100},
              ].map((m, i) => (
                <div key={i} style={{padding: 12, border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'var(--bg-2)'}}>
                  <div className="mono" style={{fontSize: 11.5, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{m.n}</div>
                  <div className="row" style={{justifyContent: 'space-between', marginBottom: 6}}>
                    <span className="muted" style={{fontSize: 10.5}}>WARM</span>
                    <span className="mono" style={{fontSize: 11}}>{m.warm}%</span>
                  </div>
                  <div className="bar" style={{marginBottom: 10}}><span style={{width: `${m.warm}%`}}/></div>
                  <div className="row" style={{justifyContent: 'space-between'}}>
                    <span className="muted" style={{fontSize: 10.5}}>TODAY</span>
                    <span className="mono" style={{fontSize: 11}}>{m.sent} / {m.max}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

window.DashboardScreen = DashboardScreen;
