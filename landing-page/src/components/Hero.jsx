import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Play } from '@phosphor-icons/react'
import { fadeUp, stagger, viewportOnce } from '../lib/motion'

const signals = [
  {
    tier: 'HOT',
    tierColor: 'border-secondary/35 bg-secondary/5 text-secondary',
    name: 'Devansh Builds',
    subs: '412K subs',
    time: '3h ago',
    note: 'Posted "hiring editor" in community tab',
  },
  {
    tier: 'HOT',
    tierColor: 'border-secondary/35 bg-secondary/5 text-secondary',
    name: 'Priya Plays',
    subs: '187K subs',
    time: '2d ago',
    note: 'Editing credit disappeared from last 4 videos',
  },
  {
    tier: 'WARM',
    tierColor: 'border-primary/30 bg-primary/5 text-primary',
    name: 'TechWithArjun',
    subs: '96.4K subs',
    time: '6h ago',
    note: 'Upload schedule broke — 18d gap after 7d cadence',
  },
]

function useScanCounter(active) {
  const [count, setCount] = useState(14203)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setCount((n) => n + Math.floor(Math.random() * 9) + 2)
    }, 1800)
    return () => clearInterval(id)
  }, [active])
  return count
}

export default function Hero() {
  const count = useScanCounter(true)

  return (
    <section id="top" className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 -z-20 flex justify-center blur-3xl"
      >
        <div className="h-72 w-[36rem] bg-gradient-to-tr from-primary/12 via-secondary/6 to-transparent opacity-70" />
      </div>
      <div
        aria-hidden="true"
        className="bg-grid-fade pointer-events-none absolute inset-0 -z-10"
        style={{
          maskImage: 'radial-gradient(900px 600px at 50% 0%, black, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(900px 600px at 50% 0%, black, transparent 75%)',
        }}
      />

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={stagger}
        className="mx-auto flex max-w-4xl flex-col items-center px-4 text-center sm:px-6"
      >
        <motion.span
          variants={fadeUp}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/7 px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-q-pulse" />
          Scanning {count.toLocaleString('en-US')} channels
        </motion.span>

        <motion.h1
          variants={fadeUp}
          className="font-heading text-4xl font-normal leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl"
        >
          The moment a creator starts looking for help
          <br className="hidden sm:block" /> — <em className="italic text-primary">you're already there.</em>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg"
        >
          Quelro detects hiring signals the day they appear, writes a personalized pitch in your
          voice, and tracks replies — so you land clients while competitors are still scrolling
          YouTube manually.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="#pricing"
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_30px_rgba(255,178,36,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_40px_rgba(255,178,36,0.34)]"
          >
            Start free — no card needed
            <ArrowRight size={18} weight="bold" />
          </a>
          <a
            href="#marcus"
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-foreground/30"
          >
            <Play size={18} weight="fill" />
            See how Marcus works
          </a>
        </motion.div>

        <motion.ul
          variants={fadeUp}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-wider text-muted-foreground"
        >
          {['Free plan to start', '1,700+ creator leads in database', '80%+ open rate proven in production'].map(
            (item) => (
              <li key={item} className="flex items-center gap-1.5">
                <span className="text-primary">—</span>
                {item}
              </li>
            ),
          )}
        </motion.ul>

        {/* Product moment: Live Signals feed + Marcus draft, not a stock screenshot */}
        <motion.div
          variants={fadeUp}
          className="mt-14 w-full overflow-hidden rounded-xl border border-border bg-card text-left shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-border bg-background/60 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-muted" />
            <span className="h-2.5 w-2.5 rounded-full bg-muted" />
            <span className="h-2.5 w-2.5 rounded-full bg-muted" />
            <span className="ml-3 font-mono text-[11px] text-muted-foreground">quelro.app/signals</span>
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary animate-q-pulse" />
              Live
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Live signals feed */}
            <div className="relative overflow-hidden border-b border-border p-5 md:border-b-0 md:border-r">
              <div
                aria-hidden="true"
                className="animate-q-scan pointer-events-none absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-primary/5 to-transparent"
              />
              <div className="mb-4 flex items-center justify-between font-mono text-[11px] tracking-widest text-muted-foreground">
                <span>LIVE SIGNALS</span>
                <span>today · 12 new</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {signals.map((s) => (
                  <div key={s.name} className={`rounded-lg border p-3.5 ${s.tierColor}`}>
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`rounded font-mono text-[10px] font-bold tracking-wider px-1.5 py-0.5 ${
                          s.tier === 'HOT'
                            ? 'bg-secondary text-white'
                            : 'bg-primary text-primary-foreground'
                        }`}
                      >
                        {s.tier}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{s.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{s.subs}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">{s.time}</span>
                    </div>
                    <p className="mt-2 text-[13px] leading-snug text-foreground/80">{s.note}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Marcus draft preview */}
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between font-mono text-[11px] tracking-widest text-muted-foreground">
                <span>MARCUS · DRAFT</span>
                <span className="flex items-center gap-1.5 text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  94/100
                </span>
              </div>
              <div className="flex h-full flex-col rounded-lg border border-border bg-background/40">
                <div className="flex flex-col gap-1.5 border-b border-border px-4 py-3">
                  <div className="flex gap-2 text-[12.5px]">
                    <span className="w-11 shrink-0 text-muted-foreground">To</span>
                    <span className="text-foreground/80">priya@priyaplays.co</span>
                  </div>
                  <div className="flex gap-2 text-[12.5px]">
                    <span className="w-11 shrink-0 text-muted-foreground">Subject</span>
                    <span className="font-semibold text-foreground">
                      Noticed something about your editing setup
                    </span>
                  </div>
                </div>
                <div className="flex-1 px-4 py-3.5 text-[13px] leading-relaxed text-foreground/80">
                  <p>
                    Hey Priya — the "Edited by @kmedits" credit that's been in every description
                    since March vanished from your last four uploads.
                  </p>
                  <p className="mt-3">
                    If you're between editors, I'd love to cut a free 60-second test edit of your
                    Goa vlog so you can judge the pacing yourself.
                    <span className="animate-q-blink ml-0.5 inline-block h-4 w-2 translate-y-0.5 bg-primary align-middle" />
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
                  <span className="rounded border border-success/30 bg-success/8 px-2 py-1 font-mono text-[10.5px] tracking-wide text-success">
                    ✓ Voice DNA matched
                  </span>
                  <span className="rounded border border-success/30 bg-success/8 px-2 py-1 font-mono text-[10.5px] tracking-wide text-success">
                    ✓ Quality gate passed
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  )
}
