const plans = [{ name: 'Free', price: 0 }, { name: 'Pro', price: 12 }]

export function PricingSection({ highlight }: { highlight?: string }) {
  return (
    <div className="rounded-card bg-brand-50 p-8 text-brand-700">
      {plans.map(p => <div key={p.name} data-highlight={p.name === highlight}>{p.name}: ${p.price}</div>)}
    </div>
  )
}
