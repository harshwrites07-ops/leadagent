import { motion } from 'framer-motion'
import { ArrowRight } from '@phosphor-icons/react'
import { fadeUp, viewportOnce } from '../lib/motion'

export default function CTA() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={fadeUp}
        className="flex flex-col items-center rounded-3xl border border-border bg-card px-6 py-16 text-center sm:px-12"
      >
        <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Start pitching creators today
        </h2>
        <p className="mt-4 max-w-lg text-muted-foreground">
          Free to start, no credit card required. Upgrade only once your outreach volume grows.
        </p>
        <a
          href="#pricing"
          className="mt-8 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_32px_rgba(200,246,84,0.35)]"
        >
          Start free
          <ArrowRight size={18} weight="bold" />
        </a>
      </motion.div>
    </section>
  )
}
