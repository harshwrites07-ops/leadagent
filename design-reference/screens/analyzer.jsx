/* global React, Icon, Avatar, Badge, ChannelChip, PageHead, Sparkline */

const AnalyzerScreen = ({ goPitch }) => {
  return (
    <div className="page" style={{maxWidth: 1320}}>
      <div style={{marginBottom: 20, display:'flex', alignItems:'center', gap: 12}}>
        <button className="btn btn--ghost btn--sm"><Icon name="chev" size={12} style={{transform:'rotate(180deg)'}}/>Back to Lead Finder</button>
        <span className="muted" style={{fontSize: 12}}>·</span>
        <span className="mono muted" style={{fontSize: 11.5}}>Analyzer report · generated 4m ago</span>
        <div className="spacer"/>
        <button className="btn btn--ghost btn--sm"><Icon name="arrowDown" size={12}/>Export PDF</button>
        <button className="btn btn--coral" onClick={goPitch}><Icon name="sparkle" size={12}/>Draft pitch with this brief</button>
      </div>

      <div className="dossier">
        {/* Hero (left, sticky) */}
        <div className="dossier__hero">
          <div className="dossier__channel-img">J</div>
          <div className="row" style={{gap: 6, marginBottom: 6}}>
            <Badge kind="coral">A+ score · 94</Badge>
          </div>
          <div style={{fontSize: 18, fontWeight: 500, letterSpacing:'-0.01em'}}>Jay Patel</div>
          <div className="mono muted" style={{fontSize: 11.5}}>@MarketMavenJay</div>
          <div className="muted" style={{fontSize: 12.5, lineHeight: 1.55, marginTop: 10}}>
            "Practical personal finance for people who don't have time for finance." Mid-tier US channel with a clean, charts-first editing style.
          </div>

          <div className="dossier__metric-grid">
            <div className="dossier__metric"><div className="dossier__metric-l">Subs</div><div className="dossier__metric-v">142k</div></div>
            <div className="dossier__metric"><div className="dossier__metric-l">Avg views</div><div className="dossier__metric-v">4.2M</div></div>
            <div className="dossier__metric"><div className="dossier__metric-l">Est. CPM</div><div className="dossier__metric-v" style={{color:'var(--lime)'}}>$28</div></div>
            <div className="dossier__metric"><div className="dossier__metric-l">Upload rate</div><div className="dossier__metric-v">2 / wk</div></div>
            <div className="dossier__metric"><div className="dossier__metric-l">Engagement</div><div className="dossier__metric-v">6.2%</div></div>
            <div className="dossier__metric"><div className="dossier__metric-l">Audience</div><div className="dossier__metric-v">US 64%</div></div>
          </div>

          <div className="muted" style={{fontSize: 11, textTransform:'uppercase', letterSpacing:'.06em', marginTop: 18, marginBottom: 8}}>Contact</div>
          <div style={{padding:10, background:'var(--bg-2)', border:'1px solid var(--line)', borderRadius: 8, fontFamily:'var(--f-mono)', fontSize:11.5}}>
            jay@maven.co
            <Icon name="check" size={11} className="" style={{marginLeft: 6, color:'var(--ok)'}}/>
          </div>
          <div className="muted" style={{fontSize: 10.5, marginTop: 6}}>Verified via Hunter · Apollo · domain MX check</div>
        </div>

        {/* Body (right) */}
        <div>
          {/* What we learned */}
          <div className="dossier__section">
            <h3>What the agent learned <span className="muted">Gemini 2.5 · 8.4s · 12 sources</span></h3>
            <ul style={{padding: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8}}>
              {[
                {ic: 'check', t: 'Talks like an everyman — uses "your buddy," "no jargon allowed." Avoid finance-speak in pitch.'},
                {ic: 'check', t: 'Last 3 sponsors: Acorns (twice), Public, Ramp. All at ~$28 CPM, 60-sec mid-roll.'},
                {ic: 'check', t: 'Cadence: Tues + Fri uploads. Tuesdays trend higher views (avg +18%).'},
                {ic: 'check', t: 'Hates: "limited time offer" copy, exclamation marks, anything that sounds like a press release.'},
                {ic: 'check', t: 'Loves: data visualizations, contrarian takes, references to The Psychology of Money.'},
                {ic: 'check', t: 'Comment section: mostly 25-40 US, asks about index funds, real estate, budgeting tools.'},
              ].map((p, i) => (
                <li key={i} className="row" style={{gap: 8, alignItems: 'flex-start', fontSize: 13, color:'var(--text-2)', lineHeight: 1.55}}>
                  <Icon name={p.ic} size={12} style={{color:'var(--lime)', marginTop: 4, flexShrink: 0}}/>
                  <span>{p.t}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Top angles */}
          <div className="dossier__section">
            <h3>Recommended angles <span className="muted">ranked by predicted reply rate</span></h3>
            {[
              {top: true, score: 96, title: '"The 4:12 chart on your index funds video"',
               body: 'Hook → his most distinctive recent moment (specific). Compliments his strength (data viz). Establishes you watch his work. 96/100 predicted reply.'},
              {score: 87, title: '"Following up after your Acorns sponsorship"',
               body: 'Positions us as adjacent, not competing. Names a recent sponsor he\'s comfortable with. Avoids cold-pitch feel.'},
              {score: 74, title: '"Quick pitch — fintech sponsorship for @MarketMavenJay"',
               body: 'Direct, low-effort. Works because his bio says "DMs open." Slightly underperforms longer hooks.'},
            ].map((a, i) => (
              <div key={i} className={`angle ${a.top ? 'angle--top' : ''}`}>
                <div className="angle__head">
                  <span className="angle__score">{a.score}/100</span>
                  <span style={{fontSize: 13, fontWeight: 500}}>{a.title}</span>
                  {a.top && <Badge kind="coral" style={{marginLeft:'auto'}}>Recommended</Badge>}
                </div>
                <div className="angle__body">{a.body}</div>
              </div>
            ))}
          </div>

          {/* Recent uploads */}
          <div className="dossier__section">
            <h3>Recent uploads <span className="muted">last 5</span></h3>
            <div>
              {[
                {t: 'Index funds vs. real estate — which actually wins?', v: '184k', d: '3 days ago', extra: 'best performer · 12k engagement'},
                {t: 'I asked 10 millionaires how much they spend on coffee', v: '92k',  d: '6 days ago', extra: ''},
                {t: 'The 2026 budget that finally worked for me',          v: '76k',  d: '10 days ago', extra: ''},
                {t: 'Why your 401k is leaking money (and you don\'t know it)', v: '118k', d: '14 days ago', extra: ''},
                {t: 'Real estate is a meme — change my mind',              v: '64k',  d: '17 days ago', extra: ''},
              ].map((v, i) => (
                <div key={i} className="vid-row">
                  <div className="vid-thumb">▶ THUMB</div>
                  <div>
                    <div className="vid-title">{v.t}</div>
                    <div className="vid-meta">{v.v} views · {v.d}{v.extra && <span style={{color: 'var(--lime)', marginLeft: 8}}>· {v.extra}</span>}</div>
                  </div>
                  <div className="muted mono" style={{fontSize: 10.5, alignSelf: 'center'}}>
                    <Icon name="eye" size={11}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sponsor history */}
          <div className="dossier__section">
            <h3>Sponsor history <span className="muted">last 90 days</span></h3>
            <div className="grid g-3" style={{gap: 10}}>
              {[
                {n: 'Acorns', d: '2× placements', tag: 'Direct competitor risk', kind: 'warn'},
                {n: 'Public', d: '1× placement', tag: 'Adjacent — safe', kind: 'lime'},
                {n: 'Ramp',   d: '1× placement', tag: 'Different category', kind: 'lime'},
              ].map((s, i) => (
                <div key={i} style={{padding: 14, border: '1px solid var(--line)', borderRadius: 8, background:'var(--bg-2)'}}>
                  <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
                    <div style={{fontSize: 13, fontWeight: 500}}>{s.n}</div>
                    <Badge kind={s.kind}>{s.tag}</Badge>
                  </div>
                  <div className="mono muted" style={{fontSize: 11}}>{s.d}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Audience signal */}
          <div className="dossier__section">
            <h3>Audience signal <span className="muted">from 1,240 recent comments</span></h3>
            <div className="row" style={{gap: 8, marginBottom: 14, flexWrap: 'wrap'}}>
              {['index funds (218)', 'real estate (164)', 'budgeting (142)', 'index ETFs (98)', 'retirement (84)', 'crypto (62)', 'tax loss (48)'].map((t, i) => (
                <span key={i} className="chan" style={{padding:'4px 9px', fontSize: 11.5}}>{t}</span>
              ))}
            </div>
            <div className="muted" style={{fontSize: 12, lineHeight: 1.55}}>
              Audience is action-oriented — 38% of comments ask "how do I…" or "what's the best way to…". Pitch should sell a *tool they can use*, not a concept.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

window.AnalyzerScreen = AnalyzerScreen;
