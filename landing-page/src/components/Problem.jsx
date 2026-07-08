import { motion } from 'framer-motion'
import { fadeUp, stagger, viewportOnce } from '../lib/motion'

const stats = [
  { value: '< 1%', label: 'reply rate on generic cold email', color: 'text-secondary' },
  { value: '3–5 hrs', label: 'spent per day on manual prospecting', color: 'text-foreground' },
  { value: '48 hrs', label: 'before a hiring signal goes cold', color: 'text-primary' },
]

export default function Problem() {
  return (
    <section className="border-t border-border py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.span
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
          className="mb-5 block font-mono text-xs tracking-widest text-primary"
        >
          01 — THE PROBLEM
        </motion.span>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <motion.h2
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={fadeUp}
            className="font-heading text-3xl font-normal leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            Every editor is cold-emailing blind.{' '}
            <em className="not-italic text-muted-foreground">You included.</em>
          </motion.h2>
          <motion.p
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={fadeUp}
            className="text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            YouTube creators who need a video editor don't post job listings. They just stop
            uploading consistently. Their editing credit quietly disappears. They post a community
            update about "taking a break." Meanwhile you're scrolling manually, guessing who might
            need help, writing generic pitches that land in the same pile as 50 others.
          </motion.p>
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="mt-14 grid grid-cols-1 border-t border-border sm:grid-cols-3"
        >
          {stats.map((s) => (
            <motion.div key={s.label} variants={fadeUp} className="border-l border-border px-6 py-8 first:border-l-0">
              <div className={`font-heading text-4xl font-normal tracking-tight sm:text-5xl ${s.color}`}>
                {s.value}
              </div>
              <p className="mt-2.5 text-sm leading-snug text-muted-foreground">{s.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
