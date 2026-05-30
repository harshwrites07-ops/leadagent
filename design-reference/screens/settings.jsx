/* global React, Icon, Badge, PageHead, Avatar */
const { useState: useStateSet } = React;

const SettingsScreen = () => {
  const [tab, setTab] = useStateSet('mailboxes');

  return (
    <div className="page" style={{maxWidth: 960}}>
      <PageHead
        eyebrow="Workspace"
        title="Settings"
      />

      <div className="tabs" style={{marginBottom: 24}}>
        {[
          {id: 'profile',   l: 'Profile'},
          {id: 'mailboxes', l: 'Mailboxes & sending'},
          {id: 'integrations', l: 'Integrations'},
          {id: 'team',      l: 'Team & roles'},
          {id: 'plan',      l: 'Plan & billing'},
        ].map(t => (
          <div key={t.id} className={`tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)}>{t.l}</div>
        ))}
      </div>

      {tab === 'mailboxes' && <MailboxSettings />}

      {tab === 'plan' && <PlanSettings />}

      {tab === 'profile' && (
        <div className="card">
          <div className="card__body">
            <div className="grid g-2" style={{gap: 14}}>
              <div className="field"><div className="field__label">Name</div><input className="input" defaultValue="Sahil Mehta"/></div>
              <div className="field"><div className="field__label">Email</div><input className="input" defaultValue="sahil@reachagency.io"/></div>
              <div className="field"><div className="field__label">Agency</div><input className="input" defaultValue="Rocket Reach Agency"/></div>
              <div className="field"><div className="field__label">Timezone</div><input className="input" defaultValue="America/New_York"/></div>
            </div>
            <div className="field" style={{marginTop: 14}}>
              <div className="field__label">Sender signature</div>
              <textarea className="textarea" rows={4} defaultValue={'— Sahil\nFounder, Rocket Reach\nWe match brands with creators who actually convert.'}/>
            </div>
          </div>
        </div>
      )}

      {tab === 'integrations' && (
        <div className="card">
          <div className="card__body" style={{padding: 0}}>
            {[
              {n: 'Google Workspace', s: 'Connected · 3 mailboxes', on: true, ic: 'mail'},
              {n: 'Microsoft 365',     s: 'Connected · 1 mailbox',   on: true, ic: 'mail'},
              {n: 'Smartlead SMTP',    s: 'Not connected',           on: false, ic: 'mail'},
              {n: 'YouTube Data API',  s: 'Connected · 12.4k quota / day', on: true, ic: 'youtube'},
              {n: 'Hunter (emails)',   s: 'Connected · 8.2k credits', on: true, ic: 'globe'},
              {n: 'Apollo (emails)',   s: 'Connected · enrichment + verify', on: true, ic: 'globe'},
              {n: 'Slack',             s: 'Send reply alerts to #outreach', on: true, ic: 'bell'},
              {n: 'Zapier / Make',     s: 'Webhook out · 0 active flows', on: false, ic: 'link'},
            ].map((it, i, arr) => (
              <div key={i} className="row" style={{padding: 16, borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none', gap: 14}}>
                <div style={{width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--line)', display:'grid', placeItems:'center', color: it.on ? 'var(--lime)' : 'var(--text-3)'}}>
                  <Icon name={it.ic} size={14}/>
                </div>
                <div style={{flex: 1}}>
                  <div style={{fontSize: 13, fontWeight: 500}}>{it.n}</div>
                  <div className="muted" style={{fontSize: 11.5}}>{it.s}</div>
                </div>
                {it.on
                  ? <Badge kind="lime"><Icon name="check" size={11}/>Connected</Badge>
                  : <button className="btn btn--sm">Connect</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'team' && (
        <div className="card">
          <div className="card__body" style={{padding: 0}}>
            {[
              {n: 'Sahil Mehta',  e: 'sahil@reachagency.io',  role: 'Owner',  online: true},
              {n: 'Priya Joshi',  e: 'priya@reachagency.io',  role: 'Admin',  online: true},
              {n: 'Ben Cohen',    e: 'ben@reachagency.io',     role: 'Member', online: false},
              {n: 'Alex Romero',  e: 'alex@reachagency.io',    role: 'Member', online: true},
            ].map((m, i, arr) => (
              <div key={i} className="row" style={{padding: 14, borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none', gap: 14}}>
                <div style={{position:'relative'}}>
                  <Avatar name={m.n}/>
                  {m.online && <span style={{position:'absolute', bottom:-1, right:-1, width: 8, height: 8, borderRadius:'50%', background: 'var(--lime)', border: '2px solid var(--surface)'}}/>}
                </div>
                <div style={{flex: 1}}>
                  <div style={{fontSize: 13, fontWeight: 500}}>{m.n}</div>
                  <div className="mono muted" style={{fontSize: 11}}>{m.e}</div>
                </div>
                <Badge kind={m.role === 'Owner' ? 'coral' : ''}>{m.role}</Badge>
                <button className="btn btn--ghost btn--sm"><Icon name="moreH" size={12}/></button>
              </div>
            ))}
            <div style={{padding: 16, borderTop: '1px solid var(--line)'}}>
              <button className="btn"><Icon name="plus" size={12}/>Invite teammate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MailboxSettings = () => (
  <>
    <div className="card" style={{marginBottom: 16}}>
      <div className="card__head">
        <div className="card__title">Connected mailboxes</div>
        <button className="btn btn--primary btn--sm"><Icon name="plus" size={11}/>Connect</button>
      </div>
      <div>
        {[
          {n: 'sahil@reachagency.io',    p: 'Google',     warm: 96, sent: 142, max: 180, st: 'Sending'},
          {n: 'team@reachagency.io',     p: 'Google',     warm: 89, sent: 96,  max: 150, st: 'Sending'},
          {n: 'hello@reachfounder.co',   p: 'Microsoft',  warm: 92, sent: 124, max: 180, st: 'Sending'},
          {n: 'pitch@rocketreach.email', p: 'Smartlead',  warm: 78, sent: 50,  max: 100, st: 'Warming'},
        ].map((m, i, arr) => (
          <div key={i} style={{padding: 16, borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none', display:'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 0.6fr', gap: 18, alignItems:'center'}}>
            <div className="row" style={{gap: 12}}>
              <div style={{width: 30, height: 30, borderRadius: 7, background:'var(--surface-2)', border: '1px solid var(--line)', display:'grid', placeItems:'center', fontFamily:'var(--f-mono)', fontSize: 11, color:'var(--text-3)'}}>
                {m.p === 'Google' ? 'G' : m.p === 'Microsoft' ? 'M' : 'S'}
              </div>
              <div className="mono" style={{fontSize: 12}}>{m.n}</div>
            </div>
            <div>
              <div className="row" style={{justifyContent:'space-between', marginBottom: 4}}>
                <span className="muted" style={{fontSize: 10}}>WARMTH</span>
                <span className="mono" style={{fontSize: 11}}>{m.warm}%</span>
              </div>
              <div className="bar"><span style={{width: `${m.warm}%`}}/></div>
            </div>
            <div>
              <div className="row" style={{justifyContent:'space-between', marginBottom: 4}}>
                <span className="muted" style={{fontSize: 10}}>TODAY</span>
                <span className="mono" style={{fontSize: 11}}>{m.sent} / {m.max}</span>
              </div>
              <div className="bar"><span style={{width: `${(m.sent/m.max)*100}%`, background: 'var(--cream)'}}/></div>
            </div>
            <div>{m.st === 'Sending' ? <Badge kind="lime"><span className="dot dot--pulse"/>Sending</Badge> : <Badge kind="warn">Warming</Badge>}</div>
            <div style={{textAlign:'right'}}>
              <button className="btn btn--ghost btn--sm"><Icon name="moreH" size={12}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="card">
      <div className="card__head">
        <div className="card__title">Sending rules</div>
      </div>
      <div className="card__body" style={{display:'flex', flexDirection:'column', gap: 12}}>
        {[
          {l: 'Send window',           v: 'Mon–Fri · 9:00 → 17:30 (recipient TZ)'},
          {l: 'Random gap between sends', v: '30s – 90s'},
          {l: 'Skip if reply detected', v: 'On', good: true},
          {l: 'Pause if bounce rate >', v: '2%'},
          {l: 'Daily warmup volume',    v: 'Auto · +2 / day until target'},
          {l: 'Rotate sender mailbox',  v: 'Round-robin across healthy mailboxes', good: true},
        ].map((r, i) => (
          <div key={i} className="row" style={{justifyContent:'space-between', padding: '6px 0', borderBottom: '1px dashed var(--line)'}}>
            <span style={{fontSize: 12.5, color: 'var(--text-2)'}}>{r.l}</span>
            <span className="mono" style={{fontSize: 12, color: r.good ? 'var(--lime)' : 'var(--text)'}}>{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  </>
);

const PlanSettings = () => (
  <>
    <div className="card" style={{marginBottom: 16, padding: 24}}>
      <div className="row" style={{gap: 14, marginBottom: 14}}>
        <Badge kind="coral">Growth plan</Badge>
        <span className="mono muted" style={{fontSize: 11}}>$199 / month · renews Jun 14</span>
      </div>
      <div style={{fontSize: 28, fontFamily: 'var(--f-serif)', fontStyle:'italic', letterSpacing:'-0.02em', lineHeight: 1.1, marginBottom: 16}}>
        Up to 5,000 emails / mo, 4 mailboxes, 10k AI credits, unlimited CRM.
      </div>
      <div className="grid g-3" style={{gap: 14}}>
        {[
          {l: 'Emails this month', v: 3184, max: 5000, c: 'var(--lime)'},
          {l: 'AI credits',         v: 6400, max: 10000, c: 'var(--coral)'},
          {l: 'Mailboxes',          v: 4,    max: 4,     c: 'var(--cream)'},
        ].map((m, i) => (
          <div key={i} style={{padding: 14, background:'var(--bg-2)', border:'1px solid var(--line)', borderRadius: 8}}>
            <div className="row" style={{justifyContent:'space-between', marginBottom: 8}}>
              <span className="muted" style={{fontSize: 10.5, textTransform:'uppercase', letterSpacing:'.06em'}}>{m.l}</span>
              <span className="mono" style={{fontSize: 11}}>{m.v.toLocaleString()} / {m.max.toLocaleString()}</span>
            </div>
            <div className="bar"><span style={{width: `${(m.v/m.max)*100}%`, background: m.c}}/></div>
          </div>
        ))}
      </div>
    </div>

    <div className="grid g-3" style={{gap: 14}}>
      {[
        {n: 'Starter', p: '$49', leads: '500 emails', current: false},
        {n: 'Growth',  p: '$199', leads: '5,000 emails', current: true},
        {n: 'Agency',  p: '$599', leads: 'Unlimited', current: false},
      ].map((p, i) => (
        <div key={i} className="card" style={{padding: 20, border: p.current ? '1px solid var(--coral-border)' : '1px solid var(--line)', background: p.current ? 'var(--coral-soft)' : 'var(--surface)'}}>
          <div style={{fontSize: 14, fontWeight: 500, marginBottom: 6}}>{p.n}</div>
          <div className="row" style={{alignItems:'baseline', gap: 4, marginBottom: 10}}>
            <span className="serif" style={{fontSize: 32, letterSpacing:'-0.02em'}}>{p.p}</span>
            <span className="muted" style={{fontSize: 11}}>/ mo</span>
          </div>
          <div className="muted" style={{fontSize: 12, marginBottom: 14}}>{p.leads}</div>
          {p.current
            ? <Badge kind="coral">Current</Badge>
            : <button className="btn btn--sm" style={{width: '100%', justifyContent:'center'}}>Switch</button>}
        </div>
      ))}
    </div>
  </>
);

window.SettingsScreen = SettingsScreen;
