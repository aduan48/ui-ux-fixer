import type { ReactNode } from 'react'

interface FeatureCardProps {
  icon: ReactNode
  title: string
  body: string
}

export const FeatureCard = ({ icon, title, body }: FeatureCardProps) => (
  <div className="rounded-card border border-sunset p-6">
    {icon}
    <h3>{title}</h3>
    <p>{body}</p>
  </div>
)
