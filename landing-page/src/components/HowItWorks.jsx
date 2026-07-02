import { motion } from 'framer-motion'
import { Binoculars, Sparkle, ChatCircleDots } from '@phosphor-icons/react'
import { fadeUp, stagger, viewportOnce } from '../lib/motion'

const steps = [
  {
    icon: Binoculars,
    title: 'Find creators worth pitching',
    description: 'Lead Finder scores intent by niche, size, and recent activity — so you skip the dead ends.',
  },
  {
    icon: Sparkle,
    title: 'Let Marcus draft the pitch',
    description: 'It researches the channel, writes in your voice, and only lets quality-gated pitches through.',
  },
  {
    icon: ChatCircleDots,
    title: 'Track replies as they land',
    description: 'Reply intelligence flags the hot ones instantly, so nothing important sits unanswered.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Three steps, start to reply
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            No separate scraper, no separate copywriter, no separate spreadsheet to track it all.
          </p>
        </motion.div>

        <motion.ol
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-3"
        >
          {steps.map(({ icon: Icon, title, description }, index) => (
            <motion.li key={title} variants={fadeUp} className="relative text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
                <Icon size={26} weight="bold" aria-hidden="true" />
              </div>
              <span className="mt-4 block font-mono text-xs font-bold uppercase tracking-widest text-secondary">
                Step {index + 1}
              </span>
              <h3 className="mt-1 font-heading text-lg font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  )
}
