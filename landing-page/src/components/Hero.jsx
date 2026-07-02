import { motion } from 'framer-motion'
import { ArrowRight, Play, CheckCircle } from '@phosphor-icons/react'
import { fadeUp, stagger, viewportOnce } from '../lib/motion'

const steps = [
  { label: 'Research', done: true },
  { label: 'Draft', done: true },
  { label: 'Quality gate', done: false, current: true },
]

const subjectVariants = [
  { text: 'Loved your latest upload on smart home setups', score: 91, tier: 'Excellent' },
  { text: 'Quick idea for your channel', score: 62, tier: 'Needs polish' },
]

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 flex justify-center blur-3xl"
      >
        <div className="h-72 w-[36rem] bg-gradient-to-tr from-primary/20 via-secondary/10 to-transparent opacity-70" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 opacity-[0.15]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, var(--color-border) 1px, transparent 0)',
          backgroundSize: '24px 24px',
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
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-muted-foreground"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          For freelancers & agencies pitching YouTube creators
        </motion.span>

        <motion.h1
          variants={fadeUp}
          className="text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl"
        >
          The operating system for
          <br />
          <span className="font-serif italic font-normal text-primary">creator outreach</span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg"
        >
          Quelro finds YouTube creators worth pitching, researches and drafts the email,
          and tells you the moment someone replies.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="#pricing"
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(200,246,84,0.35)]"
          >
            Start free
            <ArrowRight size={18} weight="bold" />
          </a>
          <a
            href="#how-it-works"
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-muted"
          >
            <Play size={18} weight="fill" />
            See how it works
          </a>
        </motion.div>

        <motion.ul
          variants={fadeUp}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
        >
          {['Free plan to start', 'No credit card needed', 'Upgrade anytime'].map((item) => (
            <li key={item} className="flex items-center gap-1.5">
              <CheckCircle size={16} weight="fill" className="text-primary" />
              {item}
            </li>
          ))}
        </motion.ul>

        {/* Product moment: a recreation of the Pitch Gen flow, not a stock screenshot */}
        <motion.div
          variants={fadeUp}
          className="mt-14 w-full overflow-hidden rounded-2xl border border-border bg-card text-left shadow-2xl"
        >
          <div className="flex items-center gap-1.5 border-b border-border bg-background/60 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-secondary/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-accent/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-primary/60" />
            <span className="ml-3 font-mono text-[11px] text-muted-foreground">Pitch Generator</span>
          </div>

          <div className="grid grid-cols-1 gap-6 p-6 sm:p-8 md:grid-cols-2">
            <div>
              <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Marcus is working
              </p>
              <div className="flex overflow-hidden rounded-lg border border-border">
                {steps.map((step, i) => (
                  <div
                    key={step.label}
                    className={`flex flex-1 items-center gap-2 px-3 py-2.5 text-xs ${
                      i > 0 ? 'border-l border-border' : ''
                    } ${step.done || step.current ? 'bg-muted text-foreground' : 'bg-transparent text-muted-foreground'}`}
                  >
                    <span
                      className={`grid h-4 w-4 place-items-center rounded-full font-mono text-[9px] ${
                        step.done || step.current
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-border text-muted-foreground'
                      }`}
                    >
                      {i + 1}
                    </span>
                    {step.label}
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 font-mono text-[11px] text-primary">
                Quality gate: subject line B needs a rewrite before send
              </div>
            </div>

            <div>
              <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Subject line variants
              </p>
              <div className="flex flex-col gap-2">
                {subjectVariants.map((v) => (
                  <div key={v.text} className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-sm text-foreground">{v.text}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`rounded font-mono text-[10px] font-bold px-1.5 py-0.5 ${
                          v.score >= 80
                            ? 'bg-primary/15 text-primary'
                            : 'bg-secondary/15 text-secondary'
                        }`}
                      >
                        {v.score}
                      </span>
                      <span className="text-xs text-muted-foreground">{v.tier}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  )
}
