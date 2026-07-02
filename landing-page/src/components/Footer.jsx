import { TwitterLogo, LinkedinLogo } from '@phosphor-icons/react'

const columns = [
  {
    title: 'Product',
    links: ['Lead Finder', 'Pitch Generator', 'CRM', 'Analytics'],
  },
  {
    title: 'Company',
    links: ['About', 'Contact'],
  },
  {
    title: 'Legal',
    links: ['Privacy policy', 'Terms of service'],
  },
]

export default function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2">
            <a href="#top" className="flex items-center gap-2.5 font-heading text-lg font-semibold text-foreground">
              <span
                className="grid h-6 w-6 place-items-center rounded-[7px] font-mono text-xs font-bold text-background"
                style={{ background: 'linear-gradient(135deg, #c8f654 0%, #c8f654 50%, #ff8a73 50%, #ff8a73 100%)' }}
              >
                Q
              </span>
              Quelro
            </a>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              The operating system for creator outreach.
            </p>
            <div className="mt-5 flex gap-4 text-muted-foreground">
              <a href="#" aria-label="Twitter" className="cursor-pointer hover:text-foreground">
                <TwitterLogo size={20} />
              </a>
              <a href="#" aria-label="LinkedIn" className="cursor-pointer hover:text-foreground">
                <LinkedinLogo size={20} />
              </a>
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-foreground">{col.title}</h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Quelro. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
