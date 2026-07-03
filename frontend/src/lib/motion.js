/* ═══════════════════════════════════════════════════════════
   QUELRO MOTION CONFIG — the single source of truth for motion.
   Import from here. Never write inline one-off transition values.

   Law:
   - micro (press, badge landing, toggles):  spring 400/30
   - macro (page, section, panel):           gentle ease, ≤300ms
   - every animation either demonstrates work or confirms a
     state change — nothing decorative.
   ═══════════════════════════════════════════════════════════ */

/* ── Curves ── */
export const springMicro = { type: 'spring', stiffness: 400, damping: 30 };
export const springGentle = { type: 'spring', stiffness: 260, damping: 32 };
export const easeMacro = { duration: 0.2, ease: [0.16, 1, 0.3, 1] };
export const easeSlow = { duration: 0.35, ease: [0.16, 1, 0.3, 1] };

/* ── Page transition: subtle fade + 8px rise, 200ms. Every page. ── */
export const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: easeMacro },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12, ease: 'easeIn' } },
};
export const pageProps = {
  variants: pageVariants,
  initial: 'initial',
  animate: 'animate',
  exit: 'exit',
};

/* ── Scroll/section reveal ── */
export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};
export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: easeMacro },
};
export const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};
export const staggerSlow = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
};
export const viewportOnce = { once: true, amount: 0.2 };

/* ── State-change confirmations ── */
/* Badge / tier result landing (quality gate pass, score tier) */
export const springIn = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1, transition: springMicro },
};
/* List row entering (activity feed, queue rows) */
export const rowIn = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: springGentle },
};
/* Card press affordance — spread onto motion.div for tappable cards */
export const pressable = {
  whileTap: { scale: 0.98 },
  transition: springMicro,
};

/* ── Panel / overlay ── */
export const slideInRight = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: springGentle },
  exit: { opacity: 0, x: 24, transition: { duration: 0.15, ease: 'easeIn' } },
};
export const modalIn = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: springGentle },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.12, ease: 'easeIn' } },
};

/* ── Chart entrance: path drawing ── */
export const drawPath = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: { pathLength: { duration: 0.8, ease: 'easeOut' }, opacity: { duration: 0.2 } },
  },
};
