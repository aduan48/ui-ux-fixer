import Hero from '../src/components/hero'
import { PricingSection } from '../src/components/PricingSection'
import { TestimonialWall } from '../src/components/Testimonials'

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6">
      <Hero title="Ship faster" subtitle="The toolkit for small teams" ctaLabel="Start free" />
      <PricingSection />
      <section className="mx-auto max-w-3xl py-16">
        <h2 className="text-2xl font-bold">What people say</h2>
        <TestimonialWall quotes={[]} />
      </section>
    </main>
  )
}
