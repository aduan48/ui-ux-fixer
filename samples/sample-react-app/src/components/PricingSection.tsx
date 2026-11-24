const plans = [{ name: 'Free', price: 0 }, { name: 'Pro', price: 12 }]

export function PricingSection({ highlight }: { highlight?: string }) {
  return (
    <div>
      {plans.map(p => <div key={p.name} data-highlight={p.name === highlight}>{p.name}: ${p.price}</div>)}
    </div>
  )
}
