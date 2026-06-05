import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const PRICING = [
  {
    name: 'Starter',
    price: 39,
    period: 'mo',
    tag: null,
    emails: '2,000',
    leads: 'Unlimited',
    features: ['Lead Finder PowerMode', 'AI Email Generation', 'CRM Pipeline', 'Email Analytics', 'Follow-up Sequences', 'Gmail Integration'],
    cta: 'Start Free Trial',
    highlight: false,
  },
  {
    name: 'Pro',
    price: 79,
    period: 'mo',
    tag: 'MOST POPULAR',
    emails: '10,000',
    leads: 'Unlimited',
    features: ['Everything in Starter', '5x Email Volume', 'Multi-inbox Rotation', 'Priority AI Generation', 'Advanced Analytics', 'Jack AI Agent Access'],
    cta: 'Start Free Trial',
    highlight: true,
  },
  {
    name: 'Agency',
    price: 149,
    period: 'mo',
    tag: null,
    emails: 'Unlimited',
    leads: 'Unlimited',
    features: ['Everything in Pro', 'Unlimited Emails', 'Team Seats (coming)', 'White-label Reports', 'API Access', 'Dedicated Support'],
    cta: 'Start Free Trial',
    highlight: false,
  },
];

const FEATURES = [
  {
    icon: '🎯',
    title: 'Lead Finder PowerMode',
    desc: 'Extract thousands of verified email leads from YouTube channels in your niche. Every lead comes with subscriber count, engagement data, and a verified email address — ready to contact.',
  },
  {
    icon: '✍️',
    title: 'AI Email Generation',
    desc: 'Our AI studies each channel before writing. It spots their upload gaps, CTR issues, and growth stalls — then writes a hyper-personalized email that speaks directly to their pain point.',
  },
  {
    icon: '📬',
    title: 'Smart Email Sending',
    desc: 'Multi-inbox rotation sends at human-like intervals. Open tracking, reply detection, and automatic follow-up sequences run on autopilot — so you never miss a hot lead.',
  },
  {
    icon: '🗂️',
    title: 'CRM Pipeline',
    desc: 'Every lead flows into a visual pipeline. Track who opened, who replied, who needs a follow-up. Move deals forward without juggling spreadsheets.',
  },
  {
    icon: '📊',
    title: 'Deep Analytics',
    desc: 'See exactly which niches, subject lines, and email styles convert. Double down on what works. Cut what doesn\'t. Real numbers, not guesses.',
  },
  {
    icon: '🤖',
    title: 'Jack — Your AI Agent',
    desc: 'Tell Jack what you need in plain English. "Find 50 Finance creators under 100k subs." "Why did my reply rate drop?" Jack executes. You close.',
  },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Set Your Voice Profile', desc: 'Tell us your service, your results, your style. One-time setup. Our AI becomes you — writing emails that sound exactly like you, not a robot.' },
  { step: '02', title: 'Find Leads Instantly', desc: 'Pick your niche. Hit PowerMode. In seconds, you get dozens of pre-verified email leads — real YouTube channels with real contact emails.' },
  { step: '03', title: 'Generate & Send', desc: 'One click generates a channel-specific email. Our AI spots their weakest metric and leads with it. Hit send — or let the system send and follow up automatically.' },
];

export default function Landing() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <div style={{ background: '#0a0a0c', minHeight: '100vh', color: '#f3f3f5', fontFamily: "'Geist', sans-serif" }}>
      {/* ── Nav ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? 'rgba(10,10,12,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid #23232c' : '1px solid transparent',
        transition: 'all 0.2s',
        padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 60,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: '#c8f654',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.12)',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="#0a0a0c" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>Quelro</span>
          <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#46464f', letterSpacing: '0.1em', marginLeft: 4 }}>FOR CREATOR SERVICE PROVIDERS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/login')} style={navBtnStyle}>Log In</button>
          <button onClick={() => navigate('/signup')} style={ctaNavStyle}>Start Free Trial →</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '100px 24px 56px', position: 'relative', overflow: 'hidden' }}>
        {/* Background glow */}
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', width: 600, height: 600, background: 'radial-gradient(circle, rgba(200,246,84,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(200,246,84,0.08)', border: '1px solid rgba(200,246,84,0.25)', borderRadius: 99, padding: '5px 14px 5px 8px', marginBottom: 32 }}>
          <span style={{ background: '#c8f654', color: '#0a0a0c', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99, fontFamily: 'monospace', letterSpacing: '0.08em' }}>NEW</span>
          <span style={{ fontSize: 12, color: '#a8a8b3' }}>100 free emails + leads on signup — no card needed</span>
        </div>

        <h1 style={{ fontSize: 'clamp(38px, 6vw, 76px)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em', margin: '0 0 20px', maxWidth: 820 }}>
          The outreach system built for{' '}
          <span style={{ color: '#c8f654', fontStyle: 'italic', fontFamily: "'Instrument Serif', serif" }}>everyone who sells</span>
          {' '}to YouTube creators
        </h1>

        <p style={{ fontSize: 18, color: '#a8a8b3', lineHeight: 1.6, maxWidth: 580, margin: '0 0 40px' }}>
          Video editors, thumbnail designers, scriptwriters, agencies — find verified YouTube creator leads, send hyper-personalized emails, and land clients on autopilot.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 60 }}>
          <button onClick={() => navigate('/signup')} style={heroCta}>
            Start Free Trial — 100 emails included →
          </button>
          <button onClick={() => navigate('/login')} style={heroSecondary}>
            Already have an account
          </button>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[['1,700+', 'Verified leads ready now'], ['80%', 'Average open rate'], ['< 60s', 'To generate a personalized pitch']].map(([val, label]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#c8f654', letterSpacing: '-0.02em' }}>{val}</div>
              <div style={{ fontSize: 12, color: '#6e6e7a', marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={section}>
        <div style={sectionInner}>
          <div style={sectionLabel}>HOW IT WORKS</div>
          <h2 style={sectionH2}>Three steps from zero to booked</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginTop: 48 }}>
            {HOW_IT_WORKS.map(item => (
              <div key={item.step} style={stepCard}>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#c8f654', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 16 }}>{item.step}</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.01em' }}>{item.title}</h3>
                <p style={{ fontSize: 14, color: '#a8a8b3', lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ ...section, background: '#0d0d10' }}>
        <div style={sectionInner}>
          <div style={sectionLabel}>FEATURES</div>
          <h2 style={sectionH2}>Everything you need to fill your calendar</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 48 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={featureCard}>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{f.icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: '#a8a8b3', lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section style={section} id="pricing">
        <div style={sectionInner}>
          <div style={sectionLabel}>PRICING</div>
          <h2 style={sectionH2}>Start free. Scale when you're ready.</h2>
          <p style={{ fontSize: 15, color: '#a8a8b3', textAlign: 'center', margin: '-16px 0 48px' }}>
            Every account gets 100 free emails and 100 free lead extractions. No credit card required.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {PRICING.map(plan => (
              <div key={plan.name} style={{ ...pricingCard, ...(plan.highlight ? pricingCardHighlight : {}) }}>
                {plan.tag && (
                  <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: '#c8f654', color: '#0a0a0c', fontSize: 9, fontWeight: 800, padding: '3px 12px', borderRadius: 99, fontFamily: 'monospace', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
                    {plan.tag}
                  </div>
                )}
                <div style={{ marginBottom: 6, fontWeight: 700, fontSize: 15 }}>{plan.name}</div>
                <div style={{ marginBottom: 20 }}>
                  <span style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', color: plan.highlight ? '#c8f654' : '#f3f3f5' }}>${plan.price}</span>
                  <span style={{ fontSize: 14, color: '#6e6e7a' }}>/{plan.period}</span>
                </div>
                <div style={{ marginBottom: 6, fontSize: 13, color: '#a8a8b3' }}>✓ <strong style={{ color: '#f3f3f5' }}>{plan.emails} emails</strong>/month</div>
                <div style={{ marginBottom: 24, fontSize: 13, color: '#a8a8b3' }}>✓ <strong style={{ color: '#f3f3f5' }}>{plan.leads} leads</strong> extraction</div>
                <div style={{ borderTop: '1px solid #23232c', paddingTop: 20, marginBottom: 24 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ fontSize: 12, color: '#a8a8b3', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ color: plan.highlight ? '#c8f654' : '#6ee7a8', flexShrink: 0 }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                <button onClick={() => navigate('/signup')} style={{ ...pricingBtn, ...(plan.highlight ? pricingBtnHighlight : {}) }}>
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontSize: 12, color: '#46464f', marginTop: 24 }}>
            Cancel anytime · Secure checkout via Stripe · <a href="/terms" style={{ color: '#6e6e7a' }}>Terms</a> · <a href="/privacy" style={{ color: '#6e6e7a' }}>Privacy</a>
          </p>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section style={{ padding: '80px 24px', textAlign: 'center', background: 'linear-gradient(180deg, #0a0a0c 0%, #0f0f14 100%)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 16px', lineHeight: 1.1 }}>
            Your next client is already on YouTube.
          </h2>
          <p style={{ fontSize: 16, color: '#a8a8b3', margin: '0 0 36px', lineHeight: 1.6 }}>
            Whether you edit, design thumbnails, write scripts, or manage channels — stop sending generic cold DMs. Start using a system that finds the right creators and writes emails that speak directly to their pain.
          </p>
          <button onClick={() => navigate('/signup')} style={{ ...heroCta, fontSize: 16, padding: '14px 32px' }}>
            Get Started Free — No Card Needed →
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid #23232c', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: '#c8f654', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="#0a0a0c" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Quelro</span>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <a href="/privacy" style={{ fontSize: 12, color: '#6e6e7a', textDecoration: 'none' }}>Privacy</a>
          <a href="/terms" style={{ fontSize: 12, color: '#6e6e7a', textDecoration: 'none' }}>Terms</a>
          <button onClick={() => navigate('/login')} style={{ fontSize: 12, color: '#6e6e7a', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Log In</button>
        </div>
      </footer>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const navBtnStyle = { background: 'none', border: '1px solid #23232c', borderRadius: 8, padding: '7px 16px', color: '#a8a8b3', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
const ctaNavStyle = { background: '#c8f654', border: 'none', borderRadius: 8, padding: '7px 16px', color: '#0a0a0c', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const heroCta = { background: '#c8f654', color: '#0a0a0c', border: 'none', borderRadius: 10, padding: '13px 26px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' };
const heroSecondary = { background: 'none', color: '#a8a8b3', border: '1px solid #23232c', borderRadius: 10, padding: '13px 26px', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' };
const section = { padding: '64px 24px' };
const sectionInner = { maxWidth: 1080, margin: '0 auto' };
const sectionLabel = { fontFamily: 'monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: '#6e6e7a', textAlign: 'center', marginBottom: 16, textTransform: 'uppercase' };
const sectionH2 = { fontSize: 'clamp(24px, 3.5vw, 40px)', fontWeight: 800, textAlign: 'center', letterSpacing: '-0.03em', margin: '0 0 0', lineHeight: 1.15 };
const stepCard = { background: '#131318', border: '1px solid #23232c', borderRadius: 14, padding: 28 };
const featureCard = { background: '#131318', border: '1px solid #23232c', borderRadius: 14, padding: 28, transition: 'border-color 0.15s' };
const pricingCard = { background: '#131318', border: '1px solid #23232c', borderRadius: 16, padding: '32px 28px', position: 'relative' };
const pricingCardHighlight = { background: '#181820', border: '1px solid rgba(200,246,84,0.35)', boxShadow: '0 0 40px -8px rgba(200,246,84,0.12)' };
const pricingBtn = { width: '100%', background: '#1f1f28', color: '#f3f3f5', border: '1px solid #2c2c37', borderRadius: 9, padding: '11px 0', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' };
const pricingBtnHighlight = { background: '#c8f654', color: '#0a0a0c', border: 'none' };
