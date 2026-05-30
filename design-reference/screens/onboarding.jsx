/* global React, Icon */
const { useState: useStateOnb } = React;

const OnboardingOverlay = ({ onClose }) => {
  const [step, setStep] = useStateOnb(0);

  const steps = [
    { title: 'Welcome to ContentCrafterzz', sub: 'Built for agencies running outreach to creators.' },
    { title: 'Connect your mailbox',        sub: 'Outpost rotates across multiple senders to protect deliverability.' },
    { title: 'Tell us who you sell to',     sub: 'We use this to scrape, score, and personalize.' },
    { title: 'Draft your pitch',            sub: 'You write the brief. The agent writes the emails.' },
    { title: 'Ready to launch',             sub: 'Your first campaign is one click away.' },
  ];

  return (
    <div className="onb">
      <div className="onb__card">
        {/* Header */}
        <div style={{padding: '24px 28px 12px', display: 'flex', alignItems: 'center', gap: 14}}>
          <div className="sb__logo" style={{width: 30, height: 30}}><span>c</span></div>
          <div>
            <div style={{fontSize: 13, fontWeight: 600}}>ContentCrafterzz Outreach OS</div>
            <div className="muted mono" style={{fontSize: 10.5}}>Setup · {step + 1} of {steps.length}</div>
          </div>
          <div className="spacer"/>
          <button className="btn btn--ghost btn--sm" onClick={onClose}><Icon name="x" size={12}/>Skip</button>
        </div>

        {/* Progress */}
        <div style={{display: 'flex', gap: 4, padding: '0 28px 24px'}}>
          {steps.map((_, i) => (
            <div key={i} style={{flex: 1, height: 3, borderRadius: 2, background: i <= step ? 'var(--lime)' : 'var(--surface-3)'}}/>
          ))}
        </div>

        {/* Body */}
        <div style={{padding: '8px 28px 28px'}}>
          <div className="muted" style={{fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8}}>Step {step + 1}</div>
          <h2 className="page__title" style={{fontSize: 32, marginBottom: 6}}>{steps[step].title}</h2>
          <div className="muted" style={{fontSize: 13.5, lineHeight: 1.6, marginBottom: 24}}>{steps[step].sub}</div>

          {/* Step-specific content */}
          {step === 0 && (
            <div className="grid g-3" style={{gap: 12}}>
              {[
                {ic: 'sparkle', t: 'AI agents do the work', d: 'Scrape, study, write, send, follow up. You stay strategic.'},
                {ic: 'flame',   t: 'Deliverability-first',  d: 'Built-in warmup, rotation, and inbox placement monitoring.'},
                {ic: 'bar',     t: 'Honest analytics',       d: 'Cost per meeting. Pipeline value. Nothing vanity.'},
              ].map((f, i) => (
                <div key={i} style={{padding: 16, border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'var(--bg-2)'}}>
                  <div style={{color: 'var(--lime)', marginBottom: 10}}><Icon name={f.ic} size={18}/></div>
                  <div style={{fontSize: 13, fontWeight: 500, marginBottom: 4}}>{f.t}</div>
                  <div className="muted" style={{fontSize: 12, lineHeight: 1.5}}>{f.d}</div>
                </div>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="col" style={{gap: 10}}>
              {[
                {n: 'Google Workspace', d: 'Recommended · OAuth in 1 click', primary: true},
                {n: 'Microsoft 365',     d: 'Outlook & Exchange · OAuth'},
                {n: 'Custom SMTP / IMAP', d: 'Smartlead, Mailreef, your own server'},
              ].map((p, i) => (
                <div key={i} style={{padding: 16, border: `1px solid ${p.primary ? 'var(--lime-border)' : 'var(--line)'}`, borderRadius: 'var(--r)', background: p.primary ? 'var(--lime-soft)' : 'var(--surface)', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer'}}>
                  <div style={{width: 32, height: 32, borderRadius: 8, background: 'var(--bg-2)', display: 'grid', placeItems: 'center', fontFamily: 'var(--f-mono)', fontSize: 13, color: p.primary ? 'var(--lime)' : 'var(--text-2)'}}>
                    {p.n[0]}
                  </div>
                  <div style={{flex: 1}}>
                    <div style={{fontSize: 13.5, fontWeight: 500}}>{p.n}</div>
                    <div className="muted" style={{fontSize: 11.5}}>{p.d}</div>
                  </div>
                  <Icon name="chev" size={14} className=""/>
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="col" style={{gap: 14}}>
              <div className="field">
                <div className="field__label">What do you sell?</div>
                <input className="input" placeholder="e.g. AI thumbnail design for YouTubers" defaultValue="Sponsorship placements for fintech app"/>
              </div>
              <div className="field">
                <div className="field__label">Who's your ideal creator?</div>
                <div className="grid g-2" style={{gap: 10}}>
                  <input className="input" placeholder="Niche" defaultValue="Finance, Tech"/>
                  <input className="input" placeholder="Sub range" defaultValue="50k – 500k"/>
                  <input className="input" placeholder="Geography" defaultValue="US, UK, Canada"/>
                  <input className="input" placeholder="Posting cadence" defaultValue="1+ video / week"/>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="col" style={{gap: 12}}>
              <div className="field">
                <div className="field__label">Your one-line pitch</div>
                <textarea className="textarea" rows={3} defaultValue="We pay $28 CPM for 60-sec mid-roll placements on Finance YouTube channels (50k–500k subs)."/>
              </div>
              <div style={{padding: 12, border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'var(--bg-2)', display: 'flex', alignItems: 'flex-start', gap: 10}}>
                <Icon name="sparkle" size={14} className=""/>
                <div style={{fontSize: 12.5, color: 'var(--text-2)'}}>
                  We'll turn this into ~50 personalized variants per send — referencing each creator's latest video, tone, and sponsor history.
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div style={{textAlign: 'center', padding: '24px 0'}}>
              <div style={{display: 'inline-grid', placeItems: 'center', width: 84, height: 84, borderRadius: 28, background: 'var(--lime-soft)', border: '1px solid var(--lime-border)', color: 'var(--lime)', marginBottom: 18}}>
                <Icon name="rocket" size={36}/>
              </div>
              <div className="page__title" style={{fontSize: 30, marginBottom: 10}}>You're set up.</div>
              <div className="muted" style={{fontSize: 13.5, maxWidth: 420, margin: '0 auto'}}>
                Your first campaign — Finance YT 50k+ — is queued with 184 prospects. Launch when you're ready.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{padding: '18px 28px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-2)'}}>
          <span className="muted" style={{fontSize: 11.5}}>Takes ~3 minutes. Skip anytime.</span>
          <div className="spacer"/>
          {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Back</button>}
          {step < steps.length - 1
            ? <button className="btn btn--primary" onClick={() => setStep(step + 1)}>Continue <Icon name="arrowR" size={12}/></button>
            : <button className="btn btn--primary" onClick={onClose}><Icon name="rocket" size={12}/>Launch first campaign</button>}
        </div>
      </div>
    </div>
  );
};

window.OnboardingOverlay = OnboardingOverlay;
