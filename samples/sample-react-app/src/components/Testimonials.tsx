import type { FC } from 'react'

type Quote = { author: string; text: string }

export const TestimonialWall: FC<{ quotes: Quote[] }> = ({ quotes }) => (
  <ul>{quotes.map(q => <li key={q.author}>{q.text}</li>)}</ul>
)
