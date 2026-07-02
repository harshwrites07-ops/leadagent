import { motion } from 'framer-motion'
import { CaretDown } from '@phosphor-icons/react'
import { fadeUp, stagger, viewportOnce } from '../lib/motion'

const faqs = [
  {
    question: 'Do I need to connect my own Gmail?',
    answer:
      'Yes — pitches send from your own Gmail account so they land in a real inbox, not a shared sending domain. Each plan includes a set number of connected Gmail accounts.',
  },
  {
    question: 'How many creators can I pitch per month?',
    answer:
      'That depends on your plan’s email limit — 500/month on Starter, 1,500 on Pro, and 5,000 on Agency. Every plan includes Lead Finder, Pitch Generator, CRM, and Analytics.',
  },
  {
    question: 'Can pitches sound like me, not a template?',
    answer:
      'Yes. You set your voice, tone, and typical pricing in onboarding, and every pitch Marcus drafts is written against that profile — then graded by the quality gate before it can send.',
  },
  {
    question: 'Does Quelro guarantee replies?',
    answer:
      "No tool can guarantee that. What Quelro does guarantee is that every pitch is researched, quality-gated, and never a duplicate — the parts of outreach that are actually in your control.",
  },
  {
    question: 'What happens if I outgrow my plan?',
    answer:
      'Upgrade from Settings at any time — your usage limits update immediately and billing prorates automatically.',
  },
]

export default function FAQ() {
  return (
    <section id="faq" className="bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
          className="text-center"
        >
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Frequently asked questions
          </h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="mt-10 flex flex-col gap-3"
        >
          {faqs.map((faq) => (
            <motion.details
              key={faq.question}
              variants={fadeUp}
              className="group rounded-xl border border-border bg-card p-5 open:shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-heading text-base font-semibold text-foreground">
                {faq.question}
                <CaretDown
                  size={18}
                  weight="bold"
                  className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
            </motion.details>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
