/* global React, Icon, Badge, ChannelChip, PageHead, Avatar */
const { useState: useStatePitch } = React;

const STEPS = [
  { n: 1, label: 'Brief',     status: 'done' },
  { n: 2, label: 'Research',  status: 'done' },
  { n: 3, label: 'Variants',  status: 'done' },
  { n: 4, label: 'Sequence',  status: 'current' },
  { n: 5, label: 'Send',      status: 'pending' },
];

const PitchScreen = ({ goSender }) => {
  const [variant, setVariant] = useStatePitch(0);
  const [subjVar, setSubjVar] = useStatePitch(0);

  const variants = [
    { angle: 'Channel-Hook · specific recent video', score: 96, why: 'Most distinctive opener. References the exact moment (4:12 chart).' },
    { angle: 'Sponsor-Adjacent · Acorns reference',  score: 87, why: 'Names a recent sponsor, positions as complementary not competing.' },
    { angle: 'Direct · skip the warm-up',            score: 74, why: 'Works because his bio says "DMs open." Shorter wins lower opens.' },
  ];

  const subjects = [
    'The 4:12 chart on your index funds video',
    'Following up after Acorns sponsorship',
    'Quick pitch for {{channel.name}}',
  ];

  const v = variants[variant];

  return (
    <div className="page" style={{maxWidth: 1280}}>
      <div style={{marginBottom: 16, display:'flex', alignItems:'center', gap: 10}}>
        <span className="mono muted" style={{fontSize: 11}}>FOR · @MarketMavenJay · Finance · 142k</span>
        <div className="spacer"/>
        <button className="btn btn--ghost btn--sm">Save as template</button>
        <button className="btn btn--ghost btn--sm"><Icon name="arrowR" size={12}/>Next prospect</button>
      </div>

      <PageHead
        title="Pitch Gen — <em>brief → research → draft → review → send.</em>"
      />

      {/* Stepper */}
      <div className="steps">
        {STEPS.map((s, i) => (
          <div key={s.n} className={`step ${s.status === 'done' ? 'is-done' : s.status === 'current' ? 'is-current' : ''}`}>
            <span className="step__num">{s.status === 'done' ? <Icon name="check" size={11}/> : s.n}</span>
            <span>{s.label}</span>
            {i < STEPS.length - 1 && <span className="muted" style={{marginLeft: 'auto', fontSize: 10}}>→</span>}
          </div>
        ))}
      </div>

      <div className="grid" style={{gridTemplateColumns: '1fr 1.4fr', gap: 20}}>
        {/* LEFT: brief + variants picker */}
        <div className="col" style={{gap: 16}}>
          <div className="card">
            <div className="card__head">
              <div className="card__title">Brief</div>
              <Badge kind="lime"><Icon name="check" size={11}/>Compiled</Badge>
            </div>
            <div className="card__body" style={{display:'flex', flexDirection:'column', gap: 12}}>
              <div className="field">
                <div className="field__label">Goal</div>
                <div style={{padding: '8px 11px', background: 'var(--bg-2)', borderRadius: 6, fontSize: 12.5, border: '1px solid var(--line)'}}>Book a 15-min call to discuss sponsorship</div>
              </div>
              <div className="field">
                <div className="field__label">Pitch one-liner</div>
                <div style={{padding: '8px 11px', background: 'var(--bg-2)', borderRadius: 6, fontSize: 12.5, border: '1px solid var(--line)', lineHeight: 1.55}}>$28 CPM for 60-sec mid-roll on Finance YT channels 50k–500k.</div>
              </div>
              <div className="field">
                <div className="field__label">Tone</div>
                <div className="row" style={{gap: 6}}>
                  <Badge kind="lime">Friendly</Badge>
                  <Badge kind="lime">Direct</Badge>
                  <Badge>+ AI confident</Badge>
                </div>
              </div>
              <div className="field">
                <div className="field__label">Personalization sources</div>
                <div className="col" style={{gap: 4}}>
                  {[
                    'Last 5 videos · views, hooks, topics',
                    'Sponsor history · last 90 days',
                    'Comment-section signal',
                    'Posting cadence + cadence pattern',
                  ].map((s, i) => (
                    <div key={i} className="row" style={{fontSize: 12, color: 'var(--text-2)', gap: 6}}>
                      <Icon name="check" size={11} style={{color: 'var(--lime)'}}/>{s}
                    </div>
                  ))}
                </div>
              </div>
              <button className="btn btn--ghost btn--sm" style={{justifyContent:'center'}}><Icon name="pen" size={11}/>Edit brief</button>
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <div className="card__title">3 variants ranked</div>
              <span className="mono muted" style={{fontSize: 11}}>predicted reply rate</span>
            </div>
            <div style={{padding: 8}}>
              {variants.map((vt, i) => (
                <button
                  key={i}
                  onClick={() => setVariant(i)}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '12px 14px',
                    background: variant === i ? 'var(--surface-2)' : 'transparent',
                    border: variant === i ? '1px solid var(--line-3)' : '1px solid transparent',
                    borderRadius: 8,
                    marginBottom: 4,
                    cursor: 'pointer',
                  }}>
                  <div className="row" style={{justifyContent: 'space-between', marginBottom: 4}}>
                    <span className="mono muted" style={{fontSize: 10.5}}>VARIANT {String.fromCharCode(65+i)}</span>
                    <span className="mono" style={{fontSize: 11, color: vt.score >= 90 ? 'var(--coral)' : 'var(--text-2)'}}>{vt.score}/100</span>
                  </div>
                  <div style={{fontSize: 12.5, fontWeight: 500, marginBottom: 4}}>{vt.angle}</div>
                  <div className="muted" style={{fontSize: 11.5, lineHeight: 1.5}}>{vt.why}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: preview */}
        <div className="col" style={{gap: 16}}>
          <div className="card">
            <div className="card__head">
              <div className="row">
                <div className="card__title">Preview</div>
                <ChannelChip color="var(--lime)">Finance · 142k</ChannelChip>
              </div>
              <div className="row" style={{gap: 6}}>
                <button className="btn btn--ghost btn--sm"><Icon name="eye" size={11}/>Mobile</button>
                <button className="btn btn--ghost btn--sm"><Icon name="pen" size={11}/>Edit</button>
                <button className="btn btn--ghost btn--sm"><Icon name="sparkle" size={11}/>Rewrite</button>
              </div>
            </div>
            <div className="card__body">
              {/* Subject variants */}
              <div className="muted" style={{fontSize: 10.5, textTransform:'uppercase', letterSpacing:'.06em', marginBottom: 6}}>Subject (3 A/B variants)</div>
              <div className="row" style={{gap: 6, marginBottom: 14, flexWrap: 'wrap'}}>
                {subjects.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setSubjVar(i)}
                    className="chan"
                    style={{
                      cursor: 'pointer',
                      padding: '6px 11px',
                      fontSize: 12,
                      background: subjVar === i ? 'var(--lime-soft)' : 'var(--surface)',
                      borderColor: subjVar === i ? 'var(--lime-border)' : 'var(--line)',
                      color: subjVar === i ? 'var(--lime)' : 'var(--text-2)',
                    }}>
                    {s}
                  </button>
                ))}
              </div>

              <div className="mail">
                <div className="mail__sub">{subjects[subjVar].replace('{{channel.name}}', '@MarketMavenJay')}</div>
                <div className="mail__meta">From sahil@reachagency.io · To jay@maven.co · Will send Tue 10:14 AM (best time for this niche)</div>
                <div className="mail__body">
{`Hey Jay,

Watched the index funds breakdown last night — the chart at 4:12 was genuinely the cleanest visualization I've seen on YT this year.

I run growth for a fintech app (no, not a robo-advisor 😅). We pay `}<span className="token">cpm</span>{` for 60-sec mid-roll placements on Finance channels in the 50k–500k range. Your audience would slot perfectly between Acorns and Public.

Worth a 15-min call to see if it's a fit?

— `}<span className="token">sender.first_name</span>
                </div>
              </div>

              {/* Predicted */}
              <div className="grid g-3" style={{gap: 10, marginTop: 14}}>
                {[
                  {l: 'Open rate',  v: '64%', c: 'var(--lime)',  d: '+8 vs avg'},
                  {l: 'Reply rate', v: '19%', c: 'var(--coral)', d: '+5 vs avg'},
                  {l: 'Spam risk',  v: '0.4', c: 'var(--ok)',    d: '/ 10'},
                ].map((m, i) => (
                  <div key={i} style={{padding: 12, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8}}>
                    <div className="muted" style={{fontSize: 10.5, textTransform:'uppercase', letterSpacing:'.06em'}}>{m.l}</div>
                    <div className="row" style={{alignItems: 'baseline', gap: 6, marginTop: 4}}>
                      <span className="mono" style={{fontSize: 18, color: m.c}}>{m.v}</span>
                      <span className="muted" style={{fontSize: 11}}>{m.d}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Followup row */}
          <div className="card">
            <div className="card__head">
              <div className="card__title">Followups</div>
              <span className="mono muted" style={{fontSize: 11}}>3 steps · skips on reply</span>
            </div>
            <div className="card__body" style={{padding: 0}}>
              {[
                {d: 'Day 2',  l: 'Bump if no reply',     prev: '"Bumping this — should I close the loop or worth a quick chat?"'},
                {d: 'Day 5',  l: 'Different angle',       prev: '"Different approach: here\'s a case study from a creator your size."'},
                {d: 'Day 9',  l: 'Final break-up',       prev: '"Last note — happy to never bother you again, just say the word."'},
              ].map((f, i) => (
                <div key={i} style={{padding: '14px 16px', borderBottom: i < 2 ? '1px solid var(--line)' : 'none', display: 'flex', gap: 14}}>
                  <div className="mono" style={{width: 50, color: 'var(--text-3)', fontSize: 11, paddingTop: 2}}>{f.d}</div>
                  <div style={{flex: 1}}>
                    <div style={{fontSize: 12.5, fontWeight: 500, marginBottom: 2}}>{f.l}</div>
                    <div className="muted" style={{fontSize: 12, fontStyle: 'italic'}}>{f.prev}</div>
                  </div>
                  <button className="btn btn--ghost btn--sm"><Icon name="pen" size={11}/></button>
                </div>
              ))}
            </div>
          </div>

          {/* Final CTA */}
          <div className="row" style={{gap: 8, marginTop: 4}}>
            <button className="btn">Back</button>
            <button className="btn">Save as draft</button>
            <div className="spacer"/>
            <button className="btn btn--primary" onClick={goSender}><Icon name="rocket" size={12}/>Queue for sending</button>
          </div>
        </div>
      </div>
    </div>
  );
};

window.PitchScreen = PitchScreen;
