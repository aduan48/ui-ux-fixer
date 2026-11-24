type Props = { title: string; subtitle: string; ctaLabel: string }

export default function ({ title, subtitle, ctaLabel }: Props) {
  return (
    <section className="py-24 text-center">
      <h1>{title}</h1>
      <p>{subtitle}</p>
      <button>{ctaLabel}</button>
    </section>
  )
}
