import { motion } from 'framer-motion'
import { ShieldCheck, Fingerprint, BellRinging, Clock } from '@phosphor-icons/react'
import { fadeUp, stagger, viewportOnce } from '../lib/motion'

const principles = [
  {
    icon: ShieldCheck,
    title: 'Every pitch is quality-gated',
    description: "Marcus grades each draft before it's allowed to send — no generic blasts leave your inbox.",
  },
  {
    icon: Fingerprint,
    title: 'Duplicate protection, automatic',
    description: 'A dedup gate stops you from pitching the same creator twice, even across campaigns.',
  },
  {
    icon: BellRinging,
    title: 'Hot replies, flagged instantly',
    description: "Reply intelligence surfaces the replies that need you now, so nothing important sits unread.",
  },
  {
    icon: Clock,
    title: 'Send times, tuned to you',
    description: 'Analytics learns the windows that actually get responses from your own reply history.',
  },
]

export default function Principles() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={fadeUp}
        className="mx-auto max-w-2xl text-center"
      >
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Built for how outreach actually works
        </h2>
        <p className="mt-4 text-base text-muted-foreground">
          No fabricated stats — just the mechanics baked into every pitch you send.
        </p>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={stagger}
        className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2"
      >
        {principles.map(({ icon: Icon, title, description }) => (
          <motion.div
            key={title}
            variants={fadeUp}
            className="flex gap-4 rounded-xl border border-border bg-card p-6"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
              <Icon size={22} weight="bold" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
