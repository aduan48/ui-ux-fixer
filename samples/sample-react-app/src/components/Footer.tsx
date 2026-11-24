import { memo } from 'react'

const Footer = memo(function Footer({ year }: { year: number }) {
  return <footer>© {year} Sample Co.</footer>
})

export { Footer }
