import heroArt from '../../assets/hero.svg'

type Props = { title: string; subtitle: string; ctaLabel: string }

export default function ({ title, subtitle, ctaLabel }: Props) {
  return (
    <section className="hero-bg py-24 text-center">
      <h1 className="text-5xl font-bold tracking-tight">{title}</h1>
      <p className="mt-4 text-lg text-gray-600">{subtitle}</p>
      <button className="btn-primary mt-8">{ctaLabel}</button>
      <img src={heroArt} alt="" className="mx-auto mt-12 w-80" />
    </section>
  )
}
