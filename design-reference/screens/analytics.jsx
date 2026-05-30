/* global React, Icon, Badge, ChannelChip, PageHead, Sparkline, Bars */

const AnalyticsScreen = () => {
  const months = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const hours = Array.from({length: 24}, (_, i) => i);

  // Heatmap data (7 days x 24 hours) — reply rates
  const heat = Array.from({length: 7}, (_, d) =>
    Array.from({length: 24}, (_, h) => {
      // Peak: Tue-Thu, 9-11am and 2-3pm
      let v = 0.1 + Math.random() * 0.2;
      if ([1, 2, 3].includes(d) && [9, 10, 11, 14, 15].includes(h)) v = 0.7 + Math.random() * 0.3;
      else if ([0, 1, 2, 3, 4].includes(d) && h >= 8 && h <= 18) v = 0.3 + Math.random() * 0.4;
      else if ([5, 6].includes(d)) v = 0.05 + Math.random() * 0.15;
      return Math.min(1, v);
    })
  );

  return (
    <div className="page">
      <PageHead
        eyebrow="Last 30 days"
        title="Analytics — <em>the truth about your outreach.</em>"
        actions={
          <>
            <button className="btn btn--ghost"><Icon name="clock" size={13}/>Last 30 days</button>
            <button className="btn btn--ghost"><Icon name="arrowDown" size={13}/>Export</button>
          </>
        }
      />

      {/* Hero numbers */}
      <div className="grid" style={{gridTemplateColumns: '1.4fr 1fr 1fr', marginBottom: 28}}>
        <div className="card" style={{padding: '32px 28px'}}>
          <div className="muted" style={{fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.08em'}}>Pipeline value generated</div>
          <div className="hero-num" style={{color: 'var(--cream)', marginTop: 14}}>$184,200</div>
          <div className="row" style={{marginTop: 12, gap: 14}}>
            <span className="badge badge--lime"><Icon name="arrowUp" size={11}/>+34.6%</span>
            <span className="muted" style={{fontSize: 12}}>vs previous 30 days</span>
          </div>
          <div style={{marginTop: 18}}>
            <Sparkline data={[40, 48, 44, 56, 60, 58, 72, 68, 84, 90, 88, 104, 124, 142, 168, 184]} color="var(--cream)" height={56}/>
          </div>
        </div>

        <div className="card" style={{padding: '24px'}}>
          <div className="muted" style={{fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em'}}>Meetings booked</div>
          <div style={{display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10}}>
            <span className="serif" style={{fontSize: 64, lineHeight: 1, letterSpacing: '-0.03em', color: 'var(--coral)'}}>146</span>
            <span className="mono" style={{color: 'var(--coral)', fontSize: 13}}>+38</span>
          </div>
          <div className="muted" style={{fontSize: 11.5, marginTop: 8}}>4.9 / day · 1 every ~4hrs</div>
          <div style={{marginTop: 14}}><Sparkline data={[2,3,4,3,5,6,5,7,8,6,9,10,8,12,11,14]} color="var(--coral)" height={36}/></div>
        </div>

        <div className="card" style={{padding: '24px'}}>
          <div className="muted" style={{fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em'}}>Cost per meeting</div>
          <div style={{display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10}}>
            <span className="serif" style={{fontSize: 64, lineHeight: 1, letterSpacing: '-0.03em'}}>$4.20</span>
            <span className="mono" style={{color: 'var(--lime)', fontSize: 13}}>-18%</span>
          </div>
          <div className="muted" style={{fontSize: 11.5, marginTop: 8}}>vs $24 industry median</div>
          <div style={{marginTop: 14}}><Sparkline data={[8,7,8,7,6,7,6,5,6,5,5,4,4,5,4,4]} color="var(--lime)" height={36}/></div>
        </div>
      </div>

      {/* Funnel + Deliverability */}
      <div className="grid" style={{gridTemplateColumns: '1.4fr 1fr', gap: 16}}>
        <div className="card">
          <div className="card__head">
            <div className="card__title">Funnel</div>
            <span className="mono muted" style={{fontSize: 11}}>conversion at each stage</span>
          </div>
          <div className="card__body">
            {[
              {l: 'Sent',         n: 18420, p: 100, c: 'var(--text)'},
              {l: 'Delivered',    n: 18198, p: 98.8, c: 'var(--text)'},
              {l: 'Opened',       n: 11392, p: 61.8, c: 'var(--lime)'},
              {l: 'Replied',      n: 2614,  p: 14.2, c: 'var(--coral)'},
              {l: 'Positive',     n: 884,   p: 4.8,  c: 'var(--coral)'},
              {l: 'Meeting',      n: 146,   p: 0.79, c: 'var(--cream)'},
            ].map((row, i) => (
              <div key={i} style={{marginBottom: 14}}>
                <div className="row" style={{justifyContent: 'space-between', marginBottom: 6}}>
                  <span style={{fontSize: 13}}>{row.l}</span>
                  <div className="row" style={{gap: 12}}>
                    <span className="mono muted" style={{fontSize: 11}}>{row.p}%</span>
                    <span className="mono" style={{fontSize: 13}}>{row.n.toLocaleString()}</span>
                  </div>
                </div>
                <div className="bar" style={{height: 6}}>
                  <span style={{width: `${row.p}%`, background: row.c}}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <div className="card__title">Deliverability</div>
            <Badge kind="ok"><Icon name="check" size={11}/>Healthy</Badge>
          </div>
          <div className="card__body">
            <div className="row" style={{gap: 20, marginBottom: 20}}>
              <div className="ring" style={{'--p': 98, '--c': 'var(--lime)', width: 96, height: 96}}>
                <span className="mono" style={{fontSize: 18}}>98.6%</span>
              </div>
              <div>
                <div style={{fontSize: 13, marginBottom: 6}}>Inbox placement</div>
                <div className="muted" style={{fontSize: 12}}>Across 4 connected mailboxes over the last 30 days.</div>
              </div>
            </div>

            {[
              {l: 'SPF',  v: 'pass', good: true},
              {l: 'DKIM', v: 'pass', good: true},
              {l: 'DMARC', v: 'pass', good: true},
              {l: 'Spam score (avg)', v: '0.4 / 10', good: true},
              {l: 'Bounce rate',     v: '1.2%', good: true},
              {l: 'Spam complaints', v: '0.01%', good: true},
            ].map((row, i) => (
              <div key={i} className="row" style={{justifyContent: 'space-between', padding: '8px 0', borderTop: i > 0 ? '1px dashed var(--line)' : 'none'}}>
                <span style={{fontSize: 12.5, color: 'var(--text-2)'}}>{row.l}</span>
                <span className={`mono`} style={{fontSize: 12, color: row.good ? 'var(--ok)' : 'var(--bad)'}}>{row.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Heatmap — best time to send */}
      <div className="section-head"><h3>Best time to send · reply rate heatmap</h3></div>
      <div className="card">
        <div className="card__body">
          <div style={{display: 'grid', gridTemplateColumns: '24px repeat(24, 1fr)', gap: 3}}>
            <div></div>
            {hours.map(h => (
              <div key={h} className="mono muted" style={{fontSize: 9, textAlign: 'center'}}>
                {h % 3 === 0 ? `${h}` : ''}
              </div>
            ))}
            {months.map((m, di) => (
              <React.Fragment key={di}>
                <div className="mono muted" style={{fontSize: 10, lineHeight: '20px'}}>{m}</div>
                {hours.map(h => {
                  const v = heat[di][h];
                  return (
                    <div key={h} style={{
                      height: 20,
                      borderRadius: 3,
                      background: `oklch(${0.18 + v * 0.6} ${v * 0.15} 130)`,
                      border: '1px solid var(--bg)',
                    }} title={`${m} ${h}:00 · ${(v*100).toFixed(0)}% reply`}/>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="row" style={{marginTop: 14, gap: 12, justifyContent: 'flex-end'}}>
            <span className="muted" style={{fontSize: 11}}>Low</span>
            {[0.1, 0.3, 0.5, 0.7, 0.9].map(v => (
              <div key={v} style={{width: 18, height: 12, borderRadius: 2, background: `oklch(${0.18 + v * 0.6} ${v * 0.15} 130)`}}/>
            ))}
            <span className="muted" style={{fontSize: 11}}>High</span>
          </div>
        </div>
      </div>

      {/* Top performing copy */}
      <div className="grid" style={{gridTemplateColumns: '1fr 1fr', marginTop: 24}}>
        <div className="card">
          <div className="card__head">
            <div className="card__title">Top-performing copy</div>
            <button className="btn btn--ghost btn--sm">All variants</button>
          </div>
          <div className="card__body" style={{padding: 0}}>
            {[
              {sub: 'The 4:12 chart on your index funds video', open: 64, reply: 19, sent: 412},
              {sub: 'Following up after Acorns sponsorship',     open: 58, reply: 17, sent: 296},
              {sub: 'Quick question about {{channel.name}}',     open: 61, reply: 14, sent: 184},
              {sub: 'Re: collab for {{channel.name}}',           open: 52, reply: 11, sent: 612},
              {sub: 'Loved your latest upload',                  open: 46, reply: 8,  sent: 188},
            ].map((r, i) => (
              <div key={i} style={{padding: '12px 16px', borderBottom: i < 4 ? '1px solid var(--line)' : 'none'}}>
                <div style={{fontSize: 12.5, marginBottom: 4}}>{r.sub}</div>
                <div className="row" style={{gap: 16}}>
                  <span className="mono muted" style={{fontSize: 11}}>{r.sent} sent</span>
                  <span className="mono muted" style={{fontSize: 11}}>{r.open}% open</span>
                  <span className="mono" style={{fontSize: 11, color: 'var(--coral)'}}>{r.reply}% reply</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <div className="card__title">Niche performance</div>
            <span className="mono muted" style={{fontSize: 11}}>reply rate</span>
          </div>
          <div className="card__body">
            {[
              {n: 'Finance',  v: 17, color: 'var(--lime)'},
              {n: 'Tech',     v: 14, color: 'var(--sky)'},
              {n: 'Fitness',  v: 11, color: 'var(--rose)'},
              {n: 'Cooking',  v: 9,  color: 'var(--cream)'},
              {n: 'Gaming',   v: 8,  color: 'var(--violet)'},
              {n: 'Design',   v: 13, color: 'var(--sky)'},
              {n: 'Travel',   v: 10, color: 'var(--rose)'},
            ].map((row, i) => (
              <div key={i} style={{marginBottom: 12}}>
                <div className="row" style={{justifyContent: 'space-between', marginBottom: 4}}>
                  <div className="row" style={{gap: 8}}>
                    <ChannelChip color={row.color}>{row.n}</ChannelChip>
                  </div>
                  <span className="mono" style={{fontSize: 12}}>{row.v}%</span>
                </div>
                <div className="bar"><span style={{width: `${(row.v / 20) * 100}%`, background: row.color}}/></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

window.AnalyticsScreen = AnalyticsScreen;
