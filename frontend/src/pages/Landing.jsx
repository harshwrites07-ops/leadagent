import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  Zap, PenLine, Send, Handshake, Check, ArrowRight,
  Radar, ShieldCheck, Clock, Flame,
} from 'lucide-react';
import { fadeUp, stagger, springIn, viewportOnce } from '../lib/motion';
import FeatureBentoGrid from '../components/marketing/FeatureBentoGrid';

/* ─────────────────────────────────────────────────────────────
   Kinetic headline — rotating word set, 3s cadence
   ───────────────────────────────────────────────────────────── */
const ROTATING = ['client', 'video editor gig', 'thumbnail contract', 'retainer'];

function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(v => (v + 1) % ROTATING.length), 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{ display: 'inline-grid', verticalAlign: 'bottom', overflow: 'hidden' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={ROTATING[i]}
          initial={{ y: '105%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-105%', opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          style={{
            gridArea: '1 / 1',
            fontFamily: 'var(--f-heading)', fontWeight: 600,
            color: 'var(--lime)', whiteSpace: 'nowrap',
          }}
        >
          {ROTATING[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   THE LIVE MARCUS MOMENT — one clock drives a ~13.5s loop:
   intel flickers in → staged status lines → email typed
   word-by-word → gate score counts to 92 → lime pulse → loop.
   ───────────────────────────────────────────────────────────── */
const INTEL = [
  { k: 'CHANNEL', v: '@TechWithTara' },
  { k: 'SUBS', v: '284,000' },
  { k: 'LAST UPLOAD', v: '9 days ago · gap ↑' },
  { k: 'SIGNAL', v: '"looking for an editor" — community post' },
];
const STATUSES = ['analyzing channel', 'selecting angle', 'writing', 'scoring'];
const SUBJECT = 'Tara — that 9-day gap says your editor left';
const BODY = `Hey Tara,

Your last three uploads averaged 310K views — then nine days of silence. That pattern is usually an editing bottleneck, not a content one.

I cut tech reviews exactly like your M4 teardown (the pacing at 4:12 was perfect). I'll edit your next video free — if it doesn't save you 10+ hours, delete this email.

— sent by Marcus, reviewed by you`;

/* timeline (ms) */
const T_INTEL = 400;      // intel rows start
const T_STATUS = 1600;    // status lines start
const T_SUBJECT = 3000;   // subject starts typing
const T_BODY = 4200;      // body starts typing
const BODY_MS = 5600;     // body typing duration
const T_SCORE = 10200;    // score counts up
const T_HOLD = 12000;     // everything visible
const T_LOOP = 13500;     // fade + restart

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function MarcusDemo() {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.25 });
  const reduced = useMemo(prefersReducedMotion, []);
  const [t, setT] = useState(reduced ? T_HOLD : 0);

  useEffect(() => {
    if (reduced || !inView) return;
    let raf, start;
    const step = (ts) => {
      if (!start) start = ts;
      const e = (ts - start) % T_LOOP;
      setT(e);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced]);

  const fading = !reduced && t > T_HOLD + 700;
  const intelShown = Math.min(INTEL.length, Math.max(0, Math.floor((t - T_INTEL) / 250) + 1));
  const statusShown = Math.min(STATUSES.length, Math.max(0, Math.floor((t - T_STATUS) / 380) + 1));
  const subjChars = t < T_SUBJECT ? 0 : Math.min(SUBJECT.length, Math.floor(((t - T_SUBJECT) / 1000) * SUBJECT.length));
  const bodyChars = t < T_BODY ? 0 : Math.min(BODY.length, Math.floor(((t - T_BODY) / BODY_MS) * BODY.length));
  const typing = bodyChars > 0 && bodyChars < BODY.length;
  const scoreP = t < T_SCORE ? 0 : Math.min(1, (t - T_SCORE) / 900);
  const score = Math.round(92 * (1 - Math.pow(1 - scoreP, 3)));
  const passed = scoreP >= 1;

  return (
    <div
      ref={ref}
      className="lp-demo"
      style={{
        opacity: fading ? 0 : 1,
        transition: 'opacity 600ms ease',
      }}
    >
      {/* window chrome */}
      <div style={{
        height: 36, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px',
        background: 'var(--bg-2)', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--line-3)' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--line-3)' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--line-3)' }} />
        <span style={{
          marginLeft: 10, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <span className="dot dot--lime dot--pulse" style={{ width: 5, height: 5 }} />
          quelro · pitchgen
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-4)' }}>
          marcus is working
        </span>
      </div>

      <div className="lp-demo__grid">
        {/* left: intel + terminal */}
        <div style={{ padding: 'var(--sp-4)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', minWidth: 0 }}>
          <div>
            <div className="lp-demo__label">CREATOR INTELLIGENCE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {INTEL.map((row, i) => (
                <div key={row.k} style={{
                  display: 'flex', gap: 10, fontFamily: 'var(--f-mono)', fontSize: 11,
                  opacity: i < intelShown ? 1 : 0,
                  transform: i < intelShown ? 'none' : 'translateY(4px)',
                  transition: 'opacity 240ms ease, transform 240ms ease',
                }}>
                  <span style={{ color: 'var(--text-4)', width: 92, flexShrink: 0 }}>{row.k}</span>
                  <span style={{ color: i === 3 ? 'var(--coral)' : 'var(--text-2)' }}>{row.v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 'var(--sp-3)' }}>
            <div className="lp-demo__label">MARCUS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {STATUSES.map((s, i) => {
                const isDone = i < statusShown - 1 || (i === STATUSES.length - 1 && passed);
                const isCurrent = i === statusShown - 1 && !isDone;
                return (
                  <div key={s} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontFamily: 'var(--f-mono)', fontSize: 11,
                    color: isDone ? 'var(--text-2)' : isCurrent ? 'var(--lime)' : 'var(--text-4)',
                    opacity: i < statusShown ? 1 : 0.35,
                    transition: 'color 200ms ease, opacity 200ms ease',
                  }}>
                    {isDone
                      ? <Check size={11} style={{ color: 'var(--lime)', flexShrink: 0 }} />
                      : <span className={isCurrent ? 'dot dot--lime dot--pulse' : 'dot dot--neutral'} style={{ width: 5, height: 5 }} />}
                    {s}{isCurrent ? '…' : ''}
                  </div>
                );
              })}
            </div>
          </div>

          {/* quality gate */}
          <div style={{
            marginTop: 'auto', border: '1px solid', borderRadius: 'var(--r)',
            borderColor: passed ? 'var(--lime-border)' : 'var(--line)',
            background: passed ? 'var(--lime-soft)' : 'var(--bg-2)',
            padding: '10px 12px', transition: 'border-color 300ms ease, background 300ms ease',
            animation: passed ? 'pulse-lime 1.8s 1' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.06em', color: 'var(--text-3)' }}>QUALITY GATE</span>
              {passed && (
                <motion.span variants={springIn} initial="hidden" animate="visible" className="badge badge--lime" style={{ marginLeft: 'auto' }}>
                  PASSED · Excellent
                </motion.span>
              )}
            </div>
            <div style={{
              fontFamily: 'var(--f-mono)', fontSize: 28, marginTop: 4, letterSpacing: '-0.02em',
              color: score > 0 ? 'var(--lime)' : 'var(--text-4)', fontVariantNumeric: 'tabular-nums',
            }}>
              {score > 0 ? score : '—'}<span style={{ fontSize: 13, color: 'var(--text-3)' }}> / 100</span>
            </div>
          </div>
        </div>

        {/* right: the email being written */}
        <div style={{ padding: 'var(--sp-4)', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="lp-demo__label">DRAFT · sequence 1 of 4</div>
          <div style={{ fontSize: 14, fontWeight: 500, minHeight: 22, color: 'var(--text)', letterSpacing: '-0.005em' }}>
            {SUBJECT.slice(0, subjChars)}
            {subjChars > 0 && subjChars < SUBJECT.length && <span className="lp-caret" />}
          </div>
          <div style={{
            marginTop: 'var(--sp-3)', fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-2)',
            whiteSpace: 'pre-wrap', flex: 1, minHeight: 208,
          }}>
            {BODY.slice(0, bodyChars)}
            {typing && <span className="lp-caret" />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Product-real section visuals (Find / Write / Send / Close)
   ───────────────────────────────────────────────────────────── */
function VisualFind() {
  const rows = [
    { name: 'Tara Chen', handle: '@TechWithTara', subs: '284K', score: 94, hot: true },
    { name: 'Dev Patel', handle: '@DevBuilds', subs: '141K', score: 88, hot: false },
    { name: 'Mia Torres', handle: '@MiaMakes', subs: '96K', score: 82, hot: false },
    { name: 'Leo Park', handle: '@LeoPlays', subs: '412K', score: 71, hot: false },
  ];
  return (
    <div className="lp-visual">
      <div className="lp-demo__label" style={{ padding: '12px 14px 0' }}>QUALITY LEADS · scored this hour</div>
      {rows.map((r, i) => (
        <div key={r.handle} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
          borderTop: i === 0 ? 'none' : '1px solid var(--line)', fontSize: 12.5,
        }}>
          <span className="ava" style={{ background: i === 0 ? 'var(--lime)' : 'var(--surface-3)', color: i === 0 ? 'var(--on-accent)' : 'var(--text-2)' }}>
            {r.name.split(' ').map(p => p[0]).join('')}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, color: 'var(--text)' }}>{r.name}</div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{r.handle} · {r.subs}</div>
          </div>
          <span className={`score ${r.score >= 90 ? 'score--hot' : r.score >= 80 ? 'score--warm' : 'score--cold'}`} style={{ marginLeft: 'auto' }}>
            {r.score}
          </span>
        </div>
      ))}
    </div>
  );
}

function VisualWrite() {
  return (
    <div className="lp-visual" style={{ padding: 14 }}>
      <div className="lp-demo__label">SUBJECT VARIANTS</div>
      {[
        { s: 'Tara — that 9-day gap says your editor left', score: 92, top: true },
        { s: 'Quick idea for your next tech review', score: 74, top: false },
        { s: 'Editing help for @TechWithTara?', score: 61, top: false },
      ].map(v => (
        <div key={v.s} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 8,
          border: '1px solid', borderColor: v.top ? 'var(--lime-border)' : 'var(--line)',
          background: v.top ? 'var(--lime-soft)' : 'var(--bg-2)', borderRadius: 'var(--r)',
          fontSize: 12.5, color: v.top ? 'var(--text)' : 'var(--text-2)',
        }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.s}</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 11, color: v.top ? 'var(--lime)' : 'var(--text-3)', flexShrink: 0 }}>{v.score}</span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <span className="badge badge--lime">gate: 90+ required</span>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-3)' }}>below the bar never sends</span>
      </div>
    </div>
  );
}

function VisualSend() {
  const boxes = [
    { email: 'sam@studio.co', warmth: 92, today: 38, cap: 60 },
    { email: 'hello@studio.co', warmth: 78, today: 24, cap: 40 },
    { email: 'sam.k@gmail.com', warmth: 54, today: 9, cap: 20 },
  ];
  return (
    <div className="lp-visual" style={{ padding: 14 }}>
      <div className="lp-demo__label">MAILBOXES · sending window 9:40–11:20 AM recipient-local</div>
      {boxes.map(b => (
        <div key={b.email} style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--text-2)' }}>{b.email}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{b.today}/{b.cap} today</span>
          </div>
          <div className="bar"><span style={{ width: `${b.warmth}%` }} /></div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <span className="badge badge--ok">deliverability 98.2%</span>
        <span className="badge badge--neutral">auto-pause on bounce spike</span>
      </div>
    </div>
  );
}

function VisualClose() {
  return (
    <div className="lp-visual" style={{ padding: 14 }}>
      <div className="lp-demo__label">REPLIES · sorted by heat</div>
      <div style={{
        borderLeft: '3px solid var(--coral)', background: 'var(--coral-soft)',
        borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 500 }}>
          Tara Chen <span className="badge badge--coral" style={{ marginLeft: 'auto' }}><Flame size={10} /> interested</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
          "Okay this is timely. What's your rate for 2 videos/week?"
        </div>
        <div style={{
          marginTop: 8, padding: '8px 10px', background: 'var(--surface)', borderRadius: 'var(--r-sm)',
          border: '1px solid var(--line)', fontSize: 11.5, color: 'var(--text-2)',
        }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '.08em', color: 'var(--lime)', display: 'block', marginBottom: 3 }}>MARCUS SUGGESTS</span>
          Rate anchored to her view-count math, call link, 48h window…
        </div>
      </div>
      {[
        { n: 'Dev Patel', s: 'Sent → Opened 3×', c: 'var(--lime)' },
        { n: 'Mia Torres', s: 'Call booked · Thu 2 PM', c: 'var(--ok)' },
      ].map(r => (
        <div key={r.n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', fontSize: 12, borderTop: '1px solid var(--line)' }}>
          <span className="dot" style={{ color: r.c }} />
          <span style={{ color: 'var(--text)' }}>{r.n}</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{r.s}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Count-up stat that starts when scrolled into view
   ───────────────────────────────────────────────────────────── */
function StatInView({ value, suffix = '', prefix = '', decimals = 0, duration = 1100 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (prefersReducedMotion()) { setDisplay(value); return; }
    let raf, start;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setDisplay(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);
  return (
    <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix}{display.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sections config — the page IS the user's journey
   ───────────────────────────────────────────────────────────── */
const JOURNEY = [
  {
    id: 'find', icon: Radar, eyebrow: 'FIND',
    title: 'Only the creators who are ready to hire.',
    body: 'Quelro scores 100,000+ YouTube channels daily — upload gaps, comment sentiment, hiring signals from Reddit and community posts. You never see the noise; only leads that clear the quality bar reach your list.',
    points: ['Intent scoring on every channel', 'Reddit "need an editor" signals within minutes', 'Verified emails or it doesn\'t ship'],
    Visual: VisualFind,
  },
  {
    id: 'write', icon: PenLine, eyebrow: 'WRITE',
    title: 'Marcus writes it. The gate decides if it sends.',
    body: 'Every pitch is researched against the channel — recent uploads, tone, what they respond to. Then it\'s scored. Anything under 90 gets rewritten, not sent. Your name only ever lands on excellent email.',
    points: ['Pitches in your voice, not a template\'s', 'Quality gate: 90+ or it never sends', 'Three subject variants, ranked'],
    Visual: VisualWrite,
  },
  {
    id: 'send', icon: Send, eyebrow: 'SEND',
    title: 'Sent like a person, delivered like clockwork.',
    body: 'Warmed mailboxes, human gaps between sends, recipient-local timing windows, auto-pause the moment a bounce spikes. Deliverability isn\'t a feature here — it\'s the floor.',
    points: ['Mailbox warmup built in', 'Recipient-timezone send windows', 'Automatic follow-up sequences'],
    Visual: VisualSend,
  },
  {
    id: 'close', icon: Handshake, eyebrow: 'CLOSE',
    title: 'Hot replies rise. Nothing slips.',
    body: 'Replies are read and sorted by intent — interested and question replies surface first in coral, with a suggested response ready. The pipeline tracks every deal from first touch to signed retainer.',
    points: ['Reply intelligence sorts by heat', 'Marcus drafts your response', 'Kanban pipeline to closed-won'],
    Visual: VisualClose,
  },
];

const TESTIMONIALS = [
  { quote: 'Sent 20 pitches in week 1. Got 14 replies. Booked 4 calls. Closed 2 clients at $2,000/month each. The targeting is not a gimmick — it actually works.', name: 'Rohan M.', role: 'Video Editor · Mumbai', metric: '$4,000', metricLabel: 'added in week 1', color: 'var(--lime)' },
  { quote: "Before Quelro: 100 pitches, 2 replies, 0 clients. After: 20 pitches, 13 replies, 3 calls, 1 client. I genuinely don't understand how it works but it does.", name: 'Priya S.', role: 'Thumbnail Designer · Delhi', metric: '65%', metricLabel: 'reply rate', color: 'var(--sky)' },
  { quote: 'The Reddit signal feature paid for 6 months of subscription in one deal. Creator posted they needed a scriptwriter. I was in their inbox 3 minutes later.', name: 'Arjun K.', role: 'Scriptwriter · Bangalore', metric: '3 min', metricLabel: 'signal to pitch', color: 'var(--coral)' },
];

const PLANS = [
  {
    name: 'Starter', price: 29, featured: false, cta: 'Find your first client',
    desc: 'For freelancers starting their creator outreach journey.',
    features: ['500 emails/month', 'Unlimited AI pitches', '1 Gmail account', 'Intent scoring + quality gate', 'Reddit + Upwork signals', 'CRM pipeline', 'Follow-up sequences'],
  },
  {
    name: 'Pro', price: 49, featured: true, cta: 'Find your first client',
    desc: 'For serious freelancers closing creator clients every week.',
    features: ['1,500 emails/month', 'Unlimited AI pitches', '3 Gmail accounts', 'Intent scoring + quality gate', 'Reddit + Upwork signals', 'CRM pipeline', 'Follow-up sequences', 'Priority support'],
  },
  {
    name: 'Agency', price: 149, featured: false, cta: 'Scale your outreach',
    desc: 'For agencies managing creator outreach at scale.',
    features: ['5,000 emails/month', 'Unlimited AI pitches', '10 Gmail accounts', '5 team seats', 'White-label reports', 'API access', 'Dedicated support'],
  },
];

/* ═════════════════════════════════════════════════════════════
   PAGE
   ═════════════════════════════════════════════════════════════ */
export default function Landing() {
  const navigate = useNavigate();
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{
      background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--f-sans)',
      minHeight: '100vh', overflowX: 'hidden', WebkitFontSmoothing: 'antialiased',
    }}>
      <style>{`
        .lp-container { max-width: 1080px; margin: 0 auto; padding: 0 var(--sp-6); }

        /* hero mesh — the ONE spectacular moment; nowhere else on the page */
        .lp-mesh { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
        .lp-mesh::before, .lp-mesh::after {
          content: ''; position: absolute; border-radius: 50%;
          filter: blur(80px); will-change: transform;
        }
        .lp-mesh::before {
          width: 720px; height: 480px; left: 50%; top: -180px; margin-left: -360px;
          background: radial-gradient(ellipse, rgba(var(--lime-rgb), 0.13) 0%, transparent 65%);
          animation: lp-drift-a 18s ease-in-out infinite;
        }
        .lp-mesh::after {
          width: 480px; height: 380px; left: 12%; top: 30%;
          background: radial-gradient(ellipse, rgba(var(--lime-rgb), 0.07) 0%, transparent 65%);
          animation: lp-drift-b 22s ease-in-out infinite;
        }
        @keyframes lp-drift-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, 24px) scale(1.08); }
        }
        @keyframes lp-drift-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-32px, -20px) scale(1.05); }
        }

        .lp-caret {
          display: inline-block; width: 7px; height: 14px; margin-left: 1px;
          background: var(--lime); vertical-align: -2px;
          animation: lp-blink 900ms step-end infinite;
        }
        @keyframes lp-blink { 50% { opacity: 0; } }

        .lp-demo {
          width: 100%; max-width: 860px; margin: 0 auto;
          background: var(--surface); border: 1px solid var(--line-2);
          border-radius: var(--r-lg); overflow: hidden; text-align: left;
          box-shadow: var(--sh-lg);
        }
        .lp-demo__grid { display: grid; grid-template-columns: 320px 1fr; min-height: 360px; }
        .lp-demo__label {
          font-family: var(--f-mono); font-size: 10px; letter-spacing: .08em;
          color: var(--text-3); text-transform: uppercase; margin-bottom: 10px;
        }

        .lp-visual {
          background: var(--surface); border: 1px solid var(--line-2);
          border-radius: var(--r-lg); overflow: hidden; box-shadow: var(--sh-md);
        }

        .lp-journey {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: var(--sp-12); align-items: center; padding: var(--sp-12) 0;
        }
        .lp-journey--flip .lp-journey__copy { order: 2; }

        .lp-cta-primary {
          display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-2);
          height: 48px; padding: 0 var(--sp-6);
          background: var(--lime); color: var(--bg);
          border: none; border-radius: var(--r);
          font-size: var(--fs-sm); font-weight: 600; font-family: var(--f-sans);
          cursor: pointer; white-space: nowrap; letter-spacing: -0.005em;
          transition: background var(--t-fast), box-shadow var(--t-fast), transform var(--t-fast);
        }
        .lp-cta-primary:hover { background: var(--lime-2); box-shadow: 0 0 32px var(--lime-glow); transform: translateY(-1px); }
        .lp-cta-primary:active { transform: translateY(0); background: var(--lime-dim); box-shadow: none; }

        .lp-cta-ghost {
          display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-2);
          height: 48px; padding: 0 var(--sp-5);
          background: transparent; color: var(--text-2);
          border: 1px solid var(--line-2); border-radius: var(--r);
          font-size: var(--fs-sm); font-weight: 500; font-family: var(--f-sans);
          cursor: pointer; white-space: nowrap;
          transition: background var(--t-fast), border-color var(--t-fast), color var(--t-fast);
        }
        .lp-cta-ghost:hover { background: var(--surface); border-color: var(--line-3); color: var(--text); }

        .lp-h2 {
          font-size: var(--fs-2xl); font-weight: 600; letter-spacing: -0.02em;
          line-height: 1.1; margin: 0 0 var(--sp-4); color: var(--text);
        }
        .lp-eyebrow {
          display: inline-flex; align-items: center; gap: var(--sp-2);
          font-family: var(--f-mono); font-size: 11px; font-weight: 500;
          letter-spacing: .1em; text-transform: uppercase; color: var(--lime);
          margin-bottom: var(--sp-4);
        }

        .lp-price-card {
          background: var(--surface); border: 1px solid var(--line);
          border-radius: var(--r-lg); padding: var(--sp-8);
          display: flex; flex-direction: column;
          transition: border-color var(--t), transform var(--t), box-shadow var(--t);
          position: relative;
        }
        .lp-price-card:hover { border-color: var(--line-3); transform: translateY(-4px); box-shadow: var(--sh-md); }
        .lp-price-card--featured { background: var(--surface-2); border-color: var(--lime-border); }
        .lp-price-card--featured:hover { border-color: var(--lime-border); box-shadow: var(--sh-lime); }

        .lp-nav-links { display: flex; align-items: center; gap: var(--sp-1); }
        .lp-nav-cta-short { display: none; }

        @media (max-width: 900px) {
          .lp-journey { grid-template-columns: 1fr; gap: var(--sp-6); padding: var(--sp-10) 0; }
          .lp-journey--flip .lp-journey__copy { order: 0; }
          .lp-demo__grid { grid-template-columns: 1fr; }
          .lp-demo__grid > div:first-child { border-right: none; border-bottom: 1px solid var(--line); }
          .lp-nav-links { display: none; }
          .lp-bento-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 540px) {
          .lp-container { padding: 0 var(--sp-4); }
          .lp-h2 { font-size: var(--fs-xl); }
          .lp-nav-signin { display: none; }
          .lp-nav-cta-long { display: none; }
          .lp-nav-cta-short { display: inline; }
        }
      `}</style>

      {/* ══ NAV ══ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 60, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 var(--sp-6)',
        background: navScrolled ? 'rgba(10,10,12,0.85)' : 'transparent',
        backdropFilter: navScrolled ? 'blur(16px)' : 'none',
        WebkitBackdropFilter: navScrolled ? 'blur(16px)' : 'none',
        borderBottom: `1px solid ${navScrolled ? 'var(--line)' : 'transparent'}`,
        transition: 'background 300ms ease, border-color 300ms ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', cursor: 'pointer' }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--lime) 0%, var(--lime) 50%, var(--coral) 50%, var(--coral) 100%)',
          }} />
          <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>Quelro</span>
        </div>

        <div className="lp-nav-links">
          {[['How it works', '#find'], ['Pricing', '#pricing']].map(([label, href]) => (
            <a key={label} href={href} style={{
              padding: '6px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 500,
              color: 'var(--text-3)', transition: 'color 150ms',
            }}
              onMouseEnter={e => { e.target.style.color = 'var(--text)'; }}
              onMouseLeave={e => { e.target.style.color = 'var(--text-3)'; }}
            >{label}</a>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <button onClick={() => navigate('/login')} className="lp-cta-ghost lp-nav-signin" style={{ height: 34, padding: '0 14px', fontSize: 13, border: 'none' }}>
            Sign in
          </button>
          <button onClick={() => navigate('/signup')} className="lp-cta-primary lp-nav-cta" style={{ height: 34, padding: '0 16px', fontSize: 13 }}>
            <span className="lp-nav-cta-long">Find your first client</span>
            <span className="lp-nav-cta-short">Get started</span>
          </button>
        </div>
      </nav>

      {/* ══ HERO — static first paint, demo animates after mount ══ */}
      <section style={{
        position: 'relative', padding: '140px var(--sp-6) var(--sp-16)',
        textAlign: 'center', overflow: 'hidden',
      }}>
        <div className="lp-mesh" aria-hidden="true" />

        <div style={{ position: 'relative', maxWidth: 880, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            border: '1px solid var(--lime-border)', background: 'var(--lime-soft)',
            borderRadius: 999, padding: '5px 14px 5px 10px', marginBottom: 'var(--sp-6)',
          }}>
            <span className="dot dot--lime dot--pulse" style={{ width: 6, height: 6 }} />
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 500, color: 'var(--lime)', letterSpacing: '.06em' }}>
              100,000+ CREATORS INDEXED DAILY
            </span>
          </div>

          <h1 style={{
            fontSize: 'clamp(var(--fs-2xl), 6.5vw, var(--fs-4xl))', fontWeight: 600,
            letterSpacing: '-0.03em', lineHeight: 1.02, margin: '0 0 var(--sp-6)',
          }}>
            Your next creator<br />
            <RotatingWord /><br />
            <span style={{ color: 'var(--text-3)' }}>is watching YouTube right now.</span>
          </h1>

          <p style={{
            fontSize: 'clamp(var(--fs-sm), 1.6vw, 17px)', color: 'var(--text-2)',
            maxWidth: 480, margin: '0 auto var(--sp-8)', lineHeight: 1.65,
          }}>
            Quelro finds the creators actively looking to hire, writes pitches that clear a
            90-point quality gate, and fills your calendar with calls.
          </p>

          <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'center', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
            <button className="lp-cta-primary" onClick={() => navigate('/signup')}>
              Find your first client <ArrowRight size={15} />
            </button>
            <button className="lp-cta-ghost" onClick={() => document.getElementById('marcus-demo')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
              Watch Marcus write
            </button>
          </div>

          <p style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-4)', marginBottom: 'var(--sp-12)' }}>
            14-day free trial · no credit card · built for editors, designers, scriptwriters
          </p>
        </div>

        {/* THE LIVE MARCUS MOMENT */}
        <div id="marcus-demo" style={{ position: 'relative' }}>
          <MarcusDemo />
        </div>
      </section>

      {/* ══ STAT BAND ══ */}
      <div style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
        <div className="lp-container" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 'var(--sp-4)', padding: 'var(--sp-8) var(--sp-6)',
        }}>
          {[
            { v: 60, suffix: '%+', label: 'average reply rate' },
            { v: 100000, suffix: '+', label: 'creators scored daily' },
            { v: 90, suffix: '+', label: 'quality gate minimum' },
            { v: 3, suffix: ' min', label: 'signal to pitch' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 'var(--fs-2xl)', letterSpacing: '-0.02em', color: 'var(--lime)' }}>
                <StatInView value={s.v} suffix={s.suffix} />
              </div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 4, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ WHAT'S RUNNING UNDER THE HOOD ══ */}
      <div className="lp-container" style={{ padding: 'var(--sp-16) var(--sp-6) 0' }}>
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={viewportOnce} style={{ textAlign: 'center', marginBottom: 'var(--sp-8)' }}>
          <div className="lp-eyebrow" style={{ justifyContent: 'center' }}>UNDER THE HOOD</div>
          <h2 className="lp-h2">The engine behind every lead.</h2>
          <p style={{ fontSize: 'var(--fs-base)', color: 'var(--text-2)', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
            Scanning, scoring, and vacancy detection running continuously — not a one-time scrape.
          </p>
        </motion.div>
        <FeatureBentoGrid />
      </div>

      {/* ══ THE JOURNEY: FIND → WRITE → SEND → CLOSE ══ */}
      <div className="lp-container" style={{ padding: 'var(--sp-16) var(--sp-6)' }}>
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={viewportOnce} style={{ textAlign: 'center', marginBottom: 'var(--sp-8)' }}>
          <div className="lp-eyebrow" style={{ justifyContent: 'center' }}>THE SYSTEM</div>
          <h2 className="lp-h2">Find. Write. Send. Close.</h2>
          <p style={{ fontSize: 'var(--fs-base)', color: 'var(--text-2)', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
            The full path from "who should I pitch?" to a signed retainer — one system, no tab-switching.
          </p>
        </motion.div>

        {JOURNEY.map((sec, i) => {
          const Icon = sec.icon;
          return (
            <motion.section
              key={sec.id}
              id={sec.id}
              className={`lp-journey${i % 2 === 1 ? ' lp-journey--flip' : ''}`}
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={viewportOnce}
            >
              <motion.div className="lp-journey__copy" variants={fadeUp}>
                <div className="lp-eyebrow">
                  <Icon size={13} /> {sec.eyebrow}
                  <span style={{ color: 'var(--text-4)' }}>· {String(i + 1).padStart(2, '0')}/04</span>
                </div>
                <h3 className="lp-h2" style={{ fontSize: 'var(--fs-xl)' }}>{sec.title}</h3>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 'var(--sp-5)' }}>
                  {sec.body}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                  {sec.points.map(p => (
                    <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 13, color: 'var(--text-2)' }}>
                      <Check size={13} style={{ color: 'var(--lime)', flexShrink: 0 }} /> {p}
                    </div>
                  ))}
                </div>
              </motion.div>
              <motion.div variants={fadeUp}>
                <sec.Visual />
              </motion.div>
            </motion.section>
          );
        })}
      </div>

      {/* ══ TESTIMONIALS ══ */}
      <div style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-2)' }}>
        <div className="lp-container" style={{ padding: 'var(--sp-16) var(--sp-6)' }}>
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={viewportOnce} style={{ textAlign: 'center', marginBottom: 'var(--sp-10)' }}>
            <div className="lp-eyebrow" style={{ justifyContent: 'center' }}>RESULTS</div>
            <h2 className="lp-h2">Real freelancers. Real clients.</h2>
          </motion.div>

          <motion.div
            variants={stagger} initial="hidden" whileInView="visible" viewport={viewportOnce}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--sp-4)' }}
          >
            {TESTIMONIALS.map(t => (
              <motion.div key={t.name} variants={fadeUp} className="card" style={{ padding: 'var(--sp-6)', background: 'var(--surface)' }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 'var(--fs-xl)', color: t.color, letterSpacing: '-0.02em' }}>
                  {t.metric}
                </div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-3)', marginBottom: 'var(--sp-4)' }}>{t.metricLabel}</div>
                <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 'var(--sp-5)' }}>"{t.quote}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                  <span className="ava" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>{t.name[0]}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{t.name}</div>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ══ PRICING ══ */}
      <div id="pricing" className="lp-container" style={{ padding: 'var(--sp-16) var(--sp-6)' }}>
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={viewportOnce} style={{ textAlign: 'center', marginBottom: 'var(--sp-10)' }}>
          <div className="lp-eyebrow" style={{ justifyContent: 'center' }}>PRICING</div>
          <h2 className="lp-h2">One client pays for a year of Quelro.</h2>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)' }}>
            The average creator client is worth $2,000–5,000/month. Quelro starts at $29.
          </p>
        </motion.div>

        <motion.div
          variants={stagger} initial="hidden" whileInView="visible" viewport={viewportOnce}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--sp-4)', alignItems: 'stretch' }}
        >
          {PLANS.map(plan => (
            <motion.div key={plan.name} variants={fadeUp} className={`lp-price-card${plan.featured ? ' lp-price-card--featured' : ''}`}>
              {plan.featured && (
                <span className="badge badge--lime" style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)' }}>
                  MOST POPULAR
                </span>
              )}
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 'var(--sp-3)' }}>
                {plan.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 'var(--sp-2)' }}>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 'var(--fs-3xl)', letterSpacing: '-0.03em', color: plan.featured ? 'var(--lime)' : 'var(--text)' }}>
                  ${plan.price}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>/mo</span>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 'var(--sp-5)' }}>{plan.desc}</p>
              <button
                onClick={() => navigate('/signup')}
                className={plan.featured ? 'lp-cta-primary' : 'lp-cta-ghost'}
                style={{ width: '100%', height: 40, marginBottom: 'var(--sp-5)' }}
              >
                {plan.cta}
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 12.5, color: 'var(--text-2)' }}>
                    <Check size={12} style={{ color: 'var(--lime)', flexShrink: 0 }} /> {f}
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* ══ FINAL CTA ══ */}
      <div style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-2)' }}>
        <motion.div
          variants={fadeUp} initial="hidden" whileInView="visible" viewport={viewportOnce}
          className="lp-container" style={{ padding: 'var(--sp-16) var(--sp-6)', textAlign: 'center' }}
        >
          <h2 style={{
            fontSize: 'clamp(var(--fs-2xl), 5vw, var(--fs-3xl))', fontWeight: 600,
            letterSpacing: '-0.025em', lineHeight: 1.05, margin: '0 0 var(--sp-4)',
          }}>
            They're posting. They're struggling.<br />
            <span style={{ fontFamily: 'var(--f-heading)', fontWeight: 600, color: 'var(--lime)' }}>
              They need someone exactly like you.
            </span>
          </h2>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)', marginBottom: 'var(--sp-8)', lineHeight: 1.6 }}>
            Quelro finds them before anyone else does.
          </p>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'center', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
            <button className="lp-cta-primary" onClick={() => navigate('/signup')}>
              Find your first client <ArrowRight size={15} />
            </button>
            <button className="lp-cta-ghost" onClick={() => document.getElementById('marcus-demo')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
              Watch Marcus write
            </button>
          </div>
          <p style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-4)' }}>
            14-day free trial · no credit card · setup in 5 minutes
          </p>
        </motion.div>
      </div>

      {/* ══ FOOTER ══ */}
      <footer style={{
        borderTop: '1px solid var(--line)', padding: 'var(--sp-6)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <div style={{
            width: 20, height: 20, borderRadius: 5,
            background: 'linear-gradient(135deg, var(--lime) 0%, var(--lime) 50%, var(--coral) 50%, var(--coral) 100%)',
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>Quelro</span>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-4)' }}>© 2026</span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-6)' }}>
          {[['Privacy', '/privacy'], ['Terms', '/terms']].map(([label, href]) => (
            <a key={label} href={href} style={{ fontSize: 12, color: 'var(--text-3)', transition: 'color 150ms' }}
              onMouseEnter={e => { e.target.style.color = 'var(--text)'; }}
              onMouseLeave={e => { e.target.style.color = 'var(--text-3)'; }}
            >{label}</a>
          ))}
        </div>
      </footer>
    </div>
  );
}
