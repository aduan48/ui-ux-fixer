import { useState } from 'react'

function ContactForm({ onSubmit }) {
  const [email, setEmail] = useState('')
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(email) }}>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
      <button type="submit">Send</button>
    </form>
  )
}

export default ContactForm
