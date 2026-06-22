import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    const onMouse = (e) => {
      setMouseX(e.clientX / window.innerWidth);
      setMouseY(e.clientY / window.innerHeight);
    };
    window.addEventListener('scroll', onScroll);
    window.addEventListener('mousemove', onMouse);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('mousemove', onMouse);
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('revealed');
      }),
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const navScrolled = scrollY > 20;

  return (
    <div style={{
      background: '#0a0a0c',
      color: '#f3f3f5',
      fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
      minHeight: '100vh',
      overflowX: 'hidden',
      WebkitFontSmoothing: 'antialiased',
    }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .reveal {
          opacity: 0;
          transform: translateY(32px);
          transition: opacity 700ms cubic-bezier(0.16,1,0.3,1), transform 700ms cubic-bezier(0.16,1,0.3,1);
        }
        .reveal.revealed { opacity: 1; transform: none; }
        .reveal-d1 { transition-delay: 80ms; }
        .reveal-d2 { transition-delay: 160ms; }
        .reveal-d3 { transition-delay: 240ms; }
        .reveal-d4 { transition-delay: 320ms; }
        .reveal-d5 { transition-delay: 400ms; }

        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes float1 {
          0%,100% { transform: perspective(1000px) rotateX(4deg) translateY(0px); }
          50% { transform: perspective(1000px) rotateX(4deg) translateY(-8px); }
        }
        @keyframes glow-pulse {
          0%,100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        @keyframes blink {
          0%,100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .lp-btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 14px 28px;
          background: #c8f654; color: #0a0a0c;
          border: none; border-radius: 10px;
          font-size: 14px; font-weight: 700;
          cursor: pointer; text-decoration: none;
          transition: all 200ms cubic-bezier(0.16,1,0.3,1);
          letter-spacing: -0.2px; white-space: nowrap;
          position: relative; overflow: hidden;
        }
        .lp-btn-primary::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 60%);
          opacity: 0; transition: opacity 200ms;
        }
        .lp-btn-primary:hover {
          background: #d6ff6e;
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(200,246,84,0.4), 0 0 0 1px rgba(200,246,84,0.5);
        }
        .lp-btn-primary:hover::before { opacity: 1; }

        .lp-btn-ghost {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 14px 24px;
          background: rgba(255,255,255,0.04);
          color: rgba(243,243,245,0.7);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          font-size: 14px; font-weight: 600;
          cursor: pointer; text-decoration: none;
          transition: all 200ms cubic-bezier(0.16,1,0.3,1);
        }
        .lp-btn-ghost:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.15);
          color: #f3f3f5;
          transform: translateY(-1px);
        }

        .feature-card {
          background: rgba(19,19,24,0.8);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px; padding: 28px;
          transition: all 300ms cubic-bezier(0.16,1,0.3,1);
          position: relative; overflow: hidden;
          backdrop-filter: blur(8px);
        }
        .feature-card::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(200,246,84,0.6), transparent);
          opacity: 0; transition: opacity 300ms;
        }
        .feature-card:hover {
          border-color: rgba(200,246,84,0.2);
          box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,246,84,0.1), 0 0 40px rgba(200,246,84,0.05);
          transform: translateY(-6px);
          background: rgba(22,22,28,0.9);
        }
        .feature-card:hover::before { opacity: 1; }

        .icon-box {
          width: 40px; height: 40px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 16px; font-size: 18px;
          border: 1px solid rgba(255,255,255,0.08);
        }

        .stat-number {
          font-size: 56px; font-weight: 900;
          letter-spacing: -3px; line-height: 1;
          background: linear-gradient(135deg, #c8f654 0%, #d6ff6e 50%, #f3f3f5 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .pricing-card {
          background: rgba(19,19,24,0.8);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px; padding: 36px;
          transition: all 300ms cubic-bezier(0.16,1,0.3,1);
          position: relative; overflow: hidden;
        }
        .pricing-card.featured {
          background: linear-gradient(135deg, rgba(200,246,84,0.06) 0%, rgba(19,19,24,0.9) 60%);
          border-color: rgba(200,246,84,0.25);
          box-shadow: 0 0 0 1px rgba(200,246,84,0.1), 0 40px 80px rgba(0,0,0,0.5);
        }
        .pricing-card:hover:not(.featured) {
          border-color: rgba(255,255,255,0.12);
          transform: translateY(-4px);
        }

        .testimonial-card {
          background: rgba(19,19,24,0.8);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px; padding: 28px;
          transition: all 300ms cubic-bezier(0.16,1,0.3,1);
          position: relative;
        }
        .testimonial-card:hover {
          border-color: rgba(200,246,84,0.15);
          transform: translateY(-4px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }

        .section-label {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 700;
          letter-spacing: 1.5px; text-transform: uppercase;
          color: #c8f654;
          font-family: 'Geist Mono', monospace;
          margin-bottom: 20px;
        }

        .gradient-text {
          background: linear-gradient(135deg, #f3f3f5 0%, #c8f654 60%, #d6ff6e 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .noise-bg {
          position: fixed; inset: 0; pointer-events: none;
          opacity: 0.025; z-index: 1000;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
        }
      `}</style>

      <div className="noise-bg" />

      {/* ══ NAV ══ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: 60, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px',
        background: navScrolled ? 'rgba(10,10,12,0.85)' : 'transparent',
        backdropFilter: navScrolled ? 'blur(20px) saturate(180%)' : 'none',
        WebkitBackdropFilter: navScrolled ? 'blur(20px) saturate(180%)' : 'none',
        borderBottom: navScrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        transition: 'all 400ms cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: '#c8f654',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(200,246,84,0.5)', flexShrink: 0,
          }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1.5L13.5 5V10L7.5 13.5L1.5 10V5L7.5 1.5Z" fill="#0a0a0c"/>
            </svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.5px', color: '#f3f3f5' }}>Quelro</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {['Features', 'Pricing', 'Blog'].map(item => (
            <a key={item} href={`#${item.toLowerCase()}`} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              color: 'rgba(243,243,245,0.5)', textDecoration: 'none', transition: 'color 150ms',
            }}
            onMouseEnter={e => e.target.style.color = '#f3f3f5'}
            onMouseLeave={e => e.target.style.color = 'rgba(243,243,245,0.5)'}
            >{item}</a>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/login')} style={{
            background: 'none', border: 'none', color: 'rgba(243,243,245,0.5)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px 16px',
            borderRadius: 8, transition: 'color 150ms',
          }}
          onMouseEnter={e => e.target.style.color = '#f3f3f5'}
          onMouseLeave={e => e.target.style.color = 'rgba(243,243,245,0.5)'}
          >Sign in</button>
          <button className="lp-btn-primary" style={{ padding: '9px 18px', fontSize: 13 }}
            onClick={() => navigate('/signup')}>
            Get started free →
          </button>
        </div>
      </nav>

      {/* ══ HERO ══ */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '100px 40px 80px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(600px circle at ${mouseX * 100}% ${mouseY * 100}%, rgba(200,246,84,0.06) 0%, transparent 50%)`,
          pointerEvents: 'none', transition: 'background 200ms',
        }} />
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 100% 60% at 50% -10%, rgba(200,246,84,0.1) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 85% 70%, rgba(110,231,168,0.04) 0%, transparent 50%),
            radial-gradient(ellipse 50% 40% at 15% 70%, rgba(142,197,255,0.03) 0%, transparent 50%)
          `,
        }} />
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          maskImage: 'radial-gradient(ellipse 90% 70% at 50% 40%, black 20%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 70% at 50% 40%, black 20%, transparent 100%)',
          opacity: 0.35,
        }} />
        <div style={{
          position: 'absolute', top: 0, left: '10%', right: '10%', height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(200,246,84,0.5), transparent)',
          opacity: 0.6,
        }} />

        <div className="reveal" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(200,246,84,0.08)', border: '1px solid rgba(200,246,84,0.25)',
          borderRadius: 100, padding: '5px 14px 5px 10px', marginBottom: 28, cursor: 'default',
        }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(200,246,84,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#c8f654', animation: 'blink 2s infinite' }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#c8f654', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace' }}>
            Now in Beta · 100,000+ Creators Indexed
          </span>
        </div>

        <h1 className="reveal reveal-d1" style={{
          fontSize: 'clamp(48px, 8.5vw, 104px)', fontWeight: 900,
          letterSpacing: 'clamp(-2px, -0.03em, -4px)', lineHeight: 0.92,
          marginBottom: 28, maxWidth: 960, color: '#f3f3f5',
        }}>
          Your next creator
          <br />
          <span style={{
            background: 'linear-gradient(135deg, #c8f654 0%, #d6ff6e 40%, #c8f654 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            filter: 'drop-shadow(0 0 40px rgba(200,246,84,0.3))',
          }}>client is watching</span>
          <br />
          <span style={{ color: 'rgba(243,243,245,0.35)', fontSize: '0.65em', letterSpacing: '-1px' }}>YouTube right now.</span>
        </h1>

        <p className="reveal reveal-d2" style={{
          fontSize: 'clamp(15px, 1.8vw, 19px)', color: 'rgba(243,243,245,0.45)',
          maxWidth: 520, lineHeight: 1.65, marginBottom: 36, fontWeight: 400, letterSpacing: '-0.2px',
        }}>
          Quelro finds the creators actively looking to hire,
          writes pitches in your exact voice,
          and fills your calendar with calls.
          <span style={{ color: 'rgba(200,246,84,0.8)', fontWeight: 600 }}> Without cold outreach.</span>
        </p>

        <div className="reveal reveal-d3" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 48 }}>
          <button className="lp-btn-primary" style={{ fontSize: 15, padding: '15px 32px' }}
            onClick={() => navigate('/signup')}>
            Get Your First 10 HOT Leads Free →
          </button>
          <button className="lp-btn-ghost" onClick={() => navigate('/login')}>Sign in</button>
        </div>

        <div className="reveal reveal-d4" style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 80, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ fontSize: 11, color: 'rgba(243,243,245,0.25)', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: 'monospace' }}>Built for</span>
          {['Video Editors', 'Thumbnail Designers', 'Scriptwriters', 'Content Agencies'].map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(243,243,245,0.4)', fontWeight: 500 }}>
              {i > 0 && <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>}
              {label}
            </div>
          ))}
        </div>

        {/* Dashboard Preview */}
        <div className="reveal reveal-d5" style={{ width: '100%', maxWidth: 1040, position: 'relative' }}>
          <div style={{ position: 'absolute', top: -40, left: '15%', right: '15%', height: 80, background: 'radial-gradient(ellipse, rgba(200,246,84,0.3) 0%, transparent 70%)', filter: 'blur(24px)', pointerEvents: 'none', animation: 'glow-pulse 4s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', bottom: -20, left: '5%', right: '5%', height: 60, background: 'radial-gradient(ellipse, rgba(200,246,84,0.1) 0%, transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />
          <div style={{ animation: 'float1 8s ease-in-out infinite', borderRadius: 16, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(200,246,84,0.12), 0 0 0 1px rgba(255,255,255,0.04), 0 60px 120px rgba(0,0,0,0.9), 0 30px 60px rgba(0,0,0,0.6), 0 0 60px rgba(200,246,84,0.06)' }}>
            <div style={{ background: '#0e0e11', borderBottom: '1px solid rgba(255,255,255,0.06)', height: 38, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 7 }}>
              {['#ff5f57','#ffbd2e','#28ca41'].map(c => (
                <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
              ))}
              <div style={{ flex: 1, marginLeft: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 5, height: 22, display: 'flex', alignItems: 'center', paddingLeft: 10, gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#c8f654', opacity: 0.8 }} />
                <span style={{ fontSize: 10, color: 'rgba(243,243,245,0.3)', fontFamily: 'monospace' }}>app.quelro.com</span>
              </div>
            </div>

            <div style={{ display: 'flex', minHeight: 480, background: '#0a0a0c' }}>
              <div style={{ width: 200, background: '#0e0e11', borderRight: '1px solid rgba(255,255,255,0.05)', padding: '14px 0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 8 }}>
                  <div style={{ width: 22, height: 22, background: '#c8f654', borderRadius: 5, flexShrink: 0, boxShadow: '0 0 8px rgba(200,246,84,0.4)' }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#f3f3f5' }}>Quelro</div>
                    <div style={{ fontSize: 8, color: 'rgba(243,243,245,0.3)', fontFamily: 'monospace', letterSpacing: '1px' }}>OUTREACH OS</div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'rgba(243,243,245,0.2)', fontFamily: 'monospace', letterSpacing: '1.2px', textTransform: 'uppercase', padding: '6px 14px 4px' }}>Workspace</div>
                {[
                  { label: 'Dashboard', active: true, dot: null },
                  { label: 'Lead Finder', active: false, dot: null },
                  { label: 'Campaigns', active: false, dot: null },
                  { label: 'Email Sender', active: false, dot: 'coral' },
                  { label: 'CRM', active: false, dot: null },
                  { label: 'Quality Leads', active: false, dot: null },
                  { label: 'Analytics', active: false, dot: null },
                ].map(({ label, active, dot }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', margin: '1px 6px', borderRadius: 5, fontSize: 11, fontWeight: active ? 600 : 400, color: active ? '#c8f654' : 'rgba(243,243,245,0.35)', background: active ? 'rgba(200,246,84,0.08)' : 'transparent', boxShadow: active ? 'inset 2px 0 0 #c8f654' : 'none' }}>
                    {label}
                    {dot && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff8a73', boxShadow: '0 0 4px #ff8a73' }} />}
                  </div>
                ))}
              </div>

              <div style={{ flex: 1, padding: '20px 24px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 20, color: '#f3f3f5', letterSpacing: '-0.5px' }}>
                    Hey, Prathvi — <span style={{ color: 'rgba(243,243,245,0.4)' }}>ready to start sending.</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ padding: '5px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 10, color: 'rgba(243,243,245,0.4)' }}>+ Import leads</div>
                    <div style={{ padding: '5px 12px', background: '#c8f654', borderRadius: 6, fontSize: 10, fontWeight: 700, color: '#0a0a0c' }}>⚡ Power Email</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
                  {[
                    { label: 'LEADS FOUND', value: '2,847', color: '#f3f3f5' },
                    { label: 'PITCHES SENT', value: '124', color: '#f3f3f5' },
                    { label: 'OPENS', value: '67%', color: '#c8f654' },
                    { label: 'IN THE PIPE', value: '$8,400', color: '#6ee7a8' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: '#131318', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 12px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)' }} />
                      <div style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(243,243,245,0.3)', letterSpacing: '0.8px', marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color, letterSpacing: '-0.5px', fontFamily: 'monospace' }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 8 }}>
                  <div style={{ background: '#131318', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#f3f3f5' }}>What's happening</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(110,231,168,0.1)', border: '1px solid rgba(110,231,168,0.2)', borderRadius: 10, padding: '1px 6px', fontSize: 8, color: '#6ee7a8', fontFamily: 'monospace', fontWeight: 700 }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#6ee7a8', animation: 'blink 2s infinite' }} />
                        LIVE
                      </span>
                    </div>
                    {[
                      { text: 'MrBeast replied to your pitch', time: '2m' },
                      { text: 'Found 47 HOT leads in Tech niche', time: '15m' },
                      { text: 'Email sent to PewDiePie', time: '1h' },
                      { text: 'Call booked with TechYoutube', time: '3h' },
                    ].map(({ text, time }) => (
                      <div key={text} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 10 }}>
                        <span style={{ color: 'rgba(243,243,245,0.55)' }}>{text}</span>
                        <span style={{ color: 'rgba(243,243,245,0.2)', fontFamily: 'monospace' }}>{time}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: '#131318', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#f3f3f5', marginBottom: 10 }}>Where deals stand</div>
                    {[
                      { stage: 'Replied', count: 8, color: '#6ee7a8' },
                      { stage: 'Call booked', count: 3, color: '#ff8a73' },
                      { stage: 'Pitch sent', count: 47, color: '#c8f654' },
                      { stage: 'Studying', count: 12, color: '#8ec5ff' },
                    ].map(({ stage, count, color }) => (
                      <div key={stage} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 4px ${color}` }} />
                          <span style={{ color: 'rgba(243,243,245,0.5)' }}>{stage}</span>
                        </div>
                        <span style={{ color, fontFamily: 'monospace', fontWeight: 700 }}>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ TICKER ══ */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '14px 0', overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', animation: 'ticker 30s linear infinite', width: 'max-content' }}>
          {[...Array(2)].map((_, rep) => (
            <div key={rep} style={{ display: 'flex', alignItems: 'center', gap: 40, paddingRight: 40 }}>
              {['⚡ Intent Prediction','🧠 Psychology Matching','📧 Voice DNA Engine','🎯 60%+ Reply Rate','🔴 Reddit Signals','📊 CRM Pipeline','🤖 AI Pitch Generation','📈 Campaign Analytics','⭐ Quality Lead Scoring','🚀 Automated Follow-ups'].map(item => (
                <span key={item} style={{ fontSize: 12, fontWeight: 600, color: 'rgba(243,243,245,0.3)', whiteSpace: 'nowrap', letterSpacing: '0.3px' }}>{item}</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ══ HOW IT WORKS ══ */}
      <section style={{ padding: '120px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 72 }}>
          <div className="section-label">
            <div style={{ width: 16, height: 1, background: '#c8f654' }} />
            How it works
            <div style={{ width: 16, height: 1, background: '#c8f654' }} />
          </div>
          <h2 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-2px', lineHeight: 1.05, color: '#f3f3f5', marginBottom: 16 }}>
            From zero to <span className="gradient-text">booked calls</span> in 3 steps
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(243,243,245,0.4)', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
            No more mass cold pitching. No more getting ghosted. Just warm leads who are already looking for you.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 2, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 36, left: '16.67%', right: '16.67%', height: 1, background: 'linear-gradient(90deg, rgba(200,246,84,0.3), rgba(200,246,84,0.1), rgba(200,246,84,0.3))', zIndex: 0 }} />
          {[
            { num: '01', icon: '⚡', title: 'Intent Prediction', desc: "Our AI scores 100,000+ YouTube creators daily. Posting frequency drops, comment sentiment, hiring history — every signal points to who's ready to buy right now.", metric: '0.75+', metricSub: 'intent score threshold', color: '#c8f654', bg: 'rgba(200,246,84,0.06)' },
            { num: '02', icon: '🧠', title: 'Psychology Matching', desc: 'Every creator gets a psychological profile. Data-driven? Emotional? Creative? Your pitch adapts to speak their exact language. No generic templates.', metric: '3 min', metricSub: 'to generate your pitch', color: '#8ec5ff', bg: 'rgba(142,197,255,0.06)' },
            { num: '03', icon: '📅', title: 'Calendar Fills Up', desc: 'Pitches go out in your voice. Follow-ups happen automatically. You only touch your phone when someone wants to talk. Your calendar fills while you sleep.', metric: '60%+', metricSub: 'average reply rate', color: '#ff8a73', bg: 'rgba(255,138,115,0.06)' },
          ].map(({ num, icon, title, desc, metric, metricSub, color, bg }, i) => (
            <div key={num} className={`feature-card reveal reveal-d${i+1}`} style={{ background: bg, borderColor: `${color}20`, position: 'relative', zIndex: 1, margin: '0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}15`, border: `1px solid ${color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{icon}</div>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(243,243,245,0.2)', fontWeight: 700, letterSpacing: '1px' }}>{num}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#f3f3f5', marginBottom: 10, letterSpacing: '-0.3px' }}>{title}</div>
              <p style={{ fontSize: 13, color: 'rgba(243,243,245,0.45)', lineHeight: 1.65, marginBottom: 24 }}>{desc}</p>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 18 }}>
                <div style={{ fontSize: 32, fontWeight: 900, color, fontFamily: 'monospace', letterSpacing: '-1px', marginBottom: 4, filter: `drop-shadow(0 0 12px ${color}60)` }}>{metric}</div>
                <div style={{ fontSize: 11, color: 'rgba(243,243,245,0.3)' }}>{metricSub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ FEATURES BENTO ══ */}
      <section id="features" style={{ padding: '120px 40px', background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 72 }}>
            <div className="section-label">
              <div style={{ width: 16, height: 1, background: '#c8f654' }} />
              Features
              <div style={{ width: 16, height: 1, background: '#c8f654' }} />
            </div>
            <h2 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-2px', lineHeight: 1.05, color: '#f3f3f5' }}>
              While you sleep, <span className="gradient-text">Quelro is working</span>
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gridTemplateRows: 'auto auto', gap: 10 }}>
            <div className="feature-card reveal" style={{ gridColumn: 'span 2', background: 'linear-gradient(135deg, rgba(200,246,84,0.06) 0%, rgba(19,19,24,0.9) 100%)', borderColor: 'rgba(200,246,84,0.12)', padding: 36 }}>
              <div className="icon-box" style={{ background: 'rgba(200,246,84,0.1)', border: '1px solid rgba(200,246,84,0.2)' }}>⚡</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f3f3f5', marginBottom: 10, letterSpacing: '-0.4px' }}>Intent Prediction Engine</div>
              <p style={{ fontSize: 14, color: 'rgba(243,243,245,0.45)', lineHeight: 1.65, maxWidth: 480, marginBottom: 20 }}>
                We scan 100,000+ creators every day. Posting frequency drops. Comment sentiment shifts. Video performance falls. These are all signals that mean "I need help." You only see the 1% who are ready to buy right now.
              </p>
              <div style={{ display: 'flex', gap: 24 }}>
                {[{ value: '100K+', label: 'Creators scanned daily' }, { value: '0.75+', label: 'Intent threshold' }, { value: '1%', label: 'Top leads surfaced' }].map(({ value, label }) => (
                  <div key={label}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#c8f654', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>{value}</div>
                    <div style={{ fontSize: 11, color: 'rgba(243,243,245,0.3)', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="feature-card reveal reveal-d1">
              <div className="icon-box" style={{ background: 'rgba(142,197,255,0.1)', border: '1px solid rgba(142,197,255,0.2)' }}>🧠</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#f3f3f5', marginBottom: 8, letterSpacing: '-0.3px' }}>Psychology Profiles</div>
              <p style={{ fontSize: 13, color: 'rgba(243,243,245,0.4)', lineHeight: 1.6 }}>MrBeast responds to data. Emma responds to authenticity. Your pitch adapts automatically.</p>
            </div>

            <div className="feature-card reveal reveal-d1">
              <div className="icon-box" style={{ background: 'rgba(196,181,253,0.1)', border: '1px solid rgba(196,181,253,0.2)' }}>✍️</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#f3f3f5', marginBottom: 8, letterSpacing: '-0.3px' }}>Voice DNA Engine</div>
              <p style={{ fontSize: 13, color: 'rgba(243,243,245,0.4)', lineHeight: 1.6 }}>Paste 5 emails. Quelro learns your writing style. Every pitch sounds like you wrote it personally.</p>
            </div>

            <div className="feature-card reveal reveal-d2" style={{ gridColumn: 'span 2', background: 'linear-gradient(135deg, rgba(255,138,115,0.04) 0%, rgba(19,19,24,0.9) 100%)', borderColor: 'rgba(255,138,115,0.1)', padding: 36 }}>
              <div className="icon-box" style={{ background: 'rgba(255,138,115,0.1)', border: '1px solid rgba(255,138,115,0.2)' }}>🔴</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f3f3f5', marginBottom: 10, letterSpacing: '-0.4px' }}>Reddit Buying Signals</div>
              <p style={{ fontSize: 14, color: 'rgba(243,243,245,0.45)', lineHeight: 1.65, maxWidth: 480, marginBottom: 20 }}>
                Creators post "I need a video editor" on Reddit at 11pm. Quelro sees it at 11:01pm and puts it on your radar. You pitch before anyone else even wakes up. First mover wins every single time.
              </p>
              <div style={{ background: 'rgba(10,10,12,0.6)', border: '1px solid rgba(255,138,115,0.2)', borderRadius: 10, padding: '14px 16px', fontFamily: 'monospace', fontSize: 12, color: '#ff8a73', display: 'inline-block' }}>
                🔴 r/YouTubers · 11:01 PM<br/>
                <span style={{ color: 'rgba(243,243,245,0.6)' }}>"Looking for a thumbnail designer ASAP..."</span><br/>
                <span style={{ color: '#c8f654', marginTop: 4, display: 'block' }}>→ Signal detected · Pitch ready in 3 min</span>
              </div>
            </div>

            <div className="feature-card reveal reveal-d2">
              <div className="icon-box" style={{ background: 'rgba(110,231,168,0.1)', border: '1px solid rgba(110,231,168,0.2)' }}>📊</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#f3f3f5', marginBottom: 8, letterSpacing: '-0.3px' }}>CRM Pipeline</div>
              <p style={{ fontSize: 13, color: 'rgba(243,243,245,0.4)', lineHeight: 1.6 }}>From first pitch to signed contract. Never lose a deal in your inbox again.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══ TESTIMONIALS ══ */}
      <section style={{ padding: '120px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 72 }}>
          <div className="section-label">
            <div style={{ width: 16, height: 1, background: '#c8f654' }} />
            Results
            <div style={{ width: 16, height: 1, background: '#c8f654' }} />
          </div>
          <h2 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-2px', lineHeight: 1.05, color: '#f3f3f5', marginBottom: 16 }}>
            Real freelancers. <span className="gradient-text">Real clients.</span>
          </h2>
        </div>

        <div className="reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, marginBottom: 40, background: 'rgba(255,255,255,0.04)', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { value: '60%+', label: 'Average reply rate', sub: 'vs 2% cold email' },
            { value: '$2-5K', label: 'Avg client value', sub: 'per month per client' },
            { value: '3 min', label: 'To generate pitch', sub: 'psychology-matched' },
            { value: '10x', label: 'Faster outreach', sub: 'than manual pitching' },
          ].map(({ value, label, sub }) => (
            <div key={label} style={{ padding: '32px 24px', textAlign: 'center', background: '#0a0a0c', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="stat-number">{value}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(243,243,245,0.6)', marginTop: 8, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 11, color: 'rgba(243,243,245,0.25)', fontFamily: 'monospace' }}>{sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {[
            { quote: 'Sent 20 pitches in week 1. Got 14 replies. Booked 4 calls. Closed 2 clients at $2,000/month each. The psychology matching is not a gimmick — it actually works.', name: 'Rohan M.', role: 'Video Editor · Mumbai', metric: '$4,000', metricLabel: 'added in week 1', avatar: 'R', avatarColor: '#c8f654' },
            { quote: "Before Quelro: 100 pitches, 2 replies, 0 clients. After: 20 pitches, 13 replies, 3 calls, 1 client. I genuinely don't understand how it works but it does.", name: 'Priya S.', role: 'Thumbnail Designer · Delhi', metric: '65%', metricLabel: 'reply rate', avatar: 'P', avatarColor: '#8ec5ff' },
            { quote: 'The Reddit signal feature paid for 6 months of subscription in one deal. Creator posted they needed a scriptwriter. I was in their DMs 3 minutes later.', name: 'Arjun K.', role: 'Scriptwriter · Bangalore', metric: '3 min', metricLabel: 'signal to pitch', avatar: 'A', avatarColor: '#ff8a73' },
          ].map(({ quote, name, role, metric, metricLabel, avatar, avatarColor }, i) => (
            <div key={name} className={`testimonial-card reveal reveal-d${i+1}`}>
              <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'monospace', color: avatarColor, letterSpacing: '-1px', marginBottom: 16, filter: `drop-shadow(0 0 8px ${avatarColor}50)` }}>
                {metric}
                <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(243,243,245,0.3)', display: 'block', marginTop: 2, letterSpacing: 'normal' }}>{metricLabel}</span>
              </div>
              <p style={{ fontSize: 13.5, color: 'rgba(243,243,245,0.55)', lineHeight: 1.7, marginBottom: 20, fontStyle: 'italic' }}>"{quote}"</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${avatarColor}20`, border: `1px solid ${avatarColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: avatarColor, flexShrink: 0 }}>{avatar}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f3f3f5' }}>{name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(243,243,245,0.3)', fontFamily: 'monospace' }}>{role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ PRICING ══ */}
      <section id="pricing" style={{ padding: '120px 40px', background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 16 }}>
            <div className="section-label">
              <div style={{ width: 16, height: 1, background: '#c8f654' }} />
              Pricing
              <div style={{ width: 16, height: 1, background: '#c8f654' }} />
            </div>
            <h2 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-2px', lineHeight: 1.05, color: '#f3f3f5', marginBottom: 12 }}>
              One client pays for <span className="gradient-text">a year of Quelro</span>
            </h2>
            <p style={{ fontSize: 16, color: 'rgba(243,243,245,0.4)', marginBottom: 48 }}>
              Average creator client is worth $2,000–5,000/month. Quelro starts at $29/month. Do the math.
            </p>
          </div>

          <div className="reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {[
              {
                name: 'Starter', price: '$29', period: '/mo', featured: false, cta: 'Start Free Trial',
                desc: 'For freelancers starting their creator outreach journey.',
                emails: '500 emails/month',
                features: [
                  '500 emails/month', 'Unlimited AI pitches', '1 Gmail account',
                  'Intent scoring (0.75+ HOT leads)', 'Psychology profiles',
                  'Voice DNA email writing', 'A/B subject line testing',
                  'Reddit + Upwork signals', 'CRM pipeline',
                  'Email tracking & analytics', 'Follow-up sequences',
                ],
              },
              {
                name: 'Pro', price: '$49', period: '/mo', featured: true, cta: 'Start Free Trial',
                desc: 'For serious freelancers closing creator clients every week.',
                emails: '1,500 emails/month',
                features: [
                  '1,500 emails/month', 'Unlimited AI pitches', '3 Gmail accounts',
                  'Intent scoring (0.75+ HOT leads)', 'Psychology profiles',
                  'Voice DNA email writing', 'A/B subject line testing',
                  'Reddit + Upwork signals', 'CRM pipeline',
                  'Email tracking & analytics', 'Follow-up sequences',
                  'Priority support',
                ],
              },
              {
                name: 'Agency', price: '$149', period: '/mo', featured: false, cta: 'Get Started',
                desc: 'For agencies managing creator outreach at scale.',
                emails: '5,000 emails/month',
                features: [
                  '5,000 emails/month', 'Unlimited AI pitches', '10 Gmail accounts',
                  'Intent scoring (0.75+ HOT leads)', 'Psychology profiles',
                  'Voice DNA email writing', 'A/B subject line testing',
                  'Reddit + Upwork signals', 'CRM pipeline',
                  'Email tracking & analytics', 'Follow-up sequences',
                  '5 team seats', 'White-label reports', 'API access', 'Dedicated support',
                ],
              },
            ].map(({ name, price, period, desc, features, cta, featured }) => (
              <div key={name} className={`pricing-card ${featured ? 'featured' : ''}`}>
                {featured && (
                  <div style={{ position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)', background: '#c8f654', color: '#0a0a0c', fontSize: 9, fontWeight: 900, letterSpacing: '1.5px', padding: '4px 12px', borderRadius: '0 0 8px 8px', fontFamily: 'monospace', textTransform: 'uppercase' }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(243,243,245,0.6)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'monospace' }}>{name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 6 }}>
                  <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-3px', color: featured ? '#c8f654' : '#f3f3f5', fontFamily: 'monospace', filter: featured ? 'drop-shadow(0 0 20px rgba(200,246,84,0.3))' : 'none' }}>{price}</span>
                  <span style={{ fontSize: 14, color: 'rgba(243,243,245,0.3)' }}>{period}</span>
                </div>
                <p style={{ fontSize: 13, color: 'rgba(243,243,245,0.4)', marginBottom: 24, lineHeight: 1.5 }}>{desc}</p>
                <button
                  onClick={() => navigate('/signup')}
                  style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: featured ? '#c8f654' : 'rgba(255,255,255,0.06)', color: featured ? '#0a0a0c' : 'rgba(243,243,245,0.7)', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 24, transition: 'all 200ms' }}
                  onMouseEnter={e => { e.currentTarget.style.background = featured ? '#d6ff6e' : 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = featured ? '#c8f654' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >{cta}</button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}>
                      <span style={{ color: '#c8f654', fontSize: 12, flexShrink: 0 }}>✓</span>
                      <span style={{ color: 'rgba(243,243,245,0.5)' }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ══ */}
      <section style={{ padding: '140px 40px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 600, height: 300, background: 'radial-gradient(ellipse, rgba(200,246,84,0.08) 0%, transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div className="reveal" style={{ maxWidth: 680, margin: '0 auto', position: 'relative' }}>
          <div className="section-label" style={{ justifyContent: 'center', marginBottom: 24 }}>
            <div style={{ width: 16, height: 1, background: '#c8f654' }} />
            Get started today
            <div style={{ width: 16, height: 1, background: '#c8f654' }} />
          </div>
          <h2 style={{ fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900, letterSpacing: '-2.5px', lineHeight: 1.0, marginBottom: 20, color: '#f3f3f5' }}>
            Your next creator client
            <br />
            <span style={{ background: 'linear-gradient(135deg, #c8f654 0%, #d6ff6e 40%, #c8f654 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              is watching YouTube
            </span>
            <br />
            <span style={{ color: 'rgba(243,243,245,0.3)', fontSize: '0.7em' }}>right now.</span>
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(243,243,245,0.4)', marginBottom: 40, lineHeight: 1.6 }}>
            They're posting. They're struggling. They need someone exactly like you.
            <br />
            Quelro finds them before anyone else does.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <button
              onClick={() => navigate('/signup')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 36px', background: '#c8f654', color: '#0a0a0c', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer', transition: 'all 200ms cubic-bezier(0.16,1,0.3,1)', boxShadow: '0 8px 32px rgba(200,246,84,0.3)' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#d6ff6e'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(200,246,84,0.45)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#c8f654'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(200,246,84,0.3)'; }}
            >
              Find My First HOT Lead Free →
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'rgba(243,243,245,0.2)', fontFamily: 'monospace' }}>
            14-day free trial · No credit card · Setup in 5 minutes
          </p>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '32px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 22, height: 22, background: '#c8f654', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="11" height="11" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1.5L13.5 5V10L7.5 13.5L1.5 10V5L7.5 1.5Z" fill="#0a0a0c"/>
            </svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(243,243,245,0.5)' }}>Quelro</span>
          <span style={{ fontSize: 12, color: 'rgba(243,243,245,0.2)' }}>© 2026</span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['Privacy', 'Terms', 'Blog', 'Contact'].map(link => (
            <a key={link} href={`/${link.toLowerCase()}`} style={{ fontSize: 12, color: 'rgba(243,243,245,0.25)', textDecoration: 'none', transition: 'color 150ms' }}
              onMouseEnter={e => e.target.style.color = 'rgba(243,243,245,0.6)'}
              onMouseLeave={e => e.target.style.color = 'rgba(243,243,245,0.25)'}
            >{link}</a>
          ))}
        </div>
      </footer>

    </div>
  );
}
