import { motion } from 'framer-motion'
import {
  MagnifyingGlass,
  ChartBar,
  Sparkle,
  PaperPlaneTilt,
  Kanban,
  ChartLineUp,
} from '@phosphor-icons/react'
import { fadeUp, stagger, viewportOnce } from '../lib/motion'

const loops = [
  {
    loop: 'Discover',
    icon: MagnifyingGlass,
    title: 'Lead Finder',
    description:
      'Score creator intent before you click send. Filter by niche, subscriber range, and recent upload activity.',
  },
  {
    loop: 'Discover',
    icon: ChartBar,
    title: 'Channel Analyzer',
    description:
      'Get a full dossier on any channel — audience angles and ranked pitch ideas, not just subscriber counts.',
  },
  {
    loop: 'Convert',
    icon: Sparkle,
    title: 'Pitch Generator',
    description:
      "Marcus researches the channel and drafts a pitch in your voice, then grades it against a quality gate before it's allowed to send.",
  },
  {
    loop: 'Convert',
    icon: PaperPlaneTilt,
    title: 'Email Sender',
    description:
      'Send from your own Gmail with automatic duplicate protection, so you never pitch the same creator twice.',
  },
  {
    loop: 'Convert',
    icon: Kanban,
    title: 'CRM',
    description:
      'Track every creator from first touch to signed deal on a kanban built for outreach, not generic sales.',
  },
  {
    loop: 'Optimize',
    icon: ChartLineUp,
    title: 'Analytics',
    description:
      'See reply rates, pipeline value, and the send-time windows that actually get responses — tuned from your own data.',
  },
]

const loopColor = {
  Discover: 'text-primary bg-primary/10 border-primary/30',
  Convert: 'text-secondary bg-secondary/10 border-secondary/30',
  Optimize: 'text-accent bg-accent/10 border-accent/30',
}

export default function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={fadeUp}
        className="mx-auto max-w-2xl text-center"
      >
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          One OS, three loops
        </h2>
        <p className="mt-4 text-base text-muted-foreground">
          Discover the right creators, convert them into replies, and optimize what you send next —
          without switching tools.
        </p>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={stagger}
        className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        {loops.map(({ icon: Icon, title, description, loop }) => (
          <motion.div
            key={title}
            variants={fadeUp}
            className="rounded-xl border border-border bg-card p-6 transition-colors duration-200 hover:border-border/150"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-foreground">
                <Icon size={22} weight="bold" aria-hidden="true" />
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${loopColor[loop]}`}
              >
                {loop}
              </span>
            </div>
            <h3 className="mt-4 font-heading text-lg font-semibold text-foreground">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
