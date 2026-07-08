import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Brain, Database, Radar, Users, Briefcase, Mail, ScanLine, ShieldCheck } from 'lucide-react';
import { fadeUp, stagger, viewportOnce } from '../../lib/motion';

/* ─────────────────────────────────────────────────────────────
   FeatureBentoGrid — how the Quelro pipeline actually runs:
   scan sources → score intent → detect vacancies → allocate →
   write. Every label below names a real service in backend/src.
   ───────────────────────────────────────────────────────────── */

function BentoCard({ title, description, children, span }) {
  return (
    <motion.div
      variants={fadeUp}
      style={{
        gridColumn: span ? `span ${span}` : undefined,
        background: 'var(--surface)', border: '1px solid var(--line-2)',
        borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)',
        display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)',
        minHeight: 260, overflow: 'hidden',
      }}
    >
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h3>
        <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, marginTop: 4, maxWidth: '92%' }}>
          {description}
        </p>
      </div>
      <div style={{
        position: 'relative', flex: 1, borderRadius: 'var(--r)',
        border: '1px solid var(--line)', background: 'var(--bg-2)', overflow: 'hidden',
      }}>
        {children}
      </div>
    </motion.div>
  );
}

/* Card 1 — Lead Discovery Pipeline: query → router → intent scorer → leads db / enrich */
function PipelineCard() {
  const STEPS = ['query', 'router', 'scorer', 'sync'];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % STEPS.length), 1400);
    return () => clearInterval(t);
  }, []);
  const nodes = [
    { key: 'query', icon: Search, label: 'QUERY', color: 'var(--sky)' },
    { key: 'router', icon: ScanLine, label: 'ROUTER', color: 'var(--lime)' },
    { key: 'scorer', icon: Brain, label: 'SCORER', color: 'var(--coral)' },
    { key: 'sync', icon: Database, label: 'LEADS DB', color: 'var(--ok)' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', height: '100%', padding: 16 }}>
      {nodes.map((n, i) => {
        const Icon = n.icon;
        const active = STEPS[step] === n.key;
        return (
          <div key={n.key} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: active ? n.color : 'var(--surface-3)',
              color: active ? 'var(--bg)' : 'var(--text-3)', transition: 'all 300ms ease',
              boxShadow: active ? `0 0 20px ${n.color}55` : 'none',
            }}>
              <Icon size={18} />
            </div>
            {i < nodes.length - 1 && (
              <div style={{ width: 18, height: 1, background: 'var(--line-2)', margin: '0 6px' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* Card 2 — Signal Monitor: channels scanned + vacancy hits per hour */
function SignalMonitorCard() {
  const bars = [45, 75, 35, 85, 60, 95, 50];
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {[{ label: 'Channels scanned', value: '1.2k/hr' }, { label: 'Vacancy hits', value: '14/hr' }].map(s => (
          <div key={s.label} style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 10 }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-4)', textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 16, color: 'var(--text)', marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        {bars.map((h, i) => (
          <div key={i} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', background: 'var(--surface-3)', borderRadius: 4 }}>
            <motion.div
              style={{ width: '100%', background: 'var(--lime)', borderRadius: '4px 4px 0 0' }}
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ duration: 0.8, delay: i * 0.08, ease: 'easeOut' }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {days.map(d => (
          <span key={d} style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--text-4)' }}>{d}</span>
        ))}
      </div>
    </div>
  );
}

/* Card 3 — Outreach Pipeline Activity: scraper → scorer → credit diff → allocation → writer */
function ActivityFeedCard() {
  const logs = [
    { stage: 'Scraper', action: 'Scanned channels across 4 sources', status: 'done' },
    { stage: 'Intent Scorer', action: 'Ranked leads by niche + subs signals', status: 'done' },
    { stage: 'Credit Diff', action: 'Editor-slot vacancy detected', status: 'running' },
    { stage: 'Allocation', action: 'Checking claim window', status: 'waiting' },
    { stage: 'Email Writer', action: 'Queued for next claimed lead', status: 'idle' },
  ];
  const COLORS = { done: 'var(--lime)', running: 'var(--sky)', waiting: 'var(--warn)', idle: 'var(--text-4)' };
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, height: '100%', justifyContent: 'center' }}>
      {logs.map((l) => (
        <div key={l.stage} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
          <span className={l.status === 'running' ? 'dot dot--lime dot--pulse' : 'dot'} style={{ width: 6, height: 6, background: COLORS[l.status], borderRadius: '50%', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--text)', width: 96, flexShrink: 0 }}>{l.stage}</span>
          <span style={{ color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.action}</span>
        </div>
      ))}
    </div>
  );
}

/* Card 4 — Lead Sources: youtube, podcasts, community signals, job boards */
function LeadSourcesCard() {
  const sources = [
    { name: 'YouTube', icon: Radar, hits: 342, fill: 88, color: 'var(--lime)' },
    { name: 'Podcasts', icon: Mail, hits: 218, fill: 56, color: 'var(--sky)' },
    { name: 'Community', icon: Users, hits: 97, fill: 25, color: 'var(--coral)' },
    { name: 'Job boards', icon: Briefcase, hits: 54, fill: 14, color: 'var(--ok)' },
  ];
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', justifyContent: 'center' }}>
      {sources.map(s => {
        const Icon = s.icon;
        return (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface-3)', color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={14} />
            </div>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-2)', width: 78, flexShrink: 0 }}>{s.name}</span>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}>
              <motion.div
                style={{ height: '100%', background: s.color, borderRadius: 3 }}
                initial={{ width: 0 }}
                animate={{ width: `${s.fill}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-3)', width: 32, textAlign: 'right' }}>{s.hits}</span>
          </div>
        );
      })}
    </div>
  );
}

/* Card 5 — Signal Detectors: channel scan, credit diff, email verify, intent score */
function DetectorsCard() {
  const tools = [
    { name: 'channel_scan', calls: 14, icon: Radar, color: 'var(--sky)' },
    { name: 'credit_diff', calls: 8, icon: ScanLine, color: 'var(--lime)' },
    { name: 'email_verify', calls: 22, icon: ShieldCheck, color: 'var(--warn)' },
    { name: 'intent_score', calls: 31, icon: Brain, color: 'var(--coral)' },
  ];
  return (
    <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, height: '100%' }}>
      {tools.map(t => {
        const Icon = t.icon;
        return (
          <div key={t.name} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 10, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: t.color, color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={13} />
              </div>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--text)' }}>{t.calls}</span>
            </div>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-3)', marginTop: 8 }}>{t.name}</span>
          </div>
        );
      })}
    </div>
  );
}

const CARDS = [
  { title: 'Lead Discovery Pipeline', description: 'A query flows from source scan to a scored, allocation-ready lead in real time.', Visual: PipelineCard, span: 1 },
  { title: 'Signal Monitor', description: 'Channels scanned and vacancy-signal hits, tracked across every scraper run.', Visual: SignalMonitorCard, span: 1 },
  { title: 'Outreach Pipeline Activity', description: 'Live stages: scrape, score, credit-diff, allocate, and draft — in order.', Visual: ActivityFeedCard, span: 1 },
  { title: 'Lead Sources', description: 'YouTube, podcasts, community signals, and job boards, indexed into one pool.', Visual: LeadSourcesCard, span: 2 },
  { title: 'Signal Detectors', description: 'Channel scans, credit diffs, email verification, and intent scoring behind every lead.', Visual: DetectorsCard, span: 1 },
];

export default function FeatureBentoGrid() {
  return (
    <motion.div
      variants={stagger} initial="hidden" whileInView="visible" viewport={viewportOnce}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-4)' }}
      className="lp-bento-grid"
    >
      {CARDS.map(c => (
        <BentoCard key={c.title} title={c.title} description={c.description} span={c.span}>
          <c.Visual />
        </BentoCard>
      ))}
    </motion.div>
  );
}
