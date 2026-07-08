import { motion } from 'framer-motion'
import { Check } from '@phosphor-icons/react'
import { fadeUp, stagger, viewportOnce } from '../lib/motion'

const plans = [
  {
    key: 'starter',
    name: 'Starter',
    price: '$29',
    description: 'For freelancers sending their first pitches.',
    features: ['500 emails / month', '1 Gmail account', 'Lead Finder + Pitch Generator', 'CRM & analytics included'],
    cta: 'Start with Starter',
    highlighted: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$49',
    description: 'For freelancers running outreach as their main channel.',
    features: [
      '1,500 emails / month',
      '3 Gmail accounts',
      'All features included',
      'Priority support',
    ],
    cta: 'Start with Pro',
    highlighted: true,
  },
  {
    key: 'agency',
    name: 'Agency',
    price: '$149',
    description: 'For agencies pitching on behalf of multiple clients.',
    features: [
      '5,000 emails / month',
      '10 Gmail accounts',
      '5 team seats',
      'All features + priority support',
    ],
    cta: 'Start with Agency',
    highlighted: false,
  },
]

export default function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={fadeUp}
        className="mx-auto max-w-2xl text-center"
      >
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Simple, transparent pricing
        </h2>
        <p className="mt-4 text-base text-muted-foreground">
          Start on the free plan. Upgrade whenever your outreach volume grows.
        </p>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={stagger}
        className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3"
      >
        {plans.map((plan) => (
          <motion.div
            key={plan.key}
            variants={fadeUp}
            className={`relative flex flex-col rounded-xl border p-8 ${
              plan.highlighted
                ? 'border-primary bg-card shadow-xl shadow-primary/5'
                : 'border-border bg-card'
            }`}
          >
            {plan.highlighted && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 font-mono text-xs font-bold uppercase tracking-wide text-accent-foreground">
                Most popular
              </span>
            )}

            <h3 className="font-heading text-xl font-semibold text-foreground">{plan.name}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>

            <div className="mt-6 flex items-baseline gap-1">
              <span className="font-heading text-4xl font-semibold text-foreground">{plan.price}</span>
              <span className="text-sm text-muted-foreground">/ mo</span>
            </div>

            <ul className="mt-6 flex flex-1 flex-col gap-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                  <Check size={18} weight="bold" className="mt-0.5 shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>

            <a
              href="#"
              className={`mt-8 cursor-pointer rounded-lg px-5 py-3 text-center text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 ${
                plan.highlighted
                  ? 'bg-primary text-primary-foreground shadow-[0_0_24px_rgba(0, 112, 243,0.25)]'
                  : 'border border-border bg-muted text-foreground'
              }`}
            >
              {plan.cta}
            </a>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
