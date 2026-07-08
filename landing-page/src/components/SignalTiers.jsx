import { motion } from 'framer-motion'
import { fadeUp, stagger, viewportOnce } from '../lib/motion'

const tiers = [
  {
    letter: 'S',
    tier: 'TIER',
    title: 'Confirmed Hiring',
    description:
      'Creator posts "looking for an editor" in their community tab, About page, or a hiring board. Quelro detects it within hours.',
    rate: '15–30%',
    fill: '88%',
    color: '#ff5c38',
  },
  {
    letter: 'A',
    tier: 'TIER',
    title: 'Credit Vacancy',
    description:
      'The "Edited by @name" credit that appeared in every video description for months — just stopped. That\'s a vacancy signal nobody else reads.',
    rate: '8–15%',
    fill: '56%',
    color: '#ffb224',
  },
  {
    letter: 'B',
    tier: 'TIER',
    title: 'Schedule Break',
    description:
      'Channel uploads every 6 days like clockwork — then suddenly goes 20 days dark. Production strain, before the creator admits it publicly.',
    rate: '5–10%',
    fill: '36%',
    color: '#c8c2b4',
  },
  {
    letter: 'C',
    tier: 'TIER',
    title: 'Scaling Signals',
    description:
      'Views growing, sponsor segments appearing, subscriber milestone just crossed. They can afford help and need more of it to keep growing.',
    rate: '3–6%',
    fill: '20%',
    color: '#7a7466',
  },
]

export default function SignalTiers() {
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
          02 — SIGNAL DETECTION
        </motion.span>

        <motion.h2
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
          className="max-w-2xl font-heading text-3xl font-normal leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl"
        >
          We read the signals creators <em className="italic text-primary">don't say out loud.</em>
        </motion.h2>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {tiers.map((t) => (
            <motion.div
              key={t.letter}
              variants={fadeUp}
              className="flex flex-col rounded-xl border p-6"
              style={{
                borderColor: `${t.color}55`,
                background: `linear-gradient(180deg, ${t.color}14, ${t.color}03)`,
              }}
            >
              <div className="flex items-baseline gap-3">
                <span className="font-heading text-6xl font-normal leading-none" style={{ color: t.color }}>
                  {t.letter}
                </span>
                <span
                  className="rounded border px-2 py-0.5 font-mono text-[10.5px] tracking-widest"
                  style={{ borderColor: `${t.color}66`, color: t.color }}
                >
                  {t.tier}
                </span>
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">{t.title}</h3>
              <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted-foreground">{t.description}</p>

              <div className="mt-5 border-t pt-4" style={{ borderColor: `${t.color}33` }}>
                <div className="font-mono text-[10.5px] tracking-widest text-muted-foreground">
                  PREDICTED REPLY RATE
                </div>
                <div className="mt-1.5 font-mono text-2xl font-semibold" style={{ color: t.color }}>
                  {t.rate}
                </div>
                <div className="mt-2 h-1 rounded-full bg-border">
                  <div className="h-1 rounded-full" style={{ width: t.fill, background: t.color }} />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.p
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
          className="mx-auto mt-14 max-w-xl text-center font-heading text-2xl font-normal leading-snug text-foreground/85 sm:text-3xl"
        >
          Your pitch arrives the day they start looking.{' '}
          <em className="italic text-primary">Before the other 50 do.</em>
        </motion.p>
      </div>
    </section>
  )
}
