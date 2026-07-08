import { useState } from 'react'
import { List, X } from '@phosphor-icons/react'

const links = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/72 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5 font-heading text-xl tracking-tight text-foreground">
          <span className="h-2.5 w-2.5 rounded-full bg-primary animate-q-pulse" />
          Quelro
        </a>

        <ul className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href="#"
            className="text-sm font-medium text-foreground transition-colors duration-200 hover:text-primary"
          >
            Log in
          </a>
          <a
            href="#pricing"
            className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold tracking-tight text-primary-foreground transition-colors duration-200 hover:brightness-110"
          >
            Start free
          </a>
        </div>

        <button
          type="button"
          className="cursor-pointer p-2 text-foreground md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={24} /> : <List size={24} />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-border bg-background px-4 pb-4 md:hidden">
          <ul className="flex flex-col gap-1 pt-2">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-2 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2">
            <a
              href="#"
              className="rounded-lg border border-border px-4 py-2.5 text-center text-sm font-semibold text-foreground"
            >
              Log in
            </a>
            <a
              href="#pricing"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground"
            >
              Start free
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
