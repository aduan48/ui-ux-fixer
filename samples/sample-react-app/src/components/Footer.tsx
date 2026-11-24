import { memo } from 'react'

const Footer = memo(function Footer({ year }: { year: number }) {
  return (
    <footer className="flex items-center gap-2 border-t px-6 py-8 text-sm text-gray-500">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M5 12h14" />
      </svg>
      © {year} Sample Co.
    </footer>
  )
})

export { Footer }
