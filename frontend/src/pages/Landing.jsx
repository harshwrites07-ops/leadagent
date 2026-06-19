import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Intersection observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'var(--f-sans)',
      minHeight: '100vh',
      overflowX: 'hidden',
    }}>

      {/* ══════════════════════════════
          GLOBAL LANDING STYLES
      ══════════════════════════════ */}
      <style>{`
        .reveal {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 600ms cubic-bezier(0.16,1,0.3,1),
                      transform 600ms cubic-bezier(0.16,1,0.3,1);
        }
        .reveal-delay-1 { transition-delay: 100ms; }
        .reveal-delay-2 { transition-delay: 200ms; }
        .reveal-delay-3 { transition-delay: 300ms; }
        .reveal-delay-4 { transition-delay: 400ms; }

        .land-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 28px;
          background: var(--lime);
          color: var(--bg);
          border: none;
          border-radius: 10px;
          font-family: var(--f-sans);
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 200ms cubic-bezier(0.16,1,0.3,1);
          text-decoration: none;
          letter-spacing: -0.2px;
        }
        .land-btn-primary:hover {
          background: var(--lime-2);
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(200,246,84,0.35);
        }

        .land-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 28px;
          background: transparent;
          color: var(--text-2);
          border: 1px solid var(--line-2);
          border-radius: 10px;
          font-family: var(--f-sans);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 200ms cubic-bezier(0.16,1,0.3,1);
          text-decoration: none;
        }
        .land-btn-secondary:hover {
          border-color: var(--lime-border);
          color: var(--lime);
          transform: translateY(-1px);
        }

        .feature-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 28px;
          transition: all 250ms cubic-bezier(0.16,1,0.3,1);
          position: relative;
          overflow: hidden;
        }
        .feature-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(200,246,84,0.4), transparent);
          opacity: 0;
          transition: opacity 250ms;
        }
        .feature-card:hover {
          border-color: var(--lime-border);
          box-shadow: 0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,246,84,0.1);
          transform: translateY(-4px);
        }
        .feature-card:hover::before {
          opacity: 1;
        }

        .pricing-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 32px;
          transition: all 250ms cubic-bezier(0.16,1,0.3,1);
        }
        .pricing-card.featured {
          background: linear-gradient(135deg, rgba(200,246,84,0.08) 0%, var(--surface) 100%);
          border-color: var(--lime-border);
          box-shadow: 0 0 0 1px var(--lime-border), 0 24px 64px rgba(0,0,0,0.5);
        }

        .stat-number {
          font-family: var(--f-mono);
          font-size: 48px;
          font-weight: 700;
          color: var(--lime);
          letter-spacing: -2px;
          line-height: 1;
        }

        .dashboard-preview {
          background: var(--surface);
          border: 1px solid var(--line-2);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 40px 80px rgba(0,0,0,0.8);
        }

        .dashboard-topbar {
          background: var(--bg-2);
          border-bottom: 1px solid var(--line);
          height: 40px;
          display: flex;
          align-items: center;
          padding: 0 16px;
          gap: 8px;
        }

        .dashboard-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
      `}</style>

      {/* ══════════════════════════════
          NAV
      ══════════════════════════════ */}
      <nav style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 48px',
        zIndex: 100,
        background: scrolled ? 'rgba(10,10,12,0.9)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--line)' : '1px solid transparent',
        transition: 'all 300ms cubic-bezier(0.16,1,0.3,1)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => navigate('/landing')}>
          <div style={{
            width: 28, height: 28,
            borderRadius: 6,
            background: 'var(--lime)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 12px rgba(200,246,84,0.4)',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L13 4.5V9.5L7 13L1 9.5V4.5L7 1Z" fill="#0a0a0c"/>
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>
            Quelro
          </span>
        </div>

        {/* Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {['Features', 'Pricing', 'Blog'].map(link => (
            <a key={link} href={`#${link.toLowerCase()}`} style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-3)',
              textDecoration: 'none',
              transition: 'color 150ms',
            }}
            onMouseEnter={e => e.target.style.color = 'var(--text)'}
            onMouseLeave={e => e.target.style.color = 'var(--text-3)'}
            >{link}</a>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => navigate('/login')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-3)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              padding: '8px 16px',
              borderRadius: 8,
              transition: 'color 150ms',
            }}
            onMouseEnter={e => e.target.style.color = 'var(--text)'}
            onMouseLeave={e => e.target.style.color = 'var(--text-3)'}
          >
            Sign in
          </button>
          <button className="land-btn-primary" style={{ padding: '9px 20px', fontSize: 13 }}
            onClick={() => navigate('/signup')}>
            Start Free Trial →
          </button>
        </div>
      </nav>

      {/* ══════════════════════════════
          HERO
      ══════════════════════════════ */}
      <section style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '120px 48px 80px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Background glow */}
        <div style={{
          position: 'absolute',
          top: '20%', left: '50%',
          transform: 'translateX(-50%)',
          width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(200,246,84,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundImage: 'radial-gradient(circle, rgba(200,246,84,0.08) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          opacity: 0.3,
          pointerEvents: 'none',
        }} />

        {/* Badge */}
        <div className="reveal" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--lime-soft)',
          border: '1px solid var(--lime-border)',
          borderRadius: 20,
          padding: '6px 14px',
          marginBottom: 32,
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--lime)',
          fontFamily: 'var(--f-mono)',
          letterSpacing: '0.5px',
        }}>
          <span style={{
            width: 6, height: 6,
            borderRadius: '50%',
            background: 'var(--lime)',
            animation: 'pulse 2s infinite',
          }} />
          NOW IN BETA · 100,000+ CREATORS INDEXED
        </div>

        {/* Headline */}
        <h1 className="reveal reveal-delay-1" style={{
          fontSize: 'clamp(40px, 6vw, 80px)',
          fontWeight: 800,
          letterSpacing: '-2px',
          lineHeight: 1.05,
          marginBottom: 24,
          maxWidth: 900,
          color: 'var(--text)',
        }}>
          Find YouTube creators{' '}
          <span style={{
            color: 'var(--lime)',
            textShadow: '0 0 40px rgba(200,246,84,0.3)',
          }}>
            ready to hire you
          </span>
          {'. On autopilot.'}
        </h1>

        {/* Subheading */}
        <p className="reveal reveal-delay-2" style={{
          fontSize: 18,
          color: 'var(--text-3)',
          maxWidth: 560,
          lineHeight: 1.65,
          marginBottom: 40,
          fontWeight: 400,
        }}>
          Quelro scores 100,000+ YouTube creators for hiring intent,
          writes personalized pitches in your voice,
          and tracks every reply to calls booked.
        </p>

        {/* CTAs */}
        <div className="reveal reveal-delay-3" style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginBottom: 60,
        }}>
          <button className="land-btn-primary" onClick={() => navigate('/signup')}>
            Start Free Trial — No card required →
          </button>
          <button className="land-btn-secondary" onClick={() => navigate('/login')}>
            Sign in
          </button>
        </div>

        {/* Social proof */}
        <div className="reveal reveal-delay-4" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginBottom: 80,
        }}>
          {[
            { value: '100K+', label: 'Creators indexed' },
            { value: '60%+', label: 'Reply rate' },
            { value: '10x', label: 'Faster outreach' },
            { value: '$0', label: 'To get started' },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 22,
                fontWeight: 800,
                fontFamily: 'var(--f-mono)',
                color: 'var(--lime)',
                letterSpacing: '-0.5px',
              }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Dashboard preview */}
        <div className="reveal" style={{ width: '100%', maxWidth: 900, position: 'relative' }}>
          <div style={{
            position: 'absolute',
            top: -20, left: '50%',
            transform: 'translateX(-50%)',
            width: '80%', height: 80,
            background: 'radial-gradient(ellipse, rgba(200,246,84,0.15) 0%, transparent 70%)',
            filter: 'blur(20px)',
            pointerEvents: 'none',
          }} />
          <div className="dashboard-preview">
            {/* Fake browser chrome */}
            <div className="dashboard-topbar">
              <div className="dashboard-dot" style={{ background: '#ff5f57' }} />
              <div className="dashboard-dot" style={{ background: '#ffbd2e' }} />
              <div className="dashboard-dot" style={{ background: '#28ca41' }} />
              <div style={{
                flex: 1,
                marginLeft: 12,
                background: 'var(--surface-2)',
                borderRadius: 4,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 10,
                fontSize: 11,
                color: 'var(--text-4)',
                fontFamily: 'var(--f-mono)',
              }}>
                app.quelro.com
              </div>
            </div>

            {/* Fake dashboard UI */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '200px 1fr',
              minHeight: 400,
            }}>
              {/* Fake sidebar */}
              <div style={{
                background: 'var(--bg-2)',
                borderRight: '1px solid var(--line)',
                padding: '16px 8px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  marginBottom: 16,
                }}>
                  <div style={{
                    width: 22, height: 22,
                    background: 'var(--lime)',
                    borderRadius: 4,
                    flexShrink: 0,
                  }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>Quelro</div>
                    <div style={{ fontSize: 8, color: 'var(--text-4)', fontFamily: 'var(--f-mono)' }}>OUTREACH OS</div>
                  </div>
                </div>
                {[
                  { label: 'Dashboard', active: true },
                  { label: 'Lead Finder', active: false },
                  { label: 'Campaigns', active: false },
                  { label: 'Email Sender', active: false },
                  { label: 'CRM', active: false },
                  { label: 'Quality Leads', active: false },
                ].map(({ label, active }) => (
                  <div key={label} style={{
                    padding: '7px 10px',
                    borderRadius: 5,
                    fontSize: 11,
                    fontWeight: active ? 600 : 400,
                    color: active ? 'var(--lime)' : 'var(--text-4)',
                    background: active ? 'rgba(200,246,84,0.08)' : 'transparent',
                    boxShadow: active ? 'inset 2px 0 0 var(--lime)' : 'none',
                    marginBottom: 2,
                  }}>
                    {label}
                  </div>
                ))}
              </div>

              {/* Fake main content */}
              <div style={{ padding: '20px', background: 'var(--bg)' }}>
                <div style={{
                  fontFamily: 'var(--f-serif)',
                  fontStyle: 'italic',
                  fontSize: 20,
                  color: 'var(--text)',
                  marginBottom: 16,
                }}>
                  Hey, Prathvi — ready to start sending.
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4,1fr)',
                  gap: 8,
                  marginBottom: 16,
                }}>
                  {[
                    { label: 'LEADS FOUND', value: '2,847', color: 'var(--text)' },
                    { label: 'PITCHES SENT', value: '124', color: 'var(--text)' },
                    { label: 'OPENS', value: '67%', color: 'var(--lime)' },
                    { label: 'IN THE PIPE', value: '$8,400', color: 'var(--ok)' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      padding: 12,
                    }}>
                      <div style={{
                        fontSize: 8,
                        fontFamily: 'var(--f-mono)',
                        color: 'var(--text-4)',
                        letterSpacing: '0.8px',
                        marginBottom: 6,
                      }}>{label}</div>
                      <div style={{
                        fontSize: 18,
                        fontWeight: 700,
                        fontFamily: 'var(--f-mono)',
                        color,
                        letterSpacing: '-0.5px',
                      }}>{value}</div>
                    </div>
                  ))}
                </div>
                {/* Fake activity */}
                <div style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: 12,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8 }}>
                    RECENT ACTIVITY
                  </div>
                  {[
                    { text: 'MrBeast replied to your pitch', time: '2m ago', color: 'var(--ok)' },
                    { text: 'Found 47 HOT leads in Tech niche', time: '15m ago', color: 'var(--lime)' },
                    { text: 'Email sent to PewDiePie', time: '1h ago', color: 'var(--text-4)' },
                  ].map(({ text, time, color }) => (
                    <div key={text} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 0',
                      borderBottom: '1px solid var(--line)',
                      fontSize: 10,
                    }}>
                      <span style={{ color: 'var(--text-2)' }}>{text}</span>
                      <span style={{ color: 'var(--text-4)', fontFamily: 'var(--f-mono)' }}>{time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          HOW IT WORKS
      ══════════════════════════════ */}
      <section style={{ padding: '120px 48px', maxWidth: 1100, margin: '0 auto' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{
            display: 'inline-block',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '1.5px',
            color: 'var(--lime)',
            fontFamily: 'var(--f-mono)',
            marginBottom: 16,
            textTransform: 'uppercase',
          }}>
            How it works
          </div>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 48px)',
            fontWeight: 800,
            letterSpacing: '-1px',
            lineHeight: 1.1,
            color: 'var(--text)',
            marginBottom: 16,
          }}>
            From zero to booked calls{' '}
            <span style={{ color: 'var(--lime)' }}>in 3 steps</span>
          </h2>
          <p style={{ fontSize: 16, color: 'var(--text-3)', maxWidth: 480, margin: '0 auto' }}>
            No more cold outreach that gets ignored.
            Just warm leads that are already looking to hire.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
        }}>
          {[
            {
              step: '01',
              title: 'Intent Prediction',
              desc: 'Quelro scans 100,000+ YouTube creators and scores each one for hiring intent. Only creators actively looking to hire get through.',
              metric: '0.75+',
              metricLabel: 'Intent score threshold',
              color: 'var(--lime)',
            },
            {
              step: '02',
              title: 'Psychology Matching',
              desc: "The AI analyzes each creator's content style, communication patterns, and psychological profile to craft a pitch in their language.",
              metric: '3 min',
              metricLabel: 'To generate a personalized pitch',
              color: 'var(--sky)',
            },
            {
              step: '03',
              title: 'Automated Outreach',
              desc: 'Pitches go out automatically, follow-ups are scheduled, and replies are tracked. You only step in when someone wants to talk.',
              metric: '60%+',
              metricLabel: 'Average reply rate',
              color: 'var(--coral)',
            },
          ].map(({ step, title, desc, metric, metricLabel, color }, i) => (
            <div key={step} className={`feature-card reveal reveal-delay-${i + 1}`}>
              <div style={{
                fontSize: 11,
                fontFamily: 'var(--f-mono)',
                fontWeight: 700,
                color: 'var(--text-4)',
                letterSpacing: '1px',
                marginBottom: 16,
              }}>
                STEP {step}
              </div>
              <div style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: 12,
                letterSpacing: '-0.3px',
              }}>
                {title}
              </div>
              <p style={{
                fontSize: 13,
                color: 'var(--text-3)',
                lineHeight: 1.6,
                marginBottom: 24,
              }}>
                {desc}
              </p>
              <div style={{
                borderTop: '1px solid var(--line)',
                paddingTop: 16,
              }}>
                <div style={{
                  fontSize: 28,
                  fontWeight: 800,
                  fontFamily: 'var(--f-mono)',
                  color,
                  letterSpacing: '-1px',
                  marginBottom: 4,
                }}>
                  {metric}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{metricLabel}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════
          FEATURES
      ══════════════════════════════ */}
      <section id="features" style={{ padding: '120px 48px', background: 'var(--surface)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '1.5px',
              color: 'var(--lime)',
              fontFamily: 'var(--f-mono)',
              marginBottom: 16,
              textTransform: 'uppercase',
            }}>
              Features
            </div>
            <h2 style={{
              fontSize: 'clamp(28px, 4vw, 48px)',
              fontWeight: 800,
              letterSpacing: '-1px',
              lineHeight: 1.1,
              color: 'var(--text)',
            }}>
              Everything you need to{' '}
              <span style={{ color: 'var(--lime)' }}>close creator clients</span>
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}>
            {[
              {
                icon: '⚡',
                title: 'Intent Prediction',
                desc: 'Our AI scans posting patterns, comment sentiment, and hiring signals to find creators in buying mode.',
              },
              {
                icon: '🧠',
                title: 'Psychology Profiles',
                desc: 'Every creator gets a psychological profile. Your pitch matches their personality, not a generic template.',
              },
              {
                icon: '📧',
                title: 'Voice DNA Engine',
                desc: 'The AI learns your writing style. Every email sounds like you wrote it — because it did.',
              },
              {
                icon: '🎯',
                title: 'Campaign Management',
                desc: "Run A/B tests, track open rates, manage follow-ups. See exactly what's working.",
              },
              {
                icon: '📊',
                title: 'CRM Pipeline',
                desc: 'Track every creator from first contact to signed client. Never lose a deal in your inbox again.',
              },
              {
                icon: '🔴',
                title: 'Reddit Signals',
                desc: 'We scan r/YouTubers, r/VideoEditing, and more for creators actively asking to hire. First mover advantage.',
              },
            ].map(({ icon, title, desc }, i) => (
              <div key={title} className={`feature-card reveal reveal-delay-${(i % 3) + 1}`}>
                <div style={{ fontSize: 28, marginBottom: 16 }}>{icon}</div>
                <div style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--text)',
                  marginBottom: 8,
                  letterSpacing: '-0.2px',
                }}>
                  {title}
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          SOCIAL PROOF
      ══════════════════════════════ */}
      <section style={{ padding: '120px 48px', maxWidth: 1100, margin: '0 auto' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 64 }}>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 48px)',
            fontWeight: 800,
            letterSpacing: '-1px',
            color: 'var(--text)',
            marginBottom: 16,
          }}>
            Results that speak
          </h2>
          <p style={{ fontSize: 16, color: 'var(--text-3)' }}>
            Freelancers and agencies using Quelro to land creator clients.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            {
              quote: "Booked 8 calls in 2 weeks. Closed 1 client at $2,000/month. This is the tool I've been waiting for.",
              name: 'Rohan M.',
              role: 'Video Editor',
              metric: '$2K/mo',
            },
            {
              quote: 'Went from 2% reply rate to 60%+. The psychology matching is insane. Creators actually respond.',
              name: 'Priya S.',
              role: 'Thumbnail Designer',
              metric: '60% replies',
            },
            {
              quote: 'Found 5 high-intent creators in the first week. 3 became paying clients. ROI was immediate.',
              name: 'Arjun K.',
              role: 'Scriptwriter',
              metric: '3 clients',
            },
          ].map(({ quote, name, role, metric }) => (
            <div key={name} className="feature-card reveal">
              <div style={{
                fontSize: 28,
                fontWeight: 800,
                fontFamily: 'var(--f-mono)',
                color: 'var(--lime)',
                marginBottom: 16,
                letterSpacing: '-1px',
              }}>
                {metric}
              </div>
              <p style={{
                fontSize: 14,
                color: 'var(--text-2)',
                lineHeight: 1.65,
                marginBottom: 20,
                fontStyle: 'italic',
              }}>
                "{quote}"
              </p>
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--f-mono)', marginTop: 2 }}>
                  {role}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════
          PRICING
      ══════════════════════════════ */}
      <section id="pricing" style={{ padding: '120px 48px', background: 'var(--surface)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '1.5px',
              color: 'var(--lime)',
              fontFamily: 'var(--f-mono)',
              marginBottom: 16,
              textTransform: 'uppercase',
            }}>
              Pricing
            </div>
            <h2 style={{
              fontSize: 'clamp(28px, 4vw, 48px)',
              fontWeight: 800,
              letterSpacing: '-1px',
              color: 'var(--text)',
            }}>
              Simple, honest pricing
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              {
                name: 'Starter',
                price: '$29',
                period: '/month',
                desc: 'For freelancers getting started with creator outreach.',
                features: [
                  '500 creators/month',
                  '50 AI pitches',
                  '1 Gmail account',
                  'Intent scoring',
                  'Basic analytics',
                ],
                cta: 'Start Free Trial',
                featured: false,
              },
              {
                name: 'Pro',
                price: '$49',
                period: '/month',
                desc: 'For serious freelancers closing creator clients every week.',
                features: [
                  '2,000 creators/month',
                  'Unlimited AI pitches',
                  '3 Gmail accounts',
                  'Psychology profiles',
                  'A/B testing',
                  'Reddit signals',
                  'Priority support',
                ],
                cta: 'Start Free Trial',
                featured: true,
              },
              {
                name: 'Agency',
                price: '$99',
                period: '/month',
                desc: 'For agencies managing outreach for multiple clients.',
                features: [
                  'Unlimited creators',
                  'Unlimited AI pitches',
                  '10 Gmail accounts',
                  'Multi-user access',
                  'White-label reports',
                  'Custom integrations',
                  'Dedicated support',
                ],
                cta: 'Contact Us',
                featured: false,
              },
            ].map(({ name, price, period, desc, features, cta, featured }) => (
              <div key={name} className={`pricing-card reveal ${featured ? 'featured' : ''}`}>
                {featured && (
                  <div style={{
                    display: 'inline-block',
                    background: 'var(--lime)',
                    color: 'var(--bg)',
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: '1px',
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontFamily: 'var(--f-mono)',
                    marginBottom: 16,
                    textTransform: 'uppercase',
                  }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                  {name}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 40,
                    fontWeight: 800,
                    fontFamily: 'var(--f-mono)',
                    color: featured ? 'var(--lime)' : 'var(--text)',
                    letterSpacing: '-2px',
                  }}>{price}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-4)' }}>{period}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 24, lineHeight: 1.5 }}>
                  {desc}
                </p>
                <button
                  className={featured ? 'land-btn-primary' : 'land-btn-secondary'}
                  style={{ width: '100%', justifyContent: 'center', marginBottom: 24 }}
                  onClick={() => navigate('/signup')}
                >
                  {cta}
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span style={{ color: 'var(--lime)', fontSize: 14 }}>✓</span>
                      <span style={{ color: 'var(--text-3)' }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          FINAL CTA
      ══════════════════════════════ */}
      <section style={{ padding: '120px 48px', textAlign: 'center' }}>
        <div className="reveal" style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{
            position: 'relative',
            display: 'inline-block',
            marginBottom: 32,
          }}>
            <div style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 300, height: 300,
              background: 'radial-gradient(circle, rgba(200,246,84,0.15) 0%, transparent 70%)',
              filter: 'blur(30px)',
              pointerEvents: 'none',
            }} />
          </div>
          <h2 style={{
            fontSize: 'clamp(32px, 5vw, 56px)',
            fontWeight: 800,
            letterSpacing: '-1.5px',
            lineHeight: 1.1,
            color: 'var(--text)',
            marginBottom: 20,
          }}>
            Stop sending cold emails.{' '}
            <span style={{ color: 'var(--lime)' }}>Start closing clients.</span>
          </h2>
          <p style={{
            fontSize: 16,
            color: 'var(--text-3)',
            marginBottom: 40,
            lineHeight: 1.6,
          }}>
            Join hundreds of freelancers and agencies
            who use Quelro to find creator clients on autopilot.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="land-btn-primary"
              style={{ fontSize: 16, padding: '16px 36px' }}
              onClick={() => navigate('/signup')}
            >
              Start Free Trial — No credit card →
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 16 }}>
            14-day free trial · Cancel anytime · Setup in 5 minutes
          </p>
        </div>
      </section>

      {/* ══════════════════════════════
          FOOTER
      ══════════════════════════════ */}
      <footer style={{
        borderTop: '1px solid var(--line)',
        padding: '40px 48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 24, height: 24,
            borderRadius: 5,
            background: 'var(--lime)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L13 4.5V9.5L7 13L1 9.5V4.5L7 1Z" fill="#0a0a0c"/>
            </svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)' }}>
            Quelro
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-4)' }}>
            © 2026
          </span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['Privacy', 'Terms', 'Blog', 'Contact'].map(link => (
            <a key={link}
              href={`/${link.toLowerCase()}`}
              style={{
                fontSize: 12,
                color: 'var(--text-4)',
                textDecoration: 'none',
                transition: 'color 150ms',
              }}
              onMouseEnter={e => e.target.style.color = 'var(--text-2)'}
              onMouseLeave={e => e.target.style.color = 'var(--text-4)'}
            >
              {link}
            </a>
          ))}
        </div>
      </footer>

    </div>
  );
}
