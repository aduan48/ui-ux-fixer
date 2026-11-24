import { Footer } from '../src/components/Footer'
import { Navbar } from '../src/components/Navbar'
import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <Navbar logoSrc="/logo.svg" links={[{ href: '/', label: 'Home' }, { href: '/about', label: 'About' }]} />
        {children}
        <Footer year={2026} />
      </body>
    </html>
  )
}
