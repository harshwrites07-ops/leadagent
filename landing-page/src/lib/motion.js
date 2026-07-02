export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
}

export const stagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
}

export const viewportOnce = { once: true, amount: 0.2 }
