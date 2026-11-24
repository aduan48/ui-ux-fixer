interface NavbarProps {
  links: { href: string; label: string }[]
  logoSrc?: string
}

export function Navbar({ links, logoSrc }: NavbarProps) {
  return (
    <nav className="flex items-center justify-between px-6 py-4">
      <img src={logoSrc} alt="Logo" />
      <ul>{links.map(l => <li key={l.href}><a href={l.href}>{l.label}</a></li>)}</ul>
    </nav>
  )
}
